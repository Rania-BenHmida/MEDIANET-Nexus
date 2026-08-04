from django.urls import path
from . import views

urlpatterns = [
    # Projects (Dim_Project — direct warehouse CRUD)
    path("statuses/", views.project_statuses, name="project-statuses"),
    path("",     views.projects_collection, name="projects-collection"),
    path("<int:pk>/", views.project_detail, name="project-detail"),

    # Tasks (Fact_Log + Dim_Task — staging create, warehouse read/correct)
    path("tasks/",                              views.tasks_list,        name="tasks-list"),
    path("tasks/create/",                       views.create_task,       name="tasks-create"),
    path("tasks/pending/<str:task_id>/delete/", views.delete_pending,    name="tasks-delete-pending"),
    path("tasks/<int:pk>/",                     views.task_detail,       name="task-detail"),
    path("tasks/<int:pk>/delete/",              views.delete_historical, name="tasks-delete-historical"),
]