from tavily import TavilyClient

from config import settings

_client = None


def _get_client() -> TavilyClient:
    global _client
    if _client is None:
        _client = TavilyClient(api_key=settings.tavily_api_key)
    return _client


def web_search(query: str, max_results: int = 5) -> list[dict]:
    client = _get_client()
    response = client.search(query=query, max_results=max_results, search_depth="advanced")
    return [
        {"title": r["title"], "url": r["url"], "content": r["content"]}
        for r in response.get("results", [])
    ]


def web_fetch(url: str) -> str:
    client = _get_client()
    response = client.extract(urls=[url])
    results = response.get("results", [])
    if results:
        return results[0].get("raw_content", "")
    return ""
