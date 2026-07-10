import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str = os.environ["DATABASE_URL"]
    gemini_api_key: str = os.environ["GEMINI_API_KEY"]
    gemini_embedding_api_key: str = os.environ["GEMINI_EMBEDDING_API_KEY"]
    tavily_api_key: str = os.environ["TAVILY_API_KEY"]
    pipeline_timeout: int = int(os.getenv("PIPELINE_TIMEOUT", "120"))


settings = Settings()
