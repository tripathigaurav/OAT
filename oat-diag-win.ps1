# OAT - Windows false-mark diagnostics (read-only)
# Run at HOME, in normal PowerShell. Ideally run twice: once with VPN off, once with VPN on.
#   powershell -ExecutionPolicy Bypass -File oat-diag-win.ps1
# (or paste the whole thing into a PowerShell window)
# Output: oat-diag-<timestamp>.txt on the Desktop - send that file back.

$out = Join-Path ([Environment]::GetFolderPath('Desktop')) ("oat-diag-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".txt")
$oat = "$env:LOCALAPPDATA\OAT"
function S($t) { "`r`n===== $t =====" | Out-File $out -Append -Encoding utf8 }
function R($t, [scriptblock]$b) { S $t; try { & $b 2>&1 | Out-String -Width 300 | Out-File $out -Append -Encoding utf8 } catch { "ERR: $($_.Exception.Message)" | Out-File $out -Append -Encoding utf8 } }

R 'Time / OS build'        { Get-Date; $v = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'; "$($v.ProductName) $($v.DisplayVersion) build $($v.CurrentBuild).$($v.UBR)" }
R 'Installed script ver'   { Select-String -Path "$oat\auto-attendance.ps1" -Pattern 'SCRIPT_VERSION =|ALLOW_SEARCH_LIST_FALLBACK =' }
R 'auto-attendance.log'    { Get-Content "$oat\auto-attendance.log" -Tail 300 }
R 'watcher.log'            { if (Test-Path "$oat\watcher.log") { Get-Content "$oat\watcher.log" -Tail 100 } else { '(no watcher - scheduled task mode)' } }
R 'Lock files'             { Get-ChildItem "$env:TEMP\oat-automark-*.lock" | Select-Object Name, LastWriteTime }
R 'Scheduled task'         { Get-ScheduledTask -TaskName OAT-WiFiAttendance | Select-Object TaskName, State; Get-ScheduledTaskInfo -TaskName OAT-WiFiAttendance | Select-Object LastRunTime, LastTaskResult, NextRunTime }
R 'DRY RUN (current net)'  { powershell -NoProfile -ExecutionPolicy Bypass -File "$oat\auto-attendance.ps1" --dry-run *>&1 }
R 'netsh wlan interfaces'  { netsh wlan show interfaces }
R 'Location permission'    { Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location' -Name Value; Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location' -Name Value; Get-Service lfsvc | Select-Object Name, Status }
R 'Net adapters'           { Get-NetAdapter -IncludeHidden | Select-Object Name, InterfaceDescription, Status, MediaConnectionState | Format-Table -AutoSize }
R 'Connection profiles'    { Get-NetConnectionProfile | Select-Object InterfaceAlias, Name, NetworkCategory, IPv4Connectivity | Format-Table -AutoSize }
R 'Get-DnsClient suffixes' { Get-DnsClient | Select-Object InterfaceAlias, InterfaceIndex, ConnectionSpecificSuffix, ConnectionSpecificSuffixSearchList | Format-Table -AutoSize }
R 'WMI DNSDomain'          { Get-WmiObject Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" | Select-Object Index, Description, DNSDomain, DNSDomainSuffixSearchOrder, DHCPEnabled, IPAddress | Format-List }
R 'Global search list'     { Get-DnsClientGlobalSetting | Select-Object SuffixSearchList, UseSuffixSearchList }
R 'GPO DNS suffix policy'  { Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' -ErrorAction SilentlyContinue }
R 'ipconfig /all'          { ipconfig /all }
R 'Task Scheduler history' { Get-WinEvent -LogName 'Microsoft-Windows-TaskScheduler/Operational' -MaxEvents 3000 | Where-Object { $_.Message -like '*OAT-WiFiAttendance*' } | Select-Object -First 40 TimeCreated, Id, Message | Format-List }
R 'Network events (7d)'    { Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-NetworkProfile/Operational'; Id=10000,10001; StartTime=(Get-Date).AddDays(-7) } -MaxEvents 60 | Select-Object TimeCreated, Id, Message | Format-List }

Write-Host "Saved: $out" -ForegroundColor Green
