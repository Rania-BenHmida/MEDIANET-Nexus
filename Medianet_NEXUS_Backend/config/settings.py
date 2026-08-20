from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "django-insecure-9=s2b*0d4l$p)8kvomwy80%-34nh@=gewfde%_kb^#et3q*q!u")

DEBUG = os.getenv("DEBUG", "True") == "True"

ALLOWED_HOSTS = ["localhost", "127.0.0.1", "medianet-nexus.local"]

INSTALLED_APPS = [
    "rest_framework",
    "corsheaders",
    "deals",
    "dropdowns",
    "projects",
    "Gen_BI",
    "customers",
    "surveys",
    "insights",
    "talend",
    "dashboard",
    "accounts",

]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

CORS_ALLOWED_ORIGINS = ["http://localhost:8080", "http://localhost:5173", "http://medianet-nexus.local:5173","https://medianet-nexus.local:5173",]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
            ],
        },
    },
]

from pathlib import Path

TALEND_JOB_DIR = Path(r"D:\Projet_pfe\Talend Job\Data_Master")
TALEND_JOB_PATH = str(TALEND_JOB_DIR / "Data_Master_run.bat")
TALEND_LAST_RUN_FILE = BASE_DIR / "talend_last_run.json"

def _parse_db(url: str) -> dict:
    from urllib.parse import urlparse
    r = urlparse(url)
    return {
        "NAME": r.path.lstrip("/"),
        "USER": r.username,
        "PASSWORD": r.password,
        "HOST": r.hostname,
        "PORT": r.port or 5432,
    }

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        **_parse_db(os.environ["WAREHOUSE_DATABASE_URL"]),
    },
    "surveys": {
        "ENGINE": "django.db.backends.postgresql",
        **_parse_db(os.environ["SURVEYS_DATABASE_URL"]),
    },
}

DATABASE_ROUTERS = ["config.db_router.SurveysRouter"]

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
}

# Email — Gmail SMTP with an app password (Google Account → Security →
# 2-Step Verification → App passwords). Never use your real account
# password here. See .env for the actual credentials.
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER)

# Used to build the public survey link (FRONTEND_URL/survey/<token>) sent in the email.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


# Shared secret the Node/Better-Auth side must send (X-Internal-Key header)
# to call accounts/send-account-email/ — see accounts/views.py.
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"