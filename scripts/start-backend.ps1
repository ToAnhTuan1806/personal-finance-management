param(
    [string]$EnvFile = (Join-Path (Split-Path -Parent $PSScriptRoot) '.env'),
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$backendEnvKeys = @('DB_URL', 'DB_USERNAME', 'DB_PASSWORD', 'JWT_SECRET', 'JWT_EXPIRATION')

. (Join-Path $PSScriptRoot 'Read-LocalEnvironment.ps1')

$configuration = Read-SmartExpenseEnvironment -Path $EnvFile -AllowedKeys $backendEnvKeys
foreach ($key in @('DB_URL', 'DB_USERNAME', 'DB_PASSWORD', 'JWT_SECRET')) {
    if (-not $configuration.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($configuration[$key]) -or
            $configuration[$key] -match '^<.*>$') {
        throw "Cần điền $key trong file .env trước khi chạy Backend."
    }
}
if (-not $configuration.DB_URL.StartsWith('jdbc:mysql://')) { throw 'DB_URL phải là JDBC URL của MySQL.' }
try { $decodedKey = [Convert]::FromBase64String($configuration.JWT_SECRET) }
catch { throw 'JWT_SECRET phải là Base64 hợp lệ; không dùng khóa mẫu.' }
if ($decodedKey.Length -lt 32) { throw 'JWT_SECRET phải biểu diễn ít nhất 32 byte ngẫu nhiên.' }
if ($configuration.ContainsKey('JWT_EXPIRATION')) {
    $expirationSeconds = 0L
    if (-not [long]::TryParse($configuration.JWT_EXPIRATION, [ref]$expirationSeconds) -or $expirationSeconds -le 0) {
        throw 'JWT_EXPIRATION phải là số giây lớn hơn 0.'
    }
}

# Biến chỉ có hiệu lực cho tiến trình hiện tại và Gradle con; không ghi vào cấu hình hệ điều hành.
$previousValues = @{}
$managedEnvKeys = $backendEnvKeys + @('SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME',
        'SPRING_DATASOURCE_PASSWORD', 'APP_JWT_SECRET', 'APP_JWT_EXPIRATION')
try {
    foreach ($key in $managedEnvKeys) {
        $previousValues[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        $value = if ($configuration.ContainsKey($key)) { $configuration[$key] } else { $null }
        [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
    if ($CheckOnly) {
        Write-Host 'Cấu hình Backend hợp lệ; không in credential và không kết nối database.'
        return
    }
    Push-Location (Join-Path (Split-Path -Parent $PSScriptRoot) 'backend')
    try {
        & .\gradlew.bat bootRun --no-daemon --console=plain
        if ($LASTEXITCODE -ne 0) { throw "Backend dừng với mã lỗi $LASTEXITCODE." }
    } finally { Pop-Location }
} finally {
    foreach ($key in $previousValues.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previousValues[$key], 'Process')
    }
}
