# Local plan by default. -Apply publishes to an already provisioned, billing-enabled project.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')][string]$ProjectId,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9.-]+$')][string]$GeminiModel,
    [ValidatePattern('^[1-9][0-9]*$')][string]$SessionSecretVersion = '1',
    [ValidatePattern('^[1-9][0-9]*$')][string]$GeminiSecretVersion = '1',
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$output = Join-Path $repo '.local/deployment'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$envFile = Join-Path $output 'cloud-run-env.yaml'
$settings = @{
    SAATHI_ENVIRONMENT = 'production'
    SAATHI_FIRESTORE_MODE = 'cloud'
    SAATHI_FIRESTORE_PROJECT = $ProjectId
    SAATHI_ALLOWED_ORIGINS = "https://$ProjectId.web.app,https://$ProjectId.firebaseapp.com"
    SAATHI_GEMINI_MODEL = $GeminiModel
}
# JSON is valid YAML; only non-secret configuration is written here.
[IO.File]::WriteAllText($envFile, ($settings | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$deployArgs = @('run', 'deploy', 'saathi-api', '--source', (Join-Path $repo 'backend'),
    '--project', $ProjectId, '--region', 'asia-south1', '--allow-unauthenticated',
    '--service-account', "saathi-api@$ProjectId.iam.gserviceaccount.com",
    '--min-instances', '0', '--max-instances', '1', '--concurrency', '20',
    '--memory', '512Mi', '--cpu', '1', '--cpu-throttling', '--timeout', '60',
    '--env-vars-file', $envFile,
    '--set-secrets', "SAATHI_SESSION_SECRET=saathi-session-secret:$SessionSecretVersion,SAATHI_GEMINI_API_KEY=saathi-gemini-key:$GeminiSecretVersion")
if (!$Apply) {
    Write-Output "LOCAL PLAN ONLY: $ProjectId / asia-south1 / saathi-api"
    Write-Output 'Request-based CPU billing, minimum 0 / maximum 1 instances, 1 CPU, 512 MiB. These settings are not a spending cap.'
    Write-Output 'Potential charges: source build, image/source storage, networking, runtime, database and Gemini usage. Review costs before -Apply.'
    Write-Output "Configuration saved to $envFile. No cloud commands ran."
    return
}
foreach ($command in @('gcloud', 'firebase', 'npm.cmd')) { Get-Command $command -ErrorAction Stop | Out-Null }
$billing = & gcloud billing projects describe $ProjectId '--format=value(billingEnabled)'
if ($LASTEXITCODE -ne 0 -or (($billing -join '').Trim().ToLowerInvariant() -ne 'true')) {
    throw 'Billing is disabled or could not be verified. No build/deployment started. This script never links billing.'
}
function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed ($LASTEXITCODE). Deployment stopped." }
}
Push-Location $repo
try {
    Invoke-Checked 'npm.cmd' @('--prefix', 'frontend', 'ci')
    Invoke-Checked 'npm.cmd' @('--prefix', 'frontend', 'run', 'build')
    Invoke-Checked 'gcloud' $deployArgs
    Invoke-Checked 'firebase' @('deploy', '--project', $ProjectId, '--only', 'firestore:rules,firestore:indexes,hosting', '--non-interactive')
    Write-Output "Published: https://$ProjectId.web.app (live functionality has NOT been tested)."
} finally { Pop-Location }
