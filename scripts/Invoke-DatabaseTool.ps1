# Byte streams keep MySQL dumps intact on Windows PowerShell 5.1 and PowerShell 7.
# Paths are opened directly by .NET; no shell interprets file names or arguments.
function Invoke-SmartExpenseDatabaseTool {
    param(
        [Parameter(Mandatory = $true)][string]$ContainerName,
        [Parameter(Mandatory = $true)][string]$DbName,
        [Parameter(Mandatory = $true)][ValidateSet('backup', 'restore')][string]$Mode,
        [Parameter(Mandatory = $true)][string]$FilePath
    )
    if ($ContainerName -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$' -or
        $DbName -notmatch '^[A-Za-z0-9_]+$') {
        throw 'Container/database name contains unsupported characters.'
    }
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = (Get-Command docker.exe -ErrorAction Stop).Source
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.RedirectStandardInput = ($Mode -eq 'restore')
    $tool = if ($Mode -eq 'backup') {
        # Consistent snapshot for InnoDB without holding table locks.
        "mysqldump -u root --single-transaction --quick --no-tablespaces --databases $DbName --routines --triggers"
    } else { "mysql -u root $DbName" }
    $start.Arguments = "exec -i -e MYSQL_PWD $ContainerName $tool"
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    $stream = $null
    try {
        if ($Mode -eq 'backup') {
            $stream = [IO.File]::Open($FilePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
        } else {
            $stream = [IO.File]::OpenRead($FilePath)
        }
        [void]$process.Start()
        $errors = $process.StandardError.ReadToEndAsync()
        if ($Mode -eq 'backup') {
            $process.StandardOutput.BaseStream.CopyTo($stream)
        } else {
            $output = $process.StandardOutput.ReadToEndAsync()
            $stream.CopyTo($process.StandardInput.BaseStream)
            $process.StandardInput.Close()
        }
        $process.WaitForExit()
        # Consume stderr without printing connection/configuration details.
        [void]$errors.GetAwaiter().GetResult()
        if ($Mode -eq 'restore') { [void]$output.GetAwaiter().GetResult() }
        if ($process.ExitCode -ne 0) { throw "MySQL $Mode failed with exit code $($process.ExitCode)." }
    } finally {
        if ($stream) { $stream.Dispose() }
        $process.Dispose()
    }
}
