"""
insights/services.py

Generates the AI Insight cards shown on the Overview page.

Rather than hand-writing a second SQL layer, this reuses the Gen BI
pipeline that already exists (Gen_BI.chatbot.answer_question): a fixed
set of "seed questions" per category is run through the exact same
NL -> SQL -> validate -> execute -> natural-language-answer flow used by
the chat assistant, so every number quoted in an insight card is already
grounded in a real, validated query against DW_CustomerSuccess — no new
trust surface, no duplicated SQL-safety logic.
trust surface, no duplicated SQL-safety logic.

Those grounded answers are then handed to one more LLM call whose only
job is to compress them into up to 3 short "insight cards"
({tone, title, body}) as strict JSON — no new facts, just synthesis.

Flow per category, on refresh:
    seed questions -> Gen_BI.chatbot.answer_question() x N -> synthesis
    LLM call -> parsed JSON -> DashboardInsight row (overwritten in place)

This is synchronous and can take 10-30s (several sequential LLM round
trips) — acceptable because it only runs when a user presses "Refresh"
on a section, not on every dashboard load. Cached results are served
instantly the rest of the time.
"""

import json
import re

from django.utils import timezone

from Gen_BI.services.chatbot import answer_question
from Gen_BI.services.llm_client import chat as llm_chat

from .models import DashboardInsight, InsightCategory, InsightStatus

VALID_TONES = {"primary", "warning", "destructive"}

SEED_QUESTIONS: dict[str, list[str]] = {
    InsightCategory.REVENUE_DEALS: [
        "What is total closed-won deal value this quarter compared to last quarter?",
        "Which sales agent has the highest closed-won value this quarter?",
        "What is the current win rate across won and lost deals?",
        "What is total monthly recurring subscription revenue, and how many "
        "companies upgraded or downgraded their plan in the last 90 days?",
    ],
    InsightCategory.CUSTOMER_CHURN_B2C: [
        "What is the overall B2C customer churn rate, and which churn category "
        "is the most common reason customers leave?",
        "What is the average CLTV and satisfaction score for churned B2C "
        "customers compared to active ones?",
        "Which contract type has the highest B2C churn rate?",
    ],
    InsightCategory.CUSTOMER_CHURN_B2B: [
        "What is the B2B subscription churn rate over the last 90 days, and "
        "which industry has the highest churn?",
        "What is the average support ticket satisfaction score, and what "
        "percentage of tickets were escalated in the last 30 days?",
        "Which B2B companies are on trial subscriptions or show declining "
        "usage that could put them at churn risk?",
    ],
    InsightCategory.PROJECTS: [
        "How many project tasks are overdue — past their due date and not "
        "completed?",
        "Which project currently has the most incomplete tasks?",
        "What is the overall task completion rate across all active projects?",
    ],
}


def _parse_items(raw: str) -> list[dict]:
    """Best-effort strict-JSON parse of the synthesis call's output. Returns
    [] on any malformed response rather than raising — the caller treats an
    empty list as a failure and stores it as such."""
    cleaned = re.sub(r"^```(json)?|```$", "", (raw or "").strip(), flags=re.MULTILINE).strip()
    try:
        parsed = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []

    items = []
    for entry in parsed[:3]:
        if not isinstance(entry, dict):
            continue
        tone = entry.get("tone") if entry.get("tone") in VALID_TONES else "primary"
        title = str(entry.get("title", "")).strip()[:120]
        body = str(entry.get("body", "")).strip()[:280]
        if title and body:
            items.append({"tone": tone, "title": title, "body": body})
    return items


def _synthesize(category: str, qa_pairs: list[dict]) -> list[dict]:
    context = "\n\n".join(f"Q: {p['question']}\nA: {p['answer']}" for p in qa_pairs)

    system = (
        "You are a business intelligence analyst writing short executive "
        "insight cards for a CRM dashboard. Based ONLY on the findings "
        "below, write exactly 3 insight cards. Each card needs:\n"
        '- "tone": one of "primary" (positive/neutral highlight), "warning" '
        '(needs attention), "destructive" (urgent/critical)\n'
        '- "title": max 8 words\n'
        '- "body": one concrete sentence, max 25 words, citing real numbers '
        "from the findings when available\n"
        "Respond with ONLY a raw JSON array, no markdown, no code fences, no "
        'preamble. Example: [{"tone":"primary","title":"...","body":"..."}]'
    )
    user = f"Findings for the '{category}' dashboard section:\n\n{context}"

    raw = llm_chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=600,
        temperature=0.2,
    )
    return _parse_items(raw)


def _serialize(obj: DashboardInsight) -> dict:
    return {
        "category": obj.category,
        "status": obj.status,
        "items": obj.items,
        "modelUsed": obj.model_used,
        "errorMessage": obj.error_message,
        "generatedAt": obj.generated_at.isoformat() if obj.generated_at else None,
    }


def generate_insights(category: str) -> dict:
    """Run the seed questions for one category through the Gen BI pipeline,
    synthesize into insight cards, and overwrite the cached row. Raises
    ValueError for an unknown category (caller returns 400); any failure
    from the LLM chain is caught and stored as a FAILED row instead of
    propagating, so a bad refresh never 500s the endpoint."""
    if category not in SEED_QUESTIONS:
        raise ValueError(f"Unknown insight category: {category}")

    qa_pairs = []
    for question in SEED_QUESTIONS[category]:
        try:
            result = answer_question(question)
            answer = result.get("natural_response") or "No data available for this question."
        except Exception as e:  # noqa: BLE001 — one bad seed question shouldn't kill the batch
            answer = f"(this question could not be answered: {e})"
        qa_pairs.append({"question": question, "answer": answer})

    obj, _ = DashboardInsight.objects.get_or_create(category=category)
    try:
        items = _synthesize(category, qa_pairs)
        if not items:
            raise ValueError("The model did not return any parsable insight cards.")
        obj.items = items
        obj.status = InsightStatus.READY
        obj.error_message = ""
        obj.model_used = "Groq/Mistral chain"
        obj.generated_at = timezone.now()
        obj.save()
    except Exception as e:  # noqa: BLE001
        obj.status = InsightStatus.FAILED
        obj.error_message = str(e)
        obj.generated_at = timezone.now()
        obj.save()

    return _serialize(obj)


def get_insights(categories: list[str] | None = None) -> list[dict]:
    """Cached read only — never triggers generation. Categories not yet
    generated come back as status "empty" so the frontend can show a
    'Generate insights' prompt instead of a spinner or blank space."""
    wanted = categories or [c.value for c in InsightCategory]
    wanted = [c for c in wanted if c in SEED_QUESTIONS]

    existing = {
        obj.category: obj
        for obj in DashboardInsight.objects.filter(category__in=wanted)
    }

    result = []
    for cat in wanted:
        if cat in existing:
            result.append(_serialize(existing[cat]))
        else:
            result.append({
                "category": cat,
                "status": "empty",
                "items": [],
                "modelUsed": "",
                "errorMessage": "",
                "generatedAt": None,
            })
    return result