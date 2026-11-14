<#
.SYNOPSIS
    Automated PostgreSQL Setup and Seed Script for MPCR System.
.DESCRIPTION
    Configures PostgreSQL 17 database 'mpcr_db', creates application role 'mpcr_user',
    applies tables, views, triggers, and seeds the entire master data catalog.
.PARAMETER Hostname
    PostgreSQL server host (Default: localhost)
.PARAMETER Port
    PostgreSQL server port (Default: 5432)
.PARAMETER AdminUser
    PostgreSQL superuser for initial provisioning (Default: postgres)
.PARAMETER DatabaseName
    Target database name (Default: mpcr_db)
.PARAMETER AppUser
    Dedicated application username (Default: mpcr_user)
.PARAMETER AppPassword
    Application user password (Default: mpcr_secure_pass_2026!)
#>

[CmdletBinding()]
param (
    [string]$Hostname = "localhost",
    [int]$Port = 5432,
    [string]$AdminUser = "postgres",
    [string]$DatabaseName = "mpcr_db",
    [string]$AppUser = "mpcr_user",
    [string]$AppPassword = "mpcr_secure_pass_2026!"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " MPCR (Molding Parameter Control Record) Database Setup" -ForegroundColor Cyan
Write-Host " Motherson Group - PostgreSQL 17 Initialization" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Locate psql.exe
$psqlPath = Get-Command psql.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1

if (-not $psqlPath) {
    $searchPaths = @(
        "C:\Program Files\PostgreSQL\17\bin\psql.exe",
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe",
        "C:\Program Files (x86)\PostgreSQL\17\bin\psql.exe"
    )
    foreach ($p in $searchPaths) {
        if (Test-Path $p) {
            $psqlPath = $p
            break
        }
    }
}

if (-not $psqlPath) {
    Write-Error "Could not locate 'psql.exe'. Please ensure PostgreSQL 17 is installed and added to PATH."
    exit 1
}

Write-Host "[OK] Located psql at: $psqlPath" -ForegroundColor Green

# 2. Resolve admin password
if (-not $env:PGPASSWORD) {
    Write-Host "`nPlease enter PostgreSQL password for admin user '$AdminUser':" -ForegroundColor Yellow
    $securePass = Read-Host -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
    $env:PGPASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}

# 3. Test admin connection
Write-Host "`nConnecting to PostgreSQL server ($Hostname`:$Port as $AdminUser)..." -ForegroundColor Cyan
$testConn = & $psqlPath -h $Hostname -p $Port -U $AdminUser -d postgres -c "SELECT version();" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Could not authenticate with PostgreSQL server." -ForegroundColor Red
    Write-Host "Details: $testConn" -ForegroundColor DarkRed
    exit 1
}

Write-Host "[OK] Connection established successfully." -ForegroundColor Green

# 4. Resolve script directory paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }
$schemaFile = Join-Path $scriptDir "schema.sql"
$seedFile = Join-Path $scriptDir "seed.sql"

if (-not (Test-Path $schemaFile)) {
    Write-Error "schema.sql not found at $schemaFile"
    exit 1
}
if (-not (Test-Path $seedFile)) {
    Write-Error "seed.sql not found at $seedFile"
    exit 1
}

# 5. Create Application User & Database
Write-Host "`nProvisioning user '$AppUser' and database '$DatabaseName'..." -ForegroundColor Cyan

$createUserSql = @"
DO `$`$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$AppUser') THEN
        CREATE ROLE $AppUser WITH LOGIN PASSWORD '$AppPassword';
    ELSE
        ALTER ROLE $AppUser WITH PASSWORD '$AppPassword';
    END IF;
END
`$`$;
"@

$null = & $psqlPath -h $Hostname -p $Port -U $AdminUser -d postgres -c $createUserSql 2>&1

# Check if database exists
$dbCheck = & $psqlPath -h $Hostname -p $Port -U $AdminUser -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName';"
if ($dbCheck.Trim() -ne "1") {
    Write-Host "Creating database '$DatabaseName'..." -ForegroundColor Gray
    $null = & $psqlPath -h $Hostname -p $Port -U $AdminUser -d postgres -c "CREATE DATABASE $DatabaseName WITH OWNER = $AppUser ENCODING = 'UTF8';" 2>&1
} else {
    Write-Host "Database '$DatabaseName' already exists." -ForegroundColor Gray
}

# Grant privileges
$grantSql = @"
GRANT ALL PRIVILEGES ON DATABASE $DatabaseName TO $AppUser;
"@
$null = & $psqlPath -h $Hostname -p $Port -U $AdminUser -d postgres -c $grantSql 2>&1

# 6. Apply Schema
Write-Host "`nApplying schema DDL ($schemaFile)..." -ForegroundColor Cyan
& $psqlPath -h $Hostname -p $Port -U $AdminUser -d $DatabaseName -f $schemaFile
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to execute schema.sql"
    exit 1
}
Write-Host "[OK] Schema applied successfully." -ForegroundColor Green

# 7. Apply Seed Data
Write-Host "`nApplying master seed data ($seedFile)..." -ForegroundColor Cyan
& $psqlPath -h $Hostname -p $Port -U $AdminUser -d $DatabaseName -f $seedFile
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to execute seed.sql"
    exit 1
}
Write-Host "[OK] Seed data inserted successfully." -ForegroundColor Green

# 8. Grant ownership to AppUser
$ownSql = @"
GRANT ALL ON SCHEMA public TO $AppUser;
DO `$`$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO $AppUser;';
    END LOOP;
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
        EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequence_name) || ' OWNER TO $AppUser;';
    END LOOP;
    FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public') LOOP
        EXECUTE 'ALTER VIEW public.' || quote_ident(r.table_name) || ' OWNER TO $AppUser;';
    END LOOP;
END
`$`$;
"@
$null = & $psqlPath -h $Hostname -p $Port -U $AdminUser -d $DatabaseName -c $ownSql 2>&1

# 9. Verify Installation
Write-Host "`nVerifying database contents..." -ForegroundColor Cyan
$verifySql = @"
SELECT 
    (SELECT count(*) FROM users) AS users_count,
    (SELECT count(*) FROM machines) AS machines_count,
    (SELECT count(*) FROM parts) AS parts_count,
    (SELECT count(*) FROM molds) AS molds_count,
    (SELECT count(*) FROM parameter_definitions) AS params_count,
    (SELECT count(*) FROM recipes) AS recipes_count,
    (SELECT count(*) FROM recipe_rows) AS recipe_rows_count;
"@

& $psqlPath -h $Hostname -p $Port -U $AdminUser -d $DatabaseName -c $verifySql

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " SUCCESS: MPCR Database is ready for production use!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Connection details:" -ForegroundColor Cyan
Write-Host "  Host:     $Hostname"
Write-Host "  Port:     $Port"
Write-Host "  Database: $DatabaseName"
Write-Host "  User:     $AppUser"
Write-Host "  Password: $AppPassword"
Write-Host "`nConnection Strings:" -ForegroundColor Cyan
Write-Host "  Node.js / .env : postgresql://$AppUser`:$AppPassword@$Hostname`:$Port/$DatabaseName"
Write-Host "  psql CLI       : psql -h $Hostname -p $Port -U $AppUser -d $DatabaseName"
Write-Host "==========================================================" -ForegroundColor Green
