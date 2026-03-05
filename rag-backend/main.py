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

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from retriever import retrieve, _index, _load, reset as reset_retriever
from generator import generate
from ingest import ingest as run_ingest, DOCS_DIR

SUPPORTED = (".txt", ".md", ".pdf")

# ── App setup ─────────────────────────────────────────────
app = FastAPI(
    title="RAG API",
    description="Retrieval-Augmented Generation powered by Groq + FAISS",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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

class Source(BaseModel):
    document:  str
    snippet:   str
    score:     float

class AnswerResponse(BaseModel):
    answer:     str
    sources:    list[Source]
    confidence: str           # "high" | "medium" | "low"


# ── Routes ────────────────────────────────────────────────
@app.post("/ask", response_model=AnswerResponse)
def ask(query: Query):
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
def list_documents():
    """Return all documents currently in the docs/ folder."""
    return {"documents": _list_docs()}


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Upload a .txt / .md / .pdf file, re-index everything, return updated doc list."""
    fname = file.filename or ""
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
def delete_document(filename: str):
    """Remove a document and re-index."""
    path = os.path.join(DOCS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found.")
    os.remove(path)
    try:
        run_ingest()
        reset_retriever()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Re-indexing failed: {e}")
    return {"message": f"Deleted '{filename}'", "documents": _list_docs()}
