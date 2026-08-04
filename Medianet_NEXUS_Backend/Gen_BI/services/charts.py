"""
charts.py
Decide whether a data answer is better shown as a chart, and if so, emit a
compact spec the frontend renders with Recharts.
"""

import re
from datetime import date, datetime
from numbers import Number

_FORCE_CHART = re.compile(
    r"\b(chart|graph|graphique|visuali[sz]e|visualisation|plot|courbe|diagramme)\b",
    re.IGNORECASE,
)
_SUPPRESS_CHART = re.compile(
    r"\b(just the number|only the number|no chart|sans graphique|juste le chiffre|"
    r"just a number|number only)\b",
    re.IGNORECASE,
)
_TIME_HINTS = re.compile(
    r"(date|day|jour|month|mois|year|ann[ée]e|quarter|trimestre|week|semaine|time)",
    re.IGNORECASE,
)

# Column NAMES that mean "this is a time axis" even when the values are integers
# (year=2024, quarter=2, month=11). Without this, integer time columns get
# swallowed as numeric measures and the chart is either skipped or plotted with
# the wrong axis. Matched against the column name, not the value.
_TIME_COLUMN_NAME = re.compile(
    r"^(id_)?(date|day|jour|month|mois|month_name|year|ann[ée]e|quarter|"
    r"trimestre|week|semaine|period|periode|time|date_value)s?$",
    re.IGNORECASE,
)

_MAX_CHART_ROWS = 50
_MIN_CHART_ROWS = 2


def _is_number(v) -> bool:
    return isinstance(v, Number) and not isinstance(v, bool)


def _is_time_column(name: str) -> bool:
    return bool(_TIME_COLUMN_NAME.match(str(name)))


def _analyze_columns(rows: list[dict]):
    """
    Split columns into label (axis) keys and numeric (measure) keys.
    Time-named columns are always treated as labels/axis even if their values
    are integers (year, quarter, month), so timeseries charts pick them up as
    the x-axis instead of mistaking them for a measure.
    """
    if not rows:
        return [], []
    first = rows[0]
    numeric_keys, label_keys = [], []
    for k, v in first.items():
        if _is_time_column(k):
            label_keys.append(k)
        elif _is_number(v):
            numeric_keys.append(k)
        elif isinstance(v, (str, date, datetime)) or v is None:
            label_keys.append(k)
    return label_keys, numeric_keys


def build_chart_spec(question: str, data: list[dict] | None) -> dict | None:
    """
    Decide whether a chart adds value, based on the SHAPE of the result rather
    than only on chart keywords. A chart auto-appears when the data has a label
    column + a numeric column + enough rows to be worth plotting — even if the
    user never said "chart". Explicit suppression ("just the number") still wins;
    an explicit "chart"/"graph" request still forces one past the row bounds.
    """
    if not data:
        return None
    suppressed = bool(_SUPPRESS_CHART.search(question))
    forced = bool(_FORCE_CHART.search(question))
    if suppressed and not forced:
        return None

    n = len(data)
    label_keys, numeric_keys = _analyze_columns(data)

    # A single scalar answer (one row, e.g. a COUNT) is better as text.
    if not label_keys or not numeric_keys:
        return None
    if n < _MIN_CHART_ROWS and not forced:
        return None
    if n > _MAX_CHART_ROWS and not forced:
        # Too many rows to plot cleanly unless explicitly requested — but we can
        # still cap and show the top slice, which is usually what's wanted.
        cap = _MAX_CHART_ROWS
        return _spec_from(question, data, label_keys, numeric_keys, cap=cap)

    return _spec_from(question, data, label_keys, numeric_keys, cap=None)


def _wants_pie(question: str) -> bool:
    return bool(re.search(r"\b(pie|camembert|share|proportion|répartition|part de)\b",
                          question, re.IGNORECASE))


def _spec_from(question, data, label_keys, numeric_keys, cap=None):
    # Prefer a genuine time column as the x-axis (year, quarter, month...),
    # so "deals per quarter" plots quarters on x even if another label column
    # sorts first alphabetically. Falls back to the first label otherwise.
    time_labels = [k for k in label_keys if _is_time_column(k) or _TIME_HINTS.search(str(k))]
    x = time_labels[0] if time_labels else label_keys[0]
    y = numeric_keys[0]

    # Sort chronologically when the axis is a numeric time column (quarter=1,2,3)
    # so the line reads left-to-right in order, not in result order.
    rows = list(data)
    if x in (k for k in label_keys if _is_time_column(k)):
        try:
            rows = sorted(rows, key=lambda r: (r.get(x) is None, r.get(x)))
        except TypeError:
            pass
    rows = rows[:cap] if cap else rows

    if time_labels:
        ctype = "line"
    elif _wants_pie(question) and len(rows) <= 6:
        ctype = "pie"
    else:
        ctype = "bar"
    slim = [{x: _label(r.get(x)), y: r.get(y)} for r in rows]
    return {"type": ctype, "x": x, "y": y, "data": slim, "title": _title(question)}


def _label(v):
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return "" if v is None else str(v)


def _title(question: str) -> str:
    q = question.strip()
    return (q[:60] + "…") if len(q) > 60 else q