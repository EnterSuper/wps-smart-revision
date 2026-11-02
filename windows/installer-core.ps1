# Shared installer filesystem logic. Compatible with Windows PowerShell 5.1.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
function Get-SmartHash([string]$Path) {
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return '' }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}
function Assert-SmartPlainPath([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        if (((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Refusing a symbolic link or junction: $Path"
        }
    }
}
function Invoke-SmartInstall {
    param([Parameter(Mandatory=$true)][string]$Source,
          [Parameter(Mandatory=$true)][string]$Base,
          [ValidateSet('Install','Uninstall')][string]$Action='Install',
          [scriptblock]$BeforeCommitForTest=$null)
    $name='local_smart_revision'; $version='1.3.0'; $folder=$name+'_'+$version
    $Base=[IO.Path]::GetFullPath($Base); $Source=[IO.Path]::GetFullPath($Source)
    Assert-SmartPlainPath $Base
    [IO.Directory]::CreateDirectory($Base) | Out-Null
    $lockPath=Join-Path $Base '.smart-revision-install.lock'
    Assert-SmartPlainPath $lockPath
    $lock=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    $stage=$null; $previous=$null; $installed=$false; $committed=$false; $temporary=$null
    try {
        $manifest=Join-Path $Base 'publish.xml'; Assert-SmartPlainPath $manifest
        $initialHash=Get-SmartHash $manifest
        $xml=New-Object System.Xml.XmlDocument; $xml.PreserveWhitespace=$true; $xml.XmlResolver=$null
        if ($initialHash) {
            $settings=New-Object System.Xml.XmlReaderSettings
            $settings.DtdProcessing=[System.Xml.DtdProcessing]::Prohibit; $settings.XmlResolver=$null
            $reader=[System.Xml.XmlReader]::Create($manifest,$settings)
            try { $xml.Load($reader) } finally { $reader.Dispose() }
        } else { $xml.LoadXml('<?xml version="1.0" encoding="utf-8"?><jsplugins/>') }
        if ($xml.DocumentElement.Name -cne 'jsplugins' -or $xml.DocumentElement.NamespaceURI) { throw 'Unexpected publish.xml format; unchanged.' }
        $own=@($xml.DocumentElement.SelectNodes("*[@name='$name']"))
        foreach ($entry in $own) {
            if ($entry.LocalName -notin @('jsplugin','jspluginonline')) { throw 'Unknown registration type; unchanged.' }
            [void]$xml.DocumentElement.RemoveChild($entry)
        }
        $destination=Join-Path $Base $folder; Assert-SmartPlainPath $destination
        $token=[guid]::NewGuid().ToString('N')
        if ($Action -eq 'Install') {
            $spec=Get-Content -LiteralPath (Join-Path $Source 'payload.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($spec.version -ne $version -or $spec.name -ne $name) { throw 'Package version/name mismatch.' }
            $stage=Join-Path $Base ('.smart-stage-'+$token); [IO.Directory]::CreateDirectory($stage) | Out-Null
            $seen=@{}; $count=0
            foreach ($item in $spec.files) {
                $relative=[string]$item.path
                if ($relative -notmatch '^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)*$' -or $seen.ContainsKey($relative)) { throw "Unsafe/duplicate package path: $relative" }
                $seen[$relative]=$true; $count++
                $sourceFile=Join-Path (Join-Path $Source 'payload') $relative
                Assert-SmartPlainPath $sourceFile
                $sourceParent=Split-Path -Parent $sourceFile
                while ($sourceParent.Length -gt $Source.Length) { Assert-SmartPlainPath $sourceParent; $sourceParent=Split-Path -Parent $sourceParent }
                if ($item.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or (Get-SmartHash $sourceFile) -ne $item.sha256) { throw "Package integrity check failed: $relative" }
                $output=Join-Path $stage $relative; [IO.Directory]::CreateDirectory((Split-Path -Parent $output)) | Out-Null
                [IO.File]::Copy($sourceFile,$output,$false)
                if ((Get-SmartHash $output) -ne $item.sha256) { throw "Copy check failed: $relative" }
            }
            if ($count -lt 10 -or !$seen.ContainsKey('js/main.js') -or !$seen.ContainsKey('main.js') -or !$seen.ContainsKey('ribbon.xml') -or !$seen.ContainsKey('host.js') -or !$seen.ContainsKey('compatibility.js')) { throw 'Incomplete package.' }
            $entry=$xml.CreateElement('jsplugin')
            foreach ($pair in @(@('name',$name),@('type','wps'),@('url',$folder),@('version',$version),@('enable','enable_dev'),@('install','null'),@('customDomain',''))) { $entry.SetAttribute($pair[0],$pair[1]) }
            [void]$xml.DocumentElement.AppendChild($entry)
        }
        $temporary=Join-Path $Base ('publish.smart-'+$token+'.tmp')
        $writerSettings=New-Object System.Xml.XmlWriterSettings
        $writerSettings.Encoding=New-Object System.Text.UTF8Encoding($false)
        $writerSettings.Indent=$true
        $writer=[System.Xml.XmlWriter]::Create($temporary,$writerSettings)
        try { $xml.Save($writer) } finally { $writer.Dispose() }
        if ($Action -eq 'Install') {
            if (Test-Path -LiteralPath $destination) {
                $previous=Join-Path $Base ('.smart-previous-'+$token)
                [IO.Directory]::Move($destination,$previous)
            }
            [IO.Directory]::Move($stage,$destination); $stage=$null; $installed=$true
        }
        if ($BeforeCommitForTest) { & $BeforeCommitForTest }
        if ((Get-SmartHash $manifest) -ne $initialHash) { throw 'publish.xml changed during install; retry after closing WPS.' }
        if ($initialHash) {
            $backup=Join-Path $Base ('publish.before-smart-'+$token+'.xml.bak')
            [IO.File]::Replace($temporary,$manifest,$backup)
        } else { [IO.File]::Move($temporary,$manifest) }
        $temporary=$null; $committed=$true
        return [pscustomobject]@{Action=$Action;Version=$version;Directory=$destination;Manifest=$manifest;PreviousDirectory=$previous}
    } catch {
        if (!$committed) {
            if ($installed -and (Test-Path -LiteralPath $destination)) { [IO.Directory]::Delete($destination,$true) }
            if ($previous -and (Test-Path -LiteralPath $previous)) { [IO.Directory]::Move($previous,$destination) }
        }
        throw
    } finally {
        if ($stage -and (Test-Path -LiteralPath $stage)) { [IO.Directory]::Delete($stage,$true) }
        if ($temporary -and (Test-Path -LiteralPath $temporary)) { [IO.File]::Delete($temporary) }
        $lock.Dispose()
    }
}
