# ==============================================================================
# SmartExpense - Automated Integration & Smoke Test Suite (PowerShell)
# Phase 5: Database & DevOps Verification
# ==============================================================================
# Checks:
#   1. Infrastructure (Nginx, React Router SPA fallback, Reverse Proxy /api)
#   2. Authentication & JWT Security (Register, Login, Invalid Pwd, Bad Token)
#   3. Database & Full CRUD (Categories, Transactions, Date Filter, Budgets, Dashboard)
#   4. Multi-tenant Data Isolation (User A vs User B data leak prevention)
#   5. Public Port Exposure Security (Verifying port 3306 is not exposed to Internet)
# ==============================================================================

param(
    [string]$BaseUrl = "http://localhost:8088"
)

$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SMARTEXPENSE INTEGRATION & SMOKE TEST SUITE" -ForegroundColor Cyan
Write-Host "  Target URL: $BaseUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$Passed = 0
$Failed = 0
$Total = 0

function Report-Result {
    param(
        [string]$TestName,
        [bool]$Success,
        [string]$Details = ""
    )
    $script:Total++
    if ($Success) {
        $script:Passed++
        Write-Host " [PASS] $TestName" -ForegroundColor Green
    } else {
        $script:Failed++
        Write-Host " [FAIL] $TestName - $Details" -ForegroundColor Red
    }
}

function Send-JsonRequest {
    param(
        [string]$Uri,
        [string]$Method = "Get",
        [hashtable]$Headers = @{},
        [object]$Body = $null
    )
    $params = @{
        Uri             = $Uri
        Method          = $Method
        UseBasicParsing = $true
        TimeoutSec      = 15
    }
    if ($Headers.Count -gt 0) {
        $params["Headers"] = $Headers
    }
    if ($null -ne $Body) {
        $jsonStr = $Body | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
        $params["Body"] = $bytes
        $params["ContentType"] = "application/json; charset=utf-8"
    }
    $res = Invoke-WebRequest @params
    if ($res.RawContentStream) {
        $res.RawContentStream.Position = 0
        $bytes = $res.RawContentStream.ToArray()
        $content = [System.Text.Encoding]::UTF8.GetString($bytes)
        Add-Member -InputObject $res -NotePropertyName "Content" -NotePropertyValue $content -Force
    }
    return $res
}

# ------------------------------------------------------------------------------
# 1. INFRASTRUCTURE CHECKS
# ------------------------------------------------------------------------------
Write-Host "`n--- [1/5] Infrastructure & Nginx Proxy Checks ---" -ForegroundColor Yellow

# Test 1.1: Frontend Homepage HTTP 200
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/" -Method "Get"
    $isHtml = $resp.Content -match "<!doctype html>|<html"
    Report-Result -TestName "Frontend root (/) returns HTTP 200 HTML" -Success ($resp.StatusCode -eq 200 -and $isHtml)
} catch {
    Report-Result -TestName "Frontend root (/) returns HTTP 200 HTML" -Success $false -Details $_.Exception.Message
}

# Test 1.2: SPA Fallback on /transactions
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/transactions" -Method "Get"
    $isHtml = $resp.Content -match "<!doctype html>|<html"
    Report-Result -TestName "SPA Fallback (/transactions) returns HTTP 200" -Success ($resp.StatusCode -eq 200 -and $isHtml)
} catch {
    Report-Result -TestName "SPA Fallback (/transactions) returns HTTP 200" -Success $false -Details $_.Exception.Message
}

# Test 1.3: SPA Fallback on /categories
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/categories" -Method "Get"
    $isHtml = $resp.Content -match "<!doctype html>|<html"
    Report-Result -TestName "SPA Fallback (/categories) returns HTTP 200" -Success ($resp.StatusCode -eq 200 -and $isHtml)
} catch {
    Report-Result -TestName "SPA Fallback (/categories) returns HTTP 200" -Success $false -Details $_.Exception.Message
}

# Test 1.4: SPA Fallback on /budgets
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/budgets" -Method "Get"
    $isHtml = $resp.Content -match "<!doctype html>|<html"
    Report-Result -TestName "SPA Fallback (/budgets) returns HTTP 200" -Success ($resp.StatusCode -eq 200 -and $isHtml)
} catch {
    Report-Result -TestName "SPA Fallback (/budgets) returns HTTP 200" -Success $false -Details $_.Exception.Message
}

# Test 1.5: Security Headers
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/" -Method "Get"
    $hasNosniff = $resp.Headers["X-Content-Type-Options"] -eq "nosniff"
    $hasXframe = $resp.Headers["X-Frame-Options"] -eq "SAMEORIGIN"
    Report-Result -TestName "Nginx Security Headers (X-Content-Type-Options, X-Frame-Options)" -Success ($hasNosniff -and $hasXframe)
} catch {
    Report-Result -TestName "Nginx Security Headers" -Success $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 2. AUTHENTICATION & JWT SECURITY
# ------------------------------------------------------------------------------
Write-Host "`n--- [2/5] Authentication & Security Checks ---" -ForegroundColor Yellow

$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$userA_Email = "smoketest_a_${timestamp}@smartexpense.test"
$userA_Pass  = "PasswordA@123"
$userB_Email = "smoketest_b_${timestamp}@smartexpense.test"
$userB_Pass  = "PasswordB@123"

# Test 2.1: Register User A
$tokenA = $null
$authHeadersA = @{}
try {
    $regBody = @{
        fullName = "Smoke Test User A"
        email    = $userA_Email
        password = $userA_Pass
    }
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/auth/register" -Method "Post" -Body $regBody
    Report-Result -TestName "Register User A returns HTTP 201" -Success ($resp.StatusCode -eq 201)
} catch {
    Report-Result -TestName "Register User A returns HTTP 201" -Success $false -Details $_.Exception.Message
}

# Test 2.2: Login User A with invalid password (Expect 401)
try {
    $badLogin = @{
        email    = $userA_Email
        password = "WrongPassword123"
    }
    $null = Send-JsonRequest -Uri "$BaseUrl/api/auth/login" -Method "Post" -Body $badLogin
    Report-Result -TestName "Login with invalid password rejected (401)" -Success $false -Details "Expected 401 but request succeeded"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Report-Result -TestName "Login with invalid password rejected (401)" -Success ($status -eq 401)
}

# Test 2.3: Login User A with valid credentials
try {
    $validLogin = @{
        email    = $userA_Email
        password = $userA_Pass
    }
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/auth/login" -Method "Post" -Body $validLogin
    $json = $resp.Content | ConvertFrom-Json
    $tokenA = $json.accessToken
    $authHeadersA = @{ Authorization = "Bearer $tokenA" }
    $hasToken = -not [string]::IsNullOrWhiteSpace($tokenA)
    Report-Result -TestName "Login User A returns JWT accessToken" -Success ($resp.StatusCode -eq 200 -and $hasToken)
} catch {
    Report-Result -TestName "Login User A returns JWT accessToken" -Success $false -Details $_.Exception.Message
}

# Test 2.4: Protected API without token (Expect 401)
try {
    $null = Send-JsonRequest -Uri "$BaseUrl/api/users/me" -Method "Get"
    Report-Result -TestName "Protected endpoint without token returns HTTP 401" -Success $false -Details "Request unexpectedly succeeded"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Report-Result -TestName "Protected endpoint without token returns HTTP 401" -Success ($status -eq 401)
}

# Test 2.5: Protected API with invalid / forged token (Expect 401)
try {
    $badHeaders = @{ Authorization = "Bearer invalid.jwt.token.string" }
    $null = Send-JsonRequest -Uri "$BaseUrl/api/users/me" -Method "Get" -Headers $badHeaders
    Report-Result -TestName "Protected endpoint with fake token returns HTTP 401" -Success $false -Details "Request unexpectedly succeeded"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Report-Result -TestName "Protected endpoint with fake token returns HTTP 401" -Success ($status -eq 401)
}

# Test 2.6: Protected API (/api/users/me) with valid token
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/users/me" -Method "Get" -Headers $authHeadersA
    $userMe = $resp.Content | ConvertFrom-Json
    $matchEmail = $userMe.email -eq $userA_Email
    Report-Result -TestName "Get Profile (/api/users/me) with valid token" -Success ($resp.StatusCode -eq 200 -and $matchEmail)
} catch {
    Report-Result -TestName "Get Profile (/api/users/me) with valid token" -Success $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 3. DATABASE & CRUD OPERATIONS (Categories, Transactions, Budgets, Dashboard)
# ------------------------------------------------------------------------------
Write-Host "`n--- [3/5] Database CRUD & Business Logic Checks ---" -ForegroundColor Yellow

$categoryId = $null
$transactionId = $null

# Test 3.1: Create Category (EXPENSE)
try {
    $catBody = @{
        name = "Ăn uống kiểm thử"
        type = "EXPENSE"
    }
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/categories" -Method "Post" -Headers $authHeadersA -Body $catBody
    $cat = $resp.Content | ConvertFrom-Json
    $categoryId = $cat.id
    Report-Result -TestName "Create Category (POST /api/categories) returns HTTP 201" -Success ($resp.StatusCode -eq 201 -and $categoryId -gt 0)
} catch {
    Report-Result -TestName "Create Category (POST /api/categories) returns HTTP 201" -Success $false -Details $_.Exception.Message
}

# Test 3.2: Get All Categories
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/categories" -Method "Get" -Headers $authHeadersA
    $cats = $resp.Content | ConvertFrom-Json
    $found = ($cats | Where-Object { $_.id -eq $categoryId }) -ne $null
    Report-Result -TestName "List Categories (GET /api/categories) includes new category" -Success ($resp.StatusCode -eq 200 -and $found)
} catch {
    Report-Result -TestName "List Categories (GET /api/categories)" -Success $false -Details $_.Exception.Message
}

# Test 3.3: Update Category
try {
    $updateCatBody = @{
        name = "Ăn uống cập nhật"
        type = "EXPENSE"
    }
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/categories/$categoryId" -Method "Put" -Headers $authHeadersA -Body $updateCatBody
    $upCat = $resp.Content | ConvertFrom-Json
    Report-Result -TestName "Update Category (PUT /api/categories/{id}) returns HTTP 200" -Success ($resp.StatusCode -eq 200 -and $upCat.name -eq "Ăn uống cập nhật")
} catch {
    Report-Result -TestName "Update Category" -Success $false -Details $_.Exception.Message
}

# Test 3.4: Create Transaction
try {
    $txBody = @{
        categoryId      = $categoryId
        type            = "EXPENSE"
        amount          = 150000.00
        transactionDate = "2026-10-15"
        note            = "Bữa tối thử nghiệm"
    }
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/transactions" -Method "Post" -Headers $authHeadersA -Body $txBody
    $tx = $resp.Content | ConvertFrom-Json
    $transactionId = $tx.id
    Report-Result -TestName "Create Transaction (POST /api/transactions) returns HTTP 201" -Success ($resp.StatusCode -eq 201 -and $transactionId -gt 0)
} catch {
    Report-Result -TestName "Create Transaction" -Success $false -Details $_.Exception.Message
}

# Test 3.5: List Transactions
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/transactions" -Method "Get" -Headers $authHeadersA
    $page = $resp.Content | ConvertFrom-Json
    $content = $page.content
    $foundTx = ($content | Where-Object { $_.id -eq $transactionId }) -ne $null
    Report-Result -TestName "List Transactions (GET /api/transactions) includes created item" -Success ($resp.StatusCode -eq 200 -and $foundTx)
} catch {
    Report-Result -TestName "List Transactions" -Success $false -Details $_.Exception.Message
}

# Test 3.6: Filter Transactions by Date Range
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/transactions?startDate=2026-10-01&endDate=2026-10-31" -Method "Get" -Headers $authHeadersA
    $page = $resp.Content | ConvertFrom-Json
    Report-Result -TestName "Filter Transactions by Date Range returns HTTP 200" -Success ($resp.StatusCode -eq 200 -and $page.content.Count -ge 1)
} catch {
    Report-Result -TestName "Filter Transactions by Date Range" -Success $false -Details $_.Exception.Message
}

# Test 3.7: Set Budget (PUT /api/budgets/2026/10)
try {
    $budgetBody = @{
        amountLimit = 5000000.00
    }
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/budgets/2026/10" -Method "Put" -Headers $authHeadersA -Body $budgetBody
    $bg = $resp.Content | ConvertFrom-Json
    Report-Result -TestName "Set Budget (PUT /api/budgets/2026/10) returns HTTP 200" -Success ($resp.StatusCode -eq 200 -and $bg.amountLimit -eq 5000000.00)
} catch {
    Report-Result -TestName "Set Budget" -Success $false -Details $_.Exception.Message
}

# Test 3.8: Get Budget (GET /api/budgets/2026/10)
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/budgets/2026/10" -Method "Get" -Headers $authHeadersA
    $bg = $resp.Content | ConvertFrom-Json
    Report-Result -TestName "Get Budget (GET /api/budgets/2026/10) returns HTTP 200" -Success ($resp.StatusCode -eq 200 -and $bg.year -eq 2026 -and $bg.month -eq 10)
} catch {
    Report-Result -TestName "Get Budget" -Success $false -Details $_.Exception.Message
}

# Test 3.9: Dashboard Summary (GET /api/dashboard/summary?month=2026-10)
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/dashboard/summary?month=2026-10" -Method "Get" -Headers $authHeadersA
    $summary = $resp.Content | ConvertFrom-Json
    $hasExpense = $summary.totalExpense -ge 150000.00
    Report-Result -TestName "Dashboard Summary reflects transaction amount" -Success ($resp.StatusCode -eq 200 -and $hasExpense)
} catch {
    Report-Result -TestName "Dashboard Summary" -Success $false -Details $_.Exception.Message
}

# Test 3.10: Dashboard Expenses by Category (GET /api/dashboard/expenses-by-category?month=2026-10)
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/dashboard/expenses-by-category?month=2026-10" -Method "Get" -Headers $authHeadersA
    $byCategory = $resp.Content | ConvertFrom-Json
    Report-Result -TestName "Dashboard Expenses by Category returns HTTP 200" -Success ($resp.StatusCode -eq 200 -and $byCategory.Count -ge 1)
} catch {
    Report-Result -TestName "Dashboard Expenses by Category" -Success $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 4. MULTI-TENANT ISOLATION & DATA SECURITY
# ------------------------------------------------------------------------------
Write-Host "`n--- [4/5] Multi-Tenant Security & Access Isolation ---" -ForegroundColor Yellow

$tokenB = $null
$authHeadersB = @{}
try {
    # Register User B
    $regBBody = @{
        fullName = "Smoke Test User B"
        email    = $userB_Email
        password = $userB_Pass
    }
    $null = Send-JsonRequest -Uri "$BaseUrl/api/auth/register" -Method "Post" -Body $regBBody

    # Login User B
    $loginBBody = @{
        email    = $userB_Email
        password = $userB_Pass
    }
    $respB = Send-JsonRequest -Uri "$BaseUrl/api/auth/login" -Method "Post" -Body $loginBBody
    $tokenB = ($respB.Content | ConvertFrom-Json).accessToken
    $authHeadersB = @{ Authorization = "Bearer $tokenB" }
} catch {
    Write-Host " [WARN] Failed setting up User B: $($_.Exception.Message)" -ForegroundColor DarkYellow
}

if ($tokenB -and $categoryId) {
    # Test 4.1: User B tries to view User A's category
    try {
        $null = Send-JsonRequest -Uri "$BaseUrl/api/categories/$categoryId" -Method "Get" -Headers $authHeadersB
        Report-Result -TestName "User B forbidden from reading User A's category" -Success $false -Details "User B accessed User A's category!"
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        Report-Result -TestName "User B cannot access User A's category (403/404)" -Success ($status -in @(403, 404))
    }

    # Test 4.2: User B tries to view User A's transaction
    if ($transactionId) {
        try {
            $null = Send-JsonRequest -Uri "$BaseUrl/api/transactions/$transactionId" -Method "Get" -Headers $authHeadersB
            Report-Result -TestName "User B forbidden from reading User A's transaction" -Success $false -Details "User B accessed User A's transaction!"
        } catch {
            $status = $_.Exception.Response.StatusCode.value__
            Report-Result -TestName "User B cannot access User A's transaction (403/404)" -Success ($status -in @(403, 404))
        }
    }
} else {
    Report-Result -TestName "Multi-tenant isolation check" -Success $false -Details "Preconditions for User B not met"
}

# ------------------------------------------------------------------------------
# 5. CLEANUP & PUBLIC PORT SECURITY
# ------------------------------------------------------------------------------
Write-Host "`n--- [5/5] Data Cleanup & Host Port Exposure ---" -ForegroundColor Yellow

# Test 5.1: Clean up transaction
if ($transactionId) {
    try {
        $resp = Send-JsonRequest -Uri "$BaseUrl/api/transactions/$transactionId" -Method "Delete" -Headers $authHeadersA
        Report-Result -TestName "Delete Transaction (DELETE /api/transactions/{id})" -Success ($resp.StatusCode -eq 204)
    } catch {
        Report-Result -TestName "Delete Transaction" -Success $false -Details $_.Exception.Message
    }
}

# Test 5.2: Clean up category
if ($categoryId) {
    try {
        $resp = Send-JsonRequest -Uri "$BaseUrl/api/categories/$categoryId" -Method "Delete" -Headers $authHeadersA
        Report-Result -TestName "Delete Category (DELETE /api/categories/{id})" -Success ($resp.StatusCode -eq 204)
    } catch {
        Report-Result -TestName "Delete Category" -Success $false -Details $_.Exception.Message
    }
}

# Test 5.3: Delete monthly budget
try {
    $resp = Send-JsonRequest -Uri "$BaseUrl/api/budgets/2026/10" -Method "Delete" -Headers $authHeadersA
    Report-Result -TestName "Delete Budget (DELETE /api/budgets/2026/10)" -Success ($resp.StatusCode -eq 204)
} catch {
    Report-Result -TestName "Delete Budget" -Success $false -Details $_.Exception.Message
}

# Test 5.4: MySQL Public Port Exposure check
$mysqlPublicExposed = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect("127.0.0.1", 3306, $null, $null)
    $wait = $iar.AsyncWaitHandle.WaitOne(1000, $false)
    if ($wait -and $tcp.Connected) {
        $mysqlPublicExposed = $true
        $tcp.Close()
    }
} catch {
    $mysqlPublicExposed = $false
}

Report-Result -TestName "MySQL port 3306 is NOT publicly exposed on host" -Success (-not $mysqlPublicExposed)

# ------------------------------------------------------------------------------
# SUMMARY REPORT
# ------------------------------------------------------------------------------
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  SMARTEXPENSE SMOKE TEST SUMMARY" -ForegroundColor Cyan
Write-Host "  Total Tests : $Total" -ForegroundColor White
Write-Host "  Passed      : $Passed" -ForegroundColor Green
Write-Host "  Failed      : $Failed" -ForegroundColor $(if ($Failed -eq 0) { "Green" } else { "Red" })
Write-Host "==========================================================" -ForegroundColor Cyan

if ($Failed -eq 0) {
    exit 0
} else {
    exit 1
}
