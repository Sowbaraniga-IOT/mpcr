# MPCR

Machine Parameter Check Record: a React + Vite frontend and a Django REST backend.

## Layout

```
mpcr-login/
├── frontend/                     React app (Vite)
│   ├── package.json              npm scripts for frontend, backend, database and QA
│   ├── vite.config.js            forwards /api to the backend
│   ├── index.html
│   ├── public/                   static files (favicon, icons, Excel templates)
│   └── src/
│       ├── main.jsx, App.jsx     entry point and top-level routing/state
│       ├── api/client.js         fetch wrapper and session token
│       ├── store/                client-side data and server sync (machines, recipes, logs …)
│       ├── utils/                helpers (display scaling)
│       ├── assets/
│       ├── components/           shared UI used by several features
│       └── features/
│           ├── auth/             sign-in and change password
│           ├── dashboard/        machine overview, header, sidebar, notifications
│           ├── log/              hourly parameter log and deviation review
│           ├── report/           report view and Excel/PDF export
│           └── settings/         machine, parameter, shift and user masters, audit trail
├── backend/                      Django project
│   ├── manage.py
│   ├── mpcr/                     project config: settings, urls, wsgi/asgi
│   ├── integrations/fanuc/       FANUC MQTT client
│   └── plant/                    the Django app
│       ├── models.py, admin.py, urls.py
│       ├── services/             business rules (logic.py) and parameter definitions (params.py)
│       ├── api/                  token authentication, permissions and REST views
│       ├── management/commands/  seed, simulate, fanuc_mqtt
│       ├── migrations/, fixtures/
│       └── tests/                API tests, one file per area
├── collector/                    MPCR EUROMAP 77 Collector: FANUC OPC UA gateway → MQTT (see its README)
├── database/                     PostgreSQL schema, seed and setup script
├── qa/                           end-to-end, performance and report scripts
├── qa-reports/                   generated QA reports
└── docker-compose.yml            PostgreSQL (and optional pgAdmin)
```

## Run it

```powershell
cd frontend
npm install
npm run backend:setup   # first time only
npm run services        # backend on :8000 in a new window, then the Vite dev server
```

Backend details: [backend/README.md](backend/README.md). Database: [database/README.md](database/README.md).
Code tour of the frontend: [LEARN.md](LEARN.md).

The FANUC client runs as `python manage.py fanuc_mqtt` or, from `backend/`, `python -m integrations.fanuc.mqtt_client`.
