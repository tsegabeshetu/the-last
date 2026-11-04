"""Test configuration: every test run gets a fresh throwaway SQLite file."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

TEST_DIR = Path(tempfile.mkdtemp(prefix="aec-tests-"))
os.environ["AEC_DB_PATH"] = str(TEST_DIR / "aec-test.db")
os.environ["AEC_DATA_DIR"] = str(TEST_DIR)
# Keep .env (which may hold a real LLM key) out of the test process.
os.environ["AEC_SKIP_DOTENV"] = "1"
os.environ.pop("OPENAI_API_KEY", None)
os.environ.pop("AEC_JAVA_DISPATCH_URL", None)
