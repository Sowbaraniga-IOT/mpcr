"""The Viewer role is read-only (QA SEC-09…11). The server enforces it whatever is ticked
(models.READ_ONLY_ROLES). This clears the ticks that only ever mean "change something" (record,
approve, user management, audit), so the matrix shows what really applies. Master ticks stay: for a
Viewer they open the master pages read-only."""
from django.db import migrations

CHANGE_ONLY = ['record', 'editAfterSubmit', 'approve', 'approveFinal', 'users', 'audit']


def viewer_read_only(apps, schema_editor):
    Role = apps.get_model('plant', 'Role')
    for role in Role.objects.filter(key='Viewer'):
        role.permissions = [p for p in role.permissions if p not in CHANGE_ONLY]
        role.save()


class Migration(migrations.Migration):
    dependencies = [('plant', '0002_login_lockout')]
    operations = [migrations.RunPython(viewer_read_only, migrations.RunPython.noop)]
