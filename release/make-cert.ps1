# Create a self-signed HTTPS certificate covering this PC's current LAN IPs.
# Only writes to the current-user certificate store and .\certs\site.pfx.
# No administrator rights required.
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$certDir = Join-Path $root "certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -ExpandProperty IPAddress -Unique)
if ($ips.Count -eq 0) { $ips = @("127.0.0.1") }

$sanEntries = @("DNS=localhost") + ($ips | ForEach-Object { "IPAddress=$_" })
$sanText = "2.5.29.17={text}" + ($sanEntries -join "&")

$cert = New-SelfSignedCertificate `
    -Subject "CN=Christmas Particle Experience (Local)" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(5) `
    -KeyExportPolicy Exportable `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -TextExtension @($sanText)

$password = ConvertTo-SecureString -String "christmas-local" -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath (Join-Path $certDir "site.pfx") -Password $password | Out-Null
Remove-Item ("Cert:\CurrentUser\My\" + $cert.Thumbprint) -Force

Write-Host ""
Write-Host "Certificate written to certs\site.pfx"
Write-Host ("Covered addresses: " + ($ips -join ", ") + ", localhost")
Write-Host "Re-run this script if the PC's LAN IP changes."
