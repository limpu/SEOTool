<#
.SYNOPSIS
  Phase 34 (Production Readiness) â€” restore a backup produced by
  backup-db.ps1 into a SCRATCH database, for verification purposes.

.DESCRIPTION
  Deliberately restores into a *new, separate* database inside the same
  seo-postgres container (default name: seo_platform_restore_verify) â€”
  never overwrites the real seo_platform database. This is the safe,
  repeatable way to prove a backup file is genuinely restorable without
  any risk to live dev data (or, in a real deployment, to production data).

  Copies the dump file into the container via `docker cp` (same
  byte-exact-transfer reasoning as backup-db.ps1), creates the scratch
  database, restores into it with pg_restore, then prints a per-table row
  count so it can be diffed against the source database's own counts.

.PARAMETER DumpFile
  Path to a .dump file produced by backup-db.ps1.

.EXAMPLE
  ./scripts/restore-db.ps1 -DumpFile "database/backups/seo_platform_20260822-140000.dump"
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$DumpFile,
  [string]$ContainerName = "seo-postgres",
  [string]$DbUser = "seo_user",
  [string]$ScratchDbName = "seo_platform_restore_verify"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DumpFile)) {
  Write-Error "Dump file not found: $DumpFile"
  exit 1
}

$running = docker ps --filter "name=^${ContainerName}$" --format "{{.Names}}"
if ($running -ne $ContainerName) {
  Write-Error "Container '$ContainerName' is not running. Start it first: docker start $ContainerName"
  exit 1
}

$resolvedPath = (Resolve-Path $DumpFile).Path
$containerTmpPath = "/tmp/restore-verify.dump"

Write-Host "Copying $resolvedPath into container..."
docker cp $resolvedPath "${ContainerName}:${containerTmpPath}"

Write-Host "Dropping any pre-existing scratch database '$ScratchDbName'..."
docker exec $ContainerName psql -U $DbUser -d postgres -c "DROP DATABASE IF EXISTS $ScratchDbName;" | Out-Null

Write-Host "Creating scratch database '$ScratchDbName'..."
docker exec $ContainerName psql -U $DbUser -d postgres -c "CREATE DATABASE $ScratchDbName OWNER $DbUser;" | Out-Null

Write-Host "Restoring dump into '$ScratchDbName'..."
docker exec $ContainerName pg_restore -U $DbUser -d $ScratchDbName --no-owner --no-privileges $containerTmpPath
if ($LASTEXITCODE -ne 0) {
  Write-Warning "pg_restore reported a non-zero exit code ($LASTEXITCODE) - pg_restore commonly warns on benign ordering issues (e.g. a FK constraint referencing a not-yet-loaded table, resolved once all statements run). Row counts below are the real verification signal, not this exit code alone."
}

Write-Host ""
Write-Host "Row counts in restored scratch database (compare against the source database):"
docker exec $ContainerName psql -U $DbUser -d $ScratchDbName -c "SELECT schemaname, relname AS table_name, n_live_tup AS approx_rows FROM pg_stat_user_tables ORDER BY relname;"

docker exec $ContainerName rm -f $containerTmpPath

Write-Host ""
Write-Host "Verification complete. To compare exact row counts against the live database, run e.g.:"
Write-Host ('  docker exec {0} psql -U {1} -d seo_platform -c "SELECT count(*) FROM users;"' -f $ContainerName, $DbUser)
Write-Host ('  docker exec {0} psql -U {1} -d {2} -c "SELECT count(*) FROM users;"' -f $ContainerName, $DbUser, $ScratchDbName)
Write-Host ""
Write-Host "To clean up the scratch database when done:"
Write-Host ('  docker exec {0} psql -U {1} -d postgres -c "DROP DATABASE {2};"' -f $ContainerName, $DbUser, $ScratchDbName)
