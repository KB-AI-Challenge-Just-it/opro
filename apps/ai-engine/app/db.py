from psycopg_pool import ConnectionPool
from .config import settings

pool = ConnectionPool(settings.pg_dsn, min_size=1, max_size=5, open=False)

def init_pool():
    pool.open()
