"""Load the plant's starting data: users, role permissions, 48 machines, parts, molds,
shifts and recipes (plant/fixtures/seed.json). Readings, deviations and notifications start empty.

    python manage.py seed           # only into an empty database
    python manage.py seed --reset   # wipe everything first
"""
import json
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from plant.models import (
    AuditEntry,
    Machine,
    MachineImage,
    Mold,
    Notification,
    ParameterLog,
    Part,
    Recipe,
    RecipeVersion,
    Role,
    Setting,
    Shift,
    ShiftMaster,
    User,
)
from plant.services.shift_master import save_times

FIXTURE = Path(__file__).resolve().parents[2] / 'fixtures' / 'seed.json'


def day(text):
    return date.fromisoformat(text) if text else None


class Command(BaseCommand):
    help = 'Load users, machines, recipes and shifts into the database'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='delete all plant data first')

    @transaction.atomic
    def handle(self, *args, reset=False, **kw):
        if reset:
            for model in [Notification, ParameterLog, RecipeVersion, Recipe, MachineImage, Machine, Mold, Part, Shift, ShiftMaster, Setting, Role, AuditEntry]:
                model.objects.all().delete()
            User.objects.all().delete()
        elif Machine.objects.exists():
            raise CommandError('The database already has machines. Use --reset to start over.')

        seed = json.loads(FIXTURE.read_text(encoding='utf-8'))

        for role, keys in seed['matrix'].items():
            Role.objects.update_or_create(key=role, defaults={'permissions': keys})

        for u in seed['users']:
            user, _ = User.objects.update_or_create(
                username=u['username'],
                defaults={
                    'name': u['name'],
                    'email': u['email'],
                    'employee_id': u['employeeId'],
                    'role': u['role'],
                    'shift': u['shift'],
                    'access': u['access'],
                    'status': u['status'],
                    'can_login': u['canLogin'],
                    'force_reset': u['forceReset'],
                    # The admin also gets Django's /admin/ site and may send telemetry.
                    'is_staff': u['role'] == 'Admin',
                    'is_superuser': u['role'] == 'Admin',
                },
            )
            user.set_password(f"{u['username']}@2026")  # e.g. operator → operator@2026
            user.save()

        for i, m in enumerate(seed['machines']):
            machine = Machine(id=m['id'], position=i + 1, has_photo=m.get('hasPhoto', False))
            machine.set_fields(m, Machine.MASTER_FIELDS + Machine.TELEMETRY_FIELDS)
            machine.save()

        for p in seed['parts']:
            Part.objects.create(part_no=p['partNo'], part_name=p.get('partName', ''), material=p.get('material', ''), customer=p.get('customer', ''))
        for m in seed['molds']:
            Mold.objects.create(
                no=m['no'],
                description=m.get('description', ''),
                cavities=m.get('cavities') or 1,
                part_no=m.get('partNo', ''),
                machines=m.get('machines', []),
                life=m.get('life'),
            )

        sm = seed['shiftMaster']
        for i, s in enumerate(sm['shifts']):
            Shift.objects.create(position=i, **{f: s[f] for f in Shift.FIELDS})
            save_times(s['code'], s['start'], s['end'], s.get('unitCode', ''))  # the times go into Shift_Master
        Setting.put('shiftRules', sm['rules'])

        for r in seed['recipes']:
            recipe = Recipe.objects.create(id=r['id'], machine_id=r['machineId'], part_no=r['partNo'], mold=r['mold'])
            RecipeVersion.objects.bulk_create(
                RecipeVersion(
                    recipe=recipe,
                    v=v['v'],
                    status=v['status'],
                    rows=v['rows'],
                    effective_from=day(v['effectiveFrom']),
                    created_by=v['createdBy'],
                    created_at=day(v['createdAt']),
                    approved_by=v['approvedBy'],
                    approved_at=day(v['approvedAt']),
                    note=v['note'],
                )
                for v in r['versions']
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Seeded {User.objects.count()} users, {Machine.objects.count()} machines, {Part.objects.count()} parts, '
                f'{Mold.objects.count()} molds, {Recipe.objects.count()} recipes, {Shift.objects.count()} shifts. '
                'Passwords are <username>@2026.'
            )
        )
