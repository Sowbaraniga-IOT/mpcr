-- ==============================================================================
-- MPCR (Molding Parameter Control Record) Database Schema
-- Target: PostgreSQL 17+
-- Version: 1.0.0
-- Motherson Group - Injection Molding Parameter Control System
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ENUMS AND DOMAINS
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('Admin', 'Manager', 'Supervisor', 'Operator', 'Viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active', 'invited', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE machine_status AS ENUM ('run', 'idle', 'maint', 'alarm', 'off');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE data_source_type AS ENUM ('manual', 'auto');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE parameter_group AS ENUM ('TEMPERATURE', 'INJECTION', 'MONITOR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE check_type AS ENUM ('RANGE', 'EXACT', 'MAX ONLY', 'MIN ONLY', 'TEXT', 'NA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE recipe_status AS ENUM ('active', 'draft', 'archived', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE deviation_status AS ENUM ('open', 'awaiting', 'supervised', 'closed', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE deviation_approval_level AS ENUM ('level_1_supervisor', 'level_2_manager');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_severity AS ENUM ('info', 'warning', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 2. MASTER DATA TABLES
-- ==============================================================================

-- 2.1 Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'Viewer',
    shift_code CHAR(1), -- Assigned primary shift (A, B, C, G) or NULL
    access_scope VARCHAR(20) NOT NULL DEFAULT 'all', -- 'all' or 'custom'
    status user_status NOT NULL DEFAULT 'active',
    can_login BOOLEAN NOT NULL DEFAULT true,
    password_hash VARCHAR(255) NOT NULL, -- SHA-256 or bcrypt hash
    force_reset BOOLEAN NOT NULL DEFAULT false,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.2 Permissions catalog
CREATE TABLE IF NOT EXISTS permissions (
    key VARCHAR(50) PRIMARY KEY,
    label VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.3 Role permissions mapping matrix
CREATE TABLE IF NOT EXISTS role_permissions (
    role user_role NOT NULL,
    permission_key VARCHAR(50) NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role, permission_key)
);

-- 2.4 User custom machine access
CREATE TABLE IF NOT EXISTS user_machine_access (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    machine_id VARCHAR(50) NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, machine_id)
);

-- 2.5 Parts Catalog
CREATE TABLE IF NOT EXISTS parts (
    part_no VARCHAR(50) PRIMARY KEY,
    part_name VARCHAR(100) NOT NULL,
    material VARCHAR(100),
    customer VARCHAR(100),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.6 Molds Catalog
CREATE TABLE IF NOT EXISTS molds (
    mold_no VARCHAR(50) PRIMARY KEY,
    description VARCHAR(200),
    cavities INT NOT NULL DEFAULT 1 CHECK (cavities > 0),
    primary_part_no VARCHAR(50) REFERENCES parts(part_no) ON DELETE SET NULL,
    expected_life INT DEFAULT 40000,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.7 Machines Catalog (48 FANUC Machines)
CREATE TABLE IF NOT EXISTS machines (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'J10-25'
    name VARCHAR(100) NOT NULL, -- e.g. 'FANUC Machine 1'
    make VARCHAR(50) NOT NULL DEFAULT 'FANUC',
    model VARCHAR(100) NOT NULL, -- e.g. 'ROBOSHOT α-S100iA'
    clamp_tonnage INT NOT NULL CHECK (clamp_tonnage > 0), -- 50, 100, 300
    line VARCHAR(50) NOT NULL, -- 'Line A', 'Line B', 'Line C', 'Line D'
    bay INT NOT NULL CHECK (bay >= 1 AND bay <= 12),
    data_source data_source_type NOT NULL DEFAULT 'manual', -- 'manual' or 'auto' (OPC UA)
    active BOOLEAN NOT NULL DEFAULT true,
    current_mold_no VARCHAR(50) REFERENCES molds(mold_no) ON DELETE SET NULL,
    current_part_no VARCHAR(50) REFERENCES parts(part_no) ON DELETE SET NULL,
    status machine_status NOT NULL DEFAULT 'off',
    -- Real-time telemetry snapshot from last shot
    last_cycle_time NUMERIC(8,2),
    last_cushion NUMERIC(8,2),
    last_injection_time NUMERIC(8,3),
    last_peak_pressure NUMERIC(8,1),
    last_recovery_time NUMERIC(8,2),
    yshift_progress_pct INT DEFAULT 0 CHECK (shift_progress_pct >= 0 AND shift_progress_pct <= 100),
    last_log_label VARCHAR(50),
    deviation_count INT NOT NULL DEFAULT 0,
    has_photo BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.8 Mold-Machine compatibility cross-reference
CREATE TABLE IF NOT EXISTS mold_machines (
    mold_no VARCHAR(50) NOT NULL REFERENCES molds(mold_no) ON DELETE CASCADE,
    machine_id VARCHAR(50) NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (mold_no, machine_id)
);

-- 2.9 Shift Master: the shift timings (the same table the production logger uses)
-- Only the time of day of start_tm / end_tm counts; end_tm at or before start_tm runs past midnight.

CREATE TABLE IF NOT EXISTS "Shift_Master" (
    "Unit_code" VARCHAR(10) NOT NULL, -- e.g. 'SML'
    "Shift_Code" VARCHAR(1) PRIMARY KEY, -- 'A', 'B', 'C', 'G'
    "start_tm" TIMESTAMPTZ NOT NULL,
    "end_tm" TIMESTAMPTZ NOT NULL,
    "time_diff" VARCHAR(5) NOT NULL -- shift length 'HH:MM', e.g. '08:00'
);

-- 2.9b Shifts: MPCR's reading settings per shift (times copied from "Shift_Master", matched on code)

CREATE TABLE IF NOT EXISTS shifts (
    code CHAR(1) PRIMARY KEY REFERENCES "Shift_Master"("Shift_Code") ON DELETE CASCADE, -- 'A', 'B', 'C', 'G'
    name VARCHAR(50) NOT NULL, -- 'Morning', 'Afternoon', 'Night', 'General'
    start_minute INT NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440), -- Minutes from midnight (360 = 06:00)
    end_minute INT NOT NULL CHECK (end_minute >= 0 AND end_minute < 1440), -- (840 = 14:00)
    interval_minutes INT NOT NULL DEFAULT 60 CHECK (interval_minutes IN (30, 60, 120, 240)),
    grace_minutes INT NOT NULL DEFAULT 10 CHECK (grace_minutes >= 0),
    supervisor_username VARCHAR(50) REFERENCES users(username) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.10 Shift Scheduling Rules Configuration

CREATE TABLE IF NOT EXISTS shift_rules (
    id SERIAL PRIMARY KEY,
    first_at_start BOOLEAN NOT NULL DEFAULT true,
    grace_enabled BOOLEAN NOT NULL DEFAULT true,
    overdue_alert BOOLEAN NOT NULL DEFAULT true,
    overdue_minutes INT NOT NULL DEFAULT 15,
    back_dated_allowed BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    updated_by VARCHAR(50) REFERENCES users(username) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 3. PARAMETER & RECIPE STANDARDS
-- ==============================================================================

-- 3.1 Parameter Catalog Definition (31 standard parameters + expandable stages)

CREATE TABLE IF NOT EXISTS parameter_definitions (
    code VARCHAR(50) PRIMARY KEY, -- e.g. 'TMP_NOZ', 'INJ_VEL1', 'MON_CYCLE'
    param_key VARCHAR(50) UNIQUE NOT NULL, -- e.g. 'nozzle', 'injVel1', 'cycle'
    label VARCHAR(150) NOT NULL,
    param_group parameter_group NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT '',
    check_type check_type NOT NULL DEFAULT 'RANGE',
    default_std NUMERIC(10,3),
    default_tol NUMERIC(10,3),
    default_tol_up NUMERIC(10,3),
    default_step NUMERIC(10,3),
    digits INT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3.2 Recipe Header (Machine + Part + Mold)
CREATE TABLE IF NOT EXISTS recipes (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'R-001'
    machine_id VARCHAR(50) NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    part_no VARCHAR(50) NOT NULL REFERENCES parts(part_no) ON DELETE RESTRICT,
    mold_no VARCHAR(50) NOT NULL REFERENCES molds(mold_no) ON DELETE RESTRICT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recipe_machine_part_mold UNIQUE (machine_id, part_no, mold_no)
);

-- 3.3 Recipe Versions (Versioning & Approval Workflow)
CREATE TABLE IF NOT EXISTS recipe_versions (
    id SERIAL PRIMARY KEY,
    recipe_id VARCHAR(50) NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    version_number INT NOT NULL CHECK (version_number >= 1),
    status recipe_status NOT NULL DEFAULT 'draft',
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by VARCHAR(50) NOT NULL REFERENCES users(username),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(50) REFERENCES users(username),
    approved_at TIMESTAMPTZ,
    note TEXT,
    CONSTRAINT uq_recipe_version UNIQUE (recipe_id, version_number)
);

-- 3.4 Recipe Rows (Standard values and tolerances per parameter for this version)
CREATE TABLE IF NOT EXISTS recipe_rows (
    id SERIAL PRIMARY KEY,
    recipe_version_id INT NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
    param_code VARCHAR(50) NOT NULL REFERENCES parameter_definitions(code) ON DELETE RESTRICT,
    check_type check_type NOT NULL DEFAULT 'RANGE',
    lower_limit NUMERIC(10,3),
    standard_value NUMERIC(10,3),
    text_standard VARCHAR(100), -- For TEXT check types (e.g. 'STD')
    upper_limit NUMERIC(10,3),
    applies BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recipe_version_param UNIQUE (recipe_version_id, param_code)
);

-- ==============================================================================
-- 4. HOURLY PRODUCTION PARAMETER LOGS
-- ==============================================================================

-- 4.1 Parameter Log Header (One log per machine per production day)
-- Note: Production day runs from 06:00 to 06:00 next day
CREATE TABLE IF NOT EXISTS parameter_logs (
    id SERIAL PRIMARY KEY,
    machine_id VARCHAR(50) NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
    production_date DATE NOT NULL,
    recipe_version_id INT NOT NULL REFERENCES recipe_versions(id) ON DELETE RESTRICT,
    total_readings_count INT NOT NULL DEFAULT 0,
    deviations_count INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'verified'
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_machine_production_date UNIQUE (machine_id, production_date)
);

-- 4.2 Hourly Reading Instance (Reading slot, e.g. 06:00, 07:00, etc.)
CREATE TABLE IF NOT EXISTS hourly_readings (
    id SERIAL PRIMARY KEY,
    parameter_log_id INT NOT NULL REFERENCES parameter_logs(id) ON DELETE CASCADE,
    shift_code CHAR(1) NOT NULL REFERENCES shifts(code),
    slot_time TIME NOT NULL, -- e.g. '06:00:00'
    reading_hour INT NOT NULL CHECK (reading_hour >= 0 AND reading_hour <= 30), -- Production hour index (6..29)
    actual_recorded_at TIMESTAMPTZ,
    recorded_by VARCHAR(50) REFERENCES users(username),
    is_auto_logged BOOLEAN NOT NULL DEFAULT false, -- True if ingested from OPC UA
    has_deviation BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_log_reading_hour UNIQUE (parameter_log_id, reading_hour)
);

-- 4.3 Reading Values (Actual measured value for each parameter during this reading slot)
CREATE TABLE IF NOT EXISTS reading_values (
    id SERIAL PRIMARY KEY,
    hourly_reading_id INT NOT NULL REFERENCES hourly_readings(id) ON DELETE CASCADE,
    param_code VARCHAR(50) NOT NULL REFERENCES parameter_definitions(code) ON DELETE RESTRICT,
    num_value NUMERIC(10,3),
    text_value VARCHAR(100),
    is_out_of_spec BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_reading_param UNIQUE (hourly_reading_id, param_code)
);

-- ==============================================================================
-- 5. DEVIATIONS & QUALITY WORKFLOW (2-LEVEL APPROVAL)
-- ==============================================================================

-- 5.1 Deviation Incident Records
CREATE TABLE IF NOT EXISTS deviations (
    id SERIAL PRIMARY KEY,
    parameter_log_id INT NOT NULL REFERENCES parameter_logs(id) ON DELETE CASCADE,
    hourly_reading_id INT NOT NULL REFERENCES hourly_readings(id) ON DELETE CASCADE,
    param_code VARCHAR(50) NOT NULL REFERENCES parameter_definitions(code) ON DELETE RESTRICT,
    measured_num_value NUMERIC(10,3),
    measured_text_value VARCHAR(100),
    standard_value NUMERIC(10,3),
    lower_limit NUMERIC(10,3),
    upper_limit NUMERIC(10,3),
    variance NUMERIC(10,3),
    status deviation_status NOT NULL DEFAULT 'open',
    reason TEXT,
    corrective_action TEXT,
    created_by VARCHAR(50) NOT NULL REFERENCES users(username),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5.2 Deviation Multi-Level Review & Sign-Off History
CREATE TABLE IF NOT EXISTS deviation_reviews (
    id SERIAL PRIMARY KEY,
    deviation_id INT NOT NULL REFERENCES deviations(id) ON DELETE CASCADE,
    approval_level deviation_approval_level NOT NULL,
    reviewed_by VARCHAR(50) NOT NULL REFERENCES users(username),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decision VARCHAR(50) NOT NULL CHECK (decision IN ('approved', 'rejected', 'supervised', 'closed')),
    comments TEXT NOT NULL
);

-- ==============================================================================
-- 6. NOTIFICATIONS & ALERTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    machine_id VARCHAR(50) REFERENCES machines(id) ON DELETE CASCADE,
    parameter_log_id INT REFERENCES parameter_logs(id) ON DELETE CASCADE,
    deviation_id INT REFERENCES deviations(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    severity notification_severity NOT NULL DEFAULT 'warning',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id INT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id, user_id)
);

-- ==============================================================================
-- 7. SYSTEM AUDIT TRAIL
-- ==============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL, -- e.g. 'LOGIN', 'RECIPE_CREATE', 'PARAM_MODIFY'
    target_module VARCHAR(100) NOT NULL, -- 'Shift Master', 'Machine Master', 'Parameter Master', 'User Management', 'Parameter Log'
    target_id VARCHAR(100), -- ID of the entity modified
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 8. INDEXES FOR HIGH-PERFORMANCE QUERYING
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_machines_line_bay ON machines (line, bay);
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines (status);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_parameter_logs_search ON parameter_logs (machine_id, production_date);
CREATE INDEX IF NOT EXISTS idx_hourly_readings_log ON hourly_readings (parameter_log_id, reading_hour);
CREATE INDEX IF NOT EXISTS idx_reading_values_reading ON reading_values (hourly_reading_id, param_code);
CREATE INDEX IF NOT EXISTS idx_deviations_status ON deviations (status);
CREATE INDEX IF NOT EXISTS idx_deviations_param_log ON deviations (parameter_log_id);
CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe ON recipe_versions (recipe_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs (target_module, created_at DESC);

-- ==============================================================================
-- 9. TRIGGER FUNCTIONS: AUTOMATED UPDATED_AT STAMP
-- ==============================================================================

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER set_timestamp_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER set_timestamp_machines BEFORE UPDATE ON machines FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER set_timestamp_parts BEFORE UPDATE ON parts FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER set_timestamp_molds BEFORE UPDATE ON molds FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER set_timestamp_shifts BEFORE UPDATE ON shifts FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER set_timestamp_recipes BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER set_timestamp_parameter_logs BEFORE UPDATE ON parameter_logs FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER set_timestamp_hourly_readings BEFORE UPDATE ON hourly_readings FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER set_timestamp_deviations BEFORE UPDATE ON deviations FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ==============================================================================
-- 10. ANALYTICAL & REPORTING VIEWS
-- ==============================================================================

-- 10.1 Active Recipe Parameters View
CREATE OR REPLACE VIEW v_active_recipe_rows AS
SELECT 
    r.id AS recipe_id,
    r.machine_id,
    r.part_no,
    p.part_name,
    r.mold_no,
    rv.version_number,
    rv.effective_from,
    rr.param_code,
    pd.param_key,
    pd.label AS param_label,
    pd.param_group,
    pd.unit,
    rr.check_type,
    rr.lower_limit,
    rr.standard_value,
    rr.text_standard,
    rr.upper_limit,
    rr.applies
FROM recipes r
JOIN parts p ON r.part_no = p.part_no
JOIN recipe_versions rv ON r.id = rv.recipe_id AND rv.status = 'active'
JOIN recipe_rows rr ON rv.id = rr.recipe_version_id
JOIN parameter_definitions pd ON rr.param_code = pd.code;

-- 10.2 Machine Live Status Overview View
CREATE OR REPLACE VIEW v_machine_status_summary AS
SELECT 
    m.id AS machine_id,
    m.name AS machine_name,
    m.line,
    m.bay,
    m.clamp_tonnage,
    m.model,
    m.status,
    m.data_source,
    m.current_mold_no,
    m.current_part_no,
    p.part_name,
    m.last_cycle_time,
    m.last_cushion,
    m.last_injection_time,
    m.last_peak_pressure,
    m.last_recovery_time,
    m.shift_progress_pct,
    m.deviation_count,
    m.last_log_label,
    m.updated_at AS last_telemetry_time
FROM machines m
LEFT JOIN parts p ON m.current_part_no = p.part_no;

-- 10.3 Open & Unresolved Deviations View
CREATE OR REPLACE VIEW v_open_deviations AS
SELECT 
    d.id AS deviation_id,
    d.parameter_log_id,
    pl.machine_id,
    m.name AS machine_name,
    m.line,
    pl.production_date,
    hr.shift_code,
    hr.slot_time,
    d.param_code,
    pd.label AS param_label,
    pd.unit,
    d.measured_num_value,
    d.standard_value,
    d.lower_limit,
    d.upper_limit,
    d.variance,
    d.status,
    d.created_by,
    d.created_at
FROM deviations d
JOIN parameter_logs pl ON d.parameter_log_id = pl.id
JOIN machines m ON pl.machine_id = m.id
JOIN hourly_readings hr ON d.hourly_reading_id = hr.id
JOIN parameter_definitions pd ON d.param_code = pd.code
WHERE d.status IN ('open', 'awaiting', 'supervised');

-- 10.4 Complete Hourly Production Report View
CREATE OR REPLACE VIEW v_hourly_report AS
SELECT 
    pl.id AS parameter_log_id,
    pl.machine_id,
    pl.production_date,
    hr.id AS hourly_reading_id,
    hr.shift_code,
    hr.slot_time,
    hr.reading_hour,
    hr.recorded_by,
    hr.actual_recorded_at,
    rv.param_code,
    pd.label AS param_label,
    pd.param_group,
    pd.unit,
    rv.num_value,
    rv.text_value,
    rv.is_out_of_spec
FROM parameter_logs pl
JOIN hourly_readings hr ON pl.id = hr.parameter_log_id
JOIN reading_values rv ON hr.id = rv.hourly_reading_id
JOIN parameter_definitions pd ON rv.param_code = pd.code
ORDER BY pl.production_date DESC, pl.machine_id, hr.reading_hour, pd.sort_order;
