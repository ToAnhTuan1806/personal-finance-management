param(
    [string]$EnvFile = (Join-Path (Split-Path -Parent $PSScriptRoot) '.env'),
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$smtpEnvKeys = @('SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM',
        'APP_FRONTEND_URL', 'SMTP_AUTH', 'SMTP_STARTTLS')
$backendEnvKeys = @('DB_URL', 'DB_USERNAME', 'DB_PASSWORD', 'JWT_SECRET', 'JWT_EXPIRATION') + $smtpEnvKeys

. (Join-Path $PSScriptRoot 'Read-LocalEnvironment.ps1')

$configuration = Read-SmartExpenseEnvironment -Path $EnvFile -AllowedKeys $backendEnvKeys
# SMTP có thể được cấp qua secret môi trường; file được chọn vẫn có ưu tiên khi khai báo rõ.
foreach ($key in $smtpEnvKeys) {
    if (-not $configuration.ContainsKey($key)) {
        $inheritedValue = [Environment]::GetEnvironmentVariable($key, 'Process')
        if ($null -ne $inheritedValue) { $configuration[$key] = $inheritedValue }
    }
}
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
if ($configuration.ContainsKey('SMTP_PORT') -and -not [string]::IsNullOrWhiteSpace($configuration.SMTP_PORT)) {
    $smtpPort = 0
    if (-not [int]::TryParse($configuration.SMTP_PORT, [ref]$smtpPort) -or $smtpPort -lt 1 -or $smtpPort -gt 65535) {
        throw 'SMTP_PORT phải là số từ 1 đến 65535.'
    }
}
foreach ($key in @('SMTP_AUTH', 'SMTP_STARTTLS')) {
    if ($configuration.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($configuration[$key])) {
        $smtpFlag = $false
        if (-not [bool]::TryParse($configuration[$key], [ref]$smtpFlag)) { throw "$key phải là true hoặc false." }
    }
}

# Biến chỉ có hiệu lực cho tiến trình hiện tại và Gradle con; không ghi vào cấu hình hệ điều hành.
$previousValues = @{}
$managedEnvKeys = $backendEnvKeys + @('SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME',
        'SPRING_DATASOURCE_PASSWORD', 'APP_JWT_SECRET', 'APP_JWT_EXPIRATION',
        'SPRING_MAIL_HOST', 'SPRING_MAIL_PORT', 'SPRING_MAIL_USERNAME', 'SPRING_MAIL_PASSWORD', 'APP_MAIL_FROM')
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
