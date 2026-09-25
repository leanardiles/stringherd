import secrets
from typing import Annotated

from fastapi import Header, HTTPException, status

from app.config import get_settings

ACCEPTED_SCHEMES = ("apikey", "bearer")


def require_api_key(authorization: Annotated[str | None, Header()] = None) -> None:
    """Accept `Authorization: ApiKey <key>` or `Bearer <key>`, the two forms DeepL Sync sends."""
    expected = get_settings().tms_api_key
    if not expected:
        # Fail closed: a server without a key configured must never accept requests.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server has no TMS_API_KEY configured.",
        )

    challenge = {"WWW-Authenticate": "ApiKey, Bearer"}
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header. Send 'Authorization: ApiKey <key>' or 'Bearer <key>'.",
            headers=challenge,
        )

    scheme, _, credential = authorization.partition(" ")
    if scheme.lower() not in ACCEPTED_SCHEMES or not credential:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unsupported Authorization scheme. Use 'ApiKey <key>' or 'Bearer <key>'.",
            headers=challenge,
        )

    # compare_digest takes the same time whether the first or last character differs,
    # so response timing cannot be used to guess the key.
    if not secrets.compare_digest(credential.strip().encode(), expected.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
            headers=challenge,
        )