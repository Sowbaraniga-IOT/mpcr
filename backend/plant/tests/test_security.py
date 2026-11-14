"""Role limits: viewer, admin accounts, what the server sends, audit trail."""
from ..services import logic
from ..models import Machine, Role, User
from .base import PlantTestCase


class SecurityTests(PlantTestCase):
    # ---------- Read-only Viewer (QA SEC-09 … SEC-11) ----------

    def test_viewer_is_read_only_whatever_is_ticked(self):
        # Even if an admin ticks change permissions for the Viewer role …
        Role.objects.filter(key='Viewer').update(permissions=[p for p, _ in __import__('plant.models', fromlist=['PERMISSIONS']).PERMISSIONS])
        logic.forget_roles()
        v = self.client_for('viewer')
        v.raise_request_exception = False
        rows = v.get('/api/bootstrap/').json()['recipes'][0]['versions'][-1]['rows']
        refused = [
            v.put(f'/api/logs/J10-26/{self.today}/hours/10/', {'values': {'nozzle': 255}}, format='json'),
            v.put('/api/machines/J10-26/', {'name': 'renamed by viewer'}, format='json'),
            v.post('/api/recipes/R-001/draft/', {'rows': rows}, format='json'),
            v.put('/api/shift-master/', v.get('/api/shift-master/').json(), format='json'),
            v.post('/api/parts/bulk/', {'parts': [{'partNo': 'X', 'partName': 'x'}]}, format='json'),
            v.post('/api/users/', {'username': 'sneaky', 'name': 's', 'email': 's@x.com', 'employeeId': 'S-1', 'role': 'Viewer', 'password': 'sneaky@2026'}, format='json'),
        ]
        self.assertEqual([r.status_code for r in refused], [403] * len(refused))
        # … reading still works.
        self.assertEqual(v.get('/api/bootstrap/').status_code, 200)
        self.assertEqual(Machine.objects.get(id='J10-26').name, 'FANUC Machine 2')

    def test_seeded_viewer_has_no_change_ticks(self):
        self.assertEqual(sorted(Role.objects.get(key='Viewer').permissions), sorted(['dashboard', 'model3d', 'report', 'export', 'shiftMaster', 'machineMaster', 'parameters']))

    # ---------- Admin accounts (QA SEC-12 / SEC-13) ----------

    def test_only_admins_reach_admin_accounts(self):
        admin = self.client_for('admin')
        admin.put('/api/roles/', {'matrix': {'Manager': Role.objects.get(key='Manager').permissions + ['users']}}, format='json')
        logic.forget_roles()
        mgr = self.client_for('manager')
        refused = [
            mgr.put('/api/users/manager/', {'role': 'Admin'}, format='json'),  # promote self
            mgr.put('/api/users/operator/', {'role': 'Admin'}, format='json'),  # appoint an admin
            mgr.put('/api/users/admin/', {'password': 'taken@2026'}, format='json'),  # take over the admin
            mgr.put('/api/users/admin/', {'canLogin': False}, format='json'),
            mgr.post('/api/users/', {'username': 'boss', 'name': 'B', 'email': 'b@mpcr.com', 'employeeId': 'B-1', 'role': 'Admin', 'password': 'boss@2026'}, format='json'),
            mgr.put('/api/roles/', {'matrix': {'Manager': ['audit', 'users', 'record']}}, format='json'),  # grant itself more
            mgr.put('/api/users/manager/', {'role': 'Supervisor'}, format='json'),  # own role
        ]
        self.assertEqual([r.status_code for r in refused], [403] * len(refused))
        self.assertEqual(User.objects.get(username='manager').role, 'Manager')
        self.assertTrue(User.objects.get(username='admin').check_password('admin@2026'))
        # Ordinary accounts are still the manager's to look after.
        self.assertEqual(mgr.put('/api/users/operator/', {'shift': 'B', 'password': 'newcode@2026'}, format='json').status_code, 200)
        # An admin may appoint another admin.
        self.assertEqual(admin.put('/api/users/supervisor/', {'role': 'Admin'}, format='json').status_code, 200)

    # ---------- What the server sends (QA SEC-14 / SEC-15) ----------

    def test_machine_access_limits_what_is_sent(self):
        User.objects.filter(username='operator').update(access=['J10-26'])
        op = self.client_for('operator')
        self.record(self.client_for('admin'), 10, nozzle=270)  # a deviation on J10-25, outside the operator's access
        self.assertEqual([m['id'] for m in op.get('/api/live/').json()['machines']], ['J10-26'])
        self.assertEqual(list(op.get('/api/live/').json()['deviations']), [])
        boot = op.get('/api/bootstrap/').json()
        self.assertEqual([m['id'] for m in boot['machines']], ['J10-26'])
        self.assertEqual(list(boot['today']['logs']), [])
        self.assertEqual([m['id'] for m in op.get('/api/machines/').json()], ['J10-26'])

    def test_user_directory_only_for_user_managers(self):
        boot = self.client_for('viewer').get('/api/bootstrap/').json()
        others = [u for u in boot['users'] if u['username'] != 'viewer']
        self.assertEqual(len(others), 4)
        self.assertTrue(all(set(u) == {'username', 'name', 'role', 'shift'} for u in others))
        self.assertIn('email', next(u for u in boot['users'] if u['username'] == 'viewer'))
        self.assertTrue(all('email' in u for u in self.client_for('admin').get('/api/bootstrap/').json()['users']))

    # ---------- Audit trail (QA SEC-16) ----------

    def test_audit_entries_only_for_areas_the_user_changes(self):
        viewer, op = self.client_for('viewer'), self.client_for('operator')
        self.assertEqual(viewer.post('/api/audit/', {'area': 'User management', 'text': 'Admin deleted everything'}, format='json').status_code, 403)
        self.assertEqual(op.post('/api/audit/', {'area': 'User management', 'text': 'x'}, format='json').status_code, 403)
        self.assertEqual(op.post('/api/audit/', {'area': 'Parameter log', 'text': 'Edited J10-25 07:00'}, format='json').status_code, 201)
        self.assertEqual(op.post('/api/audit/', {'area': 'Made up', 'text': 'x'}, format='json').status_code, 400)
        self.assertEqual(op.post('/api/audit/', {'area': 'Parameter log', 'text': 'x' * 2001}, format='json').status_code, 400)

