[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,

    [string]$NodePath = "node"
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path -LiteralPath $RepoPath).Path

if (-not (Test-Path -LiteralPath (Join-Path $repo ".git"))) {
    throw "RepoPath is not a Git repository: $repo"
}

$testsPath = Join-Path $repo "tests"
$testFiles = @(Get-ChildItem -LiteralPath $testsPath -Filter "*.test.mjs" -File | Sort-Object FullName)
if ($testFiles.Count -eq 0) {
    throw "No tests/*.test.mjs files found in $repo"
}

function Get-CacheToken {
    param(
        [string]$RelativePath,
        [string]$ImportedFile
    )

    $fullPath = Join-Path $repo $RelativePath
    $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $fullPath
    $escaped = [Regex]::Escape($ImportedFile)
    $match = [Regex]::Match($content, "$escaped\?v=([A-Za-z0-9._-]+)")
    if (-not $match.Success) {
        throw "Missing cache token for $ImportedFile in $RelativePath"
    }
    return $match.Groups[1].Value
}

Push-Location $repo
try {
    Write-Host "[1/3] Running $($testFiles.Count) Node test files..."
    & $NodePath --test @($testFiles.FullName)
    if ($LASTEXITCODE -ne 0) {
        throw "Node tests failed with exit code $LASTEXITCODE"
    }

    Write-Host "[2/3] Checking whitespace errors..."
    & git diff --check
    if ($LASTEXITCODE -ne 0) {
        throw "git diff --check failed with exit code $LASTEXITCODE"
    }

    Write-Host "[3/3] Checking cooking entry cache chain..."
    $tokens = [ordered]@{
        "cooking.html -> cooking-loader.mjs" = Get-CacheToken "cooking.html" "cooking-loader.mjs"
        "cooking-loader.mjs -> cooking-solo-app.mjs" = Get-CacheToken "cooking-loader.mjs" "cooking-solo-app.mjs"
        "cooking-solo-stage.mjs -> cooking-first-person-hands.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "cooking-first-person-hands.mjs"
        "cooking-solo-app.mjs -> cooking-solo-stage.mjs" = Get-CacheToken "cooking-solo-app.mjs" "cooking-solo-stage.mjs"
        "cooking-solo-stage.mjs -> cooking-interaction-controller.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "cooking-interaction-controller.mjs"
        "cooking-solo-stage.mjs -> cooking-insertion-animation.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "cooking-insertion-animation.mjs"
        "cooking-solo-stage.mjs -> cooking-impact-feedback.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "cooking-impact-feedback.mjs"
        "cooking-solo-app.mjs -> cooking-feedback.mjs" = Get-CacheToken "cooking-solo-app.mjs" "cooking-feedback.mjs"
    }

    $uniqueTokens = @($tokens.Values | Select-Object -Unique)
    foreach ($entry in $tokens.GetEnumerator()) {
        Write-Host "  $($entry.Key): $($entry.Value)"
    }
    if ($uniqueTokens.Count -ne 1) {
        throw "Cooking cache chain mismatch: $($uniqueTokens -join ', ')"
    }

    Write-Host "PASS: tests, whitespace, and cache-chain checks succeeded."
}
finally {
    Pop-Location
}
