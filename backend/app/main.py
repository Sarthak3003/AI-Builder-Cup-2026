from fastapi import FastAPI, Response
from pydantic import BaseModel

from app.config import Settings
from app.database import FirestoreConnection


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

    @application.get("/ready")
    @application.get("/api/ready", include_in_schema=False)
    def readiness(response: Response) -> dict[str, str]:
        status = FirestoreConnection(config).probe()
        response.status_code = 200 if status == "ready" else 503
        return {"status": "ready" if status == "ready" else "not_ready", "firestore": status}

    return application


app = create_app()
