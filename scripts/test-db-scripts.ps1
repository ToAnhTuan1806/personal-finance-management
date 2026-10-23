# Run only against a disposable local MySQL container, never production.
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^smartexpense-(backup-qa|qa)-[A-Za-z0-9_.-]+$')]
    [string]$ContainerName,
    [Parameter(Mandatory = $true)]
    [string]$RootPassword
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$workspace = Split-Path -Parent $PSScriptRoot
$backupScript = Join-Path $PSScriptRoot 'backup-db.ps1'
$restoreScript = Join-Path $PSScriptRoot 'restore-db.ps1'
$runId = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$sourceDb = 'qa_backup_' + $runId
$restoreDb = 'qa_restore_' + $runId
$workDir = Join-Path $workspace ('backups/db-script-tests/' + $runId)
$dumpDir = Join-Path $workDir 'dump files'
[void](New-Item -ItemType Directory -Path $dumpDir -Force)
[IO.File]::WriteAllText((Join-Path $workDir '.env'), 'DB_ROOT_PASSWORD=' + $RootPassword, [Text.UTF8Encoding]::new($false))
$results = [Collections.Generic.List[object]]::new()

function Check([string]$Name, [bool]$Passed) {
    $results.Add([PSCustomObject]@{ name = $Name; passed = $Passed })
    Write-Host (('[' + $(if ($Passed) { 'PASS' } else { 'FAIL' }) + '] ') + $Name)
    if (-not $Passed) { throw ('Check failed: ' + $Name) }
}

function Sql([string]$Query, [string]$Database = '') {
    $dockerArgs = @('exec', '-i', '-e', ('MYSQL_PWD=' + $RootPassword), $ContainerName,
        'mysql', '-uroot', '--default-character-set=utf8mb4', '-N', '-B')
    if ($Database) { $dockerArgs += $Database }
    $output = $Query | & docker @dockerArgs
    if ($LASTEXITCODE -ne 0) { throw 'Fixture SQL failed.' }
    return $output
}

function RunScript([string]$Script, [string[]]$ScriptArguments) {
    # Expected stderr from Docker must be captured, not terminate the test runner.
    $ErrorActionPreference = 'Continue'
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Script @ScriptArguments 2>&1
    $code = $LASTEXITCODE
    return [PSCustomObject]@{ code = $code; text = ($output | Out-String) }
}

$fixtureReady = $false
Push-Location $workDir
try {
    [void](Sql ('CREATE DATABASE `' + $sourceDb + '` CHARACTER SET utf8mb4; CREATE DATABASE `' + $restoreDb + '` CHARACTER SET utf8mb4;'))
    $fixtureReady = $true
    # Hex seeds real UTF-8 text independently of Windows PowerShell's source encoding.
    [void](Sql "CREATE TABLE fixture (id INT PRIMARY KEY, note VARCHAR(100), amount DECIMAL(15,2)); INSERT INTO fixture VALUES (1, CONVERT(0x5669E1BB8774204E616D USING utf8mb4), 123456.78), (2, 'Restore test', 0.25);" $sourceDb)

    $ok = RunScript $backupScript @('-BackupDir', $dumpDir, '-ContainerName', $ContainerName, '-DbName', $sourceDb)
    $dumps = @(Get-ChildItem -LiteralPath $dumpDir -Filter '*.sql' -File)
    Check 'Successful backup returns 0 and creates one nonempty SQL file' ($ok.code -eq 0 -and $dumps.Count -eq 1 -and $dumps[0].Length -gt 0)
    $goodDump = $dumps[0].FullName
    $originalHash = (Get-FileHash -LiteralPath $goodDump).Hash

    $bad = RunScript $backupScript @('-BackupDir', $dumpDir, '-ContainerName', $ContainerName, '-DbName', ('qa_missing_' + $runId))
    Check 'Missing database backup returns failure without a success message' ($bad.code -ne 0 -and $bad.text -notmatch 'Backup created successfully')
    $bad = RunScript $backupScript @('-BackupDir', $dumpDir, '-ContainerName', ('smartexpense-qa-missing-' + $runId), '-DbName', $sourceDb)
    Check 'Missing container backup returns failure without a success message' ($bad.code -ne 0 -and $bad.text -notmatch 'Backup created successfully')
    Check 'Failed backups leave no partial files or invalid SQL backups' (@(Get-ChildItem -LiteralPath $dumpDir -File).Count -eq 1 -and (Get-FileHash -LiteralPath $goodDump).Hash -eq $originalHash)

    $restoreCopy = Join-Path $workDir 'restore copy.sql'
    $sqlText = [IO.File]::ReadAllText($goodDump, [Text.Encoding]::UTF8).Replace($sourceDb, $restoreDb)
    [IO.File]::WriteAllText($restoreCopy, $sqlText, [Text.UTF8Encoding]::new($false))
    $ok = RunScript $restoreScript @('-BackupFile', $restoreCopy, '-ContainerName', $ContainerName, '-DbName', $restoreDb)
    Check 'Valid restore with spaces in file path succeeds' ($ok.code -eq 0 -and $ok.text -match 'Database restored successfully')
    $sourceChecksum = ((Sql 'CHECKSUM TABLE fixture EXTENDED;' $sourceDb) -split "`t")[-1]
    $restoredChecksum = ((Sql 'CHECKSUM TABLE fixture EXTENDED;' $restoreDb) -split "`t")[-1]
    Check 'Restored Vietnamese text and decimal amounts match source checksum' ($sourceChecksum -match '^\d+$' -and $sourceChecksum -eq $restoredChecksum)
    $restoredTextHex = Sql 'SELECT HEX(note) FROM fixture WHERE id = 1;' $restoreDb
    Check 'Vietnamese characters retain their original UTF-8 bytes after restore' ($restoredTextHex -eq '5669E1BB8774204E616D')

    $bad = RunScript $restoreScript @('-BackupFile', $restoreCopy, '-ContainerName', ('smartexpense-qa-missing-' + $runId), '-DbName', $restoreDb)
    Check 'Missing container restore returns failure without a success message' ($bad.code -ne 0 -and $bad.text -notmatch 'Database restored successfully')
    $bad = RunScript $restoreScript @('-BackupFile', $restoreCopy, '-ContainerName', $ContainerName, '-DbName', ('qa_missing_' + $runId))
    Check 'Missing target database restore returns failure' ($bad.code -ne 0 -and $bad.text -notmatch 'Database restored successfully')

    $invalidSql = Join-Path $workDir 'invalid.sql'
    [IO.File]::WriteAllText($invalidSql, 'THIS IS NOT VALID SQL;', [Text.UTF8Encoding]::new($false))
    $bad = RunScript $restoreScript @('-BackupFile', $invalidSql, '-ContainerName', $ContainerName, '-DbName', $restoreDb)
    Check 'Invalid SQL restore returns failure without a success message' ($bad.code -ne 0 -and $bad.text -notmatch 'Database restored successfully')
    $bad = RunScript $restoreScript @('-BackupFile', (Join-Path $workDir 'missing.sql'), '-ContainerName', $ContainerName, '-DbName', $restoreDb)
    Check 'Missing backup file returns failure' ($bad.code -ne 0)
    $emptyFile = Join-Path $workDir 'empty.sql'
    [IO.File]::WriteAllText($emptyFile, '')
    $bad = RunScript $restoreScript @('-BackupFile', $emptyFile, '-ContainerName', $ContainerName, '-DbName', $restoreDb)
    Check 'Empty backup file returns failure' ($bad.code -ne 0)
    $bad = RunScript $restoreScript @('-BackupFile', $dumpDir, '-ContainerName', $ContainerName, '-DbName', $restoreDb)
    Check 'Directory cannot be used as a backup file' ($bad.code -ne 0)
    Check 'Failed operations preserve the valid backup' ((Get-FileHash -LiteralPath $goodDump).Hash -eq $originalHash)
} finally {
    try {
        if ($fixtureReady) { [void](Sql ('DROP DATABASE `' + $sourceDb + '`; DROP DATABASE `' + $restoreDb + '`;')) }
        $results | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $workDir 'results.json') -Encoding UTF8
        Write-Host ('Results saved in ' + (Join-Path $workDir 'results.json'))
    } finally {
        Pop-Location
    }
}
Write-Host ('Passed: ' + $results.Count)
