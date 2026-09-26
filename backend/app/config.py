from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SAATHI_", extra="ignore")

    environment: Literal["local", "test", "development", "production"] = "local"
    version: str = "0.1.0"
    # Same-origin /api proxy avoids permissive CORS in local and deployed environments.
