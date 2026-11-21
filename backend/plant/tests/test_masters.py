"""Shift, recipe, machine, mold/part masters and machine photos."""
from ..models import Machine, Role, Shift
from .base import PlantTestCase


class MastersTests(PlantTestCase):
    # ---------- Shift Master (QA API-07) ----------

    def test_shift_master_is_validated(self):
        admin = self.client_for('admin')
        admin.raise_request_exception = False
        good = admin.get('/api/shift-master/').json()
        a = good['shifts'][0]
        cases = [
            ({'shifts': [{k: v for k, v in a.items() if k != 'code'}]}, 'code'),
            ({'shifts': [{**a, 'start': 2000}]}, 'start'),
            ({'shifts': [{**a, 'start': '06:00'}]}, 'start'),
            ({'shifts': [{**a, 'end': a['start']}]}, 'same time'),
            ({'shifts': [{**a, 'interval': 45}]}, 'readings every'),
            ({'shifts': [{**a, 'name': ''}]}, 'name'),
            ({'shifts': [a, a]}, 'twice'),
            ({'shifts': [{**a, 'supervisor': 'nobody'}]}, 'not a user'),
            ({'shifts': [a], 'rules': {'backDated': 'yes'}}, 'true or false'),
            ({'shifts': [a], 'rules': {'deleteAll': True}}, 'Unknown rule'),
            ({'shifts': []}, 'at least one'),
            ({'shifts': ['A']}, 'object'),
            ([a], 'JSON object'),
        ]
        for payload, words in cases:
            r = admin.put('/api/shift-master/', payload, format='json')
            self.assertEqual(r.status_code, 400, payload)
            self.assertIn(words, r.json()['detail'], payload)
        # Nothing was changed by the refused saves; a valid save still works.
        self.assertEqual(admin.get('/api/shift-master/').json(), good)
        self.assertEqual(admin.put('/api/shift-master/', good, format='json').status_code, 200)

    # ---------- Recipe limits (QA API-08) ----------

    def test_recipe_limits_are_validated(self):
        admin = self.client_for('admin')
        rows = admin.get('/api/bootstrap/').json()['recipes'][0]['versions'][-1]['rows']
        nozzle = rows[0]  # RANGE 250 / 255 / 260
        by_code = {r['code']: r for r in rows}

        def with_row(code, **change):
            return [{**r, **change} if r['code'] == code else r for r in rows]

        cases = [
            (with_row('TMP_NOZ', lower=300, std=255, upper=200), 'outside its own limits'),
            (with_row('TMP_NOZ', lower=None), 'RANGE needs'),
            (with_row('TMP_NOZ', std='hot'), 'must be a number'),
            (with_row('TMP_NOZ', upper=True), 'must be a number'),
            (with_row('INJ_VEL1', lower=50), 'EXACT has no tolerance'),
            (with_row('MON_CYCLE', lower=1), 'MAX ONLY'),
            (with_row('INJ_HRMODE', std=''), 'TEXT needs'),
            (rows + [nozzle], 'listed twice'),
        ]
        for bad, words in cases:
            r = admin.post('/api/recipes/R-001/draft/', {'rows': bad}, format='json')
            self.assertEqual(r.status_code, 400, words)
            self.assertIn(words, r.json()['detail'])
            r = admin.post('/api/recipes/', {'machineId': 'J10-30', 'partNo': 'P-NEW', 'mold': 'M-NEW', 'rows': bad}, format='json')
            self.assertEqual(r.status_code, 400, words)
        # Rows that don't apply aren't checked; a sound change saves.
        ok_rows = with_row('TMP_NOZ', lower=245, std=250, upper=255)
        ok_rows = [{**r, 'applies': False, 'check': 'NA'} if r['code'] == 'TMP_HRTC1' else r for r in ok_rows]
        self.assertEqual(admin.post('/api/recipes/R-001/draft/', {'rows': ok_rows}, format='json').status_code, 200)
        self.assertEqual(by_code['TMP_NOZ']['std'], 255)

    # ---------- Masters ----------

    def test_recipe_draft_needs_admin_approval(self):
        sup, admin = self.client_for('supervisor'), self.client_for('admin')
        rows = admin.get('/api/bootstrap/').json()['recipes'][0]['versions'][-1]['rows']
        rows[0] = {**rows[0], 'std': 250, 'lower': 245, 'upper': 255}
        r = sup.post('/api/recipes/R-001/draft/', {'rows': rows, 'note': 'Nozzle 250'}, format='json')
        self.assertEqual(r.json()['versions'][-1]['status'], 'draft')
        self.assertEqual(sup.post('/api/recipes/R-001/approve/').status_code, 403)
        r = admin.post('/api/recipes/R-001/approve/').json()
        self.assertEqual([v['status'] for v in r['versions']], ['archived', 'archived', 'archived', 'active'])
        # The log now checks against the new standard: 258 is above 255.
        devs = self.record(self.client_for('operator'), 12, nozzle=258).json()['deviations']
        self.assertEqual(devs[0]['key'], 'nozzle')

    def test_add_machine(self):
        admin = self.client_for('admin')
        new = {'id': 'J10-73', 'name': 'FANUC Machine 49', 'make': 'FANUC', 'model': 'ROBOSHOT α-S100iA', 'clamp': 100, 'line': 'Line D', 'bay': 13, 'dataSource': 'manual', 'active': True, 'mold': '', 'partNo': '', 'partName': ''}
        r = admin.post('/api/machines/', new, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()['status'], r.json()['lastLog']), ('off', '—'))
        self.assertEqual(admin.post('/api/machines/', new, format='json').status_code, 409)
        self.assertEqual(Machine.objects.last().id, 'J10-73')

    # ---------- Mold and part must be in the masters (QA DB-05) ----------

    def test_machine_mold_and_part_are_checked(self):
        admin = self.client_for('admin')
        put = lambda **f: admin.put('/api/machines/J10-25/', f, format='json')  # noqa: E731
        cases = [
            ({'mold': 'DOES-NOT-EXIST'}, 'not in the mold master'),
            ({'mold': 'M1070'}, 'set up for J10-26 only'),  # another machine's mold
            ({'partNo': 'NO-SUCH-PART'}, 'not in the parts master'),
        ]
        for fields, words in cases:
            r = put(**fields)
            self.assertEqual(r.status_code, 400, fields)
            self.assertIn(words, r.json()['detail'])
        m = Machine.objects.get(id='J10-25')
        self.assertEqual((m.mold, m.part_no), ('M1056', 'MSI60983822'))  # unchanged
        # Allowed moves still save: another mold set up for this machine, or nothing mounted.
        self.assertEqual(put(mold='M1063', partNo='MSI60983859').status_code, 200)
        self.assertEqual(put(mold='', partNo='').status_code, 200)
        # New machines and the Excel import follow the same rule; a bad import saves nothing.
        new = {'id': 'J10-74', 'name': 'FANUC Machine 50', 'clamp': 100, 'bay': 1, 'mold': 'M1056'}
        self.assertEqual(admin.post('/api/machines/', new, format='json').status_code, 400)
        ok_row = {**new, 'id': 'J10-75', 'mold': ''}
        r = admin.post('/api/machines/bulk/', {'machines': [ok_row, {**new, 'mold': 'GHOST'}]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Machine.objects.filter(id__in=['J10-74', 'J10-75']).exists())

    def test_role_matrix_and_users(self):
        admin = self.client_for('admin')
        r = admin.put('/api/roles/', {'matrix': {'Manager': ['dashboard', 'record']}}, format='json')
        self.assertEqual(r.json()['Manager'], ['dashboard', 'record'])
        self.assertEqual(Role.objects.get(key='Manager').permissions, ['dashboard', 'record'])
        self.assertEqual(self.record(self.client_for('manager'), 13, nozzle=255).status_code, 200)

        r = admin.post('/api/users/', {'username': 'ravi', 'name': 'Ravi', 'email': 'ravi@mpcr.com', 'employeeId': 'EMP-0100', 'role': 'Operator', 'password': 'ravi@2026'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.client_for('ravi')
        # Nobody switches off their own login or changes their own role (so the last admin stays one).
        self.assertEqual(admin.put('/api/users/admin/', {'canLogin': False}, format='json').status_code, 403)
        self.assertEqual(admin.put('/api/users/admin/', {'role': 'Manager'}, format='json').status_code, 403)

    # ---------- Machine photos (QA SEC-17 / SEC-18) ----------

    def test_photos_are_checked(self):
        import base64

        jpeg = 'data:image/jpeg;base64,' + base64.b64encode(b'\xff\xd8\xff\xe0' + b'\0' * 100).decode()
        png = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'\0' * 100).decode()
        admin = self.client_for('admin')
        post = lambda c, image, key='J10-30': c.post('/api/images/', {'set': [{'scope': 'machine', 'key': key, 'image': image}]}, format='json')  # noqa: E731
        bad = [
            {'src': 'javascript:alert(1)'},
            {'src': 'data:image/svg+xml;base64,' + base64.b64encode(b'<svg onload="alert(1)"/>').decode()},
            {'src': 'data:image/png;base64,' + base64.b64encode(b'<html>not a png</html>').decode()},
            {'src': 'data:image/jpeg;base64,***'},
            {'src': 'data:image/jpeg;base64,' + 'A' * (3 * 1024 * 1024)},  # over 2 MB
            {'src': jpeg, 'fit': 'stretch'},
            'just text',
        ]
        for image in bad:
            r = post(admin, image)
            self.assertEqual(r.status_code, 400, str(image)[:60])
        self.assertEqual(post(admin, {'src': jpeg, 'fit': 'contain'}).status_code, 200)
        self.assertEqual(post(admin, {'src': png}, key='J10-31').status_code, 200)
        self.assertEqual(post(admin, None, key='J10-32').status_code, 200)  # "removed"
        # Photos are machine-master data: a Viewer can't change them.
        self.assertEqual(post(self.client_for('viewer'), {'src': jpeg}).status_code, 403)

