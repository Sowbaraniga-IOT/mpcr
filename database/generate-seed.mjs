import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import domain data from frontend/src/store
import { USERS, PERMISSIONS, MATRIX } from '../frontend/src/store/users.js';
import { MACHINES } from '../frontend/src/store/machines.js';
import { MOLDS, PARTS } from '../frontend/src/store/catalog.js';
import { PARAM_DEFS } from '../frontend/src/store/parameters.js';
import { SHIFT_MASTER } from '../frontend/src/store/shiftMaster.js';
import { RECIPES } from '../frontend/src/store/recipes.js';

const sqlEscape = (str) => {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
};

const numOrNull = (val) => (val === null || val === undefined || isNaN(val) ? 'NULL' : Number(val));
const boolOrNull = (val) => (val === true ? 'TRUE' : val === false ? 'FALSE' : 'NULL');

let sql = `-- ==============================================================================
-- MPCR Database Seed Data
-- Target: PostgreSQL 17+
-- Automatically synchronizes all master data with frontend domain specifications
-- ==============================================================================

-- Clean existing data in dependency order
TRUNCATE TABLE 
    audit_logs,
    notification_reads,
    notifications,
    deviation_reviews,
    deviations,
    reading_values,
    hourly_readings,
    parameter_logs,
    recipe_rows,
    recipe_versions,
    recipes,
    mold_machines,
    machines,
    molds,
    parts,
    shift_rules,
    shifts,
    "Shift_Master",
    role_permissions,
    user_machine_access,
    permissions,
    parameter_definitions,
    users
CASCADE;

-- ==============================================================================
-- 1. PERMISSIONS & ROLE MATRIX
-- ==============================================================================

INSERT INTO permissions (key, label, description) VALUES
${PERMISSIONS.map(p => `(${sqlEscape(p.key)}, ${sqlEscape(p.label)}, ${sqlEscape(p.label)})`).join(',\n')};

INSERT INTO role_permissions (role, permission_key) VALUES
${Object.entries(MATRIX).flatMap(([role, keys]) => 
  keys.map(k => `('${role}', ${sqlEscape(k)})`)
).join(',\n')};

-- ==============================================================================
-- 2. USERS
-- ==============================================================================

INSERT INTO users (username, name, email, employee_id, role, shift_code, access_scope, status, can_login, password_hash, force_reset) VALUES
${USERS.map(u => `(${sqlEscape(u.username)}, ${sqlEscape(u.name)}, ${sqlEscape(u.email)}, ${sqlEscape(u.employeeId)}, '${u.role}', ${sqlEscape(u.shift)}, ${sqlEscape(u.access || 'all')}, '${u.status}', ${boolOrNull(u.canLogin)}, ${sqlEscape(u.passwordHash)}, ${boolOrNull(u.forceReset)})`).join(',\n')};

-- ==============================================================================
-- 3. SHIFTS & SHIFT RULES
-- ==============================================================================

INSERT INTO "Shift_Master" ("Unit_code", "Shift_Code", "start_tm", "end_tm", "time_diff") VALUES
('SML', 'A', '2000-01-01 06:00:00+05:30', '2000-01-01 14:00:00+05:30', '08:00'),
('SML', 'B', '2000-01-01 14:00:00+05:30', '2000-01-01 22:00:00+05:30', '08:00'),
('SML', 'C', '2000-01-01 22:00:00+05:30', '2000-01-01 06:00:00+05:30', '08:00'),
('SML', 'G', '2000-01-01 09:00:00+05:30', '2000-01-01 17:30:00+05:30', '08:30');

INSERT INTO shifts (code, name, start_minute, end_minute, interval_minutes, grace_minutes, supervisor_username, active) VALUES
${SHIFT_MASTER.shifts.map(s => `(${sqlEscape(s.code)}, ${sqlEscape(s.name)}, ${s.start}, ${s.end}, ${s.interval}, ${s.grace}, ${sqlEscape(s.supervisor)}, ${boolOrNull(s.active)})`).join(',\n')};

INSERT INTO shift_rules (first_at_start, grace_enabled, overdue_alert, overdue_minutes, back_dated_allowed, active) VALUES
(${boolOrNull(SHIFT_MASTER.rules.firstAtStart)}, ${boolOrNull(SHIFT_MASTER.rules.grace)}, ${boolOrNull(SHIFT_MASTER.rules.overdueAlert)}, ${SHIFT_MASTER.rules.overdueMinutes}, ${boolOrNull(SHIFT_MASTER.rules.backDated)}, TRUE);

-- ==============================================================================
-- 4. PARAMETER DEFINITIONS (31 STANDARD PARAMETERS)
-- ==============================================================================

INSERT INTO parameter_definitions (code, param_key, label, param_group, unit, check_type, default_std, default_tol, default_tol_up, default_step, digits, sort_order) VALUES
${PARAM_DEFS.map((p, idx) => `(${sqlEscape(p.code)}, ${sqlEscape(p.key)}, ${sqlEscape(p.label)}, '${p.group}', ${sqlEscape(p.unit || '')}, '${p.check}', ${numOrNull(p.std)}, ${numOrNull(p.tol)}, ${numOrNull(p.tolUp)}, ${numOrNull(p.step)}, ${p.digits || 1}, ${(idx + 1) * 10})`).join(',\n')};

-- ==============================================================================
-- 5. PARTS CATALOG
-- ==============================================================================

INSERT INTO parts (part_no, part_name, material, customer, active) VALUES
${PARTS.map(p => `(${sqlEscape(p.partNo)}, ${sqlEscape(p.partName)}, ${sqlEscape(p.material || '')}, ${sqlEscape(p.customer || '')}, TRUE)`).join(',\n')};

-- ==============================================================================
-- 6. MOLDS CATALOG
-- ==============================================================================

INSERT INTO molds (mold_no, description, cavities, primary_part_no, expected_life, active) VALUES
${MOLDS.map(m => `(${sqlEscape(m.no)}, ${sqlEscape(m.description || '')}, ${m.cavities || 1}, ${sqlEscape(m.partNo)}, ${m.life || 40000}, TRUE)`).join(',\n')};

-- ==============================================================================
-- 7. MACHINES CATALOG (48 FANUC MACHINES)
-- ==============================================================================

INSERT INTO machines (
    id, name, make, model, clamp_tonnage, line, bay, data_source, active,
    current_mold_no, current_part_no, status,
    last_cycle_time, last_cushion, last_injection_time, last_peak_pressure, last_recovery_time,
    shift_progress_pct, last_log_label, deviation_count, has_photo
) VALUES
${MACHINES.map(m => `(
    ${sqlEscape(m.id)}, ${sqlEscape(m.name)}, ${sqlEscape(m.make)}, ${sqlEscape(m.model)}, ${m.clamp}, ${sqlEscape(m.line)}, ${m.bay}, '${m.dataSource}', ${boolOrNull(m.active)},
    ${sqlEscape(m.mold)}, ${sqlEscape(m.partNo)}, '${m.status}',
    ${numOrNull(m.cycle)}, ${numOrNull(m.cushion)}, ${numOrNull(m.injection)}, ${numOrNull(m.peakPressure)}, ${numOrNull(m.recovery)},
    ${m.progress || 0}, ${sqlEscape(m.lastLog)}, ${m.deviations || 0}, ${boolOrNull(m.hasPhoto)}
)`).join(',\n')};

-- ==============================================================================
-- 8. MOLD-MACHINE COMPATIBILITY CROSS-REFERENCE
-- ==============================================================================

`;

const moldMachinesSet = new Set();
const moldMachinesList = [];

for (const m of MOLDS) {
  if (m.machines && Array.isArray(m.machines)) {
    for (const machineId of m.machines) {
      const key = `${m.no}:${machineId}`;
      if (!moldMachinesSet.has(key)) {
        moldMachinesSet.add(key);
        moldMachinesList.push({ mold_no: m.no, machine_id: machineId, is_primary: true });
      }
    }
  }
}

for (const mac of MACHINES) {
  const key = `${mac.mold}:${mac.id}`;
  if (!moldMachinesSet.has(key)) {
    moldMachinesSet.add(key);
    moldMachinesList.push({ mold_no: mac.mold, machine_id: mac.id, is_primary: true });
  }
}

sql += `INSERT INTO mold_machines (mold_no, machine_id, is_primary) VALUES
${moldMachinesList.map(mm => `(${sqlEscape(mm.mold_no)}, ${sqlEscape(mm.machine_id)}, ${boolOrNull(mm.is_primary)})`).join(',\n')};

-- ==============================================================================
-- 9. RECIPES & RECIPE VERSIONS & RECIPE ROWS
-- ==============================================================================
`;

// Insert recipes
sql += `INSERT INTO recipes (id, machine_id, part_no, mold_no, description) VALUES\n`;
sql += RECIPES.map(r => `(${sqlEscape(r.id)}, ${sqlEscape(r.machineId)}, ${sqlEscape(r.partNo)}, ${sqlEscape(r.mold)}, ${sqlEscape(`Standard recipe for ${r.machineId} / ${r.partNo} / ${r.mold}`)})`).join(',\n') + ';\n\n';

// We will insert recipe_versions and recipe_rows
// To maintain deterministic IDs and relationships, we can use DO block or temporary table or generate sequential inserts
sql += `-- Recipe Versions and Parameter Rows\nDO $$ \nDECLARE\n    v_version_id INT;\nBEGIN\n`;

for (const r of RECIPES) {
  for (const v of r.versions) {
    const effDate = v.effectiveFrom ? `'${v.effectiveFrom}'` : 'CURRENT_DATE';
    const approvedAt = v.approvedAt ? `'${v.approvedAt}'` : 'NULL';
    const approvedBy = v.approvedBy ? sqlEscape(v.approvedBy) : 'NULL';
    const note = sqlEscape(v.note || '');

    sql += `\n    -- Recipe ${r.id} Version ${v.v} (${v.status})\n`;
    sql += `    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)\n`;
    sql += `    VALUES (${sqlEscape(r.id)}, ${v.v}, '${v.status}', ${effDate}, ${sqlEscape(v.createdBy || 'admin')}, ${approvedBy}, ${approvedAt}, ${note})\n`;
    sql += `    RETURNING id INTO v_version_id;\n\n`;

    if (v.rows && v.rows.length > 0) {
      sql += `    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES\n`;
      const rowStrings = v.rows.map(row => {
        const textStd = row.check === 'TEXT' ? sqlEscape(row.std) : 'NULL';
        const numStd = row.check === 'TEXT' ? 'NULL' : numOrNull(row.std);
        const lower = row.check === 'TEXT' ? 'NULL' : numOrNull(row.lower);
        const upper = row.check === 'TEXT' ? 'NULL' : numOrNull(row.upper);
        return `    (v_version_id, ${sqlEscape(row.code)}, '${row.check}', ${lower}, ${numStd}, ${textStd}, ${upper}, ${boolOrNull(row.applies)})`;
      });
      sql += rowStrings.join(',\n') + ';\n';
    }
  }
}

sql += `\nEND $$;\n\n`;

sql += `-- ==============================================================================
-- 10. SAMPLE AUDIT TRAIL LOG ENTRY
-- ==============================================================================

INSERT INTO audit_logs (username, action, target_module, target_id, new_data)
VALUES 
('admin', 'INITIAL_DATABASE_SEED', 'System', 'mpcr_db', '{"description": "Initial setup of MPCR PostgreSQL database with full catalog and master records"}'::jsonb);
`;

fs.writeFileSync(path.join(__dirname, 'seed.sql'), sql, 'utf8');
console.log('Successfully generated database/seed.sql!');
