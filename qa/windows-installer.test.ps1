param([string]$Package)
$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'windows/installer-core.ps1')
$root=Join-Path ([IO.Path]::GetTempPath()) ('smart-installer-test-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$results=New-Object System.Collections.Generic.List[object]
function Assert($value,[string]$message){if(!$value){throw $message}}
function Test([string]$name,[scriptblock]$run){& $run; $results.Add([pscustomobject]@{name=$name;status='pass'})}
function Reject([scriptblock]$run){$caught=$false;try{& $run | Out-Null}catch{$caught=$true};Assert $caught 'Expected refusal'}
try {
 $base=Join-Path $root '中文 用户路径/jsaddons';[IO.Directory]::CreateDirectory($base)|Out-Null
 $manifest=Join-Path $base 'publish.xml'
 [IO.File]::WriteAllText($manifest,'<?xml version="1.0"?><jsplugins><!--保留--><jspluginonline name="other" url="https://example.invalid/a?x=1&amp;y=2" type="et" custom="原样"/></jsplugins>')
 Test 'fresh install preserves other plugins, comments, Unicode and XML escaping' {
  $r=Invoke-SmartInstall -Source $Package -Base $base
  [xml]$x=[IO.File]::ReadAllText($manifest)
  Assert ($x.jsplugins.jspluginonline.custom -eq '原样') 'Other attribute changed'
  Assert ($x.jsplugins.jspluginonline.url -eq 'https://example.invalid/a?x=1&y=2') 'XML escaped URL changed'
  Assert ([IO.File]::ReadAllText($manifest).Contains('<!--保留-->')) 'Comment lost'
  Assert (Test-Path -LiteralPath (Join-Path $r.Directory 'js/main.js')) 'Payload absent'
 }
 Test 'repeat install has one own registration and backs up prior files' {
  $r=Invoke-SmartInstall -Source $Package -Base $base
  [xml]$x=[IO.File]::ReadAllText($manifest)
  Assert ($x.SelectNodes('/jsplugins/jsplugin[@name="local_smart_revision"]').Count -eq 1) 'Duplicate own registration'
  Assert (Test-Path -LiteralPath $r.PreviousDirectory) 'Old payload not backed up'
 }
 $destination=Join-Path $base 'local_smart_revision_1.3.0'
 $oldHash=Get-SmartHash $manifest;$oldMain=Get-SmartHash (Join-Path $destination 'js/main.js')
 Test 'commit failure restores payload and preserves original manifest bytes' {
  Reject {Invoke-SmartInstall -Source $Package -Base $base -BeforeCommitForTest {throw 'Injected commit failure'}}
  Assert ((Get-SmartHash $manifest) -eq $oldHash) 'Manifest changed after failure'
  Assert ((Get-SmartHash (Join-Path $destination 'js/main.js')) -eq $oldMain) 'Payload not restored'
 }
 Test 'concurrent manifest changes are never overwritten' {
  Reject {Invoke-SmartInstall -Source $Package -Base $base -BeforeCommitForTest {[IO.File]::AppendAllText($manifest,"`n<!--concurrent-->")}}
  Assert ([IO.File]::ReadAllText($manifest).Contains('<!--concurrent-->')) 'Concurrent writer lost'
  Assert ((Get-SmartHash (Join-Path $destination 'js/main.js')) -eq $oldMain) 'Old payload not restored'
 }
 Test 'uninstall removes only own registration and keeps payload' {
  Invoke-SmartInstall -Source $Package -Base $base -Action Uninstall | Out-Null
  [xml]$x=[IO.File]::ReadAllText($manifest)
  Assert ($x.SelectNodes('/jsplugins/*[@name="local_smart_revision"]').Count -eq 0) 'Own registration remained'
  Assert ($x.jsplugins.jspluginonline.name -eq 'other') 'Other plugin removed'
  Assert (Test-Path -LiteralPath $destination) 'Uninstall deleted payload'
 }
 Test 'malformed XML is rejected without overwriting' {
  [IO.File]::WriteAllText($manifest,'<broken>');$hash=Get-SmartHash $manifest
  Reject {Invoke-SmartInstall -Source $Package -Base $base}
  Assert ((Get-SmartHash $manifest) -eq $hash) 'Malformed manifest overwritten'
 }
 Test 'external XML entities are prohibited' {
  [IO.File]::WriteAllText($manifest,'<!DOCTYPE jsplugins [<!ENTITY e SYSTEM "file:///etc/passwd">]><jsplugins>&e;</jsplugins>');$hash=Get-SmartHash $manifest
  Reject {Invoke-SmartInstall -Source $Package -Base $base}
  Assert ((Get-SmartHash $manifest) -eq $hash) 'DTD manifest changed'
 }
 [IO.File]::WriteAllText($manifest,'<jsplugins/>')
 $bad=Join-Path $root 'bad-package';Copy-Item -LiteralPath $Package -Destination $bad -Recurse
 Test 'corrupt asset is rejected before configuration changes' {
  $hash=Get-SmartHash $manifest
  [IO.File]::AppendAllText((Join-Path $bad 'payload/live.js'),'corrupt')
  Reject {Invoke-SmartInstall -Source $bad -Base $base}
  Assert ((Get-SmartHash $manifest) -eq $hash) 'Manifest changed for corrupt package'
 }
 Test 'traversal and duplicate-case package paths are rejected' {
  $spec=Get-Content -LiteralPath (Join-Path $bad 'payload.json') -Raw|ConvertFrom-Json
  $spec.files[0].path='../escape.js';$spec|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $bad 'payload.json') -Encoding UTF8
  Reject {Invoke-SmartInstall -Source $bad -Base $base}
  $spec=Get-Content -LiteralPath (Join-Path $Package 'payload.json') -Raw|ConvertFrom-Json
  $spec.files=@($spec.files)+@([pscustomobject]@{path='HOST.js';sha256=$spec.files[0].sha256})
  $spec|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $bad 'payload.json') -Encoding UTF8
  Copy-Item -LiteralPath (Join-Path $Package 'payload/live.js') -Destination (Join-Path $bad 'payload/live.js') -Force
  Reject {Invoke-SmartInstall -Source $bad -Base $base}
 }
 $results|ConvertTo-Json -Depth 4
} finally {Remove-Item -LiteralPath $root -Recurse -Force}
