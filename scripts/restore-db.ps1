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

# Read the private credential without a hardcoded fallback or shell interpolation.
. (Join-Path $PSScriptRoot 'Read-LocalEnvironment.ps1')
$dbRootPass = Get-SmartExpenseRootPassword
$previousMysqlPwd = [Environment]::GetEnvironmentVariable('MYSQL_PWD', 'Process')
[Environment]::SetEnvironmentVariable('MYSQL_PWD', $dbRootPass, 'Process')

try {
    # Execute restore via mysql client inside container
    $cmd = "docker exec -i -e MYSQL_PWD $ContainerName mysql -u root $DbName"
    cmd /c "$cmd < `"$BackupFile`""
    $restoreExitCode = $LASTEXITCODE
    if ($restoreExitCode -ne 0) {
        throw "mysql restore failed with exit code $restoreExitCode."
    }
    Write-Host " Database restored successfully!" -ForegroundColor Green
} catch {
    Write-Host " Restore failed: $_" -ForegroundColor Red
    exit 1
} finally {
    [Environment]::SetEnvironmentVariable('MYSQL_PWD', $previousMysqlPwd, 'Process')
}
