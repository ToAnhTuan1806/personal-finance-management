# ==============================================================================
# SmartExpense - Database Restore Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\restore-db.ps1 -BackupFile "database/backups/backup_personal_finance_db_xxxx.sql"
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [string]$ContainerName = "smartexpense-mysql",
    [string]$DbName = "personal_finance_db"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
    Write-Host " Error: Backup file not found at: $BackupFile" -ForegroundColor Red
    exit 1
}

$BackupFile = (Resolve-Path -LiteralPath $BackupFile).Path
if ((Get-Item -LiteralPath $BackupFile).Length -eq 0) {
    Write-Host " Error: Backup file is empty: $BackupFile" -ForegroundColor Red
    exit 1
}

Write-Host "Restoring database '$DbName' from '$BackupFile'..." -ForegroundColor Cyan

# Read root password from .env if present
$dbRootPass = "123456$"
if (Test-Path ".env") {
    $envContent = Get-Content ".env"
    foreach ($line in $envContent) {
        if ($line -match "^DB_ROOT_PASSWORD=(.*)$") {
            $dbRootPass = $matches[1].Trim()
        }
    }
}

try {
    # Execute restore via mysql client inside container
    $cmd = "docker exec -i $ContainerName mysql -u root -p$dbRootPass $DbName"
    cmd /c "$cmd < `"$BackupFile`""
    $restoreExitCode = $LASTEXITCODE
    if ($restoreExitCode -ne 0) {
        throw "mysql restore failed with exit code $restoreExitCode."
    }
    Write-Host " Database restored successfully!" -ForegroundColor Green
} catch {
    Write-Host " Restore failed: $_" -ForegroundColor Red
    exit 1
}
