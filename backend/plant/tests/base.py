"""Shared set-up for the API tests (python manage.py test plant)."""
from datetime import datetime
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from ..services import logic
from ..models import Setting


def plant_time(day, hh, mm=0):
    return timezone.make_aware(datetime(2026, 11, day, hh, mm))


class PlantTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed', verbosity=0)

    def setUp(self):
        logic.forget_roles()
        cache.clear()  # per-address sign-in failure counters
        # A fixed plant clock (03.11.2026 23:30, so hours 6 … 23 have passed) and back-dated entries on,
        # so the tests can record any of today's hours. The entry-time rules have their own tests in test_logs.py.
        self.clock = mock.patch('plant.services.logic.local_now', return_value=plant_time(3, 23, 30))
        self.clock.start()
        self.addCleanup(self.clock.stop)
        Setting.put('shiftRules', {**Setting.get('shiftRules', {}), 'backDated': True})
        self.today = logic.production_date().isoformat()

    def set_clock(self, when):
        self.clock.stop()
        self.clock = mock.patch('plant.services.logic.local_now', return_value=when)
        self.clock.start()

    def client_for(self, username):
        c = APIClient()
        r = c.post('/api/auth/login/', {'loginId': username, 'password': f'{username}@2026'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        c.credentials(HTTP_AUTHORIZATION=f"Token {r.json()['token']}")
        return c

    def record(self, c, hour, **values):
        return c.put(f'/api/logs/J10-25/{self.today}/hours/{hour}/', {'values': values}, format='json')
