$ErrorActionPreference = 'Stop'
$release = Join-Path (Split-Path $PSScriptRoot -Parent) 'release'
$url = 'http://localhost:8080/'

function Test-ChristmasSite {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content.Contains('A real-time golden particle Christmas experience.')
    } catch { return $false }
}

try {
    if (-not (Test-Path (Join-Path $release 'site/index.html'))) {
        throw 'The website files are missing. Please restore the release/site folder.'
    }
    if (-not (Test-ChristmasSite)) {
        $node = (Get-Command node.exe -ErrorAction Stop).Source
        $server = Join-Path $release 'serve.mjs'
        $process = Start-Process -FilePath $node -ArgumentList @(('"' + $server + '"'), '--port', '8080', '--no-https') -WorkingDirectory $release -PassThru
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if (Test-ChristmasSite) { $ready = $true; break }
            if ($process.HasExited) { break }
            Start-Sleep -Milliseconds 200
        }
        if (-not $ready) {
            throw 'Could not start the website. Port 8080 may be occupied. Check the server window.'
        }
    }
    Start-Process $url
} catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'Christmas Experience') | Out-Null
    exit 1
}
