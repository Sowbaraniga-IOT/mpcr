# MPCR backend (Django + Django REST framework)

The server behind the React app. Everything the app shows comes from here:

- users and role permissions
- machines, molds, parts and shifts
- recipes (parameter standards)
- hourly readings, deviations and their two-level approval
- notifications, the audit trail and the report

## Run it

The backend has its own Python environment in `backend/.venv`, so its packages don't affect other Python projects on the same computer. It's created once:

```powershell
cd backend
copy .env.example .env       # development settings (DEBUG on)
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt   # Django 5.2 LTS, DRF 3.18, …
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py seed      # 5 users, 48 machines, 51 recipes, shifts (passwords: <username>@2026)
.venv\Scripts\python manage.py runserver 127.0.0.1:8000
```

Run every `manage.py` command below with `.venv\Scripts\python` too. Alternatively, activate the environment first with `.venv\Scripts\activate`, and then plain `python` works.

In a second terminal, start the frontend from `frontend/` with `npm run dev`. Vite forwards `/api` to `127.0.0.1:8000`. To use another backend address, set `MPCR_BACKEND`.

To make the plant move until real machines are connected, run this in a third terminal:

```powershell
py manage.py simulate              # live values every 5 s; "auto" machines record their hourly reading
py manage.py simulate --backfill 7 # first fill the last 7 days for auto machines (for the report)
```

The npm scripts in `frontend/package.json` do the same, and they use the backend's own environment: `npm run backend:setup` (first time only), `npm run backend`, `npm run backend:simulate` and `npm run backend:test`.

Django admin is at http://127.0.0.1:8000/admin/. Sign in as admin / admin@2026.

## Settings and production

Settings come from `backend/.env`, or from the file named in `DJANGO_ENV_FILE`. Real environment variables always win.

The defaults are safe:
- DEBUG is off.
- A secret key is required; without one the server refuses to start.
- Only `localhost` and `127.0.0.1` are served.

For development, `.env.example` turns DEBUG on.

For a server:
1. Copy `.env.production.example` to `backend/.env`.
2. Fill in `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS` and the database settings.
3. Run `.venv\Scripts\python manage.py check --deploy`. It must report no issues.

`DJANGO_HTTPS=1` turns on the HTTPS redirect, HSTS and secure cookies. Use it when the app is served over https, either directly or behind IIS / nginx with `DJANGO_BEHIND_PROXY=1`.

On a plain-http plant network, set `DJANGO_HTTPS=0`. The deploy check then lists the four https warnings, which you accept as a known risk.

## Sign-in protection

- **Account lock.** After 5 wrong access codes in a row, the account is locked for 15 minutes. The correct code is refused too while it's locked.
  - The lock is stored on the user record, so it holds across server processes and restarts.
  - A successful sign-in resets the count.
  - An admin ends a lock by setting a new access code in User Management, or by sending `PUT /api/users/<username>/ {"unlock": true}`.
- **Address lock.** After 20 failed sign-ins from one computer, on any accounts, that computer is refused for 15 minutes. This stops someone trying `<username>@2026` on every account. Successful sign-ins never count, so a whole shift signing in at 06:00 is never blocked.
- **The response.** A refusal answers `429` with a `Retry-After` header, and the sign-in screen shows the message.
- **Settings in `.env`:** `DJANGO_LOGIN_MAX_FAILURES`, `DJANGO_LOGIN_LOCK_MINUTES`, `DJANGO_LOGIN_IP_MAX_FAILURES`.
- **Behind IIS / nginx.** Set `DJANGO_TRUSTED_PROXIES=1`, so each workstation's address is read from `X-Forwarded-For` instead of all users sharing the proxy's address.
- **Several server processes.** The address counter lives in Django's cache, which is separate in each process by default. Configure a shared cache (DatabaseCache or Redis) so all processes share one count. The account lock needs no cache.

## Access rules

- **Every sign-in gets its own token**, stored in the `SessionToken` table with the device's browser name. Signing out ends only that device's session.
  - An admin setting someone a new access code signs that person out everywhere.
  - Changing your own access code signs out your other devices.
  - Switching off "Can log in" stops every session at once.
  - You can see the open sessions in Django admin.
- **Sign-in tokens** end after 12 hours without any request (`DJANGO_TOKEN_IDLE_HOURS`). An open dashboard polls every 10 s, so it never runs out; a forgotten "keep me signed in" session does.
- **The Viewer role is read-only,** whatever is ticked in the matrix. Its master ticks only open the master pages, without edit controls. The server refuses every change from a Viewer.
- **Only an Admin** creates, edits or appoints Admin accounts, and changes the role matrix. A Manager given "User management" looks after all other accounts. Nobody changes their own role or switches off their own login.
- **What the server sends:**
  - A user only receives the machines (and their sheets, live data and deviations) in their machine-access list.
  - Only holders of "User management" receive other people's emails and employee IDs.
- **Audit trail entries** are accepted only for areas the user may change, for example "Parameter log" needs record or edit-after-submit permission.
- **Machine photos** need "Machine master". They must be a real JPEG, PNG or WEBP image of up to 2 MB (`DJANGO_MAX_PHOTO_BYTES`). SVG is refused, because it can carry script.

## Database

By default the backend uses SQLite (`backend/db.sqlite3`), in WAL mode and with write-locking transactions so the API and the simulator can write at the same time.

To use PostgreSQL, start the container from the root (`docker compose up -d mpcr-postgres`) and set the following in `backend/.env` (see `.env.example`):

```
DB_ENGINE=postgres
DB_PASSWORD=mpcr_secure_pass_2026!
```

Then run `py manage.py migrate` and `py manage.py seed`.

Django owns the schema through its migrations. `../database/schema.sql` was written earlier, separately from this code, and Django doesn't use it. Use a fresh database for Django, or drop the tables `schema.sql` created.

## How the frontend uses it

- **Sign-in.** `POST /api/auth/login/` takes `{ loginId, password }`. `loginId` can be a username, an email or an employee ID. It returns a token, which the app sends as `Authorization: Token …`.
  - Passwords are stored hashed (PBKDF2).
  - Switching off "Can log in" ends that user's open sessions too.
- **First load.** `GET /api/bootstrap/` returns everything the screens keep in memory.
  - Saves go to the matching endpoint (see `plant/urls.py`).
  - If a save fails, the app shows a "Not saved" banner.
- **Live data.** The dashboard polls `GET /api/live/` every 10 s for machine status, last shot and today's deviations. It polls `GET /api/notifications/` every 15 s.
- **Parameter log.**
  - `PUT /api/logs/<machine>/<date>/hours/<hour>/` takes `{ values }`. The server checks each value against the machine's active recipe and opens a deviation for every value outside its limits. It also notifies the approvers.
  - Reasons go to `…/deviations/<id>/reason/`.
  - Approvals go to `…/deviations/<id>/review/`. These are level 1 (supervisor) and level 2 (manager, who must be someone other than the level-1 supervisor).
- **Report.** `POST /api/report/` takes `{ filters, offset, limit }`. It returns the statistics plus one page of rows, deviations first, built from the readings actually recorded.
- **Telemetry from a data collector.** `POST /api/machines/<id>/telemetry/` takes `{ status, cycle, cushion, injection, peakPressure, recovery, progress }`. It needs a staff account (`is_staff`).

Every permission the UI checks is checked again on the server, using the role matrix in User Management. Recipe drafts can only be approved by an Admin.

## FANUC ROBOSHOT: EUROMAP 77 names

Machine values use the EUROMAP 77 node names from FANUC spec A-97146-00021EN (Appendix 1). The mapping lives in one place, `integrations/fanuc/euromap77.py`, and everything else uses it:

- `POST /api/machines/<id>/telemetry/` accepts EUROMAP 77 BrowseNames, either as full paths or as the last name (`CycleTime`, `InjectionTime`, `DosingTime`, `CushionVolume`, `SpecificPressureMaximum`, `MachineMode`, `IsPresent`). OPC UA `Duration` values are milliseconds and are stored as seconds. MPCR's own field names still work, and they win when both are sent.
- The FANUC MQTT client (`manage.py fanuc_mqtt`) publishes its telemetry keyed by EUROMAP 77 node path, and syncs it to the database through the same mapping.
- The first load (`/api/bootstrap/`) sends the mapping. Parameter master shows each parameter's node under its code, and hovering over a parameter in the log shows the full path.

### Live data from the plant's collector

The plant already runs an OPC UA → MQTT collector against the FANUC gateway (`opc.tcp://10.245.251.10:62553`, NodeIds like `ns=6;s=IMM_FANUC_ROBOSHOT0005.Jobs.ActiveJobValues.LastCycleTime`). It publishes every change on `factory/euromap77/raw`. MPCR listens to that topic and does not open its own OPC UA session:

```powershell
.venv\Scripts\python manage.py euromap_bridge            # FANUC_MQTT_HOST / _PORT / _TOPIC from .env
.venv\Scripts\python manage.py euromap_bridge --host <collector broker> --verbose
```

- Each message names its machine by `UserMachineName` (`J1030`). The bridge matches it to the MPCR machine with the same ID, ignoring punctuation and case (`J10-30`). Names that differ further are pinned in `.env` with `FANUC_MACHINE_MAP=J1030=J10-30,IMM_FANUC_ROBOSHOT0005=J10-31`. The bridge lists unmatched names every minute.
- From the collector's current nodes, MPCR uses `operating_status` (machine mode → status) and `cycletime` (milliseconds → seconds). `tool`, `ProductName`, `jobcyclecounter` and `actualcavity` are read but not stored.
- For more live values, add their nodes to the collector's `NODE_IDS`. Use either the keys in `COLLECTOR_KEYS` (`integrations/fanuc/euromap77.py`) or the dotted EUROMAP path itself as the key (e.g. `"InjectionUnits.InjectionUnit_1.TemperatureZones.TemperatureZone_1.NominalTemperature"`); the bridge understands both.

| MPCR | EUROMAP 77 node (under `IMM_FANUC_ROBOSHOT<MachineID>`) |
| --- | --- |
| Status | `MachineStatus/MachineMode` (AUTOMATIC/SEMI_AUTOMATIC = run, MANUAL/SLEEP/OTHER = idle, SETUP = maint), `MachineStatus/IsPresent` = false is off |
| Total cycle time | `Jobs/ActiveJobValues/LastCycleTime` (the cycle event field `CycleTime` is also accepted) |
| Injection time | `…/InjUnitCycParams_1/InjectionTime` |
| Recovery time | `…/InjUnitCycParams_1/DosingTime` |
| Cushion | `…/InjUnitCycParams_1/CushionVolume` (check) |
| Peak pressure | `…/InjUnitCycParams_1/SpecificPressureMaximum` (check) |
| Position transfer | `…/InjUnitCycParams_1/VPChangeOverPosition` |
| Shot size | `…/InjUnitCycParams_1/ExtruderEndPosition` (ns 5, check) |
| Nozzle, Zone 1 … 10 | `…/InjUnitCycParams_1/BrlTmpZnCycParams_1 … 11/ActualTemperature` (check), setpoint `InjectionUnits/InjectionUnit_1/TemperatureZones/TemperatureZone_<Nr>/NominalTemperature` |
| HRTC zone 1 … 24 | `…/MldCycParams_1/MldTmpZnCycParams_<Nr>/ActualTemperature` |
| MTC / mould / dryer temperature | `…/Peripheral/Mold_1/TemperatureTo`, `…/Peripheral/Mold_1/TemperatureFrom` (check), `…/Peripheral/Dryer/TemperatureTo` |

"(check)" means the value depends on how the machine is set up: zone numbering, which peripheral channel is wired, or the unit the controller reports. Confirm it once against the node's `Name` / `EngineeringUnits` on the machine. The setpoints on the sheet (inject velocity and switch position, max inject pressure, hold pressure and time, back pressure, rotation, decompression, cooling time, HR mode) have no EUROMAP 77 node, so they stay manual entries.

## Tests

```powershell
py manage.py test plant
```

The tests cover:

- sign-in
- the record → reason → level 1 → level 2 flow and rejection
- edit-after-submit
- permissions and machine access
- the report
- recipe approval
- adding a machine
- users and roles
- the simulator

`plant/services/params.py` repeats the parameter list from `frontend/src/store/parameters.js`. When you add a parameter, add it in both places.
