# Deployment plan (not executed)

These instructions are for a future task requiring owner approval. They can create billable resources. Do not run them as part of local setup.

## Prerequisites

- Owner-selected Google Cloud project, budget review, and suitable trial/free-tier eligibility. Cloud Run needs a linked Cloud Billing account, and linking one upgrades a Firebase Spark project to the Blaze plan (Firebase documentation, checked 2026-10-11). This is an approval point for the zero-cost target.
- Google Cloud CLI and Firebase CLI installed and authenticated.
- Cloud Run, Cloud Build, and Artifact Registry APIs enabled in the selected project.
- Firebase added to that project, Hosting initialised, Firestore database/location selected.
- The Cloud Run service account holds `roles/datastore.viewer` (read-only; enough for the `/ready` probe) or `roles/datastore.user` (read/write) on Firestore. IAM changes can take up to 5 minutes to apply (Firestore IAM documentation, checked 2026-10-11).
- GitLab repository and CI runner configured. Docker job requires a runner that supports privileged Docker-in-Docker.

## Proposed deployment

Build the frontend using `npm ci` and `npm run build` inside `frontend`.

From the repository root, after substituting the approved project ID:

```sh
gcloud run deploy saathi-api --source backend --project PROJECT_ID --region us-central1 --allow-unauthenticated --min-instances 0 --max-instances 1 --memory 512Mi --cpu 1 --set-env-vars SAATHI_ENVIRONMENT=production,SAATHI_FIRESTORE_MODE=cloud,SAATHI_FIRESTORE_PROJECT=PROJECT_ID
firebase deploy --project PROJECT_ID --only hosting,firestore:rules
```

`SAATHI_FIRESTORE_MODE=cloud` is what lets `/ready` report a real Firestore read; without it `/ready` stays 503 by design and the Phase 1 gate cannot pass. Do not set `FIRESTORE_EMULATOR_HOST` in the cloud service. **Before running this against `develop`:** cloud mode also mounts the prototype `/api/hub/*` routes, which refuse to start without `SAATHI_SESSION_SECRET` (32+ characters, supplied from Secret Manager, never in the command line or the repository) and would be publicly reachable. Decide whether to gate them behind an explicit setting or to deploy the Phase 1 line instead (`docs/phase-1.md`, findings 1 and 2).

The public API should expose only health, version and readiness information in Phase 1. Reassess authentication before adding private routes. `firebase.json` uses `us-central1`; any region change must also update its Cloud Run rewrite. The original `/api` path is preserved by Hosting, and the backend has matching routes. Hosting passes only the `__session` cookie to Cloud Run, which is the name the prototype uses. Hosting also caches a 404 returned by the service for up to 10 minutes, so a smoke test straight after fixing a route can still see the old answer.

A maximum instance count limits scaling; it is not a spending cap. Builds, image storage, network traffic, and other services can have separate charges. Budget alerts are notifications, not hard stops. Review trial expiry and resource retention before deployment.

## Verify before declaring success

From a machine where the browser step can run (see the README), against the Hosting URL:

```sh
BASE_URL=https://PROJECT_ID.web.app EXPECT_VERSION=0.1.0 EXPECT_ENVIRONMENT=production node scripts/smoke.mjs --require-ready
```

This covers the first five items; record the URL and the output in `docs/phase-1.md`.

- Hosting home page loads over HTTPS.
- `/api/health` returns `{ "status": "ok", "service": "saathi-api" }`, as JSON rather than the single-page-app fallback.
- `/api/version` reports version 0.1.0 and environment production.
- `/api/ready` returns 200 with `{ "status": "ready", "firestore": "ready" }` against the approved project.
- The browser itself receives `/api/health` from the Hosting origin and displays `Backend connected · v0.1.0`.
- GitLab pipeline is green, including the container build and run check.

References: https://firebase.google.com/docs/hosting/full-config and https://cloud.google.com/run/docs/deploying-source-code.
