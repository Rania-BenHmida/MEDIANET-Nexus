from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "django-insecure-9=s2b*0d4l$p)8kvomwy80%-34nh@=gewfde%_kb^#et3q*q!u")

DEBUG = os.getenv("DEBUG", "True") == "True"

ALLOWED_HOSTS = ["localhost", "127.0.0.1", "nflsnhl4-8000.euw.devtunnels.ms"]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "corsheaders",
    "deals",
    "dropdowns",
    "projects",
    "Gen_BI",
    "customers"
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

CORS_ALLOWED_ORIGINS = ["http://localhost:8080", "http://localhost:5173", "https://nflsnhl4-5173.euw.devtunnels.ms"]

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
    }
}

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"