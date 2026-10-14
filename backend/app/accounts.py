"""Firebase ID-token verification. No service-account keys belong in the frontend."""

import os

from fastapi import HTTPException
from google.auth.transport.requests import Request
from google.oauth2.id_token import verify_firebase_token


def verify_account(token: str):
    project = os.environ.get("SAATHI_FIREBASE_PROJECT")
    if not project:
        raise HTTPException(503, "Firebase sign-in is not configured yet.")
    try:
        claims = verify_firebase_token(token, Request(), audience=project)
        if claims.get("iss") != f"https://securetoken.google.com/{project}":
            raise ValueError("Invalid issuer")
        if not claims.get("sub") or len(claims["sub"]) > 128:
            raise ValueError("Invalid user ID")
        return claims["sub"]
    except Exception:
        raise HTTPException(401, "Sign-in could not be verified. Please sign in again.") from None
