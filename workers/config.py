from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_api_key: str = ""

    model_config = {"env_prefix": "", "env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
