"""MPCR backend settings. Every value can be overridden from the environment or an env file:
backend/.env by default, or the file named by DJANGO_ENV_FILE (e.g. .env.production).

Safe by default: DEBUG is off, a secret key is required, only localhost is served.
Development turns DEBUG on in backend/.env (copied from .env.example)."""
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

# A minimal .env reader, so no extra package is needed. Real environment variables win.
_env_file = BASE_DIR / os.environ.get('DJANGO_ENV_FILE', '.env')
if _env_file.exists():
    for line in _env_file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip())


def env(key, default=''):
    return os.environ.get(key, default)


DEBUG = env('DJANGO_DEBUG', '0') == '1'

SECRET_KEY = env('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured(
            'Set DJANGO_SECRET_KEY (50+ random characters) in backend/.env or the environment. '
            'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(64))"'
        )
    SECRET_KEY = 'dev-only-' + 'x' * 60  # never used with DEBUG off

# Host names the server answers to, e.g. "mpcr.plant01.local,10.20.1.15". No wildcard by default.
ALLOWED_HOSTS = [h.strip() for h in env('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()]

# ---------- HTTPS ----------
# DJANGO_HTTPS=1 when the app is served over https (directly or behind IIS / nginx terminating TLS).
# Plain-http plant networks leave it 0; `manage.py check --deploy` then lists the https warnings.
HTTPS = env('DJANGO_HTTPS', '0') == '1'
if HTTPS:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    # Browsers remember "https only" for this long. Start low (e.g. 3600) on a new host, then raise.
    SECURE_HSTS_SECONDS = int(env('DJANGO_HSTS_SECONDS', '31536000'))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = env('DJANGO_HSTS_INCLUDE_SUBDOMAINS', '1') == '1'
    SECURE_HSTS_PRELOAD = env('DJANGO_HSTS_PRELOAD', '1') == '1'
    # Behind a proxy that terminates TLS and sets X-Forwarded-Proto.
    if env('DJANGO_BEHIND_PROXY', '0') == '1':
        SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    CSRF_TRUSTED_ORIGINS = [f'https://{h}' for h in ALLOWED_HOSTS]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'plant',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'mpcr.urls'
WSGI_APPLICATION = 'mpcr.wsgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ]
        },
    }
]

if env('DB_ENGINE', 'sqlite') == 'postgres':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'HOST': env('DB_HOST', 'localhost'),
            'PORT': env('DB_PORT', '5432'),
            'NAME': env('DB_NAME', 'mpcr_db'),
            'USER': env('DB_USER', 'mpcr_user'),
            'PASSWORD': env('DB_PASSWORD', ''),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'mpcr.sqlite',  # django.db.backends.sqlite3 + WAL + BEGIN IMMEDIATE
            # SQLITE_PATH picks another file, e.g. the end-to-end tests' own database.
            'NAME': Path(env('SQLITE_PATH')) if env('SQLITE_PATH') else BASE_DIR / 'db.sqlite3',
            # The simulator and the API write at the same time.
            'OPTIONS': {'timeout': 20},
        }
    }

AUTH_USER_MODEL = 'plant.User'
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 6}}]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = env('TIME_ZONE', 'Asia/Kolkata')
USE_I18N = False
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Machine photos arrive as data URLs.
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024

# A sign-in token ends after this many hours without a request (one shift plus a margin).
# The dashboard polls every 10 s, so an open screen never runs out; a closed one does.
TOKEN_IDLE_HOURS = float(env('DJANGO_TOKEN_IDLE_HOURS', '12'))

# Largest machine photo accepted, after the browser has shrunk it (it is stored as a data URL).
MAX_PHOTO_BYTES = int(env('DJANGO_MAX_PHOTO_BYTES', str(2 * 1024 * 1024)))

# ---------- Sign-in protection ----------
# An account is locked for LOGIN_LOCK_MINUTES after LOGIN_MAX_FAILURES wrong access codes in a row
# (the correct code is refused too while locked). One network address is refused for the same
# time after LOGIN_IP_MAX_FAILURES failures on any accounts. Successful sign-ins never count.
LOGIN_MAX_FAILURES = int(env('DJANGO_LOGIN_MAX_FAILURES', '5'))
LOGIN_LOCK_MINUTES = int(env('DJANGO_LOGIN_LOCK_MINUTES', '15'))
LOGIN_IP_MAX_FAILURES = int(env('DJANGO_LOGIN_IP_MAX_FAILURES', '20'))
# Behind IIS / nginx every request comes from the proxy; then the client address is read from
# X-Forwarded-For, trusting that many proxies.
LOGIN_TRUSTED_PROXIES = int(env('DJANGO_TRUSTED_PROXIES', '0'))
# Per-address counters live in Django's cache. The default is per process; with several server
# processes, set a shared cache (e.g. Django's DatabaseCache or Redis) so they share the count.

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['plant.api.authentication.PlantTokenAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['plant.api.permissions.PlantAccess'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'EXCEPTION_HANDLER': 'plant.api.views.common.exception_handler',
}

# The Vite dev server proxies /api, so CORS is only needed when the frontend is served elsewhere.
CORS_ALLOWED_ORIGINS = [o for o in env('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173').split(',') if o]

# The plant's EUROMAP 77 collector (OPC UA → MQTT) that `manage.py euromap_bridge` listens to.
FANUC_MQTT_HOST = env('FANUC_MQTT_HOST', 'localhost')
FANUC_MQTT_PORT = int(env('FANUC_MQTT_PORT', '1883'))
FANUC_MQTT_TOPIC = env('FANUC_MQTT_TOPIC', 'mpcr/euromap77/raw')  # MPCR's own collector (../collector); the plant collector uses factory/euromap77/raw
FANUC_MQTT_USER = env('FANUC_MQTT_USER', '')
FANUC_MQTT_PASSWORD = env('FANUC_MQTT_PASSWORD', '')
# Collector machine names that don't match an MPCR id apart from punctuation: "J1030=J10-30,…"
FANUC_MACHINE_MAP = env('FANUC_MACHINE_MAP', '')
