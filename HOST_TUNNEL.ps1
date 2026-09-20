$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cloudflared = Join-Path $root 'tools\cloudflared.exe'
$origin = 'http://127.0.0.1:5173'

function Run-Tunnel([string]$protocol, [int]$probeSeconds) {
    $log = Join-Path $env:TEMP ("eblangame-cloudflared-{0}-{1}.log" -f $protocol, [guid]::NewGuid().ToString('N'))
    $args = @('tunnel','--protocol',$protocol,'--url',$origin,'--loglevel','info')
    Write-Host ""
    Write-Host ("Trying Cloudflare Tunnel via {0}..." -f $protocol.ToUpper()) -ForegroundColor Cyan
    $p = Start-Process -FilePath $cloudflared -ArgumentList $args -NoNewWindow -PassThru -RedirectStandardError $log -RedirectStandardOutput ($log + '.out')
    $seen = 0
    $deadline = (Get-Date).AddSeconds($probeSeconds)
    $registered = $false
    $failedRegistration = $false

    while ((Get-Date) -lt $deadline -and -not $p.HasExited) {
        Start-Sleep -Milliseconds 400
        if (Test-Path $log) {
            $lines = @(Get-Content $log)
            if ($lines.Count -gt $seen) {
                $new = $lines[$seen..($lines.Count-1)]
                $new | ForEach-Object { Write-Host $_ }
                $seen = $lines.Count
                $text = $lines -join "`n"
                if ($text -match 'Registered tunnel connection') { $registered = $true; break }
                if ($text -match 'Register tunnel error.*context deadline exceeded') { $failedRegistration = $true; break }
            }
        }
    }

    if ($registered) {
        Write-Host ""
        Write-Host ("Tunnel connected successfully using {0}. Keep this window open." -f $protocol.ToUpper()) -ForegroundColor Green
        while (-not $p.HasExited) {
            Start-Sleep -Milliseconds 500
            if (Test-Path $log) {
                $lines = @(Get-Content $log)
                if ($lines.Count -gt $seen) {
                    $lines[$seen..($lines.Count-1)] | ForEach-Object { Write-Host $_ }
                    $seen = $lines.Count
                }
            }
        }
        return $true
    }

    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    if ($failedRegistration) {
        Write-Host ""
        Write-Host ("{0} could reach Cloudflare but tunnel registration timed out." -f $protocol.ToUpper()) -ForegroundColor Yellow
    } else {
        Write-Host ""
        Write-Host ("{0} did not register a working tunnel within {1} seconds." -f $protocol.ToUpper(), $probeSeconds) -ForegroundColor Yellow
    }
    return $false
}

# Prefer QUIC, then automatically fall back to HTTP/2 if registration fails.
if (Run-Tunnel 'quic' 18) { exit 0 }
Write-Host "Automatically switching to HTTP/2..." -ForegroundColor Yellow
if (Run-Tunnel 'http2' 25) { exit 0 }

Write-Host ""
Write-Host 'ERROR: Neither QUIC nor HTTP/2 established a registered Cloudflare Tunnel.' -ForegroundColor Red
Write-Host 'The local Eblangame server may still be running at http://127.0.0.1:5173'
exit 1
