# MEDIANET Nexus

A customer success-focused CRM platform built for MEDIANET, serving Tunisian and African markets. Nexus combines a Django backend, React frontend, and a PostgreSQL data warehouse to give a 360° view of clients and support proactive churn prevention.

## Overview

MEDIANET Nexus is a full-stack data product that unifies subscription, ticket, opportunity, and engagement data into a single platform, enriched with AI-powered insights and embedded BI dashboards.

**Core goals:**
- Provide a 360° view of each client (*fiche client*)
- Enable proactive churn prevention through a composite Health Score
- Surface actionable insights via AI-enhanced features (chatbot, generative BI, newsletters)

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Django (Python) |
| Frontend | React + TanStack (Router/Start) |
| Database | PostgreSQL (star schema data warehouse) |
| ETL | Talend |
| BI / Reporting | Power BI (embedded dashboards) |
| AI | LLM-powered chatbot, intent detection, and generative BI query engine |

## Project Structure

```
Medianet-NEXUS/
├── Medianet_NEXUS_Backend/    # Django REST API
│   ├── config/                 # Project settings, URLs, WSGI/ASGI
│   ├── customers/               # Customer/account management
│   ├── deals/                   # Opportunities & deals
│   ├── dropdowns/               # Shared dropdown/reference data
│   ├── projects/                # Project tracking
│   └── Gen_BI/                  # AI-powered generative BI (chatbot, query engine, charts)
└── Medianet_NEXUS_Frontend/    # React + TanStack frontend
    └── src/
        ├── components/          # UI components (AppShell, Sidebar, KPI cards, etc.)
        ├── hooks/                # Custom React hooks
        ├── lib/                 # Utilities, i18n, roles, auth helpers
        └── routes/               # App routes (dashboard, customers, deals, settings, admin)
```

## Data Model

The warehouse follows a star schema:

- `Dim_Company` — client/account dimension
- `Fact_Subscription` — subscription & contract data
- `Fact_Churn` — churn events and indicators
- `Fact_Opportunity` — sales pipeline / deals
- `Fact_Ticket` — customer support tickets
- `Fact_Log` — usage/activity logs

Raw source data (e.g. `accounts.csv`) feeds `Dim_Company` via Talend ETL pipelines, which upsert into PostgreSQL to respect foreign key constraints from fact tables.

## Key Features

- **Fiche Client** — a unified 360° client profile view combining subscription, ticket, opportunity, and engagement history
- **Health Score** — a composite score calculated at the API layer from behavioral signals (usage, tenure, support activity, deal activity), with a planned customer-voice component from survey data
- **Gen BI / AI Chatbot** — natural language querying over the data warehouse, with chart generation and intent detection
- **Embedded Power BI Dashboards** — KPI reporting embedded directly in the platform
- **Survey Agent** *(planned)* — automated satisfaction surveys feeding the Health Score
- **AI-Generated Newsletters** *(planned)*

## Getting Started

### Backend
```bash
cd Medianet_NEXUS_Backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### Frontend
```bash
cd Medianet_NEXUS_Frontend
npm install
npm run dev
```

### Environment Variables
Both `Medianet_NEXUS_Backend/.env` and `Medianet_NEXUS_Frontend/.env` are required and **not tracked in git**. Ask a team member for the current values, or see `.env.example` if available.

## Roadmap

- [ ] Fiche client (360° client profile view)
- [ ] Satisfaction survey agent
- [ ] Health Score customer-voice integration
- [ ] AI-generated newsletters
- [ ] Power BI `.pbix` DAX/KPI extraction for talk-to-data enrichment

## License

Private / internal project — not licensed for external use.