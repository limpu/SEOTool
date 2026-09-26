<#
.SYNOPSIS
  Phase 34 (Production Readiness) â€” back up the seo-postgres database.

.DESCRIPTION
  Runs `pg_dump` INSIDE the running `seo-postgres` Docker container (so it
  always matches whatever Postgres version the container runs, with no
  host-side `pg_dump` binary/version dependency), writes the dump to a file
  INSIDE the container first, then uses `docker cp` to pull it onto the
  host. `docker cp` is used deliberately instead of piping pg_dump's stdout
  through a PowerShell redirect/pipeline â€” PowerShell 5.1's text pipeline
  can mangle binary custom-format dump output (encoding/newline
  translation), whereas `docker cp` copies the file byte-for-byte.

  Custom format (-Fc) is used because it's compressed, supports
  selective/parallel restore, and is pg_restore's own recommended format
  for anything beyond a toy dump.

  This is genuinely testable today against the real local Docker Postgres
  described in read.md ("Database Credentials") â€” it does not require any
  cloud/production target to exercise for real.

.PARAMETER OutDir
  Directory to write the backup file into. Defaults to database/backups
  relative to the repo root.

.EXAMPLE
  ./scripts/backup-db.ps1
  ./scripts/backup-db.ps1 -OutDir "D:\backups\seo-platform"
#>

param(
  [string]$ContainerName = "seo-postgres",
  [string]$DbUser = "seo_user",
  [string]$DbName = "seo_platform",
  [string]$OutDir = (Join-Path $PSScriptRoot "..\database\backups")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}

# Confirm the container is actually running before attempting a dump â€”
# a clear, early error beats a confusing `docker exec` failure.
$running = docker ps --filter "name=^${ContainerName}$" --format "{{.Names}}"
if ($running -ne $ContainerName) {
  Write-Error "Container '$ContainerName' is not running. Start it first: docker start $ContainerName"
  exit 1
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "seo_platform_${timestamp}.dump"
$outPath = Join-Path $OutDir $fileName
$containerTmpPath = "/tmp/$fileName"

Write-Host "Backing up '$DbName' from container '$ContainerName' -> $outPath"

docker exec $ContainerName pg_dump -U $DbUser -d $DbName -Fc -f $containerTmpPath
if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed inside the container (exit code $LASTEXITCODE)."
  exit 1
}

docker cp "${ContainerName}:${containerTmpPath}" $outPath
docker exec $ContainerName rm -f $containerTmpPath

if (-not (Test-Path $outPath) -or (Get-Item $outPath).Length -eq 0) {
  Write-Error "Backup file was not created or is empty: $outPath"
  exit 1
}

$sizeKb = [math]::Round((Get-Item $outPath).Length / 1KB, 1)
Write-Host "Backup complete: $outPath ($sizeKb KB)"
Write-Host ""
Write-Host "To verify integrity (list contents without restoring):"
Write-Host ('  docker cp "{0}" {1}:/tmp/verify.dump' -f $outPath, $ContainerName)
Write-Host "  docker exec $ContainerName pg_restore -l /tmp/verify.dump"
Write-Host ""
Write-Host "To restore into a scratch database for verification, see scripts/restore-db.ps1."
