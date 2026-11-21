"""MPCR data model.

Every model has a `to_dict()` that returns exactly the shape the React frontend works with
(camelCase keys), so the API and the frontend's in-memory stores stay one-to-one.
"""
import secrets

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

ROLES = ['Admin', 'Manager', 'Supervisor', 'Operator', 'Viewer']

PERMISSIONS = [
    ('dashboard', 'View dashboard'),
    ('model3d', 'View 3D model'),
    ('record', 'Record param log'),
    ('editAfterSubmit', 'Edit after submit'),
    ('approve', 'Approve deviations · level 1'),
    ('approveFinal', 'Approve deviations · level 2 (final)'),
    ('monitor', 'Deviation alerts on dashboard'),
    ('report', 'View report'),
    ('export', 'Export Excel / PDF'),
    ('shiftMaster', 'Shift master'),
    ('machineMaster', 'Machine master'),
    ('parameters', 'Parameter standards'),
    ('users', 'User management'),
    ('audit', 'Audit trail · admin only'),
]
PERMISSION_KEYS = [k for k, _ in PERMISSIONS]
# Only the Admin role holds these, whatever is ticked in the matrix.
ADMIN_ONLY = ['audit']
# Permissions that change something. Read-only roles never hold them, whatever is ticked:
# a Viewer may open the masters and the log, but not record, approve or edit.
CHANGE_PERMISSIONS = ['record', 'editAfterSubmit', 'approve', 'approveFinal', 'shiftMaster', 'machineMaster', 'parameters', 'users', 'audit']
READ_ONLY_ROLES = ['Viewer']


def all_machines():
    return 'all'


def slot_key(hour):
    """A reading slot as it is stored in a sheet: 7 → "7", 6.5 → "6.5" (the same text JavaScript uses)."""
    return str(int(hour)) if float(hour).is_integer() else repr(float(hour))


def slot_label(hour):
    """A reading slot as a clock time: 26.5 → "02:30"."""
    minutes = round(hour * 60)
    return f'{minutes // 60 % 24:02d}:{minutes % 60:02d}'


def iso(value):
    return value.isoformat() if value else None


# ---------- People ----------


class User(AbstractUser):
    """A plant account. Sign in with the username, the email or the employee id."""

    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    employee_id = models.CharField(max_length=50, unique=True)
    role = models.CharField(max_length=20, choices=[(r, r) for r in ROLES], default='Viewer')
    shift = models.CharField(max_length=4, null=True, blank=True)
    # 'all' or a list of machine ids
    access = models.JSONField(default=all_machines)
    status = models.CharField(max_length=20, default='active')  # active | invited | suspended
    can_login = models.BooleanField(default=True)
    force_reset = models.BooleanField(default=False)
    # Wrong access codes in a row; after too many the account is locked until `locked_until`.
    failed_logins = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    REQUIRED_FIELDS = ['email', 'employee_id']

    def to_dict(self):
        return {
            'username': self.username,
            'name': self.name,
            'email': self.email,
            'employeeId': self.employee_id,
            'role': self.role,
            'shift': self.shift,
            'access': self.access,
            'status': self.status,
            'canLogin': self.can_login,
            'forceReset': self.force_reset,
            'lastLogin': iso(self.last_login),
            'lockedUntil': iso(self.locked_until),
        }


def new_token_key():
    return secrets.token_hex(20)


class SessionToken(models.Model):
    """One sign-in on one device. Each sign-in gets its own token, so signing out on one
    device leaves the user's other devices signed in. Sent as "Authorization: Token <key>"."""

    key = models.CharField(max_length=40, primary_key=True, default=new_token_key)
    user = models.ForeignKey(User, related_name='session_tokens', on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    last_used = models.DateTimeField(default=timezone.now)
    device = models.CharField(max_length=200, blank=True)  # the browser's User-Agent, to tell sessions apart

    class Meta:
        ordering = ['-last_used']

    def __str__(self):
        return f'{self.user.username} · {self.device[:40]}'


class Role(models.Model):
    """One row per role: the permissions ticked for it in User Management."""

    key = models.CharField(max_length=20, primary_key=True)
    permissions = models.JSONField(default=list)

    def __str__(self):
        return self.key


# ---------- Plant ----------


class Machine(models.Model):
    MASTER_FIELDS = ['id', 'name', 'make', 'model', 'clamp', 'line', 'bay', 'dataSource', 'active', 'mold', 'partNo', 'partName']
    TELEMETRY_FIELDS = ['status', 'cycle', 'cushion', 'injection', 'peakPressure', 'recovery', 'progress']

    id = models.CharField(max_length=20, primary_key=True)
    position = models.PositiveIntegerField(default=0)  # the order machines are listed in
    name = models.CharField(max_length=100)
    make = models.CharField(max_length=50, default='FANUC')
    model = models.CharField(max_length=60, blank=True)
    clamp = models.PositiveIntegerField(default=100)
    line = models.CharField(max_length=30, blank=True)
    bay = models.PositiveIntegerField(default=1)
    data_source = models.CharField(max_length=10, default='manual')  # manual | auto (OPC UA)
    active = models.BooleanField(default=True)
    mold = models.CharField(max_length=50, blank=True)
    part_no = models.CharField(max_length=50, blank=True)
    part_name = models.CharField(max_length=100, blank=True)
    has_photo = models.BooleanField(default=False)

    # Live data from the last shot; null while the machine is offline.
    status = models.CharField(max_length=10, default='off')  # run | idle | maint | alarm | off
    cycle = models.FloatField(null=True, blank=True)
    cushion = models.FloatField(null=True, blank=True)
    injection = models.FloatField(null=True, blank=True)
    peak_pressure = models.FloatField(null=True, blank=True)
    recovery = models.FloatField(null=True, blank=True)
    progress = models.PositiveIntegerField(default=0)
    telemetry_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['position', 'id']

    def __str__(self):
        return self.id

    # camelCase ↔ field name
    FIELD_OF = {'dataSource': 'data_source', 'partNo': 'part_no', 'partName': 'part_name', 'peakPressure': 'peak_pressure'}

    def set_fields(self, data, keys):
        for key in keys:
            if key in data and key != 'id':
                setattr(self, self.FIELD_OF.get(key, key), data[key])

    def to_dict(self, last_log='—', deviations=0):
        out = {k: getattr(self, self.FIELD_OF.get(k, k)) for k in self.MASTER_FIELDS + self.TELEMETRY_FIELDS}
        out.update(hasPhoto=self.has_photo, lastLog=last_log, deviations=deviations)
        return out


class MachineImage(models.Model):
    """An uploaded photo for one machine, or shared by every machine of a model.
    A machine entry with src = null means "removed, show the upload box"."""

    scope = models.CharField(max_length=10)  # machine | model
    key = models.CharField(max_length=60)
    src = models.TextField(null=True, blank=True)  # data URL
    fit = models.CharField(max_length=10, default='cover')

    class Meta:
        unique_together = [('scope', 'key')]


class Part(models.Model):
    part_no = models.CharField(max_length=50, primary_key=True)
    part_name = models.CharField(max_length=100, blank=True)
    material = models.CharField(max_length=100, blank=True)
    customer = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ['part_no']

    def to_dict(self):
        return {'partNo': self.part_no, 'partName': self.part_name, 'material': self.material, 'customer': self.customer}


class Mold(models.Model):
    no = models.CharField(max_length=50, primary_key=True)
    description = models.CharField(max_length=200, blank=True)
    cavities = models.PositiveIntegerField(default=1)
    part_no = models.CharField(max_length=50, blank=True)
    machines = models.JSONField(default=list)  # machine ids it may run on; empty = any
    life = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['no']

    def to_dict(self):
        return {
            'no': self.no,
            'description': self.description,
            'cavities': self.cavities,
            'partNo': self.part_no,
            'machines': self.machines,
            'life': self.life,
        }


# ---------- Shift master ----------


class ShiftMaster(models.Model):
    """The plant's shift timings: Unit_code, Shift_Code, start_tm, end_tm, time_diff.

    This is where the times of a shift live. Only the time of day of start_tm / end_tm counts; an end_tm
    at or before start_tm runs past midnight. time_diff is the length as "HH:MM" (e.g. "08:00").
    MPCR's reading settings for the same shift (name, interval, grace, supervisor, on/off) are in Shift,
    matched on the shift code; services/shift_master.py puts the two together."""

    Unit_code = models.CharField(max_length=10, db_column='Unit_code')
    Shift_Code = models.CharField(max_length=1, db_column='Shift_Code', primary_key=True)
    start_tm = models.DateTimeField(db_column='start_tm')
    end_tm = models.DateTimeField(db_column='end_tm')
    time_diff = models.CharField(max_length=5, db_column='time_diff')

    class Meta:
        db_table = 'Shift_Master'
        ordering = ['Shift_Code']

    def __str__(self):
        return f'{self.Unit_code} {self.Shift_Code} {self.time_diff}'


class Shift(models.Model):
    """MPCR's reading settings for one shift. The start and end times come from ShiftMaster (start/end
    here are kept as a copy, in minutes after midnight); an end at or before the start runs past midnight."""

    code = models.CharField(max_length=4, primary_key=True)
    position = models.PositiveIntegerField(default=0)
    unit_code = ''  # not stored here: filled in from ShiftMaster.Unit_code
    name = models.CharField(max_length=40)
    start = models.PositiveIntegerField()
    end = models.PositiveIntegerField()
    interval = models.PositiveIntegerField(default=60)
    grace = models.PositiveIntegerField(default=10)
    supervisor = models.CharField(max_length=150, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ['position', 'code']

    FIELDS = ['code', 'name', 'start', 'end', 'interval', 'grace', 'supervisor', 'active']

    @property
    def time_diff(self):
        """Length of the shift as "HH:MM", the text kept in Shift_Master.time_diff (e.g. "08:00")."""
        minutes = (self.end - self.start) % (24 * 60) or 24 * 60
        return f'{minutes // 60:02d}:{minutes % 60:02d}'

    def to_dict(self):
        return {**{f: getattr(self, f) for f in self.FIELDS}, 'unitCode': self.unit_code, 'timeDiff': self.time_diff}


class Setting(models.Model):
    """Small documents with no table of their own, e.g. the shift rules."""

    key = models.CharField(max_length=60, primary_key=True)
    value = models.JSONField(default=dict)

    @classmethod
    def get(cls, key, default=None):
        row = cls.objects.filter(key=key).first()
        return row.value if row else default

    @classmethod
    def put(cls, key, value):
        cls.objects.update_or_create(key=key, defaults={'value': value})


# ---------- Parameter master ----------


class Recipe(models.Model):
    """The standards for one Machine + Part No. + Mold, in numbered versions."""

    id = models.CharField(max_length=20, primary_key=True)  # R-001
    machine_id = models.CharField(max_length=20)
    part_no = models.CharField(max_length=50)
    mold = models.CharField(max_length=50)

    class Meta:
        ordering = ['id']
        unique_together = [('machine_id', 'part_no', 'mold')]

    def to_dict(self):
        return {
            'id': self.id,
            'machineId': self.machine_id,
            'partNo': self.part_no,
            'mold': self.mold,
            'versions': [v.to_dict() for v in self.versions.all()],
        }


class RecipeVersion(models.Model):
    STATUSES = ['active', 'draft', 'archived', 'rejected']

    recipe = models.ForeignKey(Recipe, related_name='versions', on_delete=models.CASCADE)
    v = models.PositiveIntegerField()
    status = models.CharField(max_length=10, default='draft')
    # [{ code, check, lower, std, upper, applies }] in sheet order
    rows = models.JSONField(default=list)
    effective_from = models.DateField(null=True, blank=True)
    created_by = models.CharField(max_length=150, blank=True)
    created_at = models.DateField(null=True, blank=True)
    approved_by = models.CharField(max_length=150, null=True, blank=True)
    approved_at = models.DateField(null=True, blank=True)
    note = models.TextField(blank=True)

    class Meta:
        ordering = ['recipe', 'v']
        unique_together = [('recipe', 'v')]

    def to_dict(self):
        return {
            'v': self.v,
            'status': self.status,
            'rows': self.rows,
            'effectiveFrom': iso(self.effective_from),
            'createdBy': self.created_by,
            'createdAt': iso(self.created_at),
            'approvedBy': self.approved_by,
            'approvedAt': iso(self.approved_at),
            'note': self.note,
        }


# ---------- Parameter log ----------


class ParameterLog(models.Model):
    """One machine's sheet for one production day (06:00 → 06:00).
    Slots run 6 … below 30, so 02:00 after midnight is hour 26 and 06:30 is 6.5."""

    machine = models.ForeignKey(Machine, related_name='logs', on_delete=models.CASCADE)
    date = models.DateField()
    # { "7": { "nozzle": 255, "hrMode": "STD", … } }
    recorded = models.JSONField(default=dict)
    # { "7": { "by": "operator", "at": "07:04" } }
    recorded_by = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('machine', 'date')]
        indexes = [models.Index(fields=['date'])]

    def to_dict(self):
        return {
            'recorded': self.recorded,
            'recordedBy': self.recorded_by,
            'deviations': [d.to_dict() for d in self.deviations.all()],
        }


class Deviation(models.Model):
    """A reading outside its limits, and its trip through
    OPEN → reason entered (awaiting) → supervisor approves (supervised) → manager approves (closed),
    or back to REJECTED for a new reason."""

    STATUSES = ['open', 'awaiting', 'supervised', 'closed', 'rejected']

    log = models.ForeignKey(ParameterLog, related_name='deviations', on_delete=models.CASCADE)
    hour = models.FloatField()  # reading slot of the production day: 6 … below 30, so 06:30 is 6.5
    key = models.CharField(max_length=40)
    value = models.JSONField()
    status = models.CharField(max_length=12, default='open')
    reason = models.TextField(null=True, blank=True)
    lot = models.CharField(max_length=60, null=True, blank=True)
    by = models.CharField(max_length=150, null=True, blank=True)
    role = models.CharField(max_length=20, null=True, blank=True)
    at = models.CharField(max_length=5, null=True, blank=True)  # HH:MM the reason was entered
    l1 = models.JSONField(null=True, blank=True)  # { by, at, comment } once the supervisor approves
    admin_by = models.CharField(max_length=150, null=True, blank=True)
    admin_at = models.CharField(max_length=5, null=True, blank=True)
    admin_comment = models.TextField(null=True, blank=True)
    admin_note = models.TextField(null=True, blank=True)  # why it was rejected
    rejected_by = models.CharField(max_length=20, null=True, blank=True)
    approved_at = models.CharField(max_length=5, null=True, blank=True)
    master_change = models.BooleanField(default=False)
    # Every decision, oldest first: [{ decision, comment, by, at, level }]
    reviews = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['hour', 'id']
        unique_together = [('log', 'hour', 'key')]
        indexes = [models.Index(fields=['status'])]

    @property
    def dev_id(self):
        return f'{slot_key(self.hour)}-{self.key}'

    def to_dict(self):
        out = {'id': self.dev_id, 'hour': int(self.hour) if float(self.hour).is_integer() else self.hour, 'key': self.key, 'value': self.value, 'status': self.status}
        optional = {
            'reason': self.reason,
            'lot': self.lot,
            'by': self.by,
            'role': self.role,
            'at': self.at,
            'l1': self.l1,
            'adminBy': self.admin_by,
            'adminAt': self.admin_at,
            'adminComment': self.admin_comment,
            'adminNote': self.admin_note,
            'rejectedBy': self.rejected_by,
            'approvedAt': self.approved_at,
        }
        out.update({k: v for k, v in optional.items() if v not in (None, '')})
        if self.master_change:
            out['masterChange'] = True
        if self.reviews:
            out['reviews'] = self.reviews
        return out


# ---------- Notifications & audit ----------


class Notification(models.Model):
    """A deviation event. `to` names who should hear about it:
    perms — everyone holding one of these permissions for the machine; users — named people."""

    ts = models.DateTimeField()
    type = models.CharField(max_length=12)  # detected | reason | l1 | rejected | approved
    machine_id = models.CharField(max_length=20)
    date = models.DateField()
    dev_id = models.CharField(max_length=60)
    param = models.CharField(max_length=100)
    detail = models.CharField(max_length=200, blank=True)
    note = models.TextField(blank=True)
    actor = models.CharField(max_length=150)
    actor_name = models.CharField(max_length=150)
    actor_role = models.CharField(max_length=20)
    to = models.JSONField(default=dict)
    read_by = models.JSONField(default=list)

    class Meta:
        ordering = ['-ts', '-id']
        indexes = [models.Index(fields=['-ts'])]

    def to_dict(self):
        return {
            'id': str(self.id),
            'ts': int(self.ts.timestamp() * 1000),
            'type': self.type,
            'machineId': self.machine_id,
            'date': self.date.strftime('%d.%m.%Y'),
            'devId': self.dev_id,
            'param': self.param,
            'detail': self.detail,
            'note': self.note,
            'actor': self.actor,
            'actorName': self.actor_name,
            'actorRole': self.actor_role,
            'to': self.to,
        }


class AuditEntry(models.Model):
    at = models.DateTimeField(auto_now_add=True)
    by = models.CharField(max_length=150)
    role = models.CharField(max_length=20, blank=True)
    area = models.CharField(max_length=40)
    text = models.TextField()

    class Meta:
        ordering = ['-at', '-id']

    def to_dict(self):
        return {'at': iso(self.at), 'by': self.by, 'role': self.role, 'area': self.area, 'text': self.text}
