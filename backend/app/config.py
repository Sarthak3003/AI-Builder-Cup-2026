from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SAATHI_", extra="ignore")

    environment: Literal["local", "test", "development", "production"] = "local"
    version: str = "0.1.0"
    firestore_mode: Literal["disabled", "emulator", "cloud"] = "disabled"
    firestore_project: str = "demo-saathi"
    firestore_timeout: float = Field(default=3.0, gt=0, le=10)
    firestore_emulator_host: str | None = Field(
        default=None, validation_alias="FIRESTORE_EMULATOR_HOST"
    )

    @model_validator(mode="after")
    def validate_firestore(self):
        if self.firestore_mode == "emulator":
            host = self.firestore_emulator_host or ""
            parsed = urlsplit(f"//{host}")
            if (
                parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
                or parsed.port is None
                or parsed.path
                or parsed.query
                or parsed.fragment
                or parsed.username
            ):
                raise ValueError("Emulator mode requires a loopback FIRESTORE_EMULATOR_HOST:port")
            if not self.firestore_project.startswith("demo-"):
                raise ValueError("Emulator mode requires a demo- project ID")
        if self.firestore_mode == "cloud":
            if self.environment in {"local", "test"}:
                raise ValueError("Cloud Firestore is disabled in local/test environments")
            if self.firestore_emulator_host:
                raise ValueError("Cloud mode cannot use FIRESTORE_EMULATOR_HOST")
            if not self.firestore_project or self.firestore_project.startswith("demo-"):
                raise ValueError("Cloud mode requires an explicit real project ID")
        return self
