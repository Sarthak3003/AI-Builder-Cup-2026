from fastapi import FastAPI
from pydantic import BaseModel

from app.config import Settings


class HealthResponse(BaseModel):
    status: str
    service: str


class VersionResponse(BaseModel):
    version: str
    environment: str


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    application = FastAPI(title="Saathi API", version=config.version)

    @application.get("/health", response_model=HealthResponse)
    @application.get("/api/health", response_model=HealthResponse, include_in_schema=False)
    def health() -> HealthResponse:
        # Liveness only. This does not claim Firestore or Gemini is connected.
        return HealthResponse(status="ok", service="saathi-api")

    @application.get("/version", response_model=VersionResponse)
    @application.get("/api/version", response_model=VersionResponse, include_in_schema=False)
    def version() -> VersionResponse:
        return VersionResponse(version=config.version, environment=config.environment)

    return application


app = create_app()
