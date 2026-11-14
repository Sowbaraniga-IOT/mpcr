# MPCR (Molding Parameter Control Record) Database Documentation

Production-grade relational database architecture for the MPCR injection molding parameter control and deviation management system, built for **PostgreSQL 17+**.

---

## 1. Architecture & Entity-Relationship Model

```mermaid
erDiagram
    USERS ||--o{ USER_MACHINE_ACCESS : "grants"
    USERS ||--o{ SHIFTS : "supervises"
    USERS ||--o{ RECIPE_VERSIONS : "authors/approves"
    USERS ||--o{ DEVIATION_REVIEWS : "reviews"
    USERS ||--o{ AUDIT_LOGS : "acts"
    
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "maps"
    
    MACHINES ||--o{ MOLD_MACHINES : "supports"
    MOLDS ||--o{ MOLD_MACHINES : "mounted_on"
    PARTS ||--o{ MOLDS : "produced_by"
    
    MACHINES ||--o{ RECIPES : "configures"
    PARTS ||--o{ RECIPES : "specifies"
    MOLDS ||--o{ RECIPES : "tooling"
    
    RECIPES ||--o{ RECIPE_VERSIONS : "tracks"
    RECIPE_VERSIONS ||--o{ RECIPE_ROWS : "defines"
    PARAMETER_DEFINITIONS ||--o{ RECIPE_ROWS : "governs"
    
    MACHINES ||--o{ PARAMETER_LOGS : "logs"
    RECIPE_VERSIONS ||--o{ PARAMETER_LOGS : "referenced_by"
    
    PARAMETER_LOGS ||--o{ HOURLY_READINGS : "contains"
    SHIFTS ||--o{ HOURLY_READINGS : "scheduled_in"
    HOURLY_READINGS ||--o{ READING_VALUES : "records"
    PARAMETER_DEFINITIONS ||--o{ READING_VALUES : "measures"
    
    PARAMETER_LOGS ||--o{ DEVIATIONS : "flags"
    HOURLY_READINGS ||--o{ DEVIATIONS : "triggers"
    DEVIATIONS ||--o{ DEVIATION_REVIEWS : "audit_flow"
    
    DEVIATIONS ||--o{ NOTIFICATIONS : "alerts"
    USERS ||--o{ NOTIFICATION_READS : "reads"
```

---

## 2. Table Catalog

| Table | Purpose | Primary Key | Key Foreign Keys |
|---|---|---|---|
| `users` | User accounts, roles, hashed passwords, shift assignments | `id` (SERIAL) | `shift_code` -> `shifts(code)` |
| `permissions` | 14 discrete functional system permissions | `key` (VARCHAR) | — |
| `role_permissions` | Role-Based Access Control matrix | `(role, permission_key)` | `permission_key` -> `permissions(key)` |
| `user_machine_access` | Specific machine authorization when not 'all' | `(user_id, machine_id)` | `user_id` -> `users(id)`, `machine_id` -> `machines(id)` |
| `parts` | Molded part catalog (part no, part name, material, customer) | `part_no` (VARCHAR) | — |
| `molds` | Tooling & mold master (cavities, life, default part) | `mold_no` (VARCHAR) | `primary_part_no` -> `parts(part_no)` |
| `machines` | 48 FANUC machines, clamp tonnage, line, bay, real-time shot telemetry | `id` (VARCHAR) | `current_mold_no` -> `molds(mold_no)`, `current_part_no` -> `parts(part_no)` |
| `mold_machines` | Compatibility matrix between molds and machines | `(mold_no, machine_id)` | `mold_no` -> `molds`, `machine_id` -> `machines` |
| `shifts` | Shift definitions (A, B, C, G) with minute offsets from midnight | `code` (CHAR) | `supervisor_username` -> `users(username)` |
| `shift_rules` | Logging interval, grace period, and overdue alert configuration | `id` (SERIAL) | `updated_by` -> `users(username)` |
| `parameter_definitions` | 31 core parameters across Temperature, Injection, Monitor | `code` (VARCHAR) | — |
| `recipes` | Standard parameter sets per Machine + Part + Mold | `id` (VARCHAR) | `machine_id`, `part_no`, `mold_no` |
| `recipe_versions` | Versioned history with draft/active/archived lifecycle | `id` (SERIAL) | `recipe_id` -> `recipes(id)` |
| `recipe_rows` | Exact tolerance, standard value, and check type per parameter | `id` (SERIAL) | `recipe_version_id`, `param_code` |
| `parameter_logs` | Daily production log header per machine (06:00 to 06:00) | `id` (SERIAL) | `machine_id` -> `machines(id)`, `recipe_version_id` |
| `hourly_readings` | Hourly reading slots (reading hour 6..29) | `id` (SERIAL) | `parameter_log_id`, `shift_code` |
| `reading_values` | Measured parameter values for each hour | `id` (SERIAL) | `hourly_reading_id`, `param_code` |
| `deviations` | Out-of-tolerance incident records with root-cause | `id` (SERIAL) | `parameter_log_id`, `hourly_reading_id`, `param_code` |
| `deviation_reviews` | 2-level sign-off history (Supervisor -> Manager) | `id` (SERIAL) | `deviation_id` -> `deviations(id)` |
| `notifications` | System & deviation alerts | `id` (SERIAL) | `machine_id`, `deviation_id` |
| `notification_reads` | Read receipts per user | `(notification_id, user_id)`| `notification_id`, `user_id` |
| `audit_logs` | Complete traceability of configuration and data changes | `id` (SERIAL) | `user_id` -> `users(id)` |

---

## 3. High-Performance Views

- **`v_active_recipe_rows`**: Joins active recipe versions with parameter definitions to output the current effective standards and tolerances for each machine, part, and mold.
- **`v_machine_status_summary`**: Provides plant-floor live monitoring summary including lines, bays, operating status (`run`, `idle`, `alarm`, `maint`, `off`), and latest shot telemetry.
- **`v_open_deviations`**: Filters unresolved quality deviations awaiting Level 1 (Supervisor) or Level 2 (Manager) sign-off.
- **`v_hourly_report`**: Denormalized report view suitable for generating shift summary sheets, Excel exports, and historical SPC charts.

---

## 4. Setup Instructions

### Option A: Local Windows PostgreSQL 17 (Automated PowerShell)

If you have PostgreSQL 17 installed locally on Windows:

1. Open PowerShell in the project directory:
   ```powershell
   cd "mpcr-login\database"
   ```
2. Run the automated setup script:
   ```powershell
   .\setup-db.ps1
   ```
   *The script will automatically detect `psql.exe`, prompt for the `postgres` admin password securely, create `mpcr_db` and `mpcr_user`, apply the schema, and seed all records.*

3. Custom parameters can be passed if your server uses custom settings:
   ```powershell
   .\setup-db.ps1 -Hostname localhost -Port 5432 -AdminUser postgres -AppPassword "YourCustomPassword!"
   ```

---

### Option B: Docker Compose (Cross-Platform / Zero-Install)

If you prefer running PostgreSQL inside a container:

1. From the project root, start the PostgreSQL 17 container:
   ```bash
   docker compose up -d
   ```
   *This launches `postgres:17-alpine` on port `5432` with a persistent volume. Both `schema.sql` and `seed.sql` are automatically executed on first launch.*

2. (Optional) Launch pgAdmin 4 web dashboard:
   ```bash
   docker compose --profile tools up -d
   ```
   *Access pgAdmin at `http://localhost:5050` with login `admin@mpcr.com` / `admin@2026`.*

3. Stop the container:
   ```bash
   docker compose down
   ```

---

### Option C: Manual Setup via `psql`

```bash
# Connect to PostgreSQL as admin
psql -U postgres -h localhost -p 5432 -f database/database_setup.sql
```

---

## 5. Backend Integration & Connection Strings

### Environment Variables (`.env`)

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mpcr_db
DB_USER=mpcr_user
DB_PASSWORD=mpcr_secure_pass_2026!

# Connection URL format
DATABASE_URL="postgresql://mpcr_user:mpcr_secure_pass_2026!@localhost:5432/mpcr_db?schema=public"
```

### Node.js Example (`pg` / `node-postgres`)

```javascript
import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'mpcr_db',
  user: process.env.DB_USER || 'mpcr_user',
  password: process.env.DB_PASSWORD || 'mpcr_secure_pass_2026!',
  max: 20,
  idleTimeoutMillis: 30000,
});

// Example: Query active recipe for a machine
export async function getActiveRecipe(machineId) {
  const result = await pool.query(
    'SELECT * FROM v_active_recipe_rows WHERE machine_id = $1 ORDER BY param_code',
    [machineId]
  );
  return result.rows;
}
```

### Python Example (`psycopg2` / `SQLAlchemy`)

```python
import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(
    dbname="mpcr_db",
    user="mpcr_user",
    password="mpcr_secure_pass_2026!",
    host="localhost",
    port=5432
)

with conn.cursor(cursor_factory=RealDictCursor) as cur:
    cur.execute("SELECT * FROM v_machine_status_summary;")
    machines = cur.fetchall()
    print(f"Total active machines: {len(machines)}")
```

---

## 6. Seed Accounts & Credentials

The seed data provisions 5 default accounts covering all role archetypes.
Default passwords follow the convention `<username>@2026`:

| Role | Username | Email | Employee ID | Default Password | Initial Permissions |
|---|---|---|---|---|---|
| **Admin** | `admin` | admin@mpcr.com | SYS-0001 | `admin@2026` | All 14 permissions (including Audit Trail) |
| **Manager** | `manager` | manager@mpcr.com | EMP-0002 | `manager@2026` | Level 2 approval, reports, masters, monitor |
| **Supervisor** | `supervisor` | supervisor@mpcr.com | EMP-0003 | `supervisor@2026` | Level 1 approval, logging, edit after submit |
| **Operator** | `operator` | operator@mpcr.com | EMP-0004 | `operator@2026` | Hourly logging, dashboards, exports |
| **Viewer** | `viewer` | viewer@mpcr.com | EMP-0005 | `viewer@2026` | Read-only dashboards and reports |

---

## 7. Verification Queries

Run these queries to confirm database health:

```sql
-- 1. Verify entity counts
SELECT 
    (SELECT count(*) FROM users) AS total_users,
    (SELECT count(*) FROM machines) AS total_machines,
    (SELECT count(*) FROM parts) AS total_parts,
    (SELECT count(*) FROM molds) AS total_molds,
    (SELECT count(*) FROM parameter_definitions) AS total_parameters,
    (SELECT count(*) FROM recipes) AS total_recipes,
    (SELECT count(*) FROM recipe_rows) AS total_recipe_rows;

-- Expected:
-- users: 5 | machines: 48 | parts: 49 | molds: 50 | parameters: 31 | recipes: 51 | recipe_rows: 1500+

-- 2. Inspect active standards for machine J10-25
SELECT param_code, param_label, param_group, unit, check_type, lower_limit, standard_value, upper_limit
FROM v_active_recipe_rows 
WHERE machine_id = 'J10-25' 
ORDER BY param_code;

-- 3. Plant status summary by line
SELECT line, status, count(*) AS count
FROM machines
GROUP BY line, status
ORDER BY line, status;
```

---

## 8. Backup & Maintenance

### Creating Backups
```bash
# Dump complete schema and data
pg_dump -h localhost -p 5432 -U mpcr_user -d mpcr_db -F c -b -v -f "mpcr_backup_$(date +%Y%m%d).dump"
```

### Restoring Backups
```bash
# Restore from custom-format dump
pg_restore -h localhost -p 5432 -U mpcr_user -d mpcr_db -v "mpcr_backup.dump"
```
