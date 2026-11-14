-- ==============================================================================
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
('dashboard', 'View dashboard', 'View dashboard'),
('model3d', 'View 3D model', 'View 3D model'),
('record', 'Record param log', 'Record param log'),
('editAfterSubmit', 'Edit after submit', 'Edit after submit'),
('approve', 'Approve deviations · level 1', 'Approve deviations · level 1'),
('approveFinal', 'Approve deviations · level 2 (final)', 'Approve deviations · level 2 (final)'),
('monitor', 'Deviation alerts on dashboard', 'Deviation alerts on dashboard'),
('report', 'View report', 'View report'),
('export', 'Export Excel / PDF', 'Export Excel / PDF'),
('shiftMaster', 'Shift master', 'Shift master'),
('machineMaster', 'Machine master', 'Machine master'),
('parameters', 'Parameter standards', 'Parameter standards'),
('users', 'User management', 'User management'),
('audit', 'Audit trail · admin only', 'Audit trail · admin only');

INSERT INTO role_permissions (role, permission_key) VALUES
('Admin', 'dashboard'),
('Admin', 'model3d'),
('Admin', 'record'),
('Admin', 'editAfterSubmit'),
('Admin', 'approve'),
('Admin', 'approveFinal'),
('Admin', 'monitor'),
('Admin', 'report'),
('Admin', 'export'),
('Admin', 'shiftMaster'),
('Admin', 'machineMaster'),
('Admin', 'parameters'),
('Admin', 'users'),
('Admin', 'audit'),
('Manager', 'dashboard'),
('Manager', 'model3d'),
('Manager', 'editAfterSubmit'),
('Manager', 'approveFinal'),
('Manager', 'monitor'),
('Manager', 'report'),
('Manager', 'export'),
('Manager', 'shiftMaster'),
('Manager', 'machineMaster'),
('Manager', 'parameters'),
('Supervisor', 'dashboard'),
('Supervisor', 'model3d'),
('Supervisor', 'record'),
('Supervisor', 'editAfterSubmit'),
('Supervisor', 'approve'),
('Supervisor', 'monitor'),
('Supervisor', 'report'),
('Supervisor', 'export'),
('Supervisor', 'shiftMaster'),
('Supervisor', 'machineMaster'),
('Supervisor', 'parameters'),
('Operator', 'dashboard'),
('Operator', 'model3d'),
('Operator', 'record'),
('Operator', 'report'),
('Operator', 'export'),
('Operator', 'shiftMaster'),
('Operator', 'machineMaster'),
('Operator', 'parameters'),
('Viewer', 'dashboard'),
('Viewer', 'model3d'),
('Viewer', 'record'),
('Viewer', 'report'),
('Viewer', 'export'),
('Viewer', 'shiftMaster'),
('Viewer', 'machineMaster'),
('Viewer', 'parameters');

-- ==============================================================================
-- 2. USERS
-- ==============================================================================

INSERT INTO users (username, name, email, employee_id, role, shift_code, access_scope, status, can_login, password_hash, force_reset) VALUES
('viewer', 'Viewer', 'viewer@mpcr.com', 'EMP-0005', 'Viewer', NULL, 'all', 'active', TRUE, '0ccd5ae65ab3367a8aeaedb3985a77d17fc45c3bbac62596365c01dc124f690c', FALSE),
('operator', 'Operator', 'operator@mpcr.com', 'EMP-0004', 'Operator', 'A', 'all', 'active', TRUE, 'c708f381a36036e831b2e246c81bf9ef9a457de3bb837c383dbe09e276a68e12', FALSE),
('supervisor', 'Supervisor', 'supervisor@mpcr.com', 'EMP-0003', 'Supervisor', 'A', 'all', 'active', TRUE, '1bb7dcafe830c50f92d4524d26053658b6e506b1ebd166339ad29796556e4ba6', FALSE),
('manager', 'Manager', 'manager@mpcr.com', 'EMP-0002', 'Manager', NULL, 'all', 'active', TRUE, '447983bf3f25bc4ec7e1c327727ec80511f744c320f894e137bf4f9f74a79b35', FALSE),
('admin', 'Admin', 'admin@mpcr.com', 'SYS-0001', 'Admin', NULL, 'all', 'active', TRUE, 'ad852e1edd6a5383eace40cb47b934d25a436fe0b3b2a8ecf5f01e23ceed3053', FALSE);

-- ==============================================================================
-- 3. SHIFTS & SHIFT RULES
-- ==============================================================================

INSERT INTO shifts (code, name, start_minute, end_minute, interval_minutes, grace_minutes, supervisor_username, active) VALUES
('A', 'Morning', 360, 840, 60, 10, 'supervisor', TRUE),
('B', 'Afternoon', 840, 1320, 60, 10, 'supervisor', TRUE),
('C', 'Night', 1320, 360, 60, 10, 'supervisor', TRUE),
('G', 'General', 540, 1050, 60, 10, 'manager', FALSE);

INSERT INTO shift_rules (first_at_start, grace_enabled, overdue_alert, overdue_minutes, back_dated_allowed, active) VALUES
(TRUE, TRUE, TRUE, 15, FALSE, TRUE);

-- ==============================================================================
-- 4. PARAMETER DEFINITIONS (31 STANDARD PARAMETERS)
-- ==============================================================================

INSERT INTO parameter_definitions (code, param_key, label, param_group, unit, check_type, default_std, default_tol, default_tol_up, default_step, digits, sort_order) VALUES
('TMP_NOZ', 'nozzle', 'Nozzle temperature', 'TEMPERATURE', '°C', 'RANGE', 255, 5, NULL, NULL, 1, 10),
('TMP_Z1', 'zone1', 'Zone 1 temperature', 'TEMPERATURE', '°C', 'RANGE', 255, 5, NULL, NULL, 1, 20),
('TMP_Z2', 'zone2', 'Zone 2 temperature', 'TEMPERATURE', '°C', 'RANGE', 250, 5, NULL, NULL, 1, 30),
('TMP_Z3', 'zone3', 'Zone 3 temperature', 'TEMPERATURE', '°C', 'RANGE', 245, 5, NULL, NULL, 1, 40),
('TMP_HTH', 'throat', 'Hopper throat temp', 'TEMPERATURE', '°C', 'RANGE', 55, 10, NULL, NULL, 1, 50),
('TMP_HRTC1', 'hrtc1', 'HRTC temperature zone-1', 'TEMPERATURE', '°C', 'NA', NULL, NULL, NULL, NULL, 1, 60),
('TMP_HRTC2', 'hrtc2', 'HRTC temperature zone-2', 'TEMPERATURE', '°C', 'NA', NULL, NULL, NULL, NULL, 1, 70),
('TMP_HRTC3', 'hrtc3', 'HRTC temperature zone-3', 'TEMPERATURE', '°C', 'NA', NULL, NULL, NULL, NULL, 1, 80),
('TMP_HRTC4', 'hrtc4', 'HRTC temperature zone-4', 'TEMPERATURE', '°C', 'NA', NULL, NULL, NULL, NULL, 1, 90),
('TMP_MTC', 'mtc', 'MTC temperature', 'TEMPERATURE', '°C', 'RANGE', 60, 5, NULL, NULL, 1, 100),
('TMP_MOLD', 'mold', 'Mold temperature', 'TEMPERATURE', '°C', 'RANGE', 60, 5, NULL, NULL, 1, 110),
('TMP_DRY', 'dryer', 'Hopper dryer temp', 'TEMPERATURE', '°C', 'RANGE', 140, 10, NULL, NULL, 1, 120),
('INJ_VEL1', 'injVel1', 'Inject velocity 1', 'INJECTION', 'mm/s', 'EXACT', 60, NULL, NULL, NULL, 1, 130),
('INJ_SWPOS1', 'injSwitch1', 'Inject switch position 1', 'INJECTION', 'mm', 'NA', NULL, NULL, NULL, NULL, 1, 140),
('INJ_VEL2', 'injVel2', 'Inject velocity 2', 'INJECTION', 'mm/s', 'NA', NULL, NULL, NULL, NULL, 1, 150),
('INJ_MAXPRS', 'maxInjPress', 'Max inject pressure', 'INJECTION', 'MPa', 'EXACT', 150, NULL, NULL, NULL, 1, 160),
('INJ_POSTR', 'transfer', 'Position transfer', 'INJECTION', 'mm', 'EXACT', 6, NULL, NULL, NULL, 1, 170),
('INJ_HRMODE', 'hrMode', 'HR mode', 'INJECTION', '', 'TEXT', NULL, NULL, NULL, NULL, 1, 180),
('INJ_HOLDP1', 'hold1', 'Hold pressure 1', 'INJECTION', 'MPa', 'EXACT', 55, NULL, NULL, NULL, 1, 190),
('INJ_HOLDT1', 'holdTime1', 'Hold time 1', 'INJECTION', 's', 'EXACT', 3, NULL, NULL, NULL, 1, 200),
('INJ_BACKP', 'back', 'Back pressure', 'INJECTION', 'MPa', 'EXACT', 10, NULL, NULL, NULL, 1, 210),
('INJ_ROT', 'rotation', 'Rotation', 'INJECTION', 'min⁻¹', 'EXACT', 120, NULL, NULL, NULL, 1, 220),
('INJ_SHOT', 'shotSize', 'Shot size', 'INJECTION', 'mm', 'EXACT', 39.8, NULL, NULL, 0.4, 1, 230),
('INJ_DECD', 'decompDist', 'Decompression distance', 'INJECTION', 'mm', 'EXACT', 5, NULL, NULL, NULL, 1, 240),
('INJ_DECV', 'decompVel', 'Decompression velocity', 'INJECTION', 'mm/s', 'EXACT', 5, NULL, NULL, NULL, 1, 250),
('INJ_COOLT', 'cooling', 'Cooling time', 'INJECTION', 's', 'EXACT', 18, NULL, NULL, NULL, 1, 260),
('MON_CYCLE', 'cycle', 'Total cycle time', 'MONITOR', 's', 'MAX ONLY', 26.15, NULL, 1, 0.5, 1, 270),
('MON_CUSH', 'cushion', 'Cushion (actual)', 'MONITOR', 'mm', 'RANGE', 3.7, 1, NULL, 0.3, 1, 280),
('MON_INJT', 'injection', 'Injection time', 'MONITOR', 's', 'RANGE', 0.668, 0.05, NULL, 0.02, 1, 290),
('MON_PEAKP', 'peakPressure', 'Peak pressure', 'MONITOR', 'MPa', 'RANGE', 115, 20, NULL, 5, 1, 300),
('MON_RCVT', 'recovery', 'Recovery time', 'MONITOR', 's', 'RANGE', 5.2, 3, NULL, 0.5, 1, 310);

-- ==============================================================================
-- 5. PARTS CATALOG
-- ==============================================================================

INSERT INTO parts (part_no, part_name, material, customer, active) VALUES
('MSI60983822', '12377NYH20M-NA', 'PP-TD20', '', TRUE),
('MSI60983859', '12377NYH21M-NA', 'PP-TD20', '', TRUE),
('MSI60983896', '12410KXA10M-NA', 'ABS', '', TRUE),
('MSI60983933', '12455PQR02M-NA', '', '', TRUE),
('MSI60983970', '12471LMN05M-NA', '', '', TRUE),
('MSI60984007', '12335NYH20M-NA', '', '', TRUE),
('MSI60984044', '12342NYH21M-NA', '', '', TRUE),
('MSI60984081', '12349NYH22M-NA', '', '', TRUE),
('MSI60984118', '12356NYH23M-NA', '', '', TRUE),
('MSI60984155', '12363NYH24M-NA', '', '', TRUE),
('MSI60984192', '12370NYH20M-NA', '', '', TRUE),
('MSI60984229', '12377NYH21M-NA', '', '', TRUE),
('MSI60984266', '12384NYH22M-NA', '', '', TRUE),
('MSI60984303', '12391NYH23M-NA', '', '', TRUE),
('MSI60984340', '12398NYH24M-NA', '', '', TRUE),
('MSI60984377', '12405NYH20M-NA', '', '', TRUE),
('MSI60984414', '12412NYH21M-NA', '', '', TRUE),
('MSI60984451', '12419NYH22M-NA', '', '', TRUE),
('MSI60984488', '12426NYH23M-NA', '', '', TRUE),
('MSI60984525', '12433NYH24M-NA', '', '', TRUE),
('MSI60984562', '12440NYH20M-NA', '', '', TRUE),
('MSI60984599', '12447NYH21M-NA', '', '', TRUE),
('MSI60984636', '12454NYH22M-NA', '', '', TRUE),
('MSI60984673', '12461NYH23M-NA', '', '', TRUE),
('MSI60984710', '12468NYH24M-NA', '', '', TRUE),
('MSI60984747', '12475NYH20M-NA', '', '', TRUE),
('MSI60984784', '12482NYH21M-NA', '', '', TRUE),
('MSI60984821', '12489NYH22M-NA', '', '', TRUE),
('MSI60984858', '12496NYH23M-NA', '', '', TRUE),
('MSI60984895', '12503NYH24M-NA', '', '', TRUE),
('MSI60984932', '12510NYH20M-NA', '', '', TRUE),
('MSI60984969', '12517NYH21M-NA', '', '', TRUE),
('MSI60985006', '12524NYH22M-NA', '', '', TRUE),
('MSI60985043', '12531NYH23M-NA', '', '', TRUE),
('MSI60985080', '12538NYH24M-NA', '', '', TRUE),
('MSI60985117', '12545NYH20M-NA', '', '', TRUE),
('MSI60985154', '12552NYH21M-NA', '', '', TRUE),
('MSI60985191', '12559NYH22M-NA', '', '', TRUE),
('MSI60985228', '12566NYH23M-NA', '', '', TRUE),
('MSI60985265', '12573NYH24M-NA', '', '', TRUE),
('MSI60985302', '12580NYH20M-NA', '', '', TRUE),
('MSI60985339', '12587NYH21M-NA', '', '', TRUE),
('MSI60985376', '12594NYH22M-NA', '', '', TRUE),
('MSI60985413', '12601NYH23M-NA', '', '', TRUE),
('MSI60985450', '12608NYH24M-NA', '', '', TRUE),
('MSI60985487', '12615NYH20M-NA', '', '', TRUE),
('MSI60985524', '12622NYH21M-NA', '', '', TRUE),
('MSI60985561', '12629NYH22M-NA', '', '', TRUE),
('MSI60985598', '12636NYH23M-NA', '', '', TRUE);

-- ==============================================================================
-- 6. MOLDS CATALOG
-- ==============================================================================

INSERT INTO molds (mold_no, description, cavities, primary_part_no, expected_life, active) VALUES
('M1056', 'Cover – 4 cav', 4, 'MSI60983822', 40000, TRUE),
('M1057', 'Cover – 2 cav (backup)', 2, 'MSI60983822', 40000, TRUE),
('M1063', 'Cover RH', 2, 'MSI60983859', 40000, TRUE),
('M1070', 'Bracket', 4, 'MSI60983896', 50000, TRUE),
('M1077', 'Mold for 12455PQR02M-NA', 2, 'MSI60983933', 40000, TRUE),
('M1084', 'Mold for 12471LMN05M-NA', 2, 'MSI60983970', 40000, TRUE),
('M1091', 'Mold for 12335NYH20M-NA', 2, 'MSI60984007', 40000, TRUE),
('M1098', 'Mold for 12342NYH21M-NA', 2, 'MSI60984044', 40000, TRUE),
('M1105', 'Mold for 12349NYH22M-NA', 2, 'MSI60984081', 40000, TRUE),
('M1112', 'Mold for 12356NYH23M-NA', 2, 'MSI60984118', 40000, TRUE),
('M1119', 'Mold for 12363NYH24M-NA', 2, 'MSI60984155', 40000, TRUE),
('M1126', 'Mold for 12370NYH20M-NA', 2, 'MSI60984192', 40000, TRUE),
('M1133', 'Mold for 12377NYH21M-NA', 2, 'MSI60984229', 40000, TRUE),
('M1140', 'Mold for 12384NYH22M-NA', 2, 'MSI60984266', 40000, TRUE),
('M1147', 'Mold for 12391NYH23M-NA', 2, 'MSI60984303', 40000, TRUE),
('M1154', 'Mold for 12398NYH24M-NA', 2, 'MSI60984340', 40000, TRUE),
('M1161', 'Mold for 12405NYH20M-NA', 2, 'MSI60984377', 40000, TRUE),
('M1168', 'Mold for 12412NYH21M-NA', 2, 'MSI60984414', 40000, TRUE),
('M1175', 'Mold for 12419NYH22M-NA', 2, 'MSI60984451', 40000, TRUE),
('M1182', 'Mold for 12426NYH23M-NA', 2, 'MSI60984488', 40000, TRUE),
('M1189', 'Mold for 12433NYH24M-NA', 2, 'MSI60984525', 40000, TRUE),
('M1196', 'Mold for 12440NYH20M-NA', 2, 'MSI60984562', 40000, TRUE),
('M1203', 'Mold for 12447NYH21M-NA', 2, 'MSI60984599', 40000, TRUE),
('M1210', 'Mold for 12454NYH22M-NA', 2, 'MSI60984636', 40000, TRUE),
('M1217', 'Mold for 12461NYH23M-NA', 2, 'MSI60984673', 40000, TRUE),
('M1224', 'Mold for 12468NYH24M-NA', 2, 'MSI60984710', 40000, TRUE),
('M1231', 'Mold for 12475NYH20M-NA', 2, 'MSI60984747', 40000, TRUE),
('M1238', 'Mold for 12482NYH21M-NA', 2, 'MSI60984784', 40000, TRUE),
('M1245', 'Mold for 12489NYH22M-NA', 2, 'MSI60984821', 40000, TRUE),
('M1252', 'Mold for 12496NYH23M-NA', 2, 'MSI60984858', 40000, TRUE),
('M1259', 'Mold for 12503NYH24M-NA', 2, 'MSI60984895', 40000, TRUE),
('M1266', 'Mold for 12510NYH20M-NA', 2, 'MSI60984932', 40000, TRUE),
('M1273', 'Mold for 12517NYH21M-NA', 2, 'MSI60984969', 40000, TRUE),
('M1280', 'Mold for 12524NYH22M-NA', 2, 'MSI60985006', 40000, TRUE),
('M1287', 'Mold for 12531NYH23M-NA', 2, 'MSI60985043', 40000, TRUE),
('M1294', 'Mold for 12538NYH24M-NA', 2, 'MSI60985080', 40000, TRUE),
('M1301', 'Mold for 12545NYH20M-NA', 2, 'MSI60985117', 40000, TRUE),
('M1308', 'Mold for 12552NYH21M-NA', 2, 'MSI60985154', 40000, TRUE),
('M1315', 'Mold for 12559NYH22M-NA', 2, 'MSI60985191', 40000, TRUE),
('M1322', 'Mold for 12566NYH23M-NA', 2, 'MSI60985228', 40000, TRUE),
('M1329', 'Mold for 12573NYH24M-NA', 2, 'MSI60985265', 40000, TRUE),
('M1336', 'Mold for 12580NYH20M-NA', 2, 'MSI60985302', 40000, TRUE),
('M1343', 'Mold for 12587NYH21M-NA', 2, 'MSI60985339', 40000, TRUE),
('M1350', 'Mold for 12594NYH22M-NA', 2, 'MSI60985376', 40000, TRUE),
('M1357', 'Mold for 12601NYH23M-NA', 2, 'MSI60985413', 40000, TRUE),
('M1364', 'Mold for 12608NYH24M-NA', 2, 'MSI60985450', 40000, TRUE),
('M1371', 'Mold for 12615NYH20M-NA', 2, 'MSI60985487', 40000, TRUE),
('M1378', 'Mold for 12622NYH21M-NA', 2, 'MSI60985524', 40000, TRUE),
('M1385', 'Mold for 12629NYH22M-NA', 2, 'MSI60985561', 40000, TRUE),
('M1392', 'Mold for 12636NYH23M-NA', 2, 'MSI60985598', 40000, TRUE);

-- ==============================================================================
-- 7. MACHINES CATALOG (48 FANUC MACHINES)
-- ==============================================================================

INSERT INTO machines (
    id, name, make, model, clamp_tonnage, line, bay, data_source, active,
    current_mold_no, current_part_no, status,
    last_cycle_time, last_cushion, last_injection_time, last_peak_pressure, last_recovery_time,
    shift_progress_pct, last_log_label, deviation_count, has_photo
) VALUES
(
    'J10-25', 'FANUC Machine 1', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line A', 3, 'manual', TRUE,
    'M1056', 'MSI60983822', 'run',
    31.54, 6.41, 1.51, 118, 4.77,
    93, '10:02', 1, FALSE
),
(
    'J10-26', 'FANUC Machine 2', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line A', 4, 'manual', TRUE,
    'M1070', 'MSI60983896', 'alarm',
    39.81, 4.71, 1.46, 105, 4.69,
    37, '09:58', 3, TRUE
),
(
    'J10-27', 'FANUC Machine 3', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line B', 1, 'auto', TRUE,
    'M1077', 'MSI60983933', 'run',
    36.21, 2.47, 2.26, 93, 10.76,
    49, '10:02', 0, FALSE
),
(
    'J10-28', 'FANUC Machine 4', 'FANUC', 'ROBOSHOT α-S300iA', 300, 'Line B', 2, 'manual', TRUE,
    'M1084', 'MSI60983970', 'run',
    20.51, 7.96, 3.27, 159, 8.14,
    75, '10:02', 0, TRUE
),
(
    'J10-29', 'FANUC Machine 5', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line A', 5, 'manual', TRUE,
    'M1091', 'MSI60984007', 'off',
    NULL, NULL, NULL, NULL, NULL,
    40, 'Yesterday', 1, FALSE
),
(
    'J10-30', 'FANUC Machine 6', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line A', 6, 'auto', TRUE,
    'M1098', 'MSI60984044', 'run',
    23.47, 4.72, 1.69, 99, 3.58,
    94, '10:02', 0, TRUE
),
(
    'J10-31', 'FANUC Machine 7', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line A', 7, 'manual', TRUE,
    'M1105', 'MSI60984081', 'run',
    35.43, 3.12, 2.27, 180, 4.71,
    68, '10:02', 0, TRUE
),
(
    'J10-32', 'FANUC Machine 8', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line A', 8, 'manual', TRUE,
    'M1112', 'MSI60984118', 'run',
    37.84, 6.84, 1.06, 83, 4.21,
    64, '10:02', 0, TRUE
),
(
    'J10-33', 'FANUC Machine 9', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line A', 9, 'auto', TRUE,
    'M1119', 'MSI60984155', 'run',
    22.28, 7.9, 1.74, 157, 5.39,
    67, '10:05', 0, TRUE
),
(
    'J10-34', 'FANUC Machine 10', 'FANUC', 'ROBOSHOT α-S300iA', 300, 'Line A', 10, 'manual', TRUE,
    'M1126', 'MSI60984192', 'run',
    30.28, 7.86, 1.66, 159, 10.79,
    73, '10:02', 2, TRUE
),
(
    'J10-35', 'FANUC Machine 11', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line A', 11, 'manual', TRUE,
    'M1133', 'MSI60984229', 'idle',
    26.85, 4.68, 2.33, 145, 3.57,
    52, '10:02', 0, TRUE
),
(
    'J10-36', 'FANUC Machine 12', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line A', 12, 'auto', TRUE,
    'M1140', 'MSI60984266', 'run',
    29.83, 7.62, 1.14, 123, 5.63,
    45, '09:58', 0, TRUE
),
(
    'J10-37', 'FANUC Machine 13', 'FANUC', 'ROBOSHOT α-S300iA', 300, 'Line B', 1, 'manual', TRUE,
    'M1147', 'MSI60984303', 'run',
    20.39, 4.87, 3.02, 133, 4.13,
    44, '09:58', 1, FALSE
),
(
    'J10-38', 'FANUC Machine 14', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line B', 2, 'manual', TRUE,
    'M1154', 'MSI60984340', 'maint',
    27.41, 3.52, 1.84, 111, 8.55,
    27, '09:58', 1, TRUE
),
(
    'J10-39', 'FANUC Machine 15', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line B', 3, 'auto', TRUE,
    'M1161', 'MSI60984377', 'run',
    37.26, 2.76, 1.77, 102, 5.69,
    24, '10:05', 2, TRUE
),
(
    'J10-40', 'FANUC Machine 16', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line B', 4, 'manual', TRUE,
    'M1168', 'MSI60984414', 'off',
    NULL, NULL, NULL, NULL, NULL,
    41, 'Yesterday', 0, TRUE
),
(
    'J10-41', 'FANUC Machine 17', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line B', 5, 'manual', TRUE,
    'M1175', 'MSI60984451', 'run',
    29.44, 3.93, 1.75, 91, 9.56,
    45, '09:58', 0, TRUE
),
(
    'J10-42', 'FANUC Machine 18', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line B', 6, 'auto', TRUE,
    'M1182', 'MSI60984488', 'idle',
    39.15, 7.48, 3.41, 159, 5.1,
    53, '09:58', 2, TRUE
),
(
    'J10-43', 'FANUC Machine 19', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line B', 7, 'manual', TRUE,
    'M1189', 'MSI60984525', 'run',
    33.83, 6.05, 3.21, 92, 9.12,
    95, '10:05', 0, TRUE
),
(
    'J10-44', 'FANUC Machine 20', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line B', 8, 'manual', TRUE,
    'M1196', 'MSI60984562', 'alarm',
    31.94, 3.05, 2.16, 96, 10.14,
    31, '09:58', 2, TRUE
),
(
    'J10-45', 'FANUC Machine 21', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line B', 9, 'auto', TRUE,
    'M1203', 'MSI60984599', 'run',
    41.06, 5.45, 2.02, 144, 11.43,
    52, '10:02', 0, TRUE
),
(
    'J10-46', 'FANUC Machine 22', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line B', 10, 'manual', TRUE,
    'M1210', 'MSI60984636', 'run',
    32.58, 5.64, 1.73, 119, 5,
    79, '10:02', 2, FALSE
),
(
    'J10-47', 'FANUC Machine 23', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line B', 11, 'manual', TRUE,
    'M1217', 'MSI60984673', 'off',
    NULL, NULL, NULL, NULL, NULL,
    67, 'Yesterday', 0, TRUE
),
(
    'J10-48', 'FANUC Machine 24', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line B', 12, 'auto', TRUE,
    'M1224', 'MSI60984710', 'run',
    21.09, 4.76, 2.79, 176, 7.82,
    14, '10:02', 0, TRUE
),
(
    'J10-49', 'FANUC Machine 25', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line C', 1, 'manual', TRUE,
    'M1231', 'MSI60984747', 'maint',
    28.38, 7.07, 3.08, 171, 7.98,
    14, '10:05', 0, TRUE
),
(
    'J10-50', 'FANUC Machine 26', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line C', 2, 'manual', TRUE,
    'M1238', 'MSI60984784', 'run',
    30.31, 5.82, 3.17, 114, 10.95,
    92, '10:02', 0, TRUE
),
(
    'J10-51', 'FANUC Machine 27', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line C', 3, 'auto', TRUE,
    'M1245', 'MSI60984821', 'run',
    20.81, 4.88, 2.28, 121, 7.9,
    67, '10:02', 1, TRUE
),
(
    'J10-52', 'FANUC Machine 28', 'FANUC', 'ROBOSHOT α-S300iA', 300, 'Line C', 4, 'manual', TRUE,
    'M1252', 'MSI60984858', 'alarm',
    41.36, 4.6, 1.04, 124, 11.84,
    92, '10:02', 1, TRUE
),
(
    'J10-53', 'FANUC Machine 29', 'FANUC', 'ROBOSHOT α-S300iA', 300, 'Line C', 5, 'manual', TRUE,
    'M1259', 'MSI60984895', 'idle',
    28.22, 3.84, 0.99, 173, 8.66,
    88, '10:05', 1, TRUE
),
(
    'J10-54', 'FANUC Machine 30', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line C', 6, 'auto', TRUE,
    'M1266', 'MSI60984932', 'off',
    NULL, NULL, NULL, NULL, NULL,
    35, 'Yesterday', 0, TRUE
),
(
    'J10-55', 'FANUC Machine 31', 'FANUC', 'ROBOSHOT α-S300iA', 300, 'Line C', 7, 'manual', TRUE,
    'M1273', 'MSI60984969', 'run',
    35.88, 3.45, 1.96, 159, 8.62,
    52, '10:05', 1, FALSE
),
(
    'J10-56', 'FANUC Machine 32', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line C', 8, 'manual', TRUE,
    'M1280', 'MSI60985006', 'run',
    25.11, 4.28, 1.45, 142, 4.08,
    61, '10:02', 0, TRUE
),
(
    'J10-57', 'FANUC Machine 33', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line C', 9, 'auto', TRUE,
    'M1287', 'MSI60985043', 'idle',
    28.65, 7.59, 0.88, 90, 5.38,
    69, '10:05', 1, TRUE
),
(
    'J10-58', 'FANUC Machine 34', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line C', 10, 'manual', TRUE,
    'M1294', 'MSI60985080', 'run',
    22.85, 2.94, 1.85, 84, 5.45,
    68, '09:58', 0, TRUE
),
(
    'J10-59', 'FANUC Machine 35', 'FANUC', 'ROBOSHOT α-S300iA', 300, 'Line C', 11, 'manual', TRUE,
    'M1301', 'MSI60985117', 'maint',
    22.1, 7.23, 2.28, 131, 9.92,
    94, '09:58', 1, TRUE
),
(
    'J10-60', 'FANUC Machine 36', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line C', 12, 'auto', TRUE,
    'M1308', 'MSI60985154', 'off',
    NULL, NULL, NULL, NULL, NULL,
    28, 'Yesterday', 0, TRUE
),
(
    'J10-61', 'FANUC Machine 37', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line D', 1, 'manual', TRUE,
    'M1315', 'MSI60985191', 'run',
    25.99, 6.08, 1.74, 129, 7.55,
    39, '10:05', 2, TRUE
),
(
    'J10-62', 'FANUC Machine 38', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line D', 2, 'manual', TRUE,
    'M1322', 'MSI60985228', 'alarm',
    26.96, 2.86, 1.99, 155, 11.62,
    80, '10:02', 2, FALSE
),
(
    'J10-63', 'FANUC Machine 39', 'FANUC', 'ROBOSHOT α-S300iA', 300, 'Line D', 3, 'auto', TRUE,
    'M1329', 'MSI60985265', 'run',
    32.09, 3.19, 2.81, 116, 7.02,
    23, '09:58', 0, TRUE
),
(
    'J10-64', 'FANUC Machine 40', 'FANUC', 'ROBOSHOT α-S300iA', 300, 'Line D', 4, 'manual', TRUE,
    'M1336', 'MSI60985302', 'idle',
    35.22, 6.37, 1.71, 126, 8.15,
    65, '09:58', 2, FALSE
),
(
    'J10-65', 'FANUC Machine 41', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line D', 5, 'manual', TRUE,
    'M1343', 'MSI60985339', 'idle',
    38.02, 4.14, 3.09, 174, 10.97,
    41, '09:58', 0, TRUE
),
(
    'J10-66', 'FANUC Machine 42', 'FANUC', 'ROBOSHOT α-S300iA', 300, 'Line D', 6, 'auto', TRUE,
    'M1350', 'MSI60985376', 'off',
    NULL, NULL, NULL, NULL, NULL,
    79, 'Yesterday', 1, FALSE
),
(
    'J10-67', 'FANUC Machine 43', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line D', 7, 'manual', TRUE,
    'M1357', 'MSI60985413', 'run',
    27.22, 6.08, 2.94, 142, 9.95,
    33, '10:02', 1, TRUE
),
(
    'J10-68', 'FANUC Machine 44', 'FANUC', 'ROBOSHOT α-S100iA', 100, 'Line D', 8, 'manual', TRUE,
    'M1364', 'MSI60985450', 'maint',
    39.37, 5.52, 1.53, 112, 11.7,
    72, '10:02', 0, FALSE
),
(
    'J10-69', 'FANUC Machine 45', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line D', 9, 'auto', TRUE,
    'M1371', 'MSI60985487', 'run',
    24.42, 7.04, 2.83, 111, 3.09,
    11, '09:58', 0, TRUE
),
(
    'J10-70', 'FANUC Machine 46', 'FANUC', 'ROBOSHOT α-S300iA', 300, 'Line D', 10, 'manual', TRUE,
    'M1378', 'MSI60985524', 'alarm',
    29.11, 4.69, 2.91, 87, 11.64,
    30, '10:05', 2, FALSE
),
(
    'J10-71', 'FANUC Machine 47', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line D', 11, 'manual', TRUE,
    'M1385', 'MSI60985561', 'idle',
    31.7, 5.14, 2.14, 95, 10.93,
    87, '10:05', 2, TRUE
),
(
    'J10-72', 'FANUC Machine 48', 'FANUC', 'ROBOSHOT α-S50iA', 50, 'Line D', 12, 'auto', TRUE,
    'M1392', 'MSI60985598', 'off',
    NULL, NULL, NULL, NULL, NULL,
    16, 'Yesterday', 1, TRUE
);

-- ==============================================================================
-- 8. MOLD-MACHINE COMPATIBILITY CROSS-REFERENCE
-- ==============================================================================

INSERT INTO mold_machines (mold_no, machine_id, is_primary) VALUES
('M1056', 'J10-25', TRUE),
('M1056', 'J10-26', TRUE),
('M1057', 'J10-25', TRUE),
('M1063', 'J10-25', TRUE),
('M1070', 'J10-26', TRUE),
('M1077', 'J10-27', TRUE),
('M1084', 'J10-28', TRUE),
('M1091', 'J10-29', TRUE),
('M1098', 'J10-30', TRUE),
('M1105', 'J10-31', TRUE),
('M1112', 'J10-32', TRUE),
('M1119', 'J10-33', TRUE),
('M1126', 'J10-34', TRUE),
('M1133', 'J10-35', TRUE),
('M1140', 'J10-36', TRUE),
('M1147', 'J10-37', TRUE),
('M1154', 'J10-38', TRUE),
('M1161', 'J10-39', TRUE),
('M1168', 'J10-40', TRUE),
('M1175', 'J10-41', TRUE),
('M1182', 'J10-42', TRUE),
('M1189', 'J10-43', TRUE),
('M1196', 'J10-44', TRUE),
('M1203', 'J10-45', TRUE),
('M1210', 'J10-46', TRUE),
('M1217', 'J10-47', TRUE),
('M1224', 'J10-48', TRUE),
('M1231', 'J10-49', TRUE),
('M1238', 'J10-50', TRUE),
('M1245', 'J10-51', TRUE),
('M1252', 'J10-52', TRUE),
('M1259', 'J10-53', TRUE),
('M1266', 'J10-54', TRUE),
('M1273', 'J10-55', TRUE),
('M1280', 'J10-56', TRUE),
('M1287', 'J10-57', TRUE),
('M1294', 'J10-58', TRUE),
('M1301', 'J10-59', TRUE),
('M1308', 'J10-60', TRUE),
('M1315', 'J10-61', TRUE),
('M1322', 'J10-62', TRUE),
('M1329', 'J10-63', TRUE),
('M1336', 'J10-64', TRUE),
('M1343', 'J10-65', TRUE),
('M1350', 'J10-66', TRUE),
('M1357', 'J10-67', TRUE),
('M1364', 'J10-68', TRUE),
('M1371', 'J10-69', TRUE),
('M1378', 'J10-70', TRUE),
('M1385', 'J10-71', TRUE),
('M1392', 'J10-72', TRUE);

-- ==============================================================================
-- 9. RECIPES & RECIPE VERSIONS & RECIPE ROWS
-- ==============================================================================
INSERT INTO recipes (id, machine_id, part_no, mold_no, description) VALUES
('R-001', 'J10-25', 'MSI60983822', 'M1056', 'Standard recipe for J10-25 / MSI60983822 / M1056'),
('R-002', 'J10-25', 'MSI60983822', 'M1057', 'Standard recipe for J10-25 / MSI60983822 / M1057'),
('R-003', 'J10-26', 'MSI60983822', 'M1056', 'Standard recipe for J10-26 / MSI60983822 / M1056'),
('R-004', 'J10-25', 'MSI60983859', 'M1063', 'Standard recipe for J10-25 / MSI60983859 / M1063'),
('R-005', 'J10-26', 'MSI60983896', 'M1070', 'Standard recipe for J10-26 / MSI60983896 / M1070'),
('R-006', 'J10-27', 'MSI60983933', 'M1077', 'Standard recipe for J10-27 / MSI60983933 / M1077'),
('R-007', 'J10-28', 'MSI60983970', 'M1084', 'Standard recipe for J10-28 / MSI60983970 / M1084'),
('R-008', 'J10-29', 'MSI60984007', 'M1091', 'Standard recipe for J10-29 / MSI60984007 / M1091'),
('R-009', 'J10-30', 'MSI60984044', 'M1098', 'Standard recipe for J10-30 / MSI60984044 / M1098'),
('R-010', 'J10-31', 'MSI60984081', 'M1105', 'Standard recipe for J10-31 / MSI60984081 / M1105'),
('R-011', 'J10-32', 'MSI60984118', 'M1112', 'Standard recipe for J10-32 / MSI60984118 / M1112'),
('R-012', 'J10-33', 'MSI60984155', 'M1119', 'Standard recipe for J10-33 / MSI60984155 / M1119'),
('R-013', 'J10-34', 'MSI60984192', 'M1126', 'Standard recipe for J10-34 / MSI60984192 / M1126'),
('R-014', 'J10-35', 'MSI60984229', 'M1133', 'Standard recipe for J10-35 / MSI60984229 / M1133'),
('R-015', 'J10-36', 'MSI60984266', 'M1140', 'Standard recipe for J10-36 / MSI60984266 / M1140'),
('R-016', 'J10-37', 'MSI60984303', 'M1147', 'Standard recipe for J10-37 / MSI60984303 / M1147'),
('R-017', 'J10-38', 'MSI60984340', 'M1154', 'Standard recipe for J10-38 / MSI60984340 / M1154'),
('R-018', 'J10-39', 'MSI60984377', 'M1161', 'Standard recipe for J10-39 / MSI60984377 / M1161'),
('R-019', 'J10-40', 'MSI60984414', 'M1168', 'Standard recipe for J10-40 / MSI60984414 / M1168'),
('R-020', 'J10-41', 'MSI60984451', 'M1175', 'Standard recipe for J10-41 / MSI60984451 / M1175'),
('R-021', 'J10-42', 'MSI60984488', 'M1182', 'Standard recipe for J10-42 / MSI60984488 / M1182'),
('R-022', 'J10-43', 'MSI60984525', 'M1189', 'Standard recipe for J10-43 / MSI60984525 / M1189'),
('R-023', 'J10-44', 'MSI60984562', 'M1196', 'Standard recipe for J10-44 / MSI60984562 / M1196'),
('R-024', 'J10-45', 'MSI60984599', 'M1203', 'Standard recipe for J10-45 / MSI60984599 / M1203'),
('R-025', 'J10-46', 'MSI60984636', 'M1210', 'Standard recipe for J10-46 / MSI60984636 / M1210'),
('R-026', 'J10-47', 'MSI60984673', 'M1217', 'Standard recipe for J10-47 / MSI60984673 / M1217'),
('R-027', 'J10-48', 'MSI60984710', 'M1224', 'Standard recipe for J10-48 / MSI60984710 / M1224'),
('R-028', 'J10-49', 'MSI60984747', 'M1231', 'Standard recipe for J10-49 / MSI60984747 / M1231'),
('R-029', 'J10-50', 'MSI60984784', 'M1238', 'Standard recipe for J10-50 / MSI60984784 / M1238'),
('R-030', 'J10-51', 'MSI60984821', 'M1245', 'Standard recipe for J10-51 / MSI60984821 / M1245'),
('R-031', 'J10-52', 'MSI60984858', 'M1252', 'Standard recipe for J10-52 / MSI60984858 / M1252'),
('R-032', 'J10-53', 'MSI60984895', 'M1259', 'Standard recipe for J10-53 / MSI60984895 / M1259'),
('R-033', 'J10-54', 'MSI60984932', 'M1266', 'Standard recipe for J10-54 / MSI60984932 / M1266'),
('R-034', 'J10-55', 'MSI60984969', 'M1273', 'Standard recipe for J10-55 / MSI60984969 / M1273'),
('R-035', 'J10-56', 'MSI60985006', 'M1280', 'Standard recipe for J10-56 / MSI60985006 / M1280'),
('R-036', 'J10-57', 'MSI60985043', 'M1287', 'Standard recipe for J10-57 / MSI60985043 / M1287'),
('R-037', 'J10-58', 'MSI60985080', 'M1294', 'Standard recipe for J10-58 / MSI60985080 / M1294'),
('R-038', 'J10-59', 'MSI60985117', 'M1301', 'Standard recipe for J10-59 / MSI60985117 / M1301'),
('R-039', 'J10-60', 'MSI60985154', 'M1308', 'Standard recipe for J10-60 / MSI60985154 / M1308'),
('R-040', 'J10-61', 'MSI60985191', 'M1315', 'Standard recipe for J10-61 / MSI60985191 / M1315'),
('R-041', 'J10-62', 'MSI60985228', 'M1322', 'Standard recipe for J10-62 / MSI60985228 / M1322'),
('R-042', 'J10-63', 'MSI60985265', 'M1329', 'Standard recipe for J10-63 / MSI60985265 / M1329'),
('R-043', 'J10-64', 'MSI60985302', 'M1336', 'Standard recipe for J10-64 / MSI60985302 / M1336'),
('R-044', 'J10-65', 'MSI60985339', 'M1343', 'Standard recipe for J10-65 / MSI60985339 / M1343'),
('R-045', 'J10-66', 'MSI60985376', 'M1350', 'Standard recipe for J10-66 / MSI60985376 / M1350'),
('R-046', 'J10-67', 'MSI60985413', 'M1357', 'Standard recipe for J10-67 / MSI60985413 / M1357'),
('R-047', 'J10-68', 'MSI60985450', 'M1364', 'Standard recipe for J10-68 / MSI60985450 / M1364'),
('R-048', 'J10-69', 'MSI60985487', 'M1371', 'Standard recipe for J10-69 / MSI60985487 / M1371'),
('R-049', 'J10-70', 'MSI60985524', 'M1378', 'Standard recipe for J10-70 / MSI60985524 / M1378'),
('R-050', 'J10-71', 'MSI60985561', 'M1385', 'Standard recipe for J10-71 / MSI60985561 / M1385'),
('R-051', 'J10-72', 'MSI60985598', 'M1392', 'Standard recipe for J10-72 / MSI60985598 / M1392');

-- Recipe Versions and Parameter Rows
DO $$ 
DECLARE
    v_version_id INT;
BEGIN

    -- Recipe R-001 Version 1 (archived)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-001', 1, 'archived', '2026-01-15', 'admin', 'admin', '2026-01-15', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.15, NULL, 27.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-001 Version 2 (archived)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-001', 2, 'archived', '2026-01-15', 'admin', 'admin', '2026-01-15', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.15, NULL, 27.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-001 Version 3 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-001', 3, 'active', '2026-06-01', 'admin', 'admin', '2026-06-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.15, NULL, 27.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-002 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-002', 1, 'active', '2026-06-15', 'admin', 'admin', '2026-06-15', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 21.5, 21.5, NULL, 21.5, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 20, 20, NULL, 20, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 28, NULL, 29, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-003 Version 1 (archived)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-003', 1, 'archived', '2026-01-15', 'admin', 'admin', '2026-01-15', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 140, 140, NULL, 140, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 27.5, NULL, 28.5, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-003 Version 2 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-003', 2, 'active', '2026-06-10', 'admin', 'admin', '2026-06-10', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 140, 140, NULL, 140, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 27.5, NULL, 28.5, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-004 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-004', 1, 'active', '2026-06-20', 'admin', 'admin', '2026-06-20', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.15, NULL, 27.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-005 Version 1 (archived)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-005', 1, 'archived', '2026-01-15', 'admin', 'admin', '2026-01-15', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 39.81, NULL, 40.81, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.71, 4.71, NULL, 5.71, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.41, 1.46, NULL, 1.51, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 85, 105, NULL, 125, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 1.69, 4.69, NULL, 7.69, TRUE);

    -- Recipe R-005 Version 2 (archived)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-005', 2, 'archived', '2026-01-15', 'admin', 'admin', '2026-01-15', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 39.81, NULL, 40.81, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.71, 4.71, NULL, 5.71, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.41, 1.46, NULL, 1.51, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 85, 105, NULL, 125, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 1.69, 4.69, NULL, 7.69, TRUE);

    -- Recipe R-005 Version 3 (archived)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-005', 3, 'archived', '2026-01-15', 'admin', 'admin', '2026-01-15', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 39.81, NULL, 40.81, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.71, 4.71, NULL, 5.71, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.41, 1.46, NULL, 1.51, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 85, 105, NULL, 125, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 1.69, 4.69, NULL, 7.69, TRUE);

    -- Recipe R-005 Version 4 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-005', 4, 'active', '2026-06-05', 'admin', 'admin', '2026-06-05', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 39.81, NULL, 40.81, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.71, 4.71, NULL, 5.71, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.41, 1.46, NULL, 1.51, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 85, 105, NULL, 125, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 1.69, 4.69, NULL, 7.69, TRUE);

    -- Recipe R-006 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-006', 1, 'active', '2026-05-20', 'admin', 'admin', '2026-05-20', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 36.21, NULL, 37.21, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 1.47, 2.47, NULL, 3.47, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.21, 2.26, NULL, 2.31, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 73, 93, NULL, 113, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 7.76, 10.76, NULL, 13.76, TRUE);

    -- Recipe R-006 Version 2 (draft)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-006', 2, 'draft', '2026-06-28', 'supervisor', NULL, NULL, 'Cooling time +1 s for sink marks')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 19, 19, NULL, 19, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 36.21, NULL, 37.21, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 1.47, 2.47, NULL, 3.47, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.21, 2.26, NULL, 2.31, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 73, 93, NULL, 113, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 7.76, 10.76, NULL, 13.76, TRUE);

    -- Recipe R-007 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-007', 1, 'active', '2026-06-12', 'admin', 'admin', '2026-06-12', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 20.51, NULL, 21.51, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 6.96, 7.96, NULL, 8.96, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 3.22, 3.27, NULL, 3.32, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 139, 159, NULL, 179, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 5.14, 8.14, NULL, 11.14, TRUE);

    -- Recipe R-008 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-008', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.15, NULL, 27.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-009 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-009', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 23.47, NULL, 24.47, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.72, 4.72, NULL, 5.72, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.64, 1.69, NULL, 1.74, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 79, 99, NULL, 119, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 0.58, 3.58, NULL, 6.58, TRUE);

    -- Recipe R-010 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-010', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 35.43, NULL, 36.43, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.12, 3.12, NULL, 4.12, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.22, 2.27, NULL, 2.32, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 160, 180, NULL, 200, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 1.71, 4.71, NULL, 7.71, TRUE);

    -- Recipe R-011 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-011', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 37.84, NULL, 38.84, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 5.84, 6.84, NULL, 7.84, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.01, 1.06, NULL, 1.11, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 63, 83, NULL, 103, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 1.21, 4.21, NULL, 7.21, TRUE);

    -- Recipe R-012 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-012', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 22.28, NULL, 23.28, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 6.9, 7.9, NULL, 8.9, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.69, 1.74, NULL, 1.79, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 137, 157, NULL, 177, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.39, 5.39, NULL, 8.39, TRUE);

    -- Recipe R-013 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-013', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 30.28, NULL, 31.28, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 6.86, 7.86, NULL, 8.86, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.61, 1.66, NULL, 1.71, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 139, 159, NULL, 179, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 7.79, 10.79, NULL, 13.79, TRUE);

    -- Recipe R-014 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-014', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.85, NULL, 27.85, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.68, 4.68, NULL, 5.68, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.28, 2.33, NULL, 2.38, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 125, 145, NULL, 165, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 0.57, 3.57, NULL, 6.57, TRUE);

    -- Recipe R-015 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-015', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 29.83, NULL, 30.83, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 6.62, 7.62, NULL, 8.62, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.09, 1.14, NULL, 1.19, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 103, 123, NULL, 143, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.63, 5.63, NULL, 8.63, TRUE);

    -- Recipe R-016 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-016', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 20.39, NULL, 21.39, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.87, 4.87, NULL, 5.87, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.97, 3.02, NULL, 3.07, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 113, 133, NULL, 153, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 1.13, 4.13, NULL, 7.13, TRUE);

    -- Recipe R-017 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-017', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 27.41, NULL, 28.41, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.52, 3.52, NULL, 4.52, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.79, 1.84, NULL, 1.89, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 91, 111, NULL, 131, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 5.55, 8.55, NULL, 11.55, TRUE);

    -- Recipe R-018 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-018', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 37.26, NULL, 38.26, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 1.76, 2.76, NULL, 3.76, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.72, 1.77, NULL, 1.82, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 82, 102, NULL, 122, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.69, 5.69, NULL, 8.69, TRUE);

    -- Recipe R-019 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-019', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.15, NULL, 27.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-020 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-020', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 29.44, NULL, 30.44, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.93, 3.93, NULL, 4.93, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.7, 1.75, NULL, 1.8, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 71, 91, NULL, 111, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 6.56, 9.56, NULL, 12.56, TRUE);

    -- Recipe R-021 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-021', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 39.15, NULL, 40.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 6.48, 7.48, NULL, 8.48, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 3.36, 3.41, NULL, 3.46, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 139, 159, NULL, 179, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.1, 5.1, NULL, 8.1, TRUE);

    -- Recipe R-022 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-022', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 33.83, NULL, 34.83, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 5.05, 6.05, NULL, 7.05, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 3.16, 3.21, NULL, 3.26, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 72, 92, NULL, 112, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 6.12, 9.12, NULL, 12.12, TRUE);

    -- Recipe R-023 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-023', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 31.94, NULL, 32.94, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.05, 3.05, NULL, 4.05, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.11, 2.16, NULL, 2.21, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 76, 96, NULL, 116, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 7.14, 10.14, NULL, 13.14, TRUE);

    -- Recipe R-024 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-024', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 41.06, NULL, 42.06, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 4.45, 5.45, NULL, 6.45, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.97, 2.02, NULL, 2.07, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 124, 144, NULL, 164, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 8.43, 11.43, NULL, 14.43, TRUE);

    -- Recipe R-025 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-025', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 32.58, NULL, 33.58, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 4.64, 5.64, NULL, 6.64, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.68, 1.73, NULL, 1.78, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 99, 119, NULL, 139, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2, 5, NULL, 8, TRUE);

    -- Recipe R-026 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-026', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.15, NULL, 27.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-027 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-027', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 21.09, NULL, 22.09, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.76, 4.76, NULL, 5.76, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.74, 2.79, NULL, 2.84, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 156, 176, NULL, 196, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 4.82, 7.82, NULL, 10.82, TRUE);

    -- Recipe R-028 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-028', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 28.38, NULL, 29.38, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 6.07, 7.07, NULL, 8.07, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 3.03, 3.08, NULL, 3.13, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 151, 171, NULL, 191, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 4.98, 7.98, NULL, 10.98, TRUE);

    -- Recipe R-029 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-029', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 30.31, NULL, 31.31, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 4.82, 5.82, NULL, 6.82, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 3.12, 3.17, NULL, 3.22, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 94, 114, NULL, 134, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 7.95, 10.95, NULL, 13.95, TRUE);

    -- Recipe R-030 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-030', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 20.81, NULL, 21.81, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.88, 4.88, NULL, 5.88, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.23, 2.28, NULL, 2.33, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 101, 121, NULL, 141, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 4.9, 7.9, NULL, 10.9, TRUE);

    -- Recipe R-031 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-031', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 41.36, NULL, 42.36, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.6, 4.6, NULL, 5.6, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.99, 1.04, NULL, 1.09, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 104, 124, NULL, 144, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 8.84, 11.84, NULL, 14.84, TRUE);

    -- Recipe R-032 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-032', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 28.22, NULL, 29.22, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.84, 3.84, NULL, 4.84, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.94, 0.99, NULL, 1.04, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 153, 173, NULL, 193, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 5.66, 8.66, NULL, 11.66, TRUE);

    -- Recipe R-033 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-033', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.15, NULL, 27.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-034 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-034', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 35.88, NULL, 36.88, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.45, 3.45, NULL, 4.45, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.91, 1.96, NULL, 2.01, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 139, 159, NULL, 179, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 5.62, 8.62, NULL, 11.62, TRUE);

    -- Recipe R-035 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-035', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 25.11, NULL, 26.11, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.28, 4.28, NULL, 5.28, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.4, 1.45, NULL, 1.5, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 122, 142, NULL, 162, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 1.08, 4.08, NULL, 7.08, TRUE);

    -- Recipe R-036 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-036', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 28.65, NULL, 29.65, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 6.59, 7.59, NULL, 8.59, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.83, 0.88, NULL, 0.93, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 70, 90, NULL, 110, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.38, 5.38, NULL, 8.38, TRUE);

    -- Recipe R-037 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-037', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 22.85, NULL, 23.85, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 1.94, 2.94, NULL, 3.94, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.8, 1.85, NULL, 1.9, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 64, 84, NULL, 104, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.45, 5.45, NULL, 8.45, TRUE);

    -- Recipe R-038 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-038', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 22.1, NULL, 23.1, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 6.23, 7.23, NULL, 8.23, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.23, 2.28, NULL, 2.33, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 111, 131, NULL, 151, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 6.92, 9.92, NULL, 12.92, TRUE);

    -- Recipe R-039 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-039', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.15, NULL, 27.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-040 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-040', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 25.99, NULL, 26.99, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 5.08, 6.08, NULL, 7.08, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.69, 1.74, NULL, 1.79, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 109, 129, NULL, 149, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 4.55, 7.55, NULL, 10.55, TRUE);

    -- Recipe R-041 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-041', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.96, NULL, 27.96, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 1.86, 2.86, NULL, 3.86, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.94, 1.99, NULL, 2.04, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 135, 155, NULL, 175, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 8.62, 11.62, NULL, 14.62, TRUE);

    -- Recipe R-042 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-042', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 32.09, NULL, 33.09, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.19, 3.19, NULL, 4.19, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.76, 2.81, NULL, 2.86, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 96, 116, NULL, 136, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 4.02, 7.02, NULL, 10.02, TRUE);

    -- Recipe R-043 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-043', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 35.22, NULL, 36.22, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 5.37, 6.37, NULL, 7.37, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.66, 1.71, NULL, 1.76, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 106, 126, NULL, 146, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 5.15, 8.15, NULL, 11.15, TRUE);

    -- Recipe R-044 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-044', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 38.02, NULL, 39.02, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.14, 4.14, NULL, 5.14, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 3.04, 3.09, NULL, 3.14, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 154, 174, NULL, 194, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 7.97, 10.97, NULL, 13.97, TRUE);

    -- Recipe R-045 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-045', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.15, NULL, 27.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

    -- Recipe R-046 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-046', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 27.22, NULL, 28.22, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 5.08, 6.08, NULL, 7.08, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.89, 2.94, NULL, 2.99, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 122, 142, NULL, 162, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 6.95, 9.95, NULL, 12.95, TRUE);

    -- Recipe R-047 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-047', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 39.37, NULL, 40.37, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 4.52, 5.52, NULL, 6.52, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 1.48, 1.53, NULL, 1.58, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 92, 112, NULL, 132, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 8.7, 11.7, NULL, 14.7, TRUE);

    -- Recipe R-048 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-048', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 24.42, NULL, 25.42, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 6.04, 7.04, NULL, 8.04, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.78, 2.83, NULL, 2.88, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 91, 111, NULL, 131, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 0.09, 3.09, NULL, 6.09, TRUE);

    -- Recipe R-049 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-049', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 29.11, NULL, 30.11, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 3.69, 4.69, NULL, 5.69, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.86, 2.91, NULL, 2.96, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 67, 87, NULL, 107, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 8.64, 11.64, NULL, 14.64, TRUE);

    -- Recipe R-050 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-050', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 31.7, NULL, 32.7, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 4.14, 5.14, NULL, 6.14, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 2.09, 2.14, NULL, 2.19, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 75, 95, NULL, 115, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 7.93, 10.93, NULL, 13.93, TRUE);

    -- Recipe R-051 Version 1 (active)
    INSERT INTO recipe_versions (recipe_id, version_number, status, effective_from, created_by, approved_by, approved_at, note)
    VALUES ('R-051', 1, 'active', '2026-05-01', 'admin', 'admin', '2026-05-01', '')
    RETURNING id INTO v_version_id;

    INSERT INTO recipe_rows (recipe_version_id, param_code, check_type, lower_limit, standard_value, text_standard, upper_limit, applies) VALUES
    (v_version_id, 'TMP_NOZ', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z1', 'RANGE', 250, 255, NULL, 260, TRUE),
    (v_version_id, 'TMP_Z2', 'RANGE', 245, 250, NULL, 255, TRUE),
    (v_version_id, 'TMP_Z3', 'RANGE', 240, 245, NULL, 250, TRUE),
    (v_version_id, 'TMP_HTH', 'RANGE', 45, 55, NULL, 65, TRUE),
    (v_version_id, 'TMP_HRTC1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC3', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_HRTC4', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'TMP_MTC', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_MOLD', 'RANGE', 55, 60, NULL, 65, TRUE),
    (v_version_id, 'TMP_DRY', 'RANGE', 130, 140, NULL, 150, TRUE),
    (v_version_id, 'INJ_VEL1', 'EXACT', 60, 60, NULL, 60, TRUE),
    (v_version_id, 'INJ_VEL2', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_SWPOS1', 'NA', NULL, NULL, NULL, NULL, FALSE),
    (v_version_id, 'INJ_MAXPRS', 'EXACT', 150, 150, NULL, 150, TRUE),
    (v_version_id, 'INJ_POSTR', 'EXACT', 6, 6, NULL, 6, TRUE),
    (v_version_id, 'INJ_HRMODE', 'TEXT', NULL, NULL, 'STD', NULL, TRUE),
    (v_version_id, 'INJ_HOLDP1', 'EXACT', 55, 55, NULL, 55, TRUE),
    (v_version_id, 'INJ_HOLDT1', 'EXACT', 3, 3, NULL, 3, TRUE),
    (v_version_id, 'INJ_BACKP', 'EXACT', 10, 10, NULL, 10, TRUE),
    (v_version_id, 'INJ_ROT', 'EXACT', 120, 120, NULL, 120, TRUE),
    (v_version_id, 'INJ_SHOT', 'EXACT', 39.8, 39.8, NULL, 39.8, TRUE),
    (v_version_id, 'INJ_DECD', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_DECV', 'EXACT', 5, 5, NULL, 5, TRUE),
    (v_version_id, 'INJ_COOLT', 'EXACT', 18, 18, NULL, 18, TRUE),
    (v_version_id, 'MON_CYCLE', 'MAX ONLY', NULL, 26.15, NULL, 27.15, TRUE),
    (v_version_id, 'MON_CUSH', 'RANGE', 2.7, 3.7, NULL, 4.7, TRUE),
    (v_version_id, 'MON_INJT', 'RANGE', 0.618, 0.668, NULL, 0.718, TRUE),
    (v_version_id, 'MON_PEAKP', 'RANGE', 95, 115, NULL, 135, TRUE),
    (v_version_id, 'MON_RCVT', 'RANGE', 2.2, 5.2, NULL, 8.2, TRUE);

END $$;

-- ==============================================================================
-- 10. SAMPLE AUDIT TRAIL LOG ENTRY
-- ==============================================================================

INSERT INTO audit_logs (username, action, target_module, target_id, new_data)
VALUES 
('admin', 'INITIAL_DATABASE_SEED', 'System', 'mpcr_db', '{"description": "Initial setup of MPCR PostgreSQL database with full catalog and master records"}'::jsonb);
