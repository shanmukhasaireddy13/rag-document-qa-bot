"""
main.py
-------
FastAPI entry-point.  Start with:

    uvicorn main:app --reload --port 8000

Endpoints
---------
POST /ask     { "question": "..." }  →  { answer, sources, confidence }
GET  /health  →  { "status": "ok", "vectors": <int> }
"""

import os
import shutil
import io
import re
import httpx
import fitz  # PyMuPDF
import ipaddress
import urllib.parse
import socket

from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Security
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from retriever import retrieve, _index, _load, reset as reset_retriever
from generator import generate, generate_with_context
from ingest import ingest as run_ingest, DOCS_DIR

SUPPORTED = (".txt", ".md", ".pdf")

# ── App setup ─────────────────────────────────────────────
app = FastAPI(
    title="RAG API",
    description="Retrieval-Augmented Generation powered by Groq + FAISS",
    version="1.0.0",
)

# Allowed redirect hosts (we only follow redirects from these domains)
_REDIRECT_ALLOW = {"drive.google.com", "docs.google.com", "googleusercontent.com"}

def is_safe_url(url: str) -> bool:
    """Validate that *url* resolves exclusively to global (public) IPs.

    Uses getaddrinfo to check **all** A/AAAA records (not just the first),
    and enforces ip_address.is_global so link-local, loopback, private and
    reserved ranges are all rejected.
    """
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        # Resolve every A and AAAA record for the hostname
        addrs = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
        if not addrs:
            return False
        for family, _type, _proto, _canonname, sockaddr in addrs:
            ip_obj = ipaddress.ip_address(sockaddr[0])
            if not ip_obj.is_global:
                return False
        return True
    except Exception:
        return False

def sanitize_filename(filename: str) -> str:
    basename = os.path.basename(filename)
    if not basename or basename in {".", ".."}:
        raise ValueError("Invalid filename")
    return basename

# ── Auth setup ───────────────────────────────────────────
API_KEY_NAME = "Authorization"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

def get_api_key(api_key: str = Security(api_key_header)) -> str:
    """Validate the Authorization header against RAG_API_KEY.

    Fail-closed: if the env var is unset the server returns 500 instead of
    silently allowing unauthenticated access.
    """
    expected_key = os.getenv("RAG_API_KEY")

    if not expected_key:
        raise HTTPException(
            status_code=500,
            detail="Server misconfiguration: RAG_API_KEY is not set.",
        )

    if not api_key:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    # strip "Bearer " prefix if provided
    token = api_key.replace("Bearer ", "").strip()

    if token != expected_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return token

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://flashfetch.vercel.app",
        "*"  # Wildcard for the Chrome Extension
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic models ────────────────────────────────────────
class HistoryTurn(BaseModel):
    role:    str  # "user" | "assistant"
    content: str

class Query(BaseModel):
    question: str               = Field(..., min_length=3, description="The question to answer")
    history:  list[HistoryTurn] = Field(default_factory=list, description="Previous conversation turns for multi-turn memory")

class InlineQuery(BaseModel):
    question:     str               = Field(..., min_length=3)
    context_text: str               = Field(..., description="Raw text from the open file / page")
    filename:     str               = Field(default="inline document")
    history:      list[HistoryTurn] = Field(default_factory=list)

class UrlExtractRequest(BaseModel):
    url: str = Field(..., description="Any URL: Google Drive share link, direct PDF, web page")

class Source(BaseModel):
    document:  str
    snippet:   str
    score:     float

class AnswerResponse(BaseModel):
    answer:     str
    sources:    list[Source]
    confidence: str           # "high" | "medium" | "low"


# ── Startup: auto-index committed docs ───────────────────
@app.on_event("startup")
async def auto_ingest_on_startup():
    """
    On every cold start (Render free tier, local dev, etc.):
    If docs exist but the FAISS index is missing, rebuild it automatically.
    This ensures the demo docs committed to the repo are always indexed.
    """
    index_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index", "faiss.index")
    docs_exist = any(
        f.endswith((".txt", ".md", ".pdf"))
        for f in os.listdir(DOCS_DIR)
    ) if os.path.isdir(DOCS_DIR) else False

    if docs_exist and not os.path.exists(index_path):
        print("[startup] FAISS index missing — auto-building from docs...")
        try:
            run_ingest()
            print("[startup] Index built successfully.")
        except Exception as e:
            print(f"[startup] WARNING: auto-ingest failed: {e}")
    elif os.path.exists(index_path):
        print("[startup] FAISS index found — skipping rebuild.")
    else:
        print("[startup] No docs found — upload a file to begin.")


# ── Routes ────────────────────────────────────────────────
@app.post("/ask", response_model=AnswerResponse)
def ask(query: Query, api_key: str = Depends(get_api_key)):
    """
    Accepts a question, retrieves relevant document chunks,
    and returns a grounded answer from the Groq LLM.
    """
    try:
        retrieved = retrieve(query.question)
        history   = [t.model_dump() for t in query.history]
        result    = generate(query.question, retrieved, history)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")


@app.post("/ask-with-context", response_model=AnswerResponse)
def ask_with_context(query: InlineQuery, api_key: str = Depends(get_api_key)):
    """
    Answer a question using raw text passed inline (no document upload needed).
    The Chrome extension uses this when a file is open in the browser.
    """
    try:
        history = [t.model_dump() for t in query.history]
        result  = generate_with_context(
            query.question,
            query.context_text,
            history,
            query.filename,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")


@app.post("/extract-url")
def extract_url(req: UrlExtractRequest, api_key: str = Depends(get_api_key)):
    """
    Download any URL and extract its text content.
    Supports Google Drive share links, direct PDF URLs, plain text URLs.
    Returns { filename, text, char_count } for use with /ask-with-context.
    """
    url = req.url.strip()
    if not is_safe_url(url):
        raise HTTPException(status_code=400, detail="Invalid or unsafe URL provided.")

    # ── Convert Google Drive share/view/preview URL → direct download ─────
    # Patterns:
    #   https://drive.google.com/file/d/FILE_ID/view
    #   https://drive.google.com/file/d/FILE_ID/preview
    #   https://drive.google.com/open?id=FILE_ID
    #   https://docs.google.com/document/d/FILE_ID/edit
    drive_match = re.search(
        r"(?:drive\.google\.com/file/d/|docs\.google\.com/\w+/d/)([\w-]+)",
        url
    )
    open_match  = re.search(r"drive\.google\.com/open\?id=([\w-]+)", url)
    is_drive    = bool(drive_match or open_match)
    file_id     = (drive_match or open_match).group(1) if (drive_match or open_match) else None

    filename = "document"
    raw_bytes = b""
    content_type = ""

    try:
        if is_drive and file_id:
            download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
            filename = f"drive_{file_id[:8]}.pdf"
            with httpx.Client(follow_redirects=True, timeout=30) as client:
                r = client.get(download_url)
                if r.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Google Drive returned {r.status_code}. Make sure the file is shared as 'Anyone with the link'.")
                raw_bytes    = r.content
                content_type = r.headers.get("content-type", "")
                # Try to get real filename from Content-Disposition
                cd = r.headers.get("content-disposition", "")
                fn_match = re.search(r'filename=["\']?([^"\'\n;]+)', cd)
                if fn_match:
                    filename = fn_match.group(1).strip()
        else:
            with httpx.Client(follow_redirects=True, timeout=30) as client:
                r = client.get(url)
                if r.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"URL returned {r.status_code}")
                raw_bytes    = r.content
                content_type = r.headers.get("content-type", "")
                filename     = url.split("/")[-1].split("?")[0] or "document"

    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch URL: {e}")

    # ── Extract text ──────────────────────────────────────────────────────
    is_pdf = "pdf" in content_type.lower() or filename.lower().endswith(".pdf")

    if is_pdf:
        try:
            doc  = fitz.open(stream=io.BytesIO(raw_bytes), filetype="pdf")
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"PDF text extraction failed: {e}")
    else:
        # Plain text / HTML — decode and strip HTML tags roughly
        text = raw_bytes.decode("utf-8", errors="ignore")
        # Strip HTML if needed
        if "<html" in text.lower() or "<!doctype" in text.lower():
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s{2,}", " ", text)

    text = text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="No readable text found in the document.")

    return {
        "filename":   filename,
        "text":       text[:80000],   # cap at 80k chars
        "char_count": len(text),
    }


@app.get("/health")
def health():
    """Quick sanity-check — also reports how many vectors are indexed."""
    try:
        _load()
        vector_count = _index.ntotal if _index else 0
        return {"status": "ok", "vectors": vector_count}
    except FileNotFoundError:
        return {"status": "no_index", "vectors": 0, "hint": "Run python ingest.py"}


# ── Helper ─────────────────────────────────────────────────
def _list_docs() -> list[dict]:
    """Return metadata for every file currently in docs/."""
    os.makedirs(DOCS_DIR, exist_ok=True)
    files = [f for f in os.listdir(DOCS_DIR) if f.lower().endswith(SUPPORTED)]
    result = []
    for f in sorted(files):
        path = os.path.join(DOCS_DIR, f)
        size_kb = round(os.path.getsize(path) / 1024, 1)
        result.append({"name": f, "size_kb": size_kb})
    return result


@app.get("/documents")
def list_documents(api_key: str = Depends(get_api_key)):
    """Return all documents currently in the docs/ folder."""
    return {"documents": _list_docs()}


@app.post("/upload")
async def upload_document(file: UploadFile = File(...), api_key: str = Depends(get_api_key)):
    """Upload a .txt / .md / .pdf file, re-index everything, return updated doc list."""
    try:
        fname = sanitize_filename(file.filename or "")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid filename.")
        
    if not fname.lower().endswith(SUPPORTED):
        raise HTTPException(
            status_code=400,
            detail="Only .txt, .md, and .pdf files are supported."
        )

    # Save the file
    os.makedirs(DOCS_DIR, exist_ok=True)
    dest = os.path.join(DOCS_DIR, fname)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Re-build the index
    try:
        run_ingest()
        reset_retriever()   # drop cached index so next /ask reloads from disk
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {e}")

    return {"message": f"Uploaded and indexed '{fname}'", "documents": _list_docs()}


@app.delete("/documents/{filename}")
def delete_document(filename: str, api_key: str = Depends(get_api_key)):
    """Remove a document and re-index."""
    try:
        safe_name = sanitize_filename(filename)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid filename.")
        
    path = os.path.join(DOCS_DIR, safe_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found.")
    os.remove(path)
    try:
        run_ingest()
        reset_retriever()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Re-indexing failed: {e}")
    return {"message": f"Deleted '{filename}'", "documents": _list_docs()}
