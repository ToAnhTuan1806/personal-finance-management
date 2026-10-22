# ==============================================================================
# SmartExpense - Database Backup Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\backup-db.ps1 [-BackupDir "database/backups"]
# ==============================================================================

param(
    [string]$BackupDir = "database/backups",
    [string]$ContainerName = "smartexpense-mysql",
    [string]$DbName = "personal_finance_db"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dumpFile = Join-Path $BackupDir "backup_${DbName}_${timestamp}.sql"

Write-Host "Creating database backup for '$DbName' from container '$ContainerName'..." -ForegroundColor Cyan

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
    # Execute mysqldump inside container
    $cmd = "docker exec -i $ContainerName mysqldump -u root -p$dbRootPass --databases $DbName --routines --triggers"
    cmd /c "$cmd > `"$dumpFile`""
    
    if ((Test-Path $dumpFile) -and (Get-Item $dumpFile).Length -gt 0) {
        Write-Host " Backup created successfully: $dumpFile ($( (Get-Item $dumpFile).Length ) bytes)" -ForegroundColor Green
    } else {
        throw "Backup file is empty or was not created."
    }
} catch {
    Write-Host " Backup failed: $_" -ForegroundColor Red
    exit 1
}
