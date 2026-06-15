import functools
import time
from collections.abc import Callable

import httpx

# Transient transport-level failures worth retrying: brief DNS hiccups,
# connection resets, half-open connections. Application errors are NOT retried.
_TRANSIENT = (httpx.TransportError,)


def with_retry(attempts: int = 3, base_delay: float = 0.3) -> Callable:
    """Retry a function on transient httpx transport errors with linear backoff."""

    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            last_exc: Exception | None = None
            for i in range(attempts):
                try:
                    return fn(*args, **kwargs)
                except _TRANSIENT as e:
                    last_exc = e
                    if i < attempts - 1:
                        time.sleep(base_delay * (i + 1))
            raise last_exc  # type: ignore[misc]

        return wrapper

    return decorator
