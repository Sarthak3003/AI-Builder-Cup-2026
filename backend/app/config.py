from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
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


class PhoneSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SAATHI_PHONE_", extra="ignore")

    enabled: bool = False
    public_base_url: str = ""
    number: str = Field(default="", pattern=r"^$|^\+[1-9][0-9]{6,14}$")
    account_sid: str = Field(default="", validation_alias="TWILIO_ACCOUNT_SID")
    auth_token: SecretStr = Field(default=SecretStr(""), validation_alias="TWILIO_AUTH_TOKEN")
    max_calls: int = Field(default=5, ge=1, le=25)
    max_duration: int = Field(default=600, ge=60, le=1200)
    max_turns: int = Field(default=40, ge=5, le=60)
    voice_en: str = "Google.en-IN-Standard-A"
    voice_hi: str = "Google.hi-IN-Standard-A"
    speech_model: str = "default"

    @model_validator(mode="after")
    def configured_when_enabled(self):
        self.public_base_url = self.public_base_url.rstrip("/")
        if self.public_base_url:
            parsed = urlsplit(self.public_base_url)
            if (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.path
                or parsed.query
                or parsed.fragment
                or parsed.username
                or parsed.password
                or parsed.port not in {None, 443}
            ):
                raise ValueError("SAATHI_PHONE_PUBLIC_BASE_URL must be an HTTPS origin")
        if self.enabled and (
            not self.public_base_url
            or len(self.account_sid) != 34
            or not self.account_sid.startswith("AC")
            or not self.auth_token.get_secret_value()
        ):
            raise ValueError("Phone calling needs an HTTPS origin and Twilio account credentials")
        return self
