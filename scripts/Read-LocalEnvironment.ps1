# Đọc cấu hình local như dữ liệu; không thực thi lệnh hoặc in giá trị credential.
function Read-SmartExpenseEnvironment([string]$Path, [string[]]$AllowedKeys) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw 'Chưa có file .env. Sao chép .env.example rồi điền cấu hình riêng.'
    }
    $values = @{}
    $lineNumber = 0
    foreach ($line in [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $Path).Path)) {
        $lineNumber++
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) { continue }
        if ($line -notmatch '^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$') {
            throw "Dòng $lineNumber không đúng định dạng KEY=value."
        }
        $key = $Matches[1]
        $rawValue = $Matches[2]
        if ($key -notin $AllowedKeys) { continue }
        if ($values.ContainsKey($key)) { throw "Biến $key bị khai báo lặp ở dòng $lineNumber." }
        $value = $rawValue.Trim()

        # Chỉ đọc dữ liệu, không thực thi file .env hoặc nội suy biểu thức PowerShell.
        if ($value.StartsWith("'")) {
            $quoted = [regex]::Match($value, "^'((?:\\'|[^'])*)'\s*(?:#.*)?$")
            if (-not $quoted.Success) { throw "Dấu nháy đơn không hợp lệ ở dòng $lineNumber." }
            $value = $quoted.Groups[1].Value.Replace("\'", "'")
        } elseif ($value.StartsWith('"')) {
            if ($value -notmatch '^"((?:\\.|[^"\\])*)"\s*(?:#.*)?$') {
                throw "Dấu nháy đôi không hợp lệ ở dòng $lineNumber."
            }
            $body = $Matches[1]
            if ($body.Contains('$')) { throw "Dùng nháy đơn cho biến $key có ký tự dollar." }
            try { $value = ConvertFrom-Json ('"' + $body + '"') }
            catch { throw "Ký tự escape không hợp lệ ở dòng $lineNumber; hãy dùng nháy đơn." }
        } else {
            $value = ($rawValue -replace '\s+#.*$', '').Trim()
            if ($value.Contains('$')) { throw "Dùng nháy đơn cho biến $key có ký tự dollar." }
        }
        $values[$key] = $value
    }
    return $values
}

function Get-SmartExpenseRootPassword {
    $rootPassword = [Environment]::GetEnvironmentVariable('DB_ROOT_PASSWORD', 'Process')
    if ([string]::IsNullOrWhiteSpace($rootPassword)) {
        $settings = Read-SmartExpenseEnvironment -Path (Join-Path (Get-Location) '.env') -AllowedKeys @('DB_ROOT_PASSWORD')
        $rootPassword = $settings['DB_ROOT_PASSWORD']
    }
    if ([string]::IsNullOrWhiteSpace($rootPassword) -or $rootPassword -match '^<.*>$') {
        throw 'DB_ROOT_PASSWORD must be provided through the environment or the local .env file.'
    }
    return $rootPassword
}
