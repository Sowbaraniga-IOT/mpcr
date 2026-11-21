"""Sign-in, lockout, forced password change, tokens and sessions."""
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from ..models import SessionToken, User
from .base import PlantTestCase


class AuthTests(PlantTestCase):
    # ---------- Sign-in ----------

    def test_login_by_username_email_or_employee_id(self):
        for login_id in ['operator', 'OPERATOR@mpcr.com', 'emp-0004']:
            r = APIClient().post('/api/auth/login/', {'loginId': login_id, 'password': 'operator@2026'}, format='json')
            self.assertEqual(r.status_code, 200, login_id)
            self.assertEqual(r.json()['user']['role'], 'Operator')

    def test_wrong_password_and_switched_off_account(self):
        r = APIClient().post('/api/auth/login/', {'loginId': 'operator', 'password': 'nope123'}, format='json')
        self.assertEqual(r.status_code, 401)
        c = self.client_for('viewer')
        User.objects.filter(username='viewer').update(can_login=False)
        self.assertEqual(c.get('/api/auth/me/').status_code, 401)  # the open session stops too
        r = APIClient().post('/api/auth/login/', {'loginId': 'viewer', 'password': 'viewer@2026'}, format='json')
        self.assertEqual(r.status_code, 403)

    # ---------- Brute-force protection (QA SEC-03) ----------

    def attempt(self, login_id, password, ip='10.0.0.1', **headers):
        return APIClient(REMOTE_ADDR=ip, **headers).post('/api/auth/login/', {'loginId': login_id, 'password': password}, format='json')

    def test_account_locks_after_five_wrong_codes(self):
        for _ in range(5):
            self.assertEqual(self.attempt('supervisor', 'wrong!!').status_code, 401)
        # Locked: the right code is refused too, from any computer, with how long to wait.
        r = self.attempt('supervisor', 'supervisor@2026', ip='10.0.0.2')
        self.assertEqual(r.status_code, 429)
        self.assertIn('locked', r.json()['detail'])
        self.assertTrue(840 <= int(r['Retry-After']) <= 900)
        # Other accounts are not affected.
        self.assertEqual(self.attempt('operator', 'operator@2026').status_code, 200)
        # When the lock runs out, the right code works again and the count starts over.
        User.objects.filter(username='supervisor').update(locked_until=timezone.now() - timezone.timedelta(seconds=1))
        self.assertEqual(self.attempt('supervisor', 'supervisor@2026').status_code, 200)
        self.assertEqual(User.objects.get(username='supervisor').failed_logins, 0)

    def test_the_brute_force_probe_is_refused(self):
        # QA SEC-03 exactly: 30 wrong attempts, then the right one.
        codes = {self.attempt('supervisor', 'wrong!!').status_code for _ in range(30)}
        self.assertEqual(codes, {401, 429})
        self.assertEqual(self.attempt('supervisor', 'supervisor@2026').status_code, 429)

    def test_a_good_sign_in_resets_the_count(self):
        for _ in range(4):
            self.attempt('supervisor', 'wrong!!')
        self.assertEqual(self.attempt('supervisor', 'supervisor@2026').status_code, 200)
        for _ in range(4):
            self.attempt('supervisor', 'wrong!!')
        self.assertEqual(self.attempt('supervisor', 'supervisor@2026').status_code, 200)

    def test_one_address_trying_many_accounts_is_stopped(self):
        # Password spraying: unknown and real ids alike count against the address.
        for i in range(20):
            self.assertEqual(self.attempt(f'user{i}', 'guess@2026', ip='10.0.0.66').status_code, 401)
        r = self.attempt('operator', 'operator@2026', ip='10.0.0.66')
        self.assertEqual(r.status_code, 429)
        self.assertIn('this computer', r.json()['detail'])
        self.assertEqual(self.attempt('operator', 'operator@2026', ip='10.0.0.67').status_code, 200)
        # Unknown ids lock nobody, and look the same as a wrong code for a real one.
        self.assertFalse(User.objects.filter(locked_until__isnull=False).exists())

    def test_successful_sign_ins_never_count(self):
        # A whole shift signing in through one proxy address at 06:00 is never blocked.
        for _ in range(60):
            self.assertEqual(self.attempt('operator', 'operator@2026', ip='10.0.0.5').status_code, 200)

    def test_admin_unlocks_with_a_new_code_or_unlock(self):
        admin = self.client_for('admin')
        for unlock in [{'password': 'fresh@2026'}, {'unlock': True}]:
            for _ in range(5):
                self.attempt('operator', 'wrong!!')
            self.assertIsNotNone(User.objects.get(username='operator').locked_until)
            self.assertEqual(admin.put('/api/users/operator/', unlock, format='json').status_code, 200)
            self.assertIsNone(User.objects.get(username='operator').locked_until)
        self.assertEqual(self.attempt('operator', 'fresh@2026').status_code, 200)

    @override_settings(LOGIN_TRUSTED_PROXIES=1)
    def test_behind_a_proxy_the_forwarded_address_counts(self):
        for i in range(20):
            self.attempt(f'user{i}', 'x', ip='10.9.9.9', HTTP_X_FORWARDED_FOR='192.168.5.20')
        self.assertEqual(self.attempt('operator', 'operator@2026', ip='10.9.9.9', HTTP_X_FORWARDED_FOR='192.168.5.20').status_code, 429)
        # Same proxy, another workstation: fine.
        self.assertEqual(self.attempt('operator', 'operator@2026', ip='10.9.9.9', HTTP_X_FORWARDED_FOR='192.168.5.21').status_code, 200)

    def test_api_needs_a_token(self):
        self.assertEqual(APIClient().get('/api/bootstrap/').status_code, 401)

    def test_bootstrap(self):
        data = self.client_for('admin').get('/api/bootstrap/').json()
        self.assertEqual(len(data['machines']), 48)
        self.assertEqual(len(data['recipes']), 51)
        self.assertEqual(data['machines'][0]['id'], 'J10-25')
        self.assertNotIn('password', data['users'][0])

    # ---------- A new access code when asked for ----------

    def test_forced_reset_blocks_everything_until_changed(self):
        admin = self.client_for('admin')
        self.assertEqual(admin.put('/api/users/operator/', {'password': 'temp@2026'}, format='json').json()['forceReset'], True)
        r = APIClient().post('/api/auth/login/', {'loginId': 'operator', 'password': 'temp@2026'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['user']['forceReset'])
        op = APIClient()
        op.credentials(HTTP_AUTHORIZATION=f"Token {r.json()['token']}")
        for call in [op.get('/api/bootstrap/'), op.get('/api/live/'), op.get('/api/machines/'), self.record(op, 10, nozzle=255)]:
            self.assertEqual(call.status_code, 403)
            self.assertEqual(call.json()['code'], 'password_change_required')
        self.assertEqual(op.get('/api/auth/me/').status_code, 200)
        change = lambda cur, new: op.post('/api/auth/password/', {'current': cur, 'password': new}, format='json')  # noqa: E731
        self.assertEqual(change('wrong', 'mine@2026').status_code, 400)
        self.assertEqual(change('temp@2026', 'short').status_code, 400)
        self.assertEqual(change('temp@2026', 'temp@2026').status_code, 400)
        self.assertEqual(change('temp@2026', 'mine@2026').status_code, 200)
        self.assertEqual(op.get('/api/bootstrap/').status_code, 200)  # the same session carries on
        self.assertFalse(User.objects.get(username='operator').force_reset)

    def test_reset_flag_stops_an_open_session(self):
        op = self.client_for('operator')
        self.client_for('admin').put('/api/users/operator/', {'forceReset': True}, format='json')
        self.assertEqual(op.get('/api/live/').status_code, 403)
        self.assertEqual(op.post('/api/auth/logout/').status_code, 200)  # can still sign out

    def test_when_a_new_code_is_temporary(self):
        admin = self.client_for('admin')
        # The admin may decide a code is not temporary; their own new code never is.
        r = admin.put('/api/users/viewer/', {'password': 'keep@2026', 'forceReset': False}, format='json')
        self.assertFalse(r.json()['forceReset'])
        self.assertFalse(admin.put('/api/users/admin/', {'password': 'mine@2026'}, format='json').json()['forceReset'])

    # ---------- Sign-in tokens (QA SEC-08) ----------

    def test_token_expires_after_idle_hours(self):
        c = self.client_for('operator')
        token = SessionToken.objects.get(user__username='operator')
        # Used within the idle time: still valid, and the use moves the clock forward.
        SessionToken.objects.filter(pk=token.pk).update(last_used=timezone.now() - timezone.timedelta(hours=11))
        self.assertEqual(c.get('/api/auth/me/').status_code, 200)
        self.assertGreater(SessionToken.objects.get(pk=token.pk).last_used, timezone.now() - timezone.timedelta(minutes=1))
        # 12 h without use: refused, the token is gone, and signing in gives a new one.
        SessionToken.objects.filter(pk=token.pk).update(last_used=timezone.now() - timezone.timedelta(hours=12, minutes=1))
        r = c.get('/api/auth/me/')
        self.assertEqual(r.status_code, 401)
        self.assertIn('without use', r.json()['detail'])
        self.assertFalse(SessionToken.objects.filter(pk=token.pk).exists())
        fresh = self.client_for('operator')
        self.assertEqual(fresh.get('/api/auth/me/').status_code, 200)

    def test_sign_in_clears_expired_tokens(self):
        self.client_for('operator')
        old = SessionToken.objects.get(user__username='operator')
        SessionToken.objects.filter(pk=old.pk).update(last_used=timezone.now() - timezone.timedelta(days=3))
        c = self.client_for('operator')
        self.assertEqual(c.get('/api/auth/me/').status_code, 200)
        self.assertEqual(list(SessionToken.objects.filter(user__username='operator').values_list('key', flat=True)), [c._credentials['HTTP_AUTHORIZATION'][6:]])

    # ---------- One session per device (QA SEC-23) ----------

    def test_sign_out_ends_only_this_device(self):
        tablet, pc = self.client_for('operator'), self.client_for('operator')
        self.assertNotEqual(tablet._credentials, pc._credentials)  # each sign-in has its own token
        self.assertEqual(SessionToken.objects.filter(user__username='operator').count(), 2)
        tablet.post('/api/auth/logout/')
        self.assertEqual(tablet.get('/api/auth/me/').status_code, 401)
        self.assertEqual(pc.get('/api/auth/me/').status_code, 200)  # the other device carries on

    def test_new_access_code_from_admin_ends_every_session(self):
        tablet, pc = self.client_for('operator'), self.client_for('operator')
        self.client_for('admin').put('/api/users/operator/', {'password': 'changed@2026'}, format='json')
        self.assertEqual([tablet.get('/api/auth/me/').status_code, pc.get('/api/auth/me/').status_code], [401, 401])

    def test_own_new_code_ends_the_other_devices(self):
        here, there = self.client_for('operator'), self.client_for('operator')
        self.assertEqual(here.post('/api/auth/password/', {'current': 'operator@2026', 'password': 'mine@2026'}, format='json').status_code, 200)
        self.assertEqual([here.get('/api/auth/me/').status_code, there.get('/api/auth/me/').status_code], [200, 401])

    def test_switched_off_login_ends_every_session(self):
        tablet, pc = self.client_for('operator'), self.client_for('operator')
        self.client_for('admin').put('/api/users/operator/', {'canLogin': False}, format='json')
        self.assertEqual([tablet.get('/api/auth/me/').status_code, pc.get('/api/auth/me/').status_code], [401, 401])

