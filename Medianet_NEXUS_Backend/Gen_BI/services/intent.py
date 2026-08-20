"""
intent.py
Lightweight pre-routing for the chatbot:
  - detect_language(): fr vs en (cheap heuristic, no LLM call)
  - classify_intent(): greeting / chitchat / data_question via one fast LLM call
  - conversational_reply(): direct natural reply for non-data messages

Why route first: not every message is a data question. "hello", "merci",
"bye" have no SQL, so forcing them down the NL->SQL path guarantees a
validation failure. We answer those directly and only invoke SQL generation
for genuine data questions.
"""

import re

from .llm_client import chat

# ── Language detection ───────────────────────────────────────────────────────
# Cheap, dependency-free heuristic. Good enough to pick the reply language;
# we don't need full language ID. Falls back to English.

_FR_HINTS = {
    "combien", "quel", "quelle", "quels", "quelles", "quantité", "nombre",
    "montre", "affiche", "liste", "moyenne", "total", "pour", "avec", "dans",
    "merci", "bonjour", "salut", "bonsoir", "aurevoir", "au revoir", "s'il",
    "tâche", "tâches", "projet", "projets", "client", "clients", "entreprise",
    "combien de", "quels sont", "est-ce", "voici", "j'ai", "je", "mes", "des",
}
_FR_CHARS = set("àâäéèêëîïôöùûüçœ")


def detect_language(text: str) -> str:
    """Return 'fr' or 'en'. Heuristic: accented chars or common French tokens."""
    low = text.lower()
    if any(c in _FR_CHARS for c in low):
        return "fr"
    tokens = set(re.findall(r"[a-zàâäéèêëîïôöùûüç']+", low))
    hits = len(tokens & _FR_HINTS)
    return "fr" if hits >= 1 and hits >= len(tokens) * 0.15 else "en"


# ── Intent classification ────────────────────────────────────────────────────

_VALID_INTENTS = {"greeting", "chitchat", "data_question"}

# Cheap, LLM-free pre-check for obvious pleasantries. Catches the common cases
# (hello / thanks / bye in EN + FR) with zero API calls, so greetings work even
# when every LLM provider is rate-limited or down, and we don't burn a Groq call.
_GREETING_PATTERNS = re.compile(
    r"^\s*(hi|hello|hey|yo|hiya|howdy|good\s*(morning|afternoon|evening)|"
    r"bonjour|salut|coucou|bonsoir|"
    r"thanks?|thank\s*you|thx|ty|cheers|merci|"
    r"bye|goodbye|see\s*ya|see\s*you|au\s*revoir|à\s*bientôt|"
    r"ok|okay|cool|nice|great|super|parfait|d'accord)"
    r"[\s!.?,]*$",
    re.IGNORECASE,
)

_CHITCHAT_PATTERNS = re.compile(
    r"\b(who\s*are\s*you|what\s*(can|do)\s*you\s*do|what\s*are\s*you|"
    r"help\s*me|i\s*need\s*(your\s*)?help|need\s*some\s*help|can\s*you\s*help|"
    r"how\s*do\s*you\s*work|what\s*do\s*you\s*know|"
    r"qui\s*es[- ]tu|que\s*(peux|sais)[- ]tu|comment\s*ça\s*marche|aide[- ]moi|"
    r"j'ai\s*besoin\s*d'aide|peux[- ]tu\s*m'aider|"
    r"how\s*are\s*you|comment\s*(vas|allez)[- ]vous|ça\s*va|"
    r"nice\s*to\s*meet|great\s*help|you'?ve\s*been|thank\s*you\s*so)\b",
    re.IGNORECASE,
)


def quick_intent(question: str) -> str | None:
    """
    LLM-free intent guess. Returns 'greeting' / 'chitchat' for obvious cases,
    or None when not confident (caller then asks the LLM or defaults to
    data_question). Cheap and always safe — no network call.
    """
    q = question.strip()
    if _GREETING_PATTERNS.match(q):
        return "greeting"
    # Chitchat: matches a social/meta pattern AND doesn't mention warehouse data.
    # The data-keyword guard stops "how many customers do you have" (a real data
    # question containing "do you") from being mislabeled as chitchat.
    if _CHITCHAT_PATTERNS.search(q) and not _DATA_KEYWORDS.search(q) and len(q.split()) <= 10:
        return "chitchat"
    return None


# Words that strongly imply a real warehouse query — if present, never treat
# the message as chitchat even if it also contains a pleasantry.
_DATA_KEYWORDS = re.compile(
    r"\b(how\s*many|count|list|show\s*me|number\s*of|total|average|avg|sum|"
    r"top|most|least|churn|revenue|deal|deals|ticket|tickets|task|tasks|"
    r"project|projects|customer|customers|company|companies|subscription|"
    r"combien|liste|montre|nombre|moyenne|clients?|projets?|tâches?|deals?)\b",
    re.IGNORECASE,
)


_CLASSIFY_SYSTEM = """You classify a user's message to a Customer Success BI assistant into exactly one label:

- greeting: hello/hi/hey/bonjour/salut, goodbye/bye/au revoir, thanks/merci, or other pure social pleasantries with no data request.
- chitchat: small talk, questions about the assistant itself ("who are you", "what can you do"), or anything conversational that is NOT asking for data from the warehouse.
- data_question: any request that needs data from the warehouse (counts, lists, metrics, trends, comparisons about customers, deals, projects, tasks, tickets, churn, revenue, etc.).

Respond with ONLY the single label word: greeting, chitchat, or data_question. No punctuation, no explanation."""


def classify_intent(question: str, history: list[dict] | None = None) -> str:
    """
    Route the message. Tries the LLM-free quick check first (no API call for
    obvious greetings/chitchat); only calls the LLM when the quick check is
    unsure. Defaults to 'data_question' on error for longer messages, 'greeting'
    for very short ones, so we neither miss a real data request nor 500 on 'hi'.
    """
    quick = quick_intent(question)
    if quick is not None:
        return quick

    messages = [
        {"role": "system", "content": _CLASSIFY_SYSTEM},
        {"role": "user", "content": question},
    ]
    try:
        raw = chat(messages, max_tokens=8, temperature=0.0)
    except Exception:
        return "data_question" if len(question.split()) > 3 else "greeting"

    label = _extract_label(raw)
    return label if label else ("data_question" if len(question.split()) > 3 else "chitchat")


def _extract_label(raw: str) -> str | None:
    """
    Pull a valid intent label out of possibly-messy classifier output. gpt-oss
    can wrap its answer in reasoning artifacts, so we search for the label
    anywhere in the cleaned text rather than trusting the first token.
    Data_question is checked last so 'greeting'/'chitchat' win when the model
    hedges (e.g. 'this is chitchat, not a data_question').
    """
    if not raw:
        return None
    text = _clean(raw).lower()
    if re.search(r"\bgreeting\b", text):
        return "greeting"
    if re.search(r"\bchitchat\b", text):
        return "chitchat"
    if re.search(r"\bdata[_\s]?question\b", text):
        return "data_question"
    return None


# ── Conversational reply for non-data messages ───────────────────────────────

_REPLY_SYSTEM_EN = """You are Medianaute, a friendly Customer Success BI assistant.
The user sent a greeting or small-talk message — NOT a data request.
Reply briefly and warmly in English (1-2 sentences). If it fits, gently remind
them you can answer questions about customers, deals, projects, tasks, and support.
Do not invent data. Do not output SQL."""

_REPLY_SYSTEM_FR = """Tu es Medianaute, un assistant BI Customer Success sympathique.
L'utilisateur a envoyé une salutation ou un message de conversation — PAS une
demande de données. Réponds brièvement et chaleureusement en français (1-2 phrases).
Si c'est pertinent, rappelle-lui que tu peux répondre à des questions sur les clients,
les deals, les projets, les tâches et le support. N'invente pas de données. Ne produis pas de SQL."""


def conversational_reply(question: str, lang: str, history: list[dict] | None = None) -> str:
    """Direct natural-language reply for greeting/chitchat, in the user's language."""
    system = _REPLY_SYSTEM_FR if lang == "fr" else _REPLY_SYSTEM_EN
    messages = [{"role": "system", "content": system}]
    if history:
        for m in history[-6:]:
            if m.get("role") in ("user", "assistant") and m.get("content"):
                messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": question})

    try:
        return _clean(chat(messages, max_tokens=120, temperature=0.5)).strip()
    except Exception:
        # Minimal safe fallback.
        if lang == "fr":
            return "Bonjour ! Je peux vous aider avec vos clients, deals, projets et tâches. Que voulez-vous savoir ?"
        return "Hi! I can help with your customers, deals, projects, and tasks. What would you like to know?"


# ── Shared cleanup: strip reasoning-model artifacts ──────────────────────────

_ANSI_RE = re.compile(r"\x1b?\[[0-9;]*m")          # real ESC sequences
_ANSI_TEXT_RE = re.compile(r"\[\d+m")               # de-escaped leftovers like "[4m"
# Blanket fallback: any raw ASCII control byte except newline/tab. Reasoning
# models (gpt-oss family, seen via the Groq fallback) have leaked escape-code
# variants that do not match the two specific patterns above cleanly -- this
# catches the underlying byte class instead of one exact shape.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_REASONING_TAGS = re.compile(
    r"<\s*/?\s*(think|thinking|reasoning|analysis)\s*>", re.IGNORECASE
)
# Collapse 3+ blank lines to a single blank line, and trim trailing spaces per
# line. Keeps intentional paragraph/bullet structure while removing the ragged
# gaps that make answers look scattered when artifacts get stripped out.
_MULTI_BLANK_RE = re.compile(r"\n{3,}")
_TRAILING_WS_RE = re.compile(r"[ \t]+(\n)")


def _clean(text: str) -> str:
    """
    Remove ANSI color codes and reasoning-channel tags that gpt-oss models can
    leak into visible content (the '[4m ... [0m' garbage seen in output), then
    tidy whitespace so the remaining Markdown reads cleanly. Intentional
    structure (blank line between paragraphs, '- ' bullets, **bold**) is kept.
    """
    if not text:
        return ""
    text = _CONTROL_CHARS_RE.sub("", text)
    text = _ANSI_RE.sub("", text)
    text = _ANSI_TEXT_RE.sub("", text)
    text = _REASONING_TAGS.sub("", text)
    text = _TRAILING_WS_RE.sub(r"\1", text)
    text = _MULTI_BLANK_RE.sub("\n\n", text)
    return text.strip()


# Exposed for reuse in query_engine.
clean_model_text = _clean