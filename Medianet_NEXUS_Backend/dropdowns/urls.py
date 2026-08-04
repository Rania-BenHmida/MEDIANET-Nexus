from django.urls import path
from . import views

urlpatterns = [
    path("companies/",              views.companies,             name="companies"),
    path("companies/industries/",   views.company_industries,    name="company-industries"),
    path("companies/headquarters/", views.company_headquarters,  name="company-headquarters"),
    path("plans/",                  views.plans,                 name="plans"),
    path("agents/",                 views.agents,                name="agents"),
    path("agents/managers/",        views.agent_managers,        name="agent-managers"),
    path("agents/offices/",         views.agent_offices,         name="agent-offices"),
    path("stages/",                 views.stages,                name="stages"),
    path("employees/",     views.employees,     name="employees"),
    path("companies/all/", views.companies_all, name="companies-all"),
    path("tags/", views.tags, name="tags"),
    path("sections/", views.sections, name="sections"),
    path("teams/",    views.project_teams, name="project-teams"),
    path("employees/teams/", views.employee_teams, name="employee-teams"),
]