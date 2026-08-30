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
    Write-Host "[1/4] Running $($testFiles.Count) Node test files..."
    & $NodePath --test @($testFiles.FullName)
    if ($LASTEXITCODE -ne 0) {
        throw "Node tests failed with exit code $LASTEXITCODE"
    }

    Write-Host "[2/4] Checking whitespace errors..."
    & git diff --check
    if ($LASTEXITCODE -ne 0) {
        throw "git diff --check failed with exit code $LASTEXITCODE"
    }

    Write-Host "[3/4] Checking cooking entry cache chain..."
    $tokens = [ordered]@{
        "cooking.html -> cooking-loader.mjs" = Get-CacheToken "cooking.html" "cooking-loader.mjs"
        "cooking-loader.mjs -> cooking-solo-app.mjs" = Get-CacheToken "cooking-loader.mjs" "cooking-solo-app.mjs"
        "cooking-solo-stage.mjs -> cooking-first-person-hands.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "cooking-first-person-hands.mjs"
        "cooking-solo-app.mjs -> cooking-solo-stage.mjs" = Get-CacheToken "cooking-solo-app.mjs" "cooking-solo-stage.mjs"
        "cooking-solo-stage.mjs -> cooking-interaction-controller.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "cooking-interaction-controller.mjs"
        "cooking-solo-stage.mjs -> cooking-insertion-animation.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "cooking-insertion-animation.mjs"
        "cooking-solo-stage.mjs -> cooking-impact-feedback.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "cooking-impact-feedback.mjs"
        "cooking-solo-stage.mjs -> cooking-stack-stability.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "cooking-stack-stability.mjs"
        "cooking-solo-stage.mjs -> cooking-drop-placement.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "cooking-drop-placement.mjs"
        "cooking-solo-stage.mjs -> burger-model-3d.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "burger-model-3d.mjs"
        "cooking-solo-stage.mjs -> cooking-workbench-3d.mjs" = Get-CacheToken "cooking-solo-stage.mjs" "cooking-workbench-3d.mjs"
        "cooking-solo-app.mjs -> cooking-feedback.mjs" = Get-CacheToken "cooking-solo-app.mjs" "cooking-feedback.mjs"
    }

    $uniqueTokens = @($tokens.Values | Select-Object -Unique)
    foreach ($entry in $tokens.GetEnumerator()) {
        Write-Host "  $($entry.Key): $($entry.Value)"
    }
    if ($uniqueTokens.Count -ne 1) {
        throw "Cooking cache chain mismatch: $($uniqueTokens -join ', ')"
    }

    Write-Host "[4/4] Checking sushi entry cache chain..."
    $sushiTokens = [ordered]@{
        "sushi.html -> sushi.css" = Get-CacheToken "sushi.html" "sushi.css"
        "sushi.html -> sushi-loader.mjs" = Get-CacheToken "sushi.html" "sushi-loader.mjs"
        "sushi-loader.mjs -> sushi-app.mjs" = Get-CacheToken "sushi-loader.mjs" "sushi-app.mjs"
        "sushi-app.mjs -> sushi-state.mjs" = Get-CacheToken "sushi-app.mjs" "sushi-state.mjs"
        "sushi-app.mjs -> sushi-stage.mjs" = Get-CacheToken "sushi-app.mjs" "sushi-stage.mjs"
        "sushi-app.mjs -> sushi-fish-techniques.mjs" = Get-CacheToken "sushi-app.mjs" "sushi-fish-techniques.mjs"
        "sushi-stage.mjs -> sushi-model-3d.mjs" = Get-CacheToken "sushi-stage.mjs" "sushi-model-3d.mjs"
        "sushi-stage.mjs -> sushi-fish-prep-3d.mjs" = Get-CacheToken "sushi-stage.mjs" "sushi-fish-prep-3d.mjs"
        "sushi-stage.mjs -> sushi-chef-mentor-3d.mjs" = Get-CacheToken "sushi-stage.mjs" "sushi-chef-mentor-3d.mjs"
        "sushi-stage.mjs -> sushi-fish-techniques.mjs" = Get-CacheToken "sushi-stage.mjs" "sushi-fish-techniques.mjs"
        "sushi-stage.mjs -> cooking-first-person-hands.mjs" = Get-CacheToken "sushi-stage.mjs" "cooking-first-person-hands.mjs"
        "sushi-stage.mjs -> three-scene-host.mjs" = Get-CacheToken "sushi-stage.mjs" "three-scene-host.mjs"
        "sushi-fish-prep-3d.mjs -> sushi-state.mjs" = Get-CacheToken "sushi-fish-prep-3d.mjs" "sushi-state.mjs"
    }

    $uniqueSushiTokens = @($sushiTokens.Values | Select-Object -Unique)
    foreach ($entry in $sushiTokens.GetEnumerator()) {
        Write-Host "  $($entry.Key): $($entry.Value)"
    }
    if ($uniqueSushiTokens.Count -ne 1) {
        throw "Sushi cache chain mismatch: $($uniqueSushiTokens -join ', ')"
    }

    Write-Host "PASS: tests, whitespace, and cache-chain checks succeeded."
}
finally {
    Pop-Location
}
