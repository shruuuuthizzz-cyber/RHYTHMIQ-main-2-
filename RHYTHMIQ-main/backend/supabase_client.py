import os
from pathlib import Path
from typing import Any, Optional

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env.local")
load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("REACT_APP_SUPABASE_URL") or "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = (
    os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    or os.environ.get("REACT_APP_SUPABASE_PUBLISHABLE_KEY")
    or ""
)
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("REACT_APP_SUPABASE_ANON_KEY") or ""
SUPABASE_SERVICE_ROLE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SECRET_KEY")
    or os.environ.get("SUPABASE_LEGACY_SERVICE_ROLE_KEY")
    or ""
)
SUPABASE_LEGACY_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_LEGACY_SERVICE_ROLE_KEY") or ""


def supabase_enabled() -> bool:
    return bool(SUPABASE_URL and (SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY))


def _supabase_headers(use_service_role: bool = False) -> dict[str, str]:
    api_key = SUPABASE_SERVICE_ROLE_KEY if use_service_role else ""
    if not api_key:
        api_key = SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["apikey"] = api_key
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _api_key_candidates() -> list[str]:
    candidates = [
        SUPABASE_PUBLISHABLE_KEY,
        SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_LEGACY_SERVICE_ROLE_KEY,
    ]
    return [key for index, key in enumerate(candidates) if key and key not in candidates[:index]]


def ping_supabase(timeout: int = 5) -> dict[str, Any]:
    if not SUPABASE_URL:
        return {"connected": False, "reason": "SUPABASE_URL is not configured"}

    last_reason = None
    for api_key in _api_key_candidates():
        try:
            response = requests.get(
                f"{SUPABASE_URL}/auth/v1/health",
                headers={
                    "apikey": api_key,
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                timeout=timeout,
            )
            if response.ok:
                return {
                    "connected": True,
                    "status_code": response.status_code,
                    "reason": None,
                }
            last_reason = response.text[:200]
        except requests.RequestException as exc:
            last_reason = str(exc)

    return {"connected": False, "reason": last_reason or "No valid Supabase API key was accepted"}

def get_supabase_user(access_token: str, timeout: int = 10) -> Optional[dict[str, Any]]:
    if not SUPABASE_URL or not access_token:
        return None

    for api_key in _api_key_candidates():
        try:
            response = requests.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "apikey": api_key,
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                timeout=timeout,
            )
            if response.ok:
                return response.json()
        except requests.RequestException:
            continue

    return None
