$ErrorActionPreference = 'Stop'
$credentialPath = Join-Path $PSScriptRoot 'demo-account.local.clixml'
if (!(Test-Path -LiteralPath $credentialPath)) {
    $demoSecret = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N') + 'A7!'
    $secureDemoSecret = ConvertTo-SecureString $demoSecret -AsPlainText -Force
    $demoCredential = New-Object System.Management.Automation.PSCredential('borrowbuddy.demo.20261021@bennett.edu.in', $secureDemoSecret)
    # Windows DPAPI encrypts the password for this signed-in Windows user.
    $demoCredential | Export-Clixml -LiteralPath $credentialPath
} else {
    $demoCredential = Import-Clixml -LiteralPath $credentialPath
}
$projectKeys = npx --yes supabase@2.121.0 projects api-keys --project-ref oijteuxelpwziplqwkvi --output json | ConvertFrom-Json
try {
    $env:SUPABASE_URL = 'https://oijteuxelpwziplqwkvi.supabase.co'
    $env:SUPABASE_ANON_KEY = ($projectKeys | Where-Object name -eq 'anon').api_key
    $env:SUPABASE_SERVICE_ROLE_KEY = ($projectKeys | Where-Object name -eq 'service_role').api_key
    $env:BORROWBUDDY_ALLOW_DEMO_CONTENT = '1'
    $env:BORROWBUDDY_DEMO_EMAIL = $demoCredential.UserName
    $env:BORROWBUDDY_DEMO_PASSWORD = $demoCredential.GetNetworkCredential().Password
    & node (Join-Path $PSScriptRoot 'seed-demo-catalog.mjs') --publish
    if ($LASTEXITCODE -ne 0) { throw 'Demo publication failed; inspect the non-secret receipt before resuming.' }
} finally {
    Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY, Env:SUPABASE_ANON_KEY, Env:BORROWBUDDY_DEMO_PASSWORD, Env:BORROWBUDDY_DEMO_EMAIL, Env:BORROWBUDDY_ALLOW_DEMO_CONTENT -ErrorAction SilentlyContinue
    $demoSecret = $null
    $secureDemoSecret = $null
    $demoCredential = $null
    $projectKeys = $null
}
