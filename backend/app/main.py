from fastapi import FastAPI, Request, Response
from pydantic import BaseModel

from app.config import Settings
from app.database import FirestoreConnection
from app.demo import demo_router
from app.hub import hub_router


class HealthResponse(BaseModel):
    status: str
    service: str


class VersionResponse(BaseModel):
    version: str
    environment: str


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    application = FastAPI(title="Saathi API", version=config.version)

    @application.middleware("http")
    async def private_api_responses(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            # Hosting/CDNs must not retain profiles, session errors or stale readiness.
            response.headers["Cache-Control"] = "private, no-store"
        return response

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

    # Local-only until public access controls and cloud storage are configured.
    if config.environment in {"local", "test"}:
        application.include_router(demo_router(config))
    if config.environment in {"local", "test"} or config.firestore_mode == "cloud":
        application.include_router(hub_router(config))

    return application


app = create_app()
