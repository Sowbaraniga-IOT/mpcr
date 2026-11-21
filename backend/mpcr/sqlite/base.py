"""SQLite for a server with more than one writer (the API and the simulator / OPC UA collector).

* WAL journal: readers never wait for the writer.
* Transactions take the write lock when they start (BEGIN IMMEDIATE) and wait for it up to the
  timeout. With SQLite's default BEGIN, a transaction that reads first and writes later fails at
  once with "database is locked" when another process is writing. (Django 5.1 has the
  "transaction_mode" option for this; this keeps 5.0 working too.)
"""
from django.db.backends.sqlite3 import base


class DatabaseWrapper(base.DatabaseWrapper):
    def get_new_connection(self, conn_params):
        conn = super().get_new_connection(conn_params)
        conn.execute('PRAGMA journal_mode=WAL')
        return conn

    def _start_transaction_under_autocommit(self):
        self.cursor().execute('BEGIN IMMEDIATE')
