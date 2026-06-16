from app.util import is_uuid


def test_is_uuid():
    assert is_uuid("2a333aa9-0584-4f78-8fde-ac7a24bffc3f")
    assert not is_uuid("not-a-real-id")
    assert not is_uuid("")
    assert not is_uuid(None)
