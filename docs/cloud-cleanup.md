# Delete the old Saathi cloud projects

Owner approved deleting both Saathi projects and all their test data. Deletion has not yet been verified. Preserve local code, GitLab repository, submission materials and the new source ZIP. Do not delete unrelated projects or close the entire billing/payments account.

Targets:
- Hosting: project ID ageless-welder-356803, project number 497080886421.
- Gemini: project number 446661206980; resolve its actual ID below.

Deleting these removes Firebase users, Firestore data, deployments, stored images/build artifacts, secrets and project keys. No cloud data export is requested. A future deployment creates fresh users/data/secrets. Old public links will stop working.

Run in the OLD account's authenticated Cloud Shell. First inspect identity:

```bash
gcloud auth list
gcloud projects describe ageless-welder-356803 --format='yaml(projectId,projectNumber,name,lifecycleState)'
gcloud projects describe 446661206980 --format='yaml(projectId,projectNumber,name,lifecycleState)'
```

Require the project numbers to match those above. Resolve and retain the Gemini ID before shutting down the hosting project:

```bash
SAATHI_OLD_AI_ID=$(gcloud projects describe 446661206980 --format='value(projectId)')
test -n "$SAATHI_OLD_AI_ID" || { echo 'Project lookup failed'; exit 1; }
printf 'Gemini project to delete: %s\n' "$SAATHI_OLD_AI_ID"
```

Disable hosting billing BEFORE shutdown, as Google recommends:

```bash
gcloud billing projects unlink ageless-welder-356803
gcloud billing projects describe ageless-welder-356803 --format='yaml(projectId,billingEnabled)'
gcloud billing projects describe "$SAATHI_OLD_AI_ID" --format='yaml(projectId,billingEnabled)'
```

Expect billingEnabled false for both. If Gemini unexpectedly has billing enabled, unlink that verified project as well before deletion. If any lookup/unlink fails, stop and resolve the exact error; do not assume success.

Delete the Gemini project first, then hosting. Read each confirmation and enter y for the matching target:

```bash
gcloud projects delete "$SAATHI_OLD_AI_ID"
gcloud projects delete ageless-welder-356803
```

Verify:

```bash
gcloud projects describe 446661206980 --format='yaml(projectId,lifecycleState)'
gcloud projects describe ageless-welder-356803 --format='yaml(projectId,lifecycleState)'
```

Both should report DELETE_REQUESTED. Reopen Cloud Shell if disconnected; use the explicit numbers/IDs above. Google has a roughly 30-day project recovery window, but not all underlying resources are guaranteed recoverable. Existing charges can appear later and are still payable. Check the old billing account's Reports/Transactions after reporting catches up.

Budget alerts/billing history are not running workloads. After shutdown is verified, remove obsolete Saathi budgets in Billing -> Budgets & alerts if desired; leave unrelated budgets and the billing account intact. Removing a project from AI Studio's list is not equivalent to Google Cloud project deletion.

Console alternative: Billing -> My projects -> disable billing for the hosting project, then IAM & Admin -> Settings -> Shut down for each verified project.

Official reference: https://docs.cloud.google.com/resource-manager/docs/delete-restore-projects
