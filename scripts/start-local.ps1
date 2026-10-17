[CmdletBinding()]
param([ValidateSet('backend', 'frontend')][string]$Service = 'backend')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
    if ($Service -eq 'frontend') {
        & npm.cmd --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
    } else {
        $envFile = Join-Path $repo 'backend/.env'
        if (!(Test-Path -LiteralPath $envFile)) {
            Copy-Item -LiteralPath (Join-Path $repo 'backend/.env.example') -Destination $envFile
        }
        & "$repo/.venv/Scripts/python.exe" -m uvicorn app.main:app --app-dir backend --env-file $envFile --host 127.0.0.1 --port 8000
    }
    if ($LASTEXITCODE -ne 0) { throw "$Service exited with code $LASTEXITCODE" }
} finally { Pop-Location }
