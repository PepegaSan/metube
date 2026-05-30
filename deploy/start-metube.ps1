# Start PepegaSan MeTube (Docker). Requires Docker Desktop running.
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$ComposeFile = Join-Path $PSScriptRoot "docker-compose.yml"

function Test-DockerReady {
    docker info *> $null
    return $LASTEXITCODE -eq 0
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker CLI not found. Install Docker Desktop."
}

if (-not (Test-DockerReady)) {
    Write-Host "Docker daemon is not running. Starting Docker Desktop..."
    $dockerExe = "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Start-Process $dockerExe
        Write-Host "Waiting up to 90s for Docker..."
        $deadline = (Get-Date).AddSeconds(90)
        do {
            Start-Sleep -Seconds 3
            if (Test-DockerReady) { break }
        } while ((Get-Date) -lt $deadline)
    }
    if (-not (Test-DockerReady)) {
        Write-Error "Docker still not ready. Open Docker Desktop manually, wait until it is running, then run: docker compose -f deploy/docker-compose.yml up -d --build"
    }
}

$downloads = Join-Path $RepoRoot "downloads"
if (-not (Test-Path $downloads)) { New-Item -ItemType Directory -Path $downloads | Out-Null }

Write-Host "Building image (first run may take several minutes)..."
docker compose -f $ComposeFile build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting MeTube on http://localhost:8081"
docker compose -f $ComposeFile up -d
docker compose -f $ComposeFile ps
Write-Host "Downloads folder: $downloads"
