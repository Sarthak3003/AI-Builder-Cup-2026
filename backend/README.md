# Saathi API

Phase 1 FastAPI service. See the repository README for setup and deployment prerequisites.

`/health` is a liveness endpoint, not a database readiness check. `/version` reports configured version and environment. Both have `/api` aliases for the frontend proxy.
