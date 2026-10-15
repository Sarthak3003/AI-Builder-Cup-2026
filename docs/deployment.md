# Saathi: deploy in a new Google account

Prepared 2026-10-15. Team git set go; leader Lokita Varma; members Lokita Varma and Sarthak Bhan.

## Current status

The old hosting project was ageless-welder-356803 (number 497080886421). The separate Gemini project was number 446661206980. Public health checks passed; the owner confirmed sign-in and Gemini working. Both projects and test data were approved for deletion; the owner confirmed the hosting project is pending deletion. Gemini project deletion has not been independently verified. Local source is preserved. This guide creates a fresh installation, not a migration of old users/data.

The app uses Firebase Hosting, Firestore, Cloud Run, and the Gemini Developer API. Providers are simulated: no real cab bookings, purchases or payments.

## 1. Create projects in the NEW account

1. Create a NEW Google Cloud project with a globally unique project ID. Link the intended billing account. This enables usage-based charges and Firebase Blaze; no guarantee of zero cost.
2. Add Firebase to that same project using Firebase console.
3. No Firebase Authentication, Google login, Web app registration or frontend Firebase API key is needed.
4. Every browser receives a separate signed demo session lasting up to 24 hours. Clearing cookies or changing browsers starts a separate profile; cross-device account recovery is not provided.
5. Create Firestore database `(default)`, Native mode, Standard edition, Mumbai `asia-south1`, production rules. The backend uses IAM; direct client access will be denied by deployed rules.
6. Initialize the default Firebase Hosting site if needed. Do not overwrite the supplied firebase.json with an init wizard.
7. Separately create a Gemini project in AI Studio WITHOUT linking billing. Create a new key and verify Free tier. The key remains server-side. Do not enable Vertex AI for this architecture.

Create new budget alerts and a Cloud Run spend cap in the displayed currency. Existing caps do not migrate between billing accounts. Cloud Run caps exclude builds, storage and database charges and use estimated gross cost before credits; enforcement can be delayed. Free Gemini quota can run out and interrupt the demo.

## 2. Upload source to Cloud Shell

Upload saathi-redeploy-source.zip into the new account's Cloud Shell home directory. The archive excludes credentials, .env files, caches, compiled output and local databases. It includes source, lockfiles and Firebase configuration.

```bash
unzip ~/saathi-redeploy-source.zip -d ~
cd ~/saathi-redeploy
export SAATHI_PROJECT='REPLACE_WITH_NEW_HOSTING_PROJECT_ID'
export SAATHI_REGION='asia-south1'
gcloud auth list
gcloud config set project "$SAATHI_PROJECT"
gcloud billing projects describe "$SAATHI_PROJECT"
node --version
```

Check the correct account/project and billingEnabled true. Use Node 22.12+ or a supported newer LTS. Commands below are Bash for Cloud Shell, not Windows PowerShell. Keep this directory/session or re-export the variables when returning.

## 3. APIs and runtime identity

Enabling an API does not deploy a workload; subsequent service use may incur charges.

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com --project "$SAATHI_PROJECT"
gcloud iam service-accounts create saathi-api --display-name='Saathi runtime' --project "$SAATHI_PROJECT"
gcloud projects add-iam-policy-binding "$SAATHI_PROJECT" --member="serviceAccount:saathi-api@$SAATHI_PROJECT.iam.gserviceaccount.com" --role=roles/datastore.user
```

The deployer needs source-deploy permissions, permission to act as the runtime service account, permission to allow public invocation and Firebase deployment permissions. For a personal project, its owner can perform setup. Organization policies may prevent public access.

## 4. Fresh secrets

Create the two secrets. Generate a random session secret directly into Secret Manager without displaying it:

```bash
gcloud secrets create saathi-session-secret --replication-policy=automatic --project "$SAATHI_PROJECT"
gcloud secrets create saathi-gemini-key --replication-policy=automatic --project "$SAATHI_PROJECT"
python3 -c 'import secrets,sys; sys.stdout.write(secrets.token_urlsafe(48))' | gcloud secrets versions add saathi-session-secret --data-file=- --project "$SAATHI_PROJECT"
```

In the NEW hosting project's Secret Manager console, open saathi-gemini-key -> New version and paste the NEW free-tier Gemini API key. Never paste keys into chat, frontend code, Git or command arguments.

```bash
gcloud secrets versions list saathi-session-secret --project "$SAATHI_PROJECT" --format='table(name,state)'
gcloud secrets versions list saathi-gemini-key --project "$SAATHI_PROJECT" --format='table(name,state)'
gcloud secrets add-iam-policy-binding saathi-session-secret --member="serviceAccount:saathi-api@$SAATHI_PROJECT.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor --project "$SAATHI_PROJECT"
gcloud secrets add-iam-policy-binding saathi-gemini-key --member="serviceAccount:saathi-api@$SAATHI_PROJECT.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor --project "$SAATHI_PROJECT"
```

Each new secret should have version 1 ENABLED. If a different version was created, substitute its number below. Secret version storage/access has free allowances and charges beyond them.

## 5. Deploy backend (potentially billable)

Run from ~/saathi-redeploy. This YAML contains configuration, not secrets. Model gemini-3.5-flash-lite had free-tier text/audio input and output when this guide was written; check availability and quotas at deployment time.

```bash
cat > cloud-run-env.yaml <<EOF
SAATHI_ENVIRONMENT: "production"
SAATHI_FIRESTORE_MODE: "cloud"
SAATHI_FIRESTORE_PROJECT: "$SAATHI_PROJECT"
SAATHI_ALLOWED_ORIGINS: "https://$SAATHI_PROJECT.web.app,https://$SAATHI_PROJECT.firebaseapp.com"
SAATHI_GEMINI_MODEL: "gemini-3.5-flash-lite"
EOF

gcloud run deploy saathi-api \
  --source ./backend \
  --project "$SAATHI_PROJECT" \
  --region "$SAATHI_REGION" \
  --allow-unauthenticated \
  --service-account "saathi-api@$SAATHI_PROJECT.iam.gserviceaccount.com" \
  --min-instances 0 --max-instances 1 --concurrency 20 \
  --memory 512Mi --cpu 1 --cpu-throttling --timeout 60 \
  --env-vars-file cloud-run-env.yaml \
  --set-secrets SAATHI_SESSION_SECRET=saathi-session-secret:1,SAATHI_GEMINI_API_KEY=saathi-gemini-key:1
```

Approve creation of cloud-run-source-deploy in Mumbai if prompted. This builds/stores a container and deploys the API. Minimum zero/maximum one is not a spending cap. Public invocation permits Hosting rewrites; private profile endpoints still require signed application sessions, created anonymously.

If source build fails for permissions, inspect the actual build identity in its logs. Grant that build service account roles/run.builder on the project if required by Google's source-deploy documentation. Do not grant broad Editor to the runtime identity. Fix the exact error before repeatedly rebuilding.

## 6. Build the frontend (no login configuration)

No frontend .env file or Firebase client SDK is needed. The browser uses same-origin /api routes through Firebase Hosting. Old .env.production.local values are not read. Rebuild from the updated source ZIP instead of using the old prebuilt frontend ZIP.

```bash
npm --prefix frontend ci
npm --prefix frontend run lint
npm --prefix frontend run build
npx firebase-tools login --no-localhost
```

Sign into the NEW account. If CLI is already signed into another account, run npx firebase-tools logout first. Optional Gemini-in-Firebase and telemetry can be declined. Do not share login codes.

```bash
npx firebase-tools deploy --project "$SAATHI_PROJECT" --only hosting,firestore:rules,firestore:indexes
```

The supplied firebase.json routes /api/** to saathi-api in asia-south1. Keep service/region aligned with the backend. The __session cookie passes through Hosting; private API responses are not cached. Firestore rules deny all direct browser access; server IAM permits account persistence.

## 7. Verify

```bash
curl --fail --show-error "https://$SAATHI_PROJECT.web.app/api/health"
curl --fail --show-error "https://$SAATHI_PROJECT.web.app/api/version"
curl --fail --show-error "https://$SAATHI_PROJECT.web.app/api/ready"
```

Expect health ok, production environment, and readiness ready. Readiness accesses Firestore and consumes usage. Then check:

- A fresh browser enters the demo automatically without login. Check mobile and desktop rendering.
- Profile/activity persistence after refresh within the same 24-hour browser session; isolation between separate browsers. Cookie expiry or clearing cookies starts a new demo.
- Gemini text and microphone requests with fictional data.
- Rides, food and medicines, explicit confirmations/cancellations and caregiver approvals.
- Hindi, simplified view and keyboard navigation. Providers must stay clearly simulated.
- Billing Reports actual costs after savings, grouped by service. Reporting is delayed; budget values are not invoices.

Update all submission links to the new Hosting URL. GitHub source, required-template pitch deck and 3–4 minute demo video are separate deliverables. Keep the app online during evaluation.

## 8. Pause/resume without deletion

```bash
gcloud run services update saathi-api --project "$SAATHI_PROJECT" --region "$SAATHI_REGION" --scaling=0
npx firebase-tools hosting:disable --project "$SAATHI_PROJECT"
```

Resume from the source directory, with frontend/dist still present:

```bash
gcloud run services update saathi-api --project "$SAATHI_PROJECT" --region "$SAATHI_REGION" --scaling=auto
npx firebase-tools deploy --project "$SAATHI_PROJECT" --only hosting
```

No backend rebuild is needed. Stored resources and previously incurred charges remain; pausing is not guaranteed zero cost. See cloud-cleanup.md for permanent cleanup of the old projects only.

## References

- https://docs.cloud.google.com/run/docs/deploying-source-code
- https://docs.cloud.google.com/run/docs/configuring/services/secrets
- https://firebase.google.com/docs/hosting/cloud-run
- https://ai.google.dev/gemini-api/docs/pricing
- https://cloud.google.com/run/pricing
- https://cloud.google.com/build/pricing
- https://firebase.google.com/docs/hosting/usage-quotas-pricing
- https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps
- https://docs.cloud.google.com/run/docs/configuring/services/manual-scaling
