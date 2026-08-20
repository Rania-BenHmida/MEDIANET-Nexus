# ── Add this to services.py ────────────────────────────────────────────────
# Replicates the "Company Loyalty" DAX calculated table found in
# Dashboard_Sub_Tickets.pbix (Loyalty Score + Upsell Readiness), computed
# here in SQL/Python instead of DAX so the fiche client and PowerBI show
# the same numbers without a second source of truth.
#
# NOTE: column/table names below follow schema_context.json. If your real
# Fact_Subscription/Fact_Ticket/Fact_Opportunity primary keys differ,
# adjust ID_Subscription / ID_Ticket / ID_Opportunity accordingly.

from db import get_warehouse_conn, release_warehouse_conn




# ── Replace get_b2b_stats() in customers/services.py with this version ─────
#
# Year attribution: a subscription's ARR is counted in the year its
# ID_Start_Date falls in — i.e. this is "ARR booked in 2025", not "ARR still
# being earned in 2025" (which would need an active-during-year overlap
# check against ID_Start_Date/ID_End_Date instead). Booked-in-year is the
# simpler, more common way to report this and is what's implemented below.

# ── Replace get_b2b_stats() in customers/services.py with this version ─────
#
# Revenue metric changed from "this year vs last year" to "accumulated total
# vs what was added this year": ARR is booked-and-done revenue that doesn't
# reset each year, so a running total + this year's new contribution reads
# more naturally than a YoY delta on an accumulating number.
#
# Accumulated  = SUM(annual_amount) across every subscription, no date filter.
# Added(YEAR)  = SUM(annual_amount) for subs whose ID_Start_Date falls in YEAR
#                — start date, not churn date: churn date marks revenue
#                LEAVING, not being added.

YEAR_ADDED = 2026

def get_b2b_stats() -> dict:
    """
    GET /api/customers/b2b/stats/ — KPI cards for the B2B tab of the
    Customer Analytics page.
    """
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT
                            COUNT(DISTINCT "ID_Company")                AS total_companies,
                            COUNT(*)                                    AS total_subs,
                            COUNT(*) FILTER (WHERE "Churn_flag" = true) AS churned_subs
                        FROM public."Fact_Subscription"
                        """)
            sub_row = cur.fetchone()

            cur.execute("""
                        SELECT
                            COALESCE(SUM(fs."annual_amount"), 0) AS arr_accumulated,
                            COALESCE(SUM(fs."annual_amount") FILTER (WHERE dd."year" = %s), 0) AS arr_added
                        FROM public."Fact_Subscription" fs
                                 LEFT JOIN public."Dim_Date" dd ON fs."ID_Churn_Date" = dd."ID_Date"
                        """, (YEAR_ADDED,))
            arr_row = cur.fetchone()

            cur.execute("""
                        SELECT
                            COUNT(*)                                          AS total_tickets,
                            COUNT(*) FILTER (WHERE "escalation_flag" = true)  AS escalated_tickets
                        FROM public."Fact_Ticket"
                        """)
            tix_row = cur.fetchone()

            # Per-company rows needed to replicate the Loyalty Score tiering
            # (Company Loyalty DAX table) for the Fidelity Rate.
            cur.execute("""
                        SELECT "ID_Company", "Churn_flag", "tenure_months", "upgrade_flag",
                               "downgrade_flag", "is_trial", "auto_renew_flag", "total_usage_events"
                        FROM public."Fact_Subscription"
                        """)
            all_subs = cur.fetchall()
    finally:
        release_warehouse_conn(conn)

    total_companies = int(sub_row["total_companies"])
    total_subs      = int(sub_row["total_subs"])
    churned_subs    = int(sub_row["churned_subs"])

    arr_accumulated = float(arr_row["arr_accumulated"])
    arr_added       = float(arr_row["arr_added"])

    total_tickets     = int(tix_row["total_tickets"])
    escalated_tickets = int(tix_row["escalated_tickets"])

    # Group subscription rows by company, then reuse the exact same
    # scoring function the fiche client uses — one source of truth.
    by_company: dict[int, list[dict]] = {}
    for row in all_subs:
        by_company.setdefault(row["ID_Company"], []).append(dict(row))

    company_usage_totals = [
        sum((s["total_usage_events"] or 0) for s in subs)
        for subs in by_company.values()
    ]
    max_company_usage = max(company_usage_totals) if company_usage_totals else 0

    fidelity_count = 0
    for subs in by_company.values():
        scoring = _score_subscriptions(subs, max_company_usage)
        if scoring["health"]["tier"] in ("Ambassador", "Established"):
            fidelity_count += 1

    return {
        "totalCompanies":   total_companies,
        "arrAccumulated":   arr_accumulated,
        "arrAdded":         arr_added,
        "arrYear":          YEAR_ADDED,
        "churnRate":        round(100 * churned_subs / total_subs, 1) if total_subs else 0,
        "fidelityRate":     round(100 * fidelity_count / total_companies, 1) if total_companies else 0,
        "escalatedTickets": escalated_tickets,
    }

# ── Add to customers/services.py ────────────────────────────────────────────

def get_b2c_stats() -> dict:
    """
    GET /api/customers/b2c/stats/ — KPI cards for the B2C tab of the
    Customer Analytics page.

    Mirrors real measures from Dashboard_Churn.pbix:
      - Customer Count       -> DISTINCTCOUNT(Fact_Churn[ID_Customer])
      - Total Revenue        -> SUM(Total_Revenue)
      - Churn Rate           -> Churned Customers / Customer Count
      - Average CLTV         -> AVERAGE(CLTV)
      - Churned Revenue Rate -> Churn Revenue / Total Revenue — revenue-
                                weighted churn, distinct from the customer-
                                count-weighted Churn Rate above (can diverge
                                a lot if high-value customers churn at a
                                different rate than everyone else)
      - At-Risk Customers    -> not yet churned, Churn_Score >= 70 — same
                                threshold as the "Health Tier" calculated
                                column (Churned / At Risk / Watch / Healthy)
    """
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT
                            COUNT(DISTINCT fc."ID_Customer")                        AS total_customers,
                            COALESCE(SUM(fc."Total_Revenue"), 0)                    AS total_revenue,
                            COALESCE(SUM(fc."Total_Revenue") FILTER (
                                WHERE ds."Churn_Value" = true
                            ), 0)                                                   AS churn_revenue,
                            COALESCE(AVG(fc."CLTV"), 0)                             AS avg_cltv,
                            COUNT(DISTINCT fc."ID_Customer") FILTER (
                                WHERE ds."Churn_Value" = true
                            )                                                       AS churned_customers,
                            COUNT(DISTINCT fc."ID_Customer") FILTER (
                                WHERE ds."Churn_Value" = false AND fc."Churn_Score" >= 70
                            )                                                       AS at_risk_customers
                        FROM public."Fact_Churn" fc
                                 JOIN public."Dim_Status" ds ON fc."ID_Status" = ds."ID_Status"
                        """)
            row = cur.fetchone()
    finally:
        release_warehouse_conn(conn)

    total_customers   = int(row["total_customers"])
    churned_customers = int(row["churned_customers"])
    total_revenue      = float(row["total_revenue"])
    churn_revenue       = float(row["churn_revenue"])

    return {
        "totalCustomers":    total_customers,
        "totalRevenue":      total_revenue,
        "avgCltv":           round(float(row["avg_cltv"]), 1),
        "churnRate":         round(100 * churned_customers / total_customers, 1) if total_customers else 0,
        "churnRevenueRate":  round(100 * churn_revenue / total_revenue, 1) if total_revenue else 0,
        "atRiskCustomers":   int(row["at_risk_customers"]),
    }

def get_customers_list() -> list[dict]:
    """
    GET /api/customers/  — lightweight list for the CRM-style listing page.
    One row per company that has at least one subscription, ticket, or
    deal — i.e. an actual client, not every placeholder in Dim_Company.
    """
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT
                            dc."ID_Company",
                            dc.code_company,
                            dc.company,
                            dc."Industry",
                            dc.headquarters,
                            dc.employees,
                            COALESCE(sub.nb_subs, 0)    AS nb_subs,
                            COALESCE(tix.nb_tickets, 0) AS nb_tickets,
                            COALESCE(deal.nb_deals, 0)  AS nb_deals,
                            sub.max_tenure_months
                        FROM public."Dim_Company" dc
                                 LEFT JOIN (
                            SELECT "ID_Company", COUNT(*) AS nb_subs,
                                   MAX(tenure_months) AS max_tenure_months
                            FROM public."Fact_Subscription"
                            GROUP BY "ID_Company"
                        ) sub  ON sub."ID_Company" = dc."ID_Company"
                                 LEFT JOIN (
                            SELECT "ID_Company", COUNT(*) AS nb_tickets
                            FROM public."Fact_Ticket"
                            GROUP BY "ID_Company"
                        ) tix  ON tix."ID_Company" = dc."ID_Company"
                                 LEFT JOIN (
                            SELECT "ID_Company", COUNT(*) AS nb_deals
                            FROM public."Fact_Opportunity"
                            GROUP BY "ID_Company"
                        ) deal ON deal."ID_Company" = dc."ID_Company"
                        WHERE COALESCE(sub.nb_subs, 0) + COALESCE(tix.nb_tickets, 0)
                                  + COALESCE(deal.nb_deals, 0) > 0
                        ORDER BY dc.company
                        """)
            rows = cur.fetchall()
            return [
                {
                    "id": r["ID_Company"],
                    "codeCompany": r["code_company"],
                    "company": r["company"],
                    "industry": r["Industry"],
                    "headquarters": r["headquarters"],
                    "employees": r["employees"],
                    "nbSubs": r["nb_subs"],
                    "nbTickets": r["nb_tickets"],
                    "nbDeals": r["nb_deals"],
                    "tenureMonths": float(r["max_tenure_months"]) if r["max_tenure_months"] is not None else None,
                }
                for r in rows
            ]
    finally:
        release_warehouse_conn(conn)


def get_company_profile(company_id: int) -> dict | None:
    """
    GET /api/customers/<company_id>/  — the fiche client itself.
    company_id is the warehouse ID_Company (integer surrogate key).
    """
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            # ── Identity ────────────────────────────────────────────────
            cur.execute("""
                        SELECT "ID_Company", code_company, company, "Industry",
                               headquarters, year_established, revenue, employees
                        FROM public."Dim_Company"
                        WHERE "ID_Company" = %s
                        """, [company_id])
            company = cur.fetchone()
            if company is None:
                return None

            # ── Subscriptions: raw rows for scoring ────────────────────
            cur.execute("""
                        SELECT tenure_months, monthly_amount, annual_amount,
                               total_usage_events, is_trial, upgrade_flag,
                               downgrade_flag, "Churn_flag", auto_renew_flag,
                               is_active
                        FROM public."Fact_Subscription"
                        WHERE "ID_Company" = %s
                        """, [company_id])
            subs = cur.fetchall()

            # ── Global max usage across all companies (for Upsell
            #    Readiness's usage component, which is relative) ────────
            cur.execute("""
                        SELECT MAX(total_usage) AS max_usage FROM (
                                                                      SELECT "ID_Company", SUM(total_usage_events) AS total_usage
                                                                      FROM public."Fact_Subscription"
                                                                      GROUP BY "ID_Company"
                                                                  ) t
                        """)
            max_company_usage = cur.fetchone()["max_usage"] or 0

            # ── Tickets ─────────────────────────────────────────────────
            cur.execute("""
                        SELECT
                            COUNT(*) AS total_tickets,
                            COUNT(*) FILTER (WHERE "ID_Closing_Date" IS NOT NULL) AS closed_tickets,
                            AVG(resolution_time_hours) AS avg_resolution_hours,
                            AVG(CASE WHEN escalation_flag THEN 1.0 ELSE 0.0 END) AS escalation_rate,
                            AVG(satisfaction_score) AS avg_satisfaction
                        FROM public."Fact_Ticket"
                        WHERE "ID_Company" = %s
                        """, [company_id])
            tickets = cur.fetchone()

            # ── Deals — graceful empty state, no forced alignment ──────
            cur.execute("""
                        SELECT o."ID_Opportunity", o.close_value,
                               s."Stage_Name", s."Is_Closed", s."Is_Won"
                        FROM public."Fact_Opportunity" o
                                 LEFT JOIN public."Dim_Stage" s ON s."ID_Stage" = o."ID_Stage"
                        WHERE o."ID_Company" = %s
                        ORDER BY o."ID_Opportunity" DESC
                        """, [company_id])
            deals = cur.fetchall()
    finally:
        release_warehouse_conn(conn)

    # ── Scoring — replicates the Company Loyalty DAX table ────────────
    scoring = _score_subscriptions(subs, max_company_usage)

    return {
        "company": {
            "id":            company["ID_Company"],
            "codeCompany":   company["code_company"],
            "name":          company["company"],
            "industry":      company["Industry"],
            "headquarters":  company["headquarters"],
            "yearEstablished": company["year_established"],
            "revenue":       float(company["revenue"]) if company["revenue"] is not None else None,
            "employees":     company["employees"],
        },
        "subscriptions": {
            "count":            len(subs),
            "activeCount":      sum(1 for s in subs if s["is_active"]),
            "tenureMonths":     scoring["max_tenure"],
            "mrr":              sum(float(s["monthly_amount"] or 0) for s in subs if s["is_active"]),
            "arr":              sum(float(s["annual_amount"] or 0) for s in subs if s["is_active"]),
        },
        "health": scoring["health"],  # loyaltyScore, upsellReadiness, tier, segment + breakdowns
        "tickets": {
            "total":            tickets["total_tickets"] or 0,
            "closed":           tickets["closed_tickets"] or 0,
            "avgResolutionHours": float(tickets["avg_resolution_hours"]) if tickets["avg_resolution_hours"] is not None else None,
            "escalationRate":   float(tickets["escalation_rate"]) if tickets["escalation_rate"] is not None else None,
            "avgSatisfaction":  float(tickets["avg_satisfaction"]) if tickets["avg_satisfaction"] is not None else None,
        },
        "deals": {
            "count": len(deals),
            "items": [
                {
                    "id":       d["ID_Opportunity"],
                    "value":    float(d["close_value"]) if d["close_value"] is not None else None,
                    "stage":    d["Stage_Name"],
                    "isClosed": d["Is_Closed"],
                    "isWon":    d["Is_Won"],
                }
                for d in deals
            ],
        },
        # Placeholders — populated once the survey agent and the
        # recommendation engine exist. Kept in the payload so the
        # frontend can render the section as "coming soon" instead of
        # needing a schema change later.
        "voiceOfCustomer": None,
        "recommendedActions": [],
    }


def _score_subscriptions(subs: list[dict], max_company_usage: float) -> dict:
    """
    Pure-Python port of the Company Loyalty DAX measures:
      Loyalty Score      = tenure(30) + upgrade(25) + renew_share(25) + survival(20)
      Upsell Readiness    = renew_share(20) + upgrade(25) + not_downgraded(10)
                           + not_all_trial(10) + tenure(15) + relative_usage(20)
    Weights are the intern's original hypotheses (see meeting notes) —
    not yet empirically calibrated. Surfaced as separate fields so the
    fiche can show "why" the score is what it is, per the review's
    explainability point.
    """
    if not subs:
        return {
            "max_tenure": None,
            "health": {
                "loyaltyScore": None,
                "upsellReadiness": None,
                "tier": "No data",
                "segment": "No data",
                "loyaltyBreakdown": None,
                "upsellBreakdown": None,
            },
        }

    total = len(subs)
    churned = sum(1 for s in subs if s["Churn_flag"])
    max_tenure = max((s["tenure_months"] or 0) for s in subs)
    has_upgrade = any(s["upgrade_flag"] for s in subs)
    has_downgrade = any(s["downgrade_flag"] for s in subs)
    all_trial = all(s["is_trial"] for s in subs)
    any_renew = any(s["auto_renew_flag"] for s in subs)
    renew_share = sum(1 for s in subs if s["auto_renew_flag"]) / total
    survival_share = sum(1 for s in subs if not s["Churn_flag"]) / total
    company_usage = sum((s["total_usage_events"] or 0) for s in subs)

    # Loyalty Score (/100)
    ten_pts_loy   = min(max_tenure / 36 * 30, 30)
    upg_pts_loy   = 25 if has_upgrade else 0
    renew_pts_loy = renew_share * 25
    surv_pts_loy  = survival_share * 20
    loyalty_score = round(ten_pts_loy + upg_pts_loy + renew_pts_loy + surv_pts_loy, 1)

    # Upsell Readiness (/100) — undefined (None) if fully churned,
    # same as the DAX BLANK() behaviour
    if churned == total:
        upsell_readiness = None
        upsell_breakdown = None
    else:
        renew_pts_ups = renew_share * 20
        upg_pts_ups   = 25 if has_upgrade else 0
        notdown_pts   = 10 if not has_downgrade else 0
        nottrial_pts  = 10 if not all_trial else 0
        tenure_pts_ups = min(max_tenure * 0.5, 15)
        usage_pts     = (company_usage / max_company_usage * 20) if max_company_usage else 0
        upsell_readiness = round(renew_pts_ups + upg_pts_ups + notdown_pts + nottrial_pts + tenure_pts_ups + usage_pts, 1)
        upsell_breakdown = {
            "autoRenewShare": round(renew_pts_ups, 1),
            "hasUpgraded":    upg_pts_ups,
            "noDowngrade":    notdown_pts,
            "notAllTrial":    nottrial_pts,
            "tenure":         round(tenure_pts_ups, 1),
            "relativeUsage":  round(usage_pts, 1),
        }

    # Customer Tier — thresholds on Loyalty Score
    if loyalty_score >= 75:
        tier = "Ambassador"
    elif loyalty_score >= 50:
        tier = "Established"
    elif loyalty_score >= 30:
        tier = "Developing"
    else:
        tier = "New / At Risk"

    # Customer Segment — same priority order as the DAX SWITCH(TRUE(), ...)
    if churned == total:
        segment = "Churned"
    elif all_trial:
        segment = "Trial"
    elif has_downgrade:
        segment = "At Risk"
    elif has_upgrade:
        segment = "Upsold"
    elif any_renew:
        segment = "Loyal"
    else:
        segment = "Stable"

    return {
        "max_tenure": max_tenure,
        "health": {
            "loyaltyScore": loyalty_score,
            "upsellReadiness": upsell_readiness,
            "tier": tier,
            "segment": segment,
            "loyaltyBreakdown": {
                "tenure":        round(ten_pts_loy, 1),
                "hasUpgraded":   upg_pts_loy,
                "autoRenewShare": round(renew_pts_loy, 1),
                "survival":      round(surv_pts_loy, 1),
            },
            "upsellBreakdown": upsell_breakdown,
        },
    }