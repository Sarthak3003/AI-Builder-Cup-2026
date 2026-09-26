# Deployment plan (not executed)

These instructions are for a future task requiring owner approval. They can create billable resources. Do not run them as part of local setup.

## Prerequisites

- Owner-selected Google Cloud project, budget review, and suitable trial/free-tier eligibility.
- Google Cloud CLI and Firebase CLI installed and authenticated.
- Cloud Run, Cloud Build, and Artifact Registry APIs enabled in the selected project.
- Firebase added to that project, Hosting initialized, Firestore database/location selected.
- GitLab repository and CI runner configured. Docker job requires a runner that supports privileged Docker-in-Docker.

## Proposed deployment

Build the frontend using `npm ci` and `npm run build` inside `frontend`.

From the repository root, after substituting the approved project ID:

```sh
gcloud run deploy saathi-api --source backend --project PROJECT_ID --region us-central1 --allow-unauthenticated --min-instances 0 --max-instances 1 --memory 512Mi --cpu 1 --set-env-vars SAATHI_ENVIRONMENT=production
firebase deploy --project PROJECT_ID --only hosting,firestore:rules
```

The public API currently exposes only health/version information. Reassess authentication before adding private routes. `firebase.json` uses `us-central1`; any region change must also update its Cloud Run rewrite. The original `/api` path is preserved by Hosting, and the backend has matching routes.

A maximum instance count limits scaling; it is not a spending cap. Builds, image storage, network traffic, and other services can have separate charges. Budget alerts are notifications, not hard stops. Review trial expiry and resource retention before deployment.

## Verify before declaring success

- Hosting home page loads over HTTPS.
- `/api/health` returns `{ "status": "ok", "service": "saathi-api" }`.
- `/api/version` reports version 0.1.0 and environment production.
- Browser displays the connected status.
- Firestore connection probe is implemented and passes against the approved project.
- GitLab pipeline is green, including the container build.

References: https://firebase.google.com/docs/hosting/full-config and https://cloud.google.com/run/docs/deploying-source-code.
