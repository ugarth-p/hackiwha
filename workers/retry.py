import time
from typing import Any

from google import genai
from google.api_core import exceptions as google_exceptions


def generate_with_retry(
    client: genai.Client,
    *,
    model: str,
    contents: str,
    config: Any | None = None,
    max_retries: int = 3,
    base_delay: float = 5.0,
) -> str:
    """Call Gemini with retry on 429 or transient errors, returns response text."""
    last_exc: Exception | None = None
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            return response.text
        except (
            google_exceptions.ResourceExhausted,
            google_exceptions.ServiceUnavailable,
            google_exceptions.DeadlineExceeded,
            ConnectionError,
            TimeoutError,
        ) as exc:
            last_exc = exc
            delay = base_delay * (2 ** attempt)
            print(
                f"[retry] Gemini error {type(exc).__name__} (attempt {attempt + 1}/{max_retries}), "
                f"waiting {delay:.1f}s...",
                flush=True,
            )
            time.sleep(delay)
    raise last_exc  # type: ignore[misc]
