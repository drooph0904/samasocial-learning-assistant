import threading

from supabase import Client, create_client

from app.config import get_settings

# The supabase-py sync client wraps a single httpx.Client whose connection pool
# is not safe to share across FastAPI's worker threads — concurrent use surfaces
# transient "Resource temporarily unavailable" (EAGAIN) read errors. Giving each
# thread its own client keeps every connection single-threaded.
_local = threading.local()


def get_db() -> Client:
    client = getattr(_local, "client", None)
    if client is None:
        s = get_settings()
        client = create_client(s.supabase_url, s.supabase_service_key)
        _local.client = client
    return client
