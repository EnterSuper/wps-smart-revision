#requires -Version 5.1
param([ValidateSet('Install','Uninstall')][string]$Action='Install')
$ErrorActionPreference='Stop'
try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'This installer is for Windows 11. Do not run it on macOS.' }
    if (![Environment]::GetFolderPath('ApplicationData')) { throw 'Cannot locate the current user AppData folder.' }
    if (Get-Process -Name wps,wpp,et -ErrorAction SilentlyContinue) { throw 'Please save your documents and exit WPS Writer/Spreadsheet/Presentation, then retry. No process was closed.' }
    . (Join-Path $PSScriptRoot 'installer-core.ps1')
    $source=Split-Path -Parent $PSScriptRoot
    $base=Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'kingsoft\wps\jsaddons'
    $result=Invoke-SmartInstall -Source $source -Base $base -Action $Action
    if ($Action -eq 'Install') {
        $compiler=Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'csc.exe'
        if (!(Test-Path -LiteralPath $compiler)) { $compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe' }
        $helperDir=Join-Path $base 'local_smart_revision_1.3.0\shortcuts'
        $helperExe=Join-Path $helperDir 'SmartRevisionKeys.exe'
        if (Test-Path -LiteralPath $compiler) {
            & $compiler /nologo /codepage:65001 /target:winexe /optimize+ "/out:$helperExe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $helperDir 'SmartRevisionKeys.cs')
            if ($LASTEXITCODE -ne 0) { Write-Warning 'Shortcut helper build failed. Toolbar paste is still available.' }
        } else { Write-Warning 'The built-in .NET Framework compiler is unavailable. Toolbar paste is still available.' }
        Write-Host 'Installed Smart Revision 1.3.0 (Windows adaptation).' -ForegroundColor Green
        Write-Host 'Open WPS Writer > Smart Revision (Chinese tab) > Windows self-test.'
        Write-Host 'Installation success does not certify WPS compatibility; run the in-app tests first.'
    } else { Write-Host 'Plugin registration removed. Documents and other plugins were preserved.' -ForegroundColor Green }
    Write-Host ('Config: '+$result.Manifest)
    exit 0
} catch { Write-Host ('FAILED: '+$_.Exception.Message) -ForegroundColor Red; exit 1 }
