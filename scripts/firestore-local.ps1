param([switch]$Test, [switch]$HubOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$javaDirectories = @(Get-ChildItem -LiteralPath "$projectRoot/.tools/java21" -Directory)
if ($javaDirectories.Count -ne 1) { throw 'Expected exactly one project-local Java runtime.' }
$javaRuntime = $javaDirectories[0].FullName
$firebaseEntry = "$projectRoot/.tools/firebase/node_modules/firebase-tools/lib/bin/firebase.js"
if (!(Test-Path -LiteralPath $firebaseEntry)) { throw 'Project-local Firebase CLI is missing.' }
$variableNames = @('JAVA_HOME', 'PATH', 'FIREBASE_EMULATORS_PATH', 'SAATHI_RUN_EMULATOR_TESTS', 'FIRESTORE_EMULATOR_HOST', 'CI')
$priorValues = @{}
foreach ($variableName in $variableNames) {
    $priorValues[$variableName] = [Environment]::GetEnvironmentVariable($variableName, 'Process')
}
Push-Location $projectRoot
try {
    $env:JAVA_HOME = $javaRuntime
    $env:PATH = "$javaRuntime/bin;$env:PATH"
    $env:FIREBASE_EMULATORS_PATH = "$projectRoot/.tools/emulators"
    $env:CI = 'true'
    if ($Test) {
        $env:SAATHI_RUN_EMULATOR_TESTS = '1'
        $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085'
        $testCommand = '.venv\Scripts\python.exe -m pytest backend/tests/test_firestore_emulator.py -q -p no:cacheprovider'
        if ($HubOnly) { $testCommand += ' -k hub' }
        & node $firebaseEntry emulators:exec --only firestore --project demo-saathi --non-interactive $testCommand
    } else {
        & node $firebaseEntry emulators:start --only firestore --project demo-saathi --non-interactive
    }
    if ($LASTEXITCODE -ne 0) { throw "Firebase emulator command failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
    foreach ($variableName in $variableNames) {
        [Environment]::SetEnvironmentVariable($variableName, $priorValues[$variableName], 'Process')
    }
}

