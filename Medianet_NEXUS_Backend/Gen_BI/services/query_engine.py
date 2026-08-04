"""
query_engine.py
Natural-language -> SQL generation and natural-language answer synthesis.

Ported from the original FastAPI project. Two changes:
  1. The LLM call goes through llm_client.chat() (Groq -> Mistral -> Ollama
     fallback) instead of a hardcoded Hugging Face InferenceClient.
  2. The generation system prompt is loaded from genbi/system_prompt.md if
     present, falling back to the compact inline SCHEMA_SUMMARY otherwise.
"""

import re
from pathlib import Path

from .llm_client import chat
from .intent import clean_model_text

_APP_ROOT = Path(__file__).resolve().parent.parent
_SYSTEM_PROMPT_PATH = _APP_ROOT / "system_prompt.md"

# Compact fallback prompt if system_prompt.md is missing. The full markdown
# prompt in the repo is richer; this keeps generation working regardless.
SCHEMA_SUMMARY = """
You are a PostgreSQL SQL generator for a Customer Success data warehouse.

TABLES (all in public schema, use double quotes):
- "Fact_Opportunity": ID_Opportunity, ID_Agent, ID_Plan, ID_Company, ID_Stage, ID_Engage_Date, ID_Close_Date, close_value
- "Fact_Subscription": ID_Subscription, ID_Company, ID_Plan, ID_Status, ID_Channel, ID_Start_Date, ID_End_Date, ID_Churn_Date, Total_users, tenure_months, monthly_amount, Churn_flag, is_active
- "Fact_Churn": ID_B2C_Churn, ID_Customer, ID_Location, ID_Contract, ID_Status, Tenure_Months, CLTV, Monthly_Charges, Total_Revenue, Satisfaction_Score, Churn_Score
- "Fact_Ticket": ID_Ticket, ID_Company, ID_Submission_Date, ID_Closing_Date, ID_Priority, resolution_time_hours, first_response_time_minutes, satisfaction_score, escalation_flag
- "Fact_Log": ID_Log, ID_Task, ID_Project, ID_Company, ID_Owner, ID_Section, ID_Start_Date, ID_Due_Date, ID_End_Date, completed
- "Dim_Agent": ID_Agent, Agent_FullName, manager, regional_office
- "Dim_Company": ID_Company, company, Industry, headquarters, employees, revenue
- "Dim_Date": ID_Date, date_value, year, quarter, month, month_name, day
- "Dim_Status": ID_Status, Customer_Status, Churn_Value, Churn_Category, Churn_Reason
- "Dim_Stage": ID_Stage, Stage_Name, Is_Closed, Is_Won, Stage_Group
- "Dim_Plan": ID_Plan, plan_name, default_price
- "Dim_Priority": ID_Priority, Priority_name
- "Dim_Contract": ID_Contract, Contract_Type
- "Dim_Customer": ID_Customer, Gender, Age, Senior_Citizen, Married
- "Dim_Location": ID_Location, Country, State, City
- "Dim_Channel": ID_Channel, channel_name, is_paid
- "Dim_Project": ID_Project, Project_Name, Team_Name, status
- "Dim_Task": ID_Task, Task_name, Task_type
- "Dim_Employee": ID_Employee, full_name, role

RULES:
1. Output only valid PostgreSQL SELECT queries.
2. Always use double quotes around table and column names.
3. For date filters, JOIN Dim_Date on the relevant ID and filter on date_value or year.
4. After the SQL, write: Domain: <domain> | Tables: <tables> | Summary: <one sentence>

EXAMPLE:
Question: How many active subscriptions are there?
Answer:
```sql
SELECT COUNT(*) AS active_subscriptions
FROM public."Fact_Subscription"
WHERE is_active = true;
```
Domain: Customers | Tables: Fact_Subscription | Summary: Returns the total count of currently active subscriptions.
"""


def _load_system_prompt() -> str:
    if _SYSTEM_PROMPT_PATH.exists():
        text = _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()
        if text:
            return text
    return SCHEMA_SUMMARY


# Loaded once at import.
_SYSTEM_PROMPT = _load_system_prompt()


def extract_sql(text: str) -> str:
    # Strip reasoning-model artifacts (ANSI codes, <think> tags) that gpt-oss
    # can leak into visible content before we try to parse SQL out of it.
    text = clean_model_text(text)
    match = re.search(r"```sql\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    match2 = re.search(r"(SELECT.+?;)", text, re.DOTALL | re.IGNORECASE)
    if match2:
        return match2.group(1).strip()
    return text.strip()


def ask_llm(question: str, history: list[dict] | None = None, language: str = "en") -> dict:
    """
    Generate SQL from a question plus optional conversation history.
    history: list of {"role": "user"|"assistant", "content": str}.
    language: 'fr' or 'en' — appended as a hint so the model's explanation/
    summary comes back in the right language (the SQL itself is language-neutral).
    """
    lang_hint = (
        "\n\nThe user's language is French. Write the Summary in French."
        if language == "fr"
        else "\n\nThe user's language is English. Write the Summary in English."
    )
    messages = [{"role": "system", "content": _SYSTEM_PROMPT + lang_hint}]

    if history:
        for msg in history:
            if msg.get("role") in ("user", "assistant") and msg.get("content"):
                messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": question})

    raw = chat(messages, max_tokens=900, temperature=0.1)
    cleaned = clean_model_text(raw)

    # The model can choose NOT to query and answer directly. It signals this
    # with a leading NO_SQL: token. When present, we skip SQL entirely and hand
    # the direct answer back to the orchestrator.
    no_sql_match = re.search(r"NO_SQL:\s*(.*)", cleaned, re.DOTALL | re.IGNORECASE)
    if no_sql_match and "```sql" not in cleaned.lower():
        direct = no_sql_match.group(1).strip()
        return {
            "sql": None,
            "direct_answer": direct or cleaned.replace("NO_SQL:", "").strip(),
            "explanation": "",
            "domain": "General",
            "tables_used": [],
            "raw_response": raw,
        }

    sql = extract_sql(raw)

    domain, tables_used, explanation = "Unknown", [], ""

    domain_match = re.search(r"Domain:\s*(.+?)\s*\|", raw)
    if domain_match:
        domain = domain_match.group(1).strip()

    tables_match = re.search(r"Tables:\s*(.+?)\s*\|", raw)
    if tables_match:
        tables_used = [t.strip() for t in tables_match.group(1).split(",")]

    summary_match = re.search(r"Summary:\s*(.+)", raw)
    if summary_match:
        explanation = clean_model_text(summary_match.group(1)).strip()

    return {
        "sql": sql,
        "direct_answer": None,
        "explanation": explanation,
        "domain": domain,
        "tables_used": tables_used,
        "raw_response": raw,
    }


def generate_natural_response(
        question: str,
        sql: str,
        data: list[dict] | None,
        row_count: int,
        language: str = "en",
) -> str:
    """
    Produce a short natural-language answer in the user's language.
    `language` is 'fr' or 'en', detected upstream — more reliable than
    sniffing the question text here.
    """
    is_fr = language == "fr"

    if not data or row_count == 0:
        return "Aucune donnée trouvée." if is_fr else "No data found."

    # Give the model enough to reason with: a wider sample plus lightweight
    # aggregates over numeric columns, so answers have real depth instead of
    # being guessed from 5 rows. We cap the sample so we don't blow the context.
    sample = data[:25]
    sample_str = "\n".join(str(row) for row in sample)
    stats_str = _summarize_numeric(data)
    context_str = sample_str
    if stats_str:
        context_str += "\n\nColumn statistics over ALL rows:\n" + stats_str

    if is_fr:
        system_prompt = (
            "Tu es un analyste Customer Success. Réponds EN FRANÇAIS, comme si tu "
            "expliquais à un collègue. Utilise les statistiques fournies pour "
            "parler de TOUTES les données, pas seulement de l'échantillon.\n\n"
            "FORMAT — respecte EXACTEMENT les sauts de ligne :\n"
            "- Ligne 1 : UNE phrase d'accroche avec le chiffre clé en **gras**.\n"
            "- Puis une ligne COMPLÈTEMENT VIDE.\n"
            "- Puis 2 à 4 puces. Chaque puce DOIT commencer sur sa propre nouvelle "
            "ligne avec « - » et être séparée de la suivante par un vrai saut de "
            "ligne. Ne jamais mettre deux puces sur la même ligne.\n"
            "- Puis une ligne COMPLÈTEMENT VIDE.\n"
            "- Dernière ligne : une courte synthèse ou action suggérée.\n\n"
            "Markdown LÉGER uniquement : **gras** et puces « - ». PAS de titres "
            "« # », PAS de tableaux, PAS de SQL. Un emoji seulement s'il aide à "
            "scanner (📊 📈 📉 ⚠️ ✅), au plus 1 à 2, jamais décoratif. Termine "
            "toujours par une phrase complète.\n\n"
            "Exemple de la forme exacte :\n"
            "**1 232 projets** sont répartis sur 15 équipes. 📊\n"
            "\n"
            "- Backend Engineering domine avec **432**, loin devant la moyenne de 82.\n"
            "- Marketing suit avec **424** ; à elles deux, ~70% du travail.\n"
            "- La plupart des autres équipes ont moins de 5 projets.\n"
            "\n"
            "Envisagez de rééquilibrer la charge vers les plus petites équipes."
        )
        user_prompt = (
            f'Question de l\'utilisateur : "{question}"\n\n'
            f"Nombre total de lignes : {row_count}\n"
            f"Aperçu des données :\n{context_str}\n\nRéponse :"
        )
    else:
        system_prompt = (
            "You are a Customer Success analyst. Answer IN ENGLISH, like you're "
            "explaining to a colleague. Use the provided statistics to speak to "
            "the FULL dataset, not just the sample.\n\n"
            "FORMAT — follow the whitespace EXACTLY:\n"
            "- Line 1: ONE punchy sentence with the key figure in **bold**.\n"
            "- Then a COMPLETELY BLANK line.\n"
            "- Then 2-4 bullet points. Each bullet MUST start on its own new line "
            "with '- ' and MUST be separated from the next by a real line break. "
            "Never put two bullets on the same line. Never continue prose after a "
            "bullet on the same line.\n"
            "- Then a COMPLETELY BLANK line.\n"
            "- Final line: one short takeaway or suggested action.\n\n"
            "Use LIGHT Markdown only: **bold** and '- ' bullets. NO '#' headers, "
            "NO tables, NO SQL. Add an emoji only when it truly aids scanning "
            "(📊 📈 📉 ⚠️ ✅), at most 1-2 total, never decorative. Always finish "
            "with a complete sentence.\n\n"
            "Example of the exact shape:\n"
            "**1,232 projects** are spread across 15 teams. 📊\n"
            "\n"
            "- Backend Engineering leads with **432**, far above the average of 82.\n"
            "- Marketing follows at **424**; together they hold ~70% of all work.\n"
            "- Most other teams sit under 5 projects each.\n"
            "\n"
            "Consider rebalancing workload toward the smaller teams."
        )
        user_prompt = (
            f'User question: "{question}"\n\n'
            f"Total rows: {row_count}\n"
            f"Data overview:\n{context_str}\n\nAnswer:"
        )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # One retry, then a CLEAN human-readable fallback. The old fallback dumped
    # raw Python dicts (str(row)) which looked like broken JSON to the user;
    # we never show that again. If the model is briefly unavailable we describe
    # the result in plain words instead.
    for attempt in range(2):
        try:
            out = clean_model_text(
                chat(messages, max_tokens=600, temperature=0.3)
            ).strip()
            if out:
                return out
        except Exception:
            if attempt == 0:
                continue  # transient hiccup — try once more
    return _readable_fallback(question, data, row_count, is_fr)


def _readable_fallback(question, data, row_count, is_fr: bool) -> str:
    """
    Plain-language summary used only when the LLM is unavailable. Never prints
    raw dicts — it names the columns and shows a couple of example values so the
    answer is still legible and on-brand.
    """
    row_word = "ligne" if is_fr else "row"
    plural = "s" if row_count != 1 else ""
    lead = (
            f"**{row_count:,}** {row_word}{plural} "
            + ("trouvée" if is_fr else "found")
            + ("s" if is_fr and row_count != 1 else "")
            + "."
    )

    # Build a couple of readable example lines from the first rows, formatted as
    # "Label — key: value" rather than a dict dump.
    examples = []
    for row in data[:3]:
        # Prefer a name-like field as the label if one exists.
        label = None
        for k in row:
            kl = k.lower()
            if "name" in kl or kl in ("company", "project", "team", "title"):
                label = str(row[k])
                break
        parts = [f"{k}: {v}" for k, v in list(row.items())[:3]]
        line = " · ".join(parts)
        examples.append(f"- {label + ' — ' if label else ''}{line}")

    tail = (
        "\n\n*(Résumé simplifié — le service d'analyse était momentanément indisponible.)*"
        if is_fr
        else "\n\n*(Simplified summary — the analysis service was briefly unavailable.)*"
    )
    body = ("\n\nExemples :\n" if is_fr else "\n\nExamples:\n") + "\n".join(examples) if examples else ""
    return lead + body + tail


def _summarize_numeric(data: list[dict]) -> str:
    """
    Compute min / max / avg / sum for numeric columns across ALL rows so the
    natural-language answer can speak to the whole result set, not just the
    sample. Returns a compact multi-line string, or "" if nothing numeric.
    """
    from numbers import Number

    if not data:
        return ""
    numeric_cols: dict[str, list] = {}
    for row in data:
        for k, v in row.items():
            if isinstance(v, Number) and not isinstance(v, bool):
                numeric_cols.setdefault(k, []).append(v)

    lines = []
    for col, vals in numeric_cols.items():
        if not vals:
            continue
        lo, hi = min(vals), max(vals)
        avg = sum(vals) / len(vals)
        total = sum(vals)
        lines.append(
            f"- {col}: min={_fmt(lo)}, max={_fmt(hi)}, "
            f"avg={_fmt(avg)}, sum={_fmt(total)} (n={len(vals)})"
        )
    return "\n".join(lines)


def _fmt(v) -> str:
    if isinstance(v, float):
        return f"{v:,.2f}".rstrip("0").rstrip(".")
    return f"{v:,}"