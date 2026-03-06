"""
generator.py
------------
Calls the Groq LLM (llama3-8b-8192) with a strict RAG prompt.
Returns { answer, sources, confidence } or a hard fallback when
the retrieved context isn't relevant enough.
"""

import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────
GROQ_MODEL       = "llama-3.1-8b-instant"
TEMPERATURE      = 0.1
SCORE_THRESHOLD  = 0.40   # below this → "I don't know"
HIGH_CONFIDENCE  = 0.68
MED_CONFIDENCE   = 0.52
# ──────────────────────────────────────────────────────────

NO_ANSWER = (
    "I could not find this in the provided documents. "
    "Can you share the relevant document?"
)

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            raise ValueError(
                "GROQ_API_KEY is not set. Add it to rag-backend/.env"
            )
        _client = Groq(api_key=api_key)
    return _client


def get_confidence(top_score: float) -> str:
    """Map a similarity score to a human-readable confidence label."""
    if top_score >= HIGH_CONFIDENCE:
        return "high"
    if top_score >= MED_CONFIDENCE:
        return "medium"
    return "low"


def generate(query: str, retrieved: list[dict], history: list[dict] | None = None) -> dict:
    """
    Build an answer from retrieved chunks using the Groq LLM.

    Parameters
    ----------
    query     : user question
    retrieved : output from retriever.retrieve()

    Returns
    -------
    {
        "answer":     str,
        "sources":    [{ "document": str, "snippet": str, "score": float }],
        "confidence": "high" | "medium" | "low"
    }
    """
    # ── No results or low relevance → hard fallback ────────
    if not retrieved or retrieved[0]["score"] < SCORE_THRESHOLD:
        return {
            "answer":     NO_ANSWER,
            "sources":    [],
            "confidence": "low",
        }

    top_score = retrieved[0]["score"]

    # ── Build context string ───────────────────────────────
    context_parts = []
    for i, chunk in enumerate(retrieved, start=1):
        context_parts.append(
            f"[Source {i}: {chunk['source']}]\n{chunk['text']}"
        )
    context = "\n\n---\n\n".join(context_parts)

    # ── Build conversation history prefix ──────────────────
    history_prefix = ""
    if history:
        recent = [t for t in history if t.get("role") in ("user", "assistant")][-6:]
        if recent:
            lines = []
            for turn in recent:
                prefix = "User" if turn["role"] == "user" else "Assistant"
                lines.append(f"{prefix}: {turn['content'].strip()}")
            history_prefix = "Previous conversation:\n" + "\n".join(lines) + "\n\n"

    # ── System prompt ──────────────────────────────────────
    system_prompt = (
        "You are a strict document Q&A assistant. "
        "Rules you MUST follow:\n"
        "1. Answer ONLY using the provided document context — no outside knowledge.\n"
        "2. Be direct and concise. Avoid padding or filler phrases.\n"
        "3. You may use the previous conversation for context, but base answers on the documents.\n"
        "4. If the exact answer is not in the context, respond EXACTLY with: "
        f'"{NO_ANSWER}"\n'
        "5. Never guess, infer beyond what is written, or fabricate details.\n"
        "6. IMPORTANT: Detect the language of the user's question and respond in that SAME language. "
        "If the question is in Tamil, answer in Tamil. Hindi → Hindi. Telugu → Telugu. "
        "English → English. Match the user's language exactly."
    )

    user_prompt = (
        f"{history_prefix}"
        f"Context:\n{context}\n\n"
        f"Question: {query}\n\n"
        "Answer (strictly from the context — no outside knowledge):"
    )

    # ── Call Groq ──────────────────────────────────────────
    client = _get_client()
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        temperature=TEMPERATURE,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
    )

    answer = response.choices[0].message.content.strip()

    # If model admits it can't find it, strip sources
    if NO_ANSWER.split(".")[0].lower() in answer.lower():
        return {"answer": NO_ANSWER, "sources": [], "confidence": "low"}

    # ── Format sources (only above threshold) ─────────────
    sources = [
        {
            "document": chunk["source"],
            "snippet":  chunk["text"][:250].strip(),
            "score":    chunk["score"],
        }
        for chunk in retrieved
        if chunk["score"] >= SCORE_THRESHOLD
    ]

    return {
        "answer":     answer,
        "sources":    sources,
        "confidence": get_confidence(top_score),
    }


def generate_with_context(
    query: str,
    context_text: str,
    history: list[dict] | None = None,
    filename: str = "inline document",
) -> dict:
    """
    Answer a question using raw text passed inline (no FAISS lookup).
    Used by the Chrome extension when the user has a file open in the browser.
    """
    if not context_text or not context_text.strip():
        return {
            "answer":     NO_ANSWER,
            "sources":    [],
            "confidence": "low",
        }

    # Trim to ~12 000 chars to stay within token limits
    trimmed = context_text.strip()[:12000]

    # Build conversation history prefix
    history_prefix = ""
    if history:
        recent = [t for t in history if t.get("role") in ("user", "assistant")][-6:]
        if recent:
            lines = []
            for turn in recent:
                prefix = "User" if turn["role"] == "user" else "Assistant"
                lines.append(f"{prefix}: {turn['content'].strip()}")
            history_prefix = "Previous conversation:\n" + "\n".join(lines) + "\n\n"

    system_prompt = (
        "You are a strict document Q&A assistant. "
        "Rules you MUST follow:\n"
        "1. Answer ONLY using the provided document context — no outside knowledge.\n"
        "2. Be direct and concise. Avoid padding or filler phrases.\n"
        "3. You may use the previous conversation for context, but base answers on the document.\n"
        "4. If the exact answer is not in the context, respond EXACTLY with: "
        f'"{NO_ANSWER}"\n'
        "5. Never guess, infer beyond what is written, or fabricate details.\n"
        "6. IMPORTANT: Detect the language of the user's question and respond in that SAME language. "
        "If the question is in Tamil, answer in Tamil. Hindi → Hindi. Telugu → Telugu. "
        "English → English. Match the user's language exactly."
    )

    user_prompt = (
        f"{history_prefix}"
        f"Document ({filename}):\n{trimmed}\n\n"
        f"Question: {query}\n\n"
        "Answer (strictly from the document — no outside knowledge):"
    )

    client = _get_client()
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        temperature=TEMPERATURE,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
    )

    answer = response.choices[0].message.content.strip()

    if NO_ANSWER.split(".")[0].lower() in answer.lower():
        return {"answer": NO_ANSWER, "sources": [], "confidence": "low"}

    return {
        "answer":     answer,
        "sources":    [{"document": filename, "snippet": trimmed[:200], "score": 1.0}],
        "confidence": "high",
    }
