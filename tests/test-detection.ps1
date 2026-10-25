# ============================================================
# OAT - office-network detection tests for auto-attendance.ps1
# ============================================================
# Runs the real script in --dry-run against mocked Windows networking
# (netsh, ipconfig, Get-NetAdapter, WMI, Get-DnsClient, network profiles)
# and checks the "On office net" verdict for each scenario.
#
# Works on Windows PowerShell 5.1 and PowerShell 7 (Windows or macOS):
#   pwsh tests/test-detection.ps1
#   pwsh tests/test-detection.ps1 -Script ./old-auto-attendance.ps1   # compare a version
#
# Nothing on the machine is touched: the mocks shadow the real commands
# inside a child process, and the script runs from a temp copy.
# ============================================================
param([string]$Script = (Join-Path $PSScriptRoot '..\auto-attendance.ps1'))

$ErrorActionPreference = 'Stop'
$exe  = (Get-Process -Id $PID).Path
$work = Join-Path ([IO.Path]::GetTempPath()) ("oat-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$target = Join-Path $work 'auto-attendance.ps1'
Copy-Item -LiteralPath $Script -Destination $target
$mock = Join-Path $work 'mocks.ps1'

# ---- Mocks (functions beat cmdlets and native exes in command lookup) ----
@'
$OatMock = Get-Content -Raw -LiteralPath $env:OAT_SCENARIO | ConvertFrom-Json
$env:TEMP = $env:OAT_TMP
function Test-OatBlocked { if ($OatMock.blocked) { throw 'blocked by policy (mock)' } }

function netsh {
    $w = @($OatMock.adapters | Where-Object { $_.wifi })
    if ($w.Count -eq 0) { return 'There is no wireless interface on the system.' }
    if ($OatMock.locationOff) {
        return @('Network shell commands need location permission to access WLAN information. Turn on Location services on the Location page in Privacy & security settings.')
    }
    $up = $w[0].status -eq 'Up'
    $o = @('', 'There is 1 interface on the system:', '',
           "    Name                   : $($w[0].name)",
           "    Description            : $($w[0].desc)",
           "    State                  : $(if ($up) { 'connected' } else { 'disconnected' })")
    if ($up -and $OatMock.ssid) {
        $o += "    SSID                   : $($OatMock.ssid)"
        $o += "    AP BSSID               : 00:11:22:33:44:55"
    }
    return $o
}

function ipconfig {
    $o = @('', 'Windows IP Configuration', '',
           '   Host Name . . . . . . . . . . . . : TESTPC',
           '   Primary Dns Suffix  . . . . . . . : ',
           '   Node Type . . . . . . . . . . . . : Hybrid')
    $s = @($OatMock.search)
    if ($s.Count -gt 0 -and $s[0]) {
        $o += "   DNS Suffix Search List. . . . . . : $($s[0])"
        for ($i = 1; $i -lt $s.Count; $i++) { $o += "                                       $($s[$i])" }
    }
    foreach ($a in $OatMock.adapters) {
        $kind = 'Ethernet adapter'
        if ($a.wifi) { $kind = 'Wireless LAN adapter' }
        $o += ''; $o += "$kind $($a.name):"; $o += ''
        if ($a.status -ne 'Up') { $o += '   Media State . . . . . . . . . . . : Media disconnected' }
        $o += "   Connection-specific DNS Suffix  . : $($a.suffix)"
        $o += "   Description . . . . . . . . . . . : $($a.desc)"
    }
    return $o
}

function Get-NetAdapter {
    [CmdletBinding()] param()
    Test-OatBlocked
    foreach ($a in $OatMock.adapters) {
        $pm = '802.3'; $nm = 14
        if ($a.wifi) { $pm = 'Native 802.11'; $nm = 9 }
        [pscustomobject]@{ InterfaceIndex = $a.idx; Name = $a.name; InterfaceDescription = $a.desc
                           Status = $a.status; PhysicalMediaType = $pm; NdisPhysicalMedium = $nm }
    }
}

function Get-WmiObject {
    [CmdletBinding()] param([Parameter(Position = 0)][string]$Class, [string]$Filter)
    Test-OatBlocked
    foreach ($a in $OatMock.adapters) {
        if ($Class -eq 'Win32_NetworkAdapter') {
            if ($a.status -eq 'Up') { [pscustomobject]@{ InterfaceIndex = $a.idx; NetConnectionID = $a.name; Name = $a.desc } }
        } else {
            # Worst case on purpose: disconnected adapters still report
            # IPEnabled and their last DHCP suffix.
            [pscustomobject]@{ InterfaceIndex = $a.idx; DNSDomain = $a.suffix
                               DNSDomainSuffixSearchOrder = @($OatMock.search) }
        }
    }
}

function Get-DnsClient {
    [CmdletBinding()] param()
    Test-OatBlocked
    foreach ($a in $OatMock.adapters) {
        [pscustomobject]@{ InterfaceIndex = $a.idx; InterfaceAlias = $a.name; ConnectionSpecificSuffix = $a.suffix }
    }
}

function Get-DnsClientGlobalSetting {
    [CmdletBinding()] param()
    Test-OatBlocked
    [pscustomobject]@{ SuffixSearchList = @($OatMock.search) }
}

function Get-NetConnectionProfile {
    [CmdletBinding()] param()
    Test-OatBlocked
    foreach ($p in $OatMock.profiles) {
        [pscustomobject]@{ InterfaceIndex = $p.idx; Name = $p.name; NetworkCategory = $p.category }
    }
}

function Start-Process { [CmdletBinding()] param([Parameter(Position = 0)]$FilePath) }
'@ | Set-Content -LiteralPath $mock -Encoding UTF8

# ---- Building blocks ----
function WiFi([string]$suffix, [string]$status = 'Up') {
    @{ idx = 12; name = 'Wi-Fi'; desc = 'Intel(R) Wi-Fi 6E AX211 160MHz'; wifi = $true; status = $status; suffix = $suffix }
}
function Dock([string]$suffix, [string]$status) {
    @{ idx = 7; name = 'Ethernet 3'; desc = 'Dell USB-C Dock Ethernet'; wifi = $false; status = $status; suffix = $suffix }
}
function Vpn([string]$suffix) {
    @{ idx = 30; name = 'Ethernet 4'; desc = 'PANGP Virtual Ethernet Adapter Secure'; wifi = $false; status = 'Up'; suffix = $suffix }
}
$OFFICE = 'wlan.netapp.com'
$GPO    = @('netapp.com', 'eng.netapp.com', 'wlan.netapp.com')   # worst case: pinned everywhere
$CLEAN  = @('netapp.com', 'eng.netapp.com')

$scenarios = @(
    # ---------- at the office: must mark ----------
    @{ n = 'Office Wi-Fi, SSID readable';                         e = $true
       adapters = @(WiFi $OFFICE); ssid = 'corp'; search = $GPO }
    @{ n = 'Office Wi-Fi, Location off, profile name = corp';     e = $true
       adapters = @(WiFi $OFFICE); locationOff = $true; search = $GPO
       profiles = @(@{ idx = 12; name = 'corp'; category = 'Private' }) }
    @{ n = 'Office Wi-Fi, Location off, profile "corp 2"';        e = $true
       adapters = @(WiFi $OFFICE); locationOff = $true; search = $CLEAN
       profiles = @(@{ idx = 12; name = 'corp 2'; category = 'Public' }) }
    @{ n = 'Office Wi-Fi, Location off, domain-auth profile';     e = $true
       adapters = @(WiFi $OFFICE); locationOff = $true; search = $GPO
       profiles = @(@{ idx = 12; name = 'netapp.com'; category = 'DomainAuthenticated' }) }
    @{ n = 'Office docked, Wi-Fi off, office suffix on dock';     e = $true
       adapters = @((WiFi '' 'Disconnected'), (Dock $OFFICE 'Up')); search = $GPO }
    @{ n = 'Office, SSID corp, suffix only in search list';       e = $true
       adapters = @(WiFi ''); ssid = 'corp'; search = $GPO }
    @{ n = 'Office, cmdlets blocked, ipconfig only, SSID corp';   e = $true
       adapters = @(WiFi $OFFICE); ssid = 'corp'; search = $CLEAN; blocked = $true }
    @{ n = 'Office, cmdlets blocked, Location off';               e = $true
       adapters = @(WiFi $OFFICE); locationOff = $true; search = $CLEAN; blocked = $true }

    # ---------- at home: must NOT mark ----------
    @{ n = 'HOME: Location off, no profile, office suffix in search list (25-Oct report)'; e = $false
       adapters = @(WiFi 'domain.name'); locationOff = $true; search = $GPO }
    @{ n = 'HOME: Location off, stale office suffix on unplugged dock';    e = $false
       adapters = @((WiFi ''), (Dock $OFFICE 'Disconnected')); locationOff = $true; search = $CLEAN }
    @{ n = 'HOME: Location off, VPN adapter carries office suffix';        e = $false
       adapters = @((WiFi ''), (Vpn $OFFICE)); locationOff = $true; search = $GPO }
    @{ n = 'HOME: Location off, home profile readable, VPN + GPO';         e = $false
       adapters = @((WiFi 'lan'), (Vpn $OFFICE)); locationOff = $true; search = $GPO
       profiles = @(@{ idx = 12; name = 'Airtel_Home_5G'; category = 'Private' }) }
    @{ n = 'HOME: SSID readable (home), VPN carries office suffix';        e = $false
       adapters = @((WiFi ''), (Vpn $OFFICE)); ssid = 'Airtel_Home_5G'; search = $GPO }
    @{ n = 'HOME: home Wi-Fi named corp, no office suffix';                e = $false
       adapters = @(WiFi 'lan'); ssid = 'corp'; search = $CLEAN }
    @{ n = 'HOME: cmdlets blocked, stale suffix on unplugged dock';        e = $false
       adapters = @((WiFi ''), (Dock $OFFICE 'Disconnected')); locationOff = $true; search = $CLEAN; blocked = $true }
    @{ n = 'HOME: cmdlets blocked, PANGP VPN carries office suffix';       e = $false
       adapters = @((WiFi ''), (Vpn $OFFICE)); locationOff = $true; search = $GPO; blocked = $true }
    @{ n = 'HOME: nothing NetApp at all';                                  e = $false
       adapters = @(WiFi 'lan'); ssid = 'Airtel_Home_5G'; search = @() }
)

# ---- Run ----
$pass = 0; $fail = 0
Write-Host ""
Write-Host "  Testing: $Script" -ForegroundColor Cyan
Write-Host ""
foreach ($s in $scenarios) {
    $data = @{ adapters = @($s.adapters); ssid = $s.ssid; search = @($s.search)
               locationOff = [bool]$s.locationOff; blocked = [bool]$s.blocked; profiles = @($s.profiles | Where-Object { $_ }) }
    $json = Join-Path $work 'scenario.json'
    $data | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $json -Encoding UTF8
    $env:OAT_SCENARIO = $json
    $env:OAT_TMP = $work

    $cmd = ". '$mock'; & '$target' '--dry-run'"
    $out = & $exe -NoProfile -ExecutionPolicy Bypass -Command $cmd 2>&1 | Out-String

    $got = $null
    if ($out -match 'On office net\s*:\s*(True|False)') { $got = ($matches[1] -eq 'True') }
    $reason = ''
    if ($out -match 'RESULT:\s*(.+)') { $reason = $matches[1].Trim() }

    if ($null -ne $got -and $got -eq $s.e) {
        $pass++
        Write-Host ("  PASS  {0}" -f $s.n) -ForegroundColor Green
    } else {
        $fail++
        Write-Host ("  FAIL  {0}" -f $s.n) -ForegroundColor Red
        Write-Host ("        expected office=$($s.e), got office=$got") -ForegroundColor Red
        if ($reason) { Write-Host "        $reason" -ForegroundColor DarkGray }
        if ($null -eq $got) { Write-Host ($out -split "`n" | Select-Object -First 30 | Out-String) -ForegroundColor DarkGray }
    }
}
Remove-Item -Recurse -Force -LiteralPath $work -ErrorAction SilentlyContinue
# On macOS the script's "$PSScriptRoot\auto-attendance.log" is a sibling file
# with a backslash in its name, not a file inside $work.
Remove-Item -Force -LiteralPath "$work\auto-attendance.log" -ErrorAction SilentlyContinue
Write-Host ""
$color = 'Green'
if ($fail) { $color = 'Red' }
Write-Host "  $pass passed, $fail failed" -ForegroundColor $color
Write-Host ""
if ($fail) { exit 1 }
exit 0
