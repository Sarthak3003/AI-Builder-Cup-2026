#!/bin/sh
# Run an already built backend image as Cloud Run would (production, injected PORT) and probe it from inside.
# Usage: docker build --tag saathi-api:local backend && scripts/container-smoke.sh saathi-api:local
set -eu

image="${1:-saathi-api:ci}"
name="saathi-api-smoke-$$"

cleanup() {
  docker logs "$name" 2>&1 | tail -n 20 || true
  docker rm --force "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# A non-default PORT proves the image honours the variable Cloud Run injects.
docker run --detach --name "$name" --env PORT=8081 --env SAATHI_ENVIRONMENT=production "$image" >/dev/null

uid="$(docker exec "$name" id -u)"
if [ "$uid" = "0" ]; then
  echo "FAIL container runs as root" >&2
  exit 1
fi
echo "PASS container runs as non-root (uid $uid)"

docker exec -i "$name" python - <<'PY'
import json
import sys
import time
import urllib.error
import urllib.request


def get(path):
    try:
        with urllib.request.urlopen("http://127.0.0.1:8081" + path, timeout=3) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


deadline = time.monotonic() + 30
while True:
    try:
        get("/health")
        break
    except OSError:
        if time.monotonic() > deadline:
            sys.exit("FAIL API did not start listening on PORT within 30 seconds")
        time.sleep(0.5)

ok = {"status": "ok", "service": "saathi-api"}
expected = {
    "/health": (200, ok),
    "/api/health": (200, ok),
    "/version": (200, {"version": "0.1.0", "environment": "production"}),
    "/api/version": (200, {"version": "0.1.0", "environment": "production"}),
    # Firestore is not configured here, so readiness must say so rather than pretend.
    "/api/ready": (503, {"status": "not_ready", "firestore": "disabled"}),
    # Local-only prototype routes must not exist in a production container.
    "/api/demo/session": (404, {"detail": "Not Found"}),
    "/api/hub/session": (404, {"detail": "Not Found"}),
}
failed = False
for path, want in expected.items():
    got = get(path)
    if got == want:
        print(f"PASS GET {path} -> {got[0]}")
    else:
        failed = True
        print(f"FAIL GET {path}: expected {want}, got {got}")
sys.exit(1 if failed else 0)
PY
