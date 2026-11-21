"""Report."""
from .base import PlantTestCase


class ReportTests(PlantTestCase):
    # ---------- Report ----------

    def test_report_counts_recorded_values(self):
        op = self.client_for('operator')
        self.record(op, 7, nozzle=270, zone1=255, zone2=250)
        self.record(op, 8, nozzle=255, zone1=255, zone2=250)
        f = {'from': self.today, 'to': self.today, 'shifts': ['A', 'B', 'C'], 'machines': [], 'mold': 'all', 'part': 'all', 'param': 'all', 'status': 'all'}
        r = self.client_for('manager').post('/api/report/', {'filters': f, 'offset': 0, 'limit': 25}, format='json').json()
        self.assertEqual((r['stats']['values'], r['stats']['deviations'], r['total']), (6, 1, 6))
        self.assertEqual(r['rows'][0]['deviation']['id'], '7-nozzle')
        self.assertEqual([(x['hour'], x['key']) for x in r['rows'][1:3]], [(7, 'zone1'), (7, 'zone2')])
        # Paging past the deviations lands in the within-limits rows.
        page = self.client_for('manager').post('/api/report/', {'filters': f, 'offset': 4, 'limit': 5}, format='json').json()
        self.assertEqual([(x['hour'], x['key']) for x in page['rows']], [(8, 'zone1'), (8, 'zone2')])
        only_dev = self.client_for('manager').post('/api/report/', {'filters': {**f, 'status': 'open'}}, format='json').json()
        self.assertEqual(only_dev['total'], 1)

