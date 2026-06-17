import uuid


def is_uuid(value: str) -> bool:
    """True if the string is a well-formed UUID. Used to reject malformed ids at
    the API boundary so they return 404/empty instead of a DB 500."""
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False
