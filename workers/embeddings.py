from google import genai

from config import settings

_client = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(
            api_key=settings.gemini_embedding_api_key,
            http_options=genai.types.HttpOptions(timeout=30000),
        )
    return _client


def get_embedding(text: str) -> list[float]:
    client = _get_client()
    response = client.models.embed_content(
        model="gemini-embedding-2",
        contents=text,
    )
    return response.embeddings[0].values
