# set-env.ps1
# 현재 연결된 네트워크 IP를 자동으로 감지해서 .env를 업데이트합니다.
# 사용법: .\set-env.ps1
# 이후 pnpm dev --host 실행

# WiFi 어댑터 우선으로 DHCP 할당 IP 탐색
$wifiIp = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi" -ErrorAction SilentlyContinue |
          Where-Object { $_.PrefixOrigin -eq "Dhcp" -and $_.IPAddress -notmatch "^169\." } |
          Select-Object -First 1 -ExpandProperty IPAddress

# Wi-Fi가 없으면 다른 DHCP 인터페이스에서 탐색 (이더넷 등)
$ip = if ($wifiIp) { $wifiIp } else {
    Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.PrefixOrigin -eq "Dhcp" -and $_.IPAddress -notmatch "^169\." } |
    Select-Object -First 1 -ExpandProperty IPAddress
}

if (-not $ip) {
    Write-Host "IP를 찾을 수 없습니다. 네트워크에 연결되어 있는지 확인하세요." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "감지된 IP: $ip" -ForegroundColor Green

$envPath = Join-Path $PSScriptRoot ".env"
$lines = Get-Content $envPath

$updated = $lines | ForEach-Object {
    if ($_ -match "^VITE_BACKEND_URL=")  { "VITE_BACKEND_URL=http://${ip}:4000" }
    elseif ($_ -match "^VITE_HLS_BASE_URL=") { "VITE_HLS_BASE_URL=http://${ip}:8889" }
    else { $_ }
}

[System.IO.File]::WriteAllLines($envPath, $updated)

Write-Host ""
Write-Host ".env 업데이트 완료:" -ForegroundColor Cyan
Write-Host "  VITE_BACKEND_URL  = http://${ip}:4000"
Write-Host "  VITE_HLS_BASE_URL = http://${ip}:8889"
Write-Host ""
Write-Host "아이패드 접속 주소: http://${ip}:5173" -ForegroundColor Yellow
Write-Host ""
Write-Host "이제 'pnpm dev --host' 를 실행하세요." -ForegroundColor Green
