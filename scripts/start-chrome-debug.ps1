# Start Chrome with debugging enabled
Write-Host "Closing existing Chrome processes..."
Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "Starting Chrome with remote debugging on port 9222..."
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
}

if (Test-Path $chromePath) {
    Start-Process -FilePath $chromePath -ArgumentList "--remote-debugging-port=9222","https://app.apollo.io"
    Write-Host "Chrome started! Waiting for it to initialize..."
    Start-Sleep -Seconds 5
    
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:9222/json/version" -TimeoutSec 3
        Write-Host "`nSUCCESS! Chrome debugging is enabled on port 9222" -ForegroundColor Green
        Write-Host "`nNext steps:"
        Write-Host "1. Log into Apollo in the Chrome window that opened"
        Write-Host "2. Navigate to a search results page (with leads table visible)"
        Write-Host "3. Then run: node scripts/debug-page-evaluate.js"
    } catch {
        Write-Host "`nChrome started but debugging port not responding yet." -ForegroundColor Yellow
        Write-Host "Please wait a few more seconds, then check if Chrome is running."
        Write-Host "You can verify by visiting: http://127.0.0.1:9222/json/version"
    }
} else {
    Write-Host "ERROR: Chrome not found at expected locations" -ForegroundColor Red
    Write-Host "Please start Chrome manually with:"
    Write-Host 'chrome.exe --remote-debugging-port=9222'
}

