"""
chatbot.py
Orchestrates a single Gen BI turn.

Flow:
  1. Detect language (fr/en) and classify intent.
  2. greeting / chitchat  -> direct conversational reply (no SQL).
  3. data_question        -> generate SQL -> validate -> execute
                             (with one auto-correction retry) -> natural
                             answer + optional chart spec.

Stateless: conversation history is passed in by the caller. No server-side
session store. To add persistence later, load history from a GenbiConversation
model here — the view contract does not change.
"""

from .query_engine import ask_llm, generate_natural_response
from .validator import validate_sql
from .warehouse import run_query
from .intent import classify_intent, detect_language, conversational_reply
from .charts import build_chart_spec


def _blank_response(question: str) -> dict:
    return {
        "question": question,
        "intent": None,
        "language": None,
        "domain": "Unknown",
        "tables_used": [],
        "sql": None,
        "explanation": "",
        "natural_response": None,
        "data": None,
        "row_count": None,
        "chart": None,
        "error": None,
    }


def answer_question(question: str, history: list[dict] | None = None) -> dict:
    """
    Run one Gen BI turn. Always returns a response dict (never raises for
    normal validation/execution failures — those come back in `error`).
    """
    question = (question or "").strip()
    if not question:
        raise ValueError("Empty question")

    lang = detect_language(question)
    intent = classify_intent(question, history)

    base = _blank_response(question)
    base["language"] = lang
    base["intent"] = intent

    # 1. Non-data messages: reply conversationally, skip SQL entirely.
    if intent in ("greeting", "chitchat"):
        base["natural_response"] = conversational_reply(question, lang, history)
        return base

    # 2. Data question: generate SQL. If every LLM provider is down/rate-limited,
    #    return a clean message instead of letting AllProvidersFailed 500.
    try:
        llm_result = ask_llm(question, history, language=lang)
    except Exception as gen_err:
        base["error"] = f"LLM generation failed: {gen_err}"
        base["natural_response"] = (
            "Le service est momentanément surchargé. Réessayez dans un instant."
            if lang == "fr"
            else "The service is briefly overloaded. Please try again in a moment."
        )
        return base

    # 2b. The model can answer directly without touching the warehouse
    #     (conceptual questions, definitions, "what can you do", or questions
    #     it can reason about from the schema). No SQL to validate or run.
    if llm_result.get("direct_answer"):
        base["intent"] = "direct"
        base["domain"] = llm_result.get("domain", "General")
        base["natural_response"] = llm_result["direct_answer"]
        return base

    sql = llm_result["sql"]
    base["domain"] = llm_result["domain"]
    base["tables_used"] = llm_result["tables_used"]
    base["sql"] = sql
    base["explanation"] = llm_result["explanation"]

    # If we somehow got here with no SQL and no direct answer, fall back to a
    # graceful conversational reply rather than a validation error.
    if not sql:
        base["natural_response"] = conversational_reply(question, lang, history)
        base["intent"] = "chitchat"
        return base

    # 3. Validate.
    is_valid, error_msg = validate_sql(sql)
    if not is_valid:
        base["error"] = f"SQL validation failed: {error_msg}"
        # If what came back isn't SQL at all (no SELECT), the message was likely
        # misrouted small-talk. Give a friendly conversational reply instead of
        # a "couldn't build a query" message.
        if sql and "select" not in sql.lower():
            base["intent"] = "chitchat"
            base["natural_response"] = conversational_reply(question, lang, history)
        else:
            base["natural_response"] = (
                "Je n'ai pas pu interpréter cette question en requête. Pouvez-vous la reformuler ?"
                if lang == "fr"
                else "I couldn't turn that into a valid query. Could you rephrase it?"
            )
        return base

    # 4. Execute, with one auto-correction retry on failure.
    try:
        data = run_query(sql)
    except ValueError as exec_err:
        fixed = _attempt_autocorrect(sql, str(exec_err), lang)
        if fixed is None:
            base["error"] = f"Execution failed: {exec_err}"
            base["natural_response"] = (
                "Une erreur s'est produite lors de l'exécution de la requête."
                if lang == "fr"
                else "Something went wrong running that query."
            )
            return base
        sql, data = fixed["sql"], fixed["data"]
        base["sql"] = sql

    row_count = len(data)
    base["data"] = data
    base["row_count"] = row_count
    base["natural_response"] = generate_natural_response(question, sql, data, row_count, language=lang)
    base["chart"] = build_chart_spec(question, data)
    return base


def _attempt_autocorrect(bad_sql: str, error: str, lang: str) -> dict | None:
    """Ask the LLM to fix SQL that failed at execution. Returns {"sql","data"} or None."""
    retry_question = (
        "The following SQL failed with this error:\n\n"
        f"SQL: {bad_sql}\n\nError: {error}\n\n"
        "Please fix the SQL and return only the corrected version."
    )
    try:
        retry_result = ask_llm(retry_question, language=lang)
        fixed_sql = retry_result["sql"]
        is_valid, _ = validate_sql(fixed_sql)
        if not is_valid:
            return None
        data = run_query(fixed_sql)
        return {"sql": fixed_sql, "data": data}
    except Exception:
        return None