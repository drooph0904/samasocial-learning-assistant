import httpx
import pytest

from app.retry import with_retry


def test_retries_transient_then_succeeds():
    calls = {"n": 0}

    @with_retry(attempts=3, base_delay=0)
    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise httpx.ConnectError("boom")
        return "ok"

    assert flaky() == "ok"
    assert calls["n"] == 3


def test_gives_up_after_attempts():
    @with_retry(attempts=2, base_delay=0)
    def always_fails():
        raise httpx.ReadError("nope")

    with pytest.raises(httpx.ReadError):
        always_fails()


def test_does_not_retry_non_transient():
    calls = {"n": 0}

    @with_retry(attempts=3, base_delay=0)
    def boom():
        calls["n"] += 1
        raise ValueError("real bug")

    with pytest.raises(ValueError):
        boom()
    assert calls["n"] == 1  # not retried
