from db import get_warehouse_conn, release_warehouse_conn


def get_overview_stats() -> dict:
    """
    GET /api/dashboard/stats/ — top-level KPI strip for the Executive
    Overview page. Blends numbers across every domain (Deals, Projects, B2B
    Subscriptions, B2C Churn) rather than reading from a single fact table.

    Total Revenue = Closed-Won deal revenue (Fact_Opportunity.close_value)
                  + B2B revenue (Fact_Subscription.annual_amount)
                  + B2C revenue (Fact_Churn.Total_Revenue)
      This sums three genuinely different revenue concepts — one-off closed
      deals, recurring B2B contract value, and B2C lifetime-to-date revenue.
      Treat it as a headline "size of the business" figure for the exec
      overview, not a like-for-like financial statement line.

    Overall Churn Rate = (B2B churned subs + B2C churned customers)
                        / (total B2B subs + total B2C customers)
      Weighted by entity count, not revenue — a company with 1 subscription
      and a consumer with 1 account count equally here. Simplest defensible
      blend across two different churn definitions; flag if you'd rather
      weight this by revenue instead.
    """
    conn = get_warehouse_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                        SELECT COALESCE(SUM(o."close_value"), 0) AS deals_revenue
                        FROM public."Fact_Opportunity" o
                                 JOIN public."Dim_Stage" s ON o."ID_Stage" = s."ID_Stage"
                        WHERE s."Is_Won" = true
                        """)
            deals_row = cur.fetchone()

            cur.execute("""
                        SELECT COUNT(*) AS open_count
                        FROM public."Fact_Opportunity" o
                                 JOIN public."Dim_Stage" s ON o."ID_Stage" = s."ID_Stage"
                        WHERE s."Is_Closed" = false
                        """)
            open_deals_row = cur.fetchone()

            cur.execute("""
                        SELECT
                            COALESCE(SUM("annual_amount"), 0)           AS b2b_revenue,
                            COUNT(DISTINCT "ID_Company")                AS total_companies,
                            COUNT(*)                                    AS total_subs,
                            COUNT(*) FILTER (WHERE "Churn_flag" = true) AS b2b_churned
                        FROM public."Fact_Subscription"
                        """)
            b2b_row = cur.fetchone()

            cur.execute("""
                        SELECT
                            COALESCE(SUM(fc."Total_Revenue"), 0)             AS b2c_revenue,
                            COUNT(DISTINCT fc."ID_Customer")                 AS total_customers,
                            COUNT(DISTINCT fc."ID_Customer") FILTER (
                                WHERE ds."Churn_Value" = true
                            )                                                AS b2c_churned
                        FROM public."Fact_Churn" fc
                                 JOIN public."Dim_Status" ds ON fc."ID_Status" = ds."ID_Status"
                        """)
            b2c_row = cur.fetchone()

            cur.execute("""
                        SELECT COUNT(*) FILTER (WHERE "status" = 'active') AS active_projects
                        FROM public."Dim_Project"
                        """)
            proj_row = cur.fetchone()
    finally:
        release_warehouse_conn(conn)

    deals_revenue = float(deals_row["deals_revenue"])
    b2b_revenue   = float(b2b_row["b2b_revenue"])
    b2c_revenue   = float(b2c_row["b2c_revenue"])
    total_revenue = deals_revenue + b2b_revenue + b2c_revenue

    open_deals      = int(open_deals_row["open_count"])
    active_projects = int(proj_row["active_projects"])

    total_companies = int(b2b_row["total_companies"])
    total_customers = int(b2c_row["total_customers"])
    total_accounts   = total_companies + total_customers

    total_entities = int(b2b_row["total_subs"]) + total_customers
    total_churned  = int(b2b_row["b2b_churned"]) + int(b2c_row["b2c_churned"])
    overall_churn_rate = round(100 * total_churned / total_entities, 1) if total_entities else 0

    return {
        "totalRevenue":     total_revenue,
        "activeDeals":      open_deals,
        "activeProjects":   active_projects,
        "overallChurnRate": overall_churn_rate,
        "totalAccounts":    total_accounts,
    }