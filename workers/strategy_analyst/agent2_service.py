"""Agent 2 — Analysis + Strategy service.

Calls Gemini (google-genai SDK) with response_schema forcing valid JSON,
validates against Agent2Output, retries once on failure.

Standalone test:
    python agent2_service.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from google import genai
from google.genai import types
from pydantic import ValidationError

from dotenv import load_dotenv

from prompt import SYSTEM_PROMPT
from schemas import Agent2Input, Agent2Output

MODEL_NAME = "gemini-3-flash-preview"
DATA_DIR = Path(__file__).parent

load_dotenv(DATA_DIR / ".env")

_client: genai.Client | None = None


def get_client() -> genai.Client:
    """Return a configured Gemini client (created once from env var)."""
    global _client
    if _client is not None:
        return _client
    import os

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("ERROR: Set the GEMINI_API_KEY environment variable.")
    _client = genai.Client(api_key=api_key)
    return _client


def build_prompt(user_input: Agent2Input) -> str:
    """Combine the system instructions with the user data into one prompt."""
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"## Input Data\n\n```json\n{user_input.model_dump_json(indent=2)}\n```"
    )


def call_gemini(prompt: str) -> Agent2Output:
    """Send the prompt to Gemini and return a validated Agent2Output."""
    client = get_client()
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.4,
            response_mime_type="application/json",
            response_schema=Agent2Output,
        ),
    )
    if response.parsed is not None:
        return response.parsed
    # Fallback: manual parse if .parsed is None for any reason
    return Agent2Output.model_validate_json(response.text)


def run_agent2(user_input: Agent2Input) -> Agent2Output:
    """Full pipeline: prompt -> Gemini -> validate -> return (or retry once)."""
    prompt = build_prompt(user_input)

    try:
        return call_gemini(prompt)
    except (json.JSONDecodeError, ValidationError, Exception) as first_error:
        print(f"[retry] First attempt failed: {first_error}", file=sys.stderr)
        retry_prompt = (
            f"{prompt}\n\n"
            "## Previous response failed validation\n"
            f"Error: {first_error}\n"
            "Fix the issue and return valid JSON matching the schema exactly."
        )
        return call_gemini(retry_prompt)


# ---------------------------------------------------------------------------
# Standalone test
# ---------------------------------------------------------------------------

def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    sample_input_data = _load_json(DATA_DIR / "sample_agent1_output.json")
    pattern_data = _load_json(DATA_DIR / "pattern_library.json")
    sample_input_data["patterns"] = pattern_data["patterns"]
    user_input = Agent2Input.model_validate(sample_input_data)

    print(f"Calling Gemini ({MODEL_NAME})...")
    result = run_agent2(user_input)
    print("\n=== Agent 2 Output ===\n")
    print(result.model_dump_json(indent=2))


if __name__ == "__main__":
    main()
