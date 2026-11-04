"""Runtime configuration for the AEC Python API.

Everything is environment driven so the demo can run with zero setup.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Local secrets live in .env next to requirements.txt (never committed).
# Real deployments set the same names as environment variables instead;
# load_dotenv never overrides variables that are already set.
# The test suite sets AEC_SKIP_DOTENV=1 so it never calls a live LLM.
if os.environ.get("AEC_SKIP_DOTENV") != "1":
    load_dotenv(BASE_DIR / ".env")

DATA_DIR = Path(os.environ.get("AEC_DATA_DIR", BASE_DIR / "data"))
DB_PATH = Path(os.environ.get("AEC_DB_PATH", DATA_DIR / "aec.db"))

# Comma separated list of origins allowed to call the API.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "AEC_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
    ).split(",")
    if origin.strip()
]

# Demo admin token. Replace with a real secret before any production use.
ADMIN_TOKEN = os.environ.get("AEC_ADMIN_TOKEN", "aec-demo-admin")

# Optional Java dispatch service. When absent, Python answers with a
# deterministic local dispatch plan instead of pretending a vehicle moved.
JAVA_DISPATCH_URL = os.environ.get("AEC_JAVA_DISPATCH_URL", "").rstrip("/")

# Optional OpenAI-compatible assistant. Without a key ASAYECH uses the
# built-in, offline-safe emergency knowledge base.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_MODEL = os.environ.get("AEC_ASSISTANT_MODEL", "gpt-4o-mini")

EMERGENCY_NUMBER = "611"
