# Smart Restaurant Campus - Local dev services launcher (Windows native)
# Starts MinIO, Meilisearch, Mailpit in background.
# PostgreSQL 18 and Memurai (Redis) are already running as Windows services.
#
# Usage:
#   pwsh infrastructure/scripts/start-services.ps1            # start all
#   pwsh infrastructure/scripts/start-services.ps1 -Stop      # stop all
#   pwsh infrastructure/scripts/start-services.ps1 -Status    # status

param(
    [switch]$Stop,
    [switch]$Status
)

$svcDir = "C:\Users\User\campus-services"
$dataDir = "C:\Users\User\campus-data"
$pidDir = "$env:TEMP\campus-pids"

New-Item -ItemType Directory -Path $dataDir -Force -ErrorAction SilentlyContinue | Out-Null
New-Item -ItemType Directory -Path $pidDir -Force -ErrorAction SilentlyContinue | Out-Null
New-Item -ItemType Directory -Path "$dataDir\minio" -Force -ErrorAction SilentlyContinue | Out-Null
New-Item -ItemType Directory -Path "$dataDir\meilisearch" -Force -ErrorAction SilentlyContinue | Out-Null
New-Item -ItemType Directory -Path "$dataDir\mailpit" -Force -ErrorAction SilentlyContinue | Out-Null

function Show-Status {
    $checks = @(
        @{ Name = 'PostgreSQL 18';     Port = 5432 },
        @{ Name = 'Memurai (Redis)';   Port = 6379 },
        @{ Name = 'MinIO API';         Port = 9000 },
        @{ Name = 'MinIO Console';     Port = 9001 },
        @{ Name = 'Meilisearch';       Port = 7700 },
        @{ Name = 'Mailpit SMTP';      Port = 1025 },
        @{ Name = 'Mailpit Web UI';    Port = 8025 }
    )
    foreach ($c in $checks) {
        $listen = Test-NetConnection -ComputerName localhost -Port $c.Port -InformationLevel Quiet -WarningAction SilentlyContinue
        $tag = if ($listen) { "[UP]  " } else { "[DOWN]" }
        Write-Host "$tag $($c.Name) (port $($c.Port))"
    }
}

function Stop-CampusServices {
    Get-ChildItem "$pidDir\*.pid" -ErrorAction SilentlyContinue | ForEach-Object {
        $procId = Get-Content $_.FullName -ErrorAction SilentlyContinue
        if ($procId) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped $($_.BaseName) (PID $procId)"
        }
        Remove-Item $_.FullName -Force
    }
}

function IsRunning {
    param([string]$PidFile)
    if (-not (Test-Path $PidFile)) { return $false }
    $procId = Get-Content $PidFile -ErrorAction SilentlyContinue
    if (-not $procId) { return $false }
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    return $null -ne $p
}

function Start-CampusServices {
    # MinIO
    $minioPid = "$pidDir\minio.pid"
    if (IsRunning $minioPid) {
        Write-Host "MinIO already running"
    } else {
        $env:MINIO_ROOT_USER = "minioadmin"
        $env:MINIO_ROOT_PASSWORD = "minioadmin"
        $p = Start-Process -FilePath "$svcDir\minio.exe" -ArgumentList "server","$dataDir\minio","--console-address",":9001" -WindowStyle Hidden -PassThru
        $p.Id | Out-File $minioPid
        Write-Host "Started MinIO (PID $($p.Id))  - API: http://localhost:9000  Console: http://localhost:9001  (minioadmin/minioadmin)"
    }

    # Meilisearch
    $meiliPid = "$pidDir\meilisearch.pid"
    if (IsRunning $meiliPid) {
        Write-Host "Meilisearch already running"
    } else {
        $p = Start-Process -FilePath "$svcDir\meilisearch.exe" -ArgumentList "--db-path","$dataDir\meilisearch","--no-analytics","--master-key","changeme-please-32-chars-or-more-key","--env","development" -WindowStyle Hidden -PassThru
        $p.Id | Out-File $meiliPid
        Write-Host "Started Meilisearch (PID $($p.Id))  - http://localhost:7700"
    }

    # Mailpit
    $mailPid = "$pidDir\mailpit.pid"
    if (IsRunning $mailPid) {
        Write-Host "Mailpit already running"
    } else {
        $env:MP_DATABASE = "$dataDir\mailpit\mailpit.db"
        $env:MP_MAX_MESSAGES = "5000"
        $p = Start-Process -FilePath "$svcDir\mailpit.exe" -WindowStyle Hidden -PassThru
        $p.Id | Out-File $mailPid
        Write-Host "Started Mailpit (PID $($p.Id))  - SMTP: localhost:1025  UI: http://localhost:8025"
    }
}

if ($Status) {
    Show-Status
} elseif ($Stop) {
    Stop-CampusServices
    Write-Host ""
    Write-Host "All Restaurant Campus services stopped."
} else {
    Start-CampusServices
    Start-Sleep -Seconds 4
    Write-Host ""
    Write-Host "=== Status ==="
    Show-Status
    Write-Host ""
    Write-Host "Stop services with: pwsh infrastructure/scripts/start-services.ps1 -Stop"
}
