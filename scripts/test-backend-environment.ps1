# Synthetic environment only: no DB, SMTP, Gmail or real Gradle process is started.
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $workspace ('backend/build/d12-env-test/' + [Guid]::NewGuid().ToString('N'))
$testScripts = Join-Path $testRoot 'scripts'
$testBackend = Join-Path $testRoot 'backend'
[void](New-Item -ItemType Directory -Path $testScripts, $testBackend -Force)
foreach ($file in @('start-backend.ps1', 'Read-LocalEnvironment.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $testScripts $file)
}
$runner = Join-Path $testScripts 'start-backend.ps1'
$expectedFile = Join-Path $testBackend 'expected.json'
$fakeEnv = Join-Path $testRoot 'synthetic.env'
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $testBackend 'gradlew.bat'), @'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0assert-child.ps1"
exit /b %errorlevel%
'@, $utf8)
[IO.File]::WriteAllText((Join-Path $testBackend 'assert-child.ps1'), @'
$ErrorActionPreference = 'Stop'
$expected = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'expected.json') -Raw | ConvertFrom-Json
foreach ($property in $expected.PSObject.Properties) {
    if ([Environment]::GetEnvironmentVariable($property.Name, 'Process') -cne $property.Value) {
        throw 'Child environment mismatch (value redacted)'
    }
}
foreach ($alias in @('SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME', 'SPRING_DATASOURCE_PASSWORD',
        'APP_JWT_SECRET', 'APP_JWT_EXPIRATION', 'SPRING_MAIL_HOST', 'SPRING_MAIL_PORT',
        'SPRING_MAIL_USERNAME', 'SPRING_MAIL_PASSWORD', 'APP_MAIL_FROM')) {
    if ($null -ne [Environment]::GetEnvironmentVariable($alias, 'Process')) { throw 'Unexpected alias override' }
}
if ($env:D12_FORCE_FAILURE -eq '1') { exit 7 }
Write-Output 'CHILD_ENV_PASS'
'@, $utf8)

$smtp = @{
    SMTP_HOST = 'smtp.example.test'; SMTP_PORT = '587'; SMTP_USERNAME = 'sender@example.test'
    SMTP_PASSWORD = ([Guid]::NewGuid().ToString('N') + '$literal'); SMTP_FROM = 'sender@example.test'
    APP_FRONTEND_URL = 'https://finance.example.test'; SMTP_AUTH = 'true'; SMTP_STARTTLS = 'true'
}
$key = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($key) } finally { $rng.Dispose() }
$base = @{ DB_URL = 'jdbc:mysql://127.0.0.1:1/d12_synthetic'; DB_USERNAME = 'synthetic'
    DB_PASSWORD = [Guid]::NewGuid().ToString('N'); JWT_SECRET = [Convert]::ToBase64String($key); JWT_EXPIRATION = '600' }
$gemini = @{ GEMINI_API_KEY = [Guid]::NewGuid().ToString('N'); GEMINI_MODEL = 'synthetic-model' }
$fileGemini = @{ GEMINI_API_KEY = ([Guid]::NewGuid().ToString('N') + '$literal'); GEMINI_MODEL = 'gemini-3.5-flash-lite' }
$aliases = @('SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME', 'SPRING_DATASOURCE_PASSWORD',
    'APP_JWT_SECRET', 'APP_JWT_EXPIRATION', 'SPRING_MAIL_HOST', 'SPRING_MAIL_PORT',
    'SPRING_MAIL_USERNAME', 'SPRING_MAIL_PASSWORD', 'APP_MAIL_FROM')
$original = @{}
foreach ($name in @($base.Keys) + @($smtp.Keys) + @($gemini.Keys) + $aliases + @('D12_FORCE_FAILURE')) {
    $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$script:checks = 0
function Check([string]$Name, [bool]$Ok) {
    if (-not $Ok) { throw ('FAIL: ' + $Name) }
    $script:checks++
    Write-Host ('PASS: ' + $Name)
}
function Set-TestProcessEnvironment($Name, $Value) {
    if ($null -eq $Value) {
        Remove-Item -LiteralPath ('Env:' + $Name) -ErrorAction SilentlyContinue
    } else {
        [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
    }
}
function WriteFixture([hashtable]$Values) {
    $lines = foreach ($name in $Values.Keys) { $name + "='" + $Values[$name] + "'" }
    [IO.File]::WriteAllLines($fakeEnv, [string[]]$lines, $utf8)
}
function InvokeFixture([switch]$CheckOnly) {
    $output = & $runner -EnvFile $fakeEnv -CheckOnly:$CheckOnly *>&1 | Out-String
    foreach ($value in @($smtp.SMTP_PASSWORD, $base.DB_PASSWORD, $base.JWT_SECRET, $gemini.GEMINI_API_KEY, $fileGemini.GEMINI_API_KEY)) {
        if ($output.Contains($value)) { throw 'Secret found in script output (redacted)' }
    }
    return $output
}
try {
    foreach ($name in $aliases) { Set-TestProcessEnvironment $name 'synthetic-parent-alias' }
    foreach ($name in $gemini.Keys) { Set-TestProcessEnvironment $name $gemini[$name] }
    foreach ($name in $smtp.Keys) { Set-TestProcessEnvironment $name 'synthetic-parent' }
    $expected = $base.Clone()
    foreach ($name in $smtp.Keys) { $expected[$name] = $smtp[$name] }
    foreach ($name in $gemini.Keys) { $expected[$name] = $gemini[$name] }
    [IO.File]::WriteAllText($expectedFile, ($expected | ConvertTo-Json), $utf8)
    $fileValues = $base.Clone()
    foreach ($name in $smtp.Keys) { $fileValues[$name] = $smtp[$name] }
    WriteFixture $fileValues
    Check 'All eight SMTP variables, DB/JWT and inherited Gemini reach child unchanged' ((InvokeFixture).Contains('CHILD_ENV_PASS'))
    Check 'CheckOnly starts no child and prints no secret' (-not (InvokeFixture -CheckOnly).Contains('CHILD_ENV_PASS'))
    Check 'SMTP parent environment restored after successful run' ($env:SMTP_PASSWORD -ceq 'synthetic-parent')
    Check 'Mail alias restored after successful run' ($env:SPRING_MAIL_PASSWORD -ceq 'synthetic-parent-alias')
    Check 'Gemini parent environment preserved' ($env:GEMINI_API_KEY -ceq $gemini.GEMINI_API_KEY)

    foreach ($name in $smtp.Keys) { Set-TestProcessEnvironment $name $smtp[$name] }
    WriteFixture $base
    Check 'SMTP secrets may be inherited when absent from selected env file' ((InvokeFixture).Contains('CHILD_ENV_PASS'))
    foreach ($name in $smtp.Keys) { Set-TestProcessEnvironment $name $null }
    Check 'Missing SMTP does not block Auth configuration check' (-not (InvokeFixture -CheckOnly).Contains('CHILD_ENV_PASS'))

    foreach ($badPort in @('0', '65536', 'not-a-port')) {
        $invalid = $base.Clone(); $invalid.SMTP_PORT = $badPort; WriteFixture $invalid
        $failed = $false
        try { [void](InvokeFixture -CheckOnly) } catch { $failed = $true }
        Check 'Invalid SMTP port rejected without opening a connection' $failed
    }
    foreach ($name in @('SMTP_AUTH', 'SMTP_STARTTLS')) {
        $invalid = $base.Clone(); $invalid[$name] = 'not-a-boolean'; WriteFixture $invalid
        $failed = $false
        try { [void](InvokeFixture -CheckOnly) } catch { $failed = $true }
        Check ('Invalid ' + $name + ' rejected') $failed
    }

    WriteFixture $fileValues
    $env:D12_FORCE_FAILURE = '1'
    $failed = $false
    try { [void](InvokeFixture) } catch { $failed = $true }
    Check 'Child failure propagates to caller' $failed
    Check 'SMTP environment restored after child failure' ($null -eq $env:SMTP_PASSWORD)
    Check 'Alias environment restored after child failure' ($env:SPRING_MAIL_PASSWORD -ceq 'synthetic-parent-alias')
    $env:D12_FORCE_FAILURE = $null
    $fileValuesWithGemini = $fileValues.Clone()
    $expected = $fileValues.Clone()
    foreach ($name in $fileGemini.Keys) {
        $fileValuesWithGemini[$name] = $fileGemini[$name]
        $expected[$name] = $fileGemini[$name]
    }
    [IO.File]::WriteAllText($expectedFile, ($expected | ConvertTo-Json), $utf8)
    WriteFixture $fileValuesWithGemini
    Check 'Gemini env file values override inherited values without interpolation' ((InvokeFixture).Contains('CHILD_ENV_PASS'))
    Check 'Gemini key restored after env file override' ($env:GEMINI_API_KEY -ceq $gemini.GEMINI_API_KEY)
    Check 'Gemini model restored after env file override' ($env:GEMINI_MODEL -ceq $gemini.GEMINI_MODEL)
    Check 'CheckOnly reports configuration presence without calling Gemini' ((InvokeFixture -CheckOnly).Contains('Gemini có đủ cấu hình'))

    $env:D12_FORCE_FAILURE = '1'
    $failed = $false
    try { [void](InvokeFixture) } catch { $failed = $true }
    Check 'Gemini override child failure propagates' $failed
    Check 'Gemini key and model restored after child failure' (($env:GEMINI_API_KEY -ceq $gemini.GEMINI_API_KEY) -and ($env:GEMINI_MODEL -ceq $gemini.GEMINI_MODEL))
    $env:D12_FORCE_FAILURE = $null

    foreach ($name in $gemini.Keys) { Set-TestProcessEnvironment $name $null }
    $expected = $fileValues.Clone()
    foreach ($name in $gemini.Keys) { $expected[$name] = $null }
    [IO.File]::WriteAllText($expectedFile, ($expected | ConvertTo-Json), $utf8)
    WriteFixture $fileValues
    Check 'Missing Gemini does not block Backend startup or invent a model/key' ((InvokeFixture).Contains('CHILD_ENV_PASS'))
    Check 'CheckOnly reports missing Gemini separately from DB/JWT validation' ((InvokeFixture -CheckOnly).Contains('Gemini chưa đủ key/model'))
    Write-Host ('Environment checks passed: ' + $script:checks)
} finally {
    foreach ($name in $original.Keys) { Set-TestProcessEnvironment $name $original[$name] }
}
