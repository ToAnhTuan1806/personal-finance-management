# ==============================================================================
# SmartExpense - Database Restore Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\restore-db.ps1 -BackupFile "database/backups/backup_personal_finance_db_xxxx.sql"
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')]
    [string]$ContainerName = "smartexpense-mysql",
    [ValidatePattern('^[A-Za-z0-9_]+$')]
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
. (Join-Path $PSScriptRoot 'Invoke-DatabaseTool.ps1')
$dbRootPass = Get-SmartExpenseRootPassword
$previousMysqlPwd = [Environment]::GetEnvironmentVariable('MYSQL_PWD', 'Process')
[Environment]::SetEnvironmentVariable('MYSQL_PWD', $dbRootPass, 'Process')

try {
    Invoke-SmartExpenseDatabaseTool -ContainerName $ContainerName -DbName $DbName -Mode restore -FilePath $BackupFile
    Write-Host " Database restored successfully!" -ForegroundColor Green
} catch {
    Write-Host " Restore failed: $_" -ForegroundColor Red
    exit 1
} finally {
    [Environment]::SetEnvironmentVariable('MYSQL_PWD', $previousMysqlPwd, 'Process')
}
