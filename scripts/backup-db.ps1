# ==============================================================================
# SmartExpense - Database Backup Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\backup-db.ps1 [-BackupDir "database/backups"]
# ==============================================================================

param(
    [string]$BackupDir = "database/backups",
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')]
    [string]$ContainerName = "smartexpense-mysql",
    [ValidatePattern('^[A-Za-z0-9_]+$')]
    [string]$DbName = "personal_finance_db"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$BackupDir = (Resolve-Path -LiteralPath $BackupDir).Path
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss_fff"
$dumpFile = Join-Path $BackupDir "backup_${DbName}_${timestamp}.sql"
# Only publish a .sql backup after mysqldump succeeds. A failed run must not
# overwrite or delete an earlier successful backup.
$partialDump = Join-Path $BackupDir ([IO.Path]::GetRandomFileName() + '.partial')

Write-Host "Creating database backup for '$DbName' from container '$ContainerName'..." -ForegroundColor Cyan

# Read the private credential without a hardcoded fallback or shell interpolation.
. (Join-Path $PSScriptRoot 'Read-LocalEnvironment.ps1')
. (Join-Path $PSScriptRoot 'Invoke-DatabaseTool.ps1')
$dbRootPass = Get-SmartExpenseRootPassword
$previousMysqlPwd = [Environment]::GetEnvironmentVariable('MYSQL_PWD', 'Process')
[Environment]::SetEnvironmentVariable('MYSQL_PWD', $dbRootPass, 'Process')

try {
    Invoke-SmartExpenseDatabaseTool -ContainerName $ContainerName -DbName $DbName -Mode backup -FilePath $partialDump
    if (-not (Test-Path -LiteralPath $partialDump -PathType Leaf) -or
        (Get-Item -LiteralPath $partialDump).Length -eq 0) {
        throw "Backup file is empty or was not created."
    }

    Move-Item -LiteralPath $partialDump -Destination $dumpFile -ErrorAction Stop
    Write-Host " Backup created successfully: $dumpFile ($((Get-Item -LiteralPath $dumpFile).Length) bytes)" -ForegroundColor Green
} catch {
    $backupError = $_
    if (Test-Path -LiteralPath $partialDump -PathType Leaf) {
        try {
            Remove-Item -LiteralPath $partialDump -ErrorAction Stop
        } catch {
            Write-Warning "Could not remove incomplete backup: $partialDump"
        }
    }
    Write-Host " Backup failed: $backupError" -ForegroundColor Red
    exit 1
} finally {
    [Environment]::SetEnvironmentVariable('MYSQL_PWD', $previousMysqlPwd, 'Process')
}
