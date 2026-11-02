#!/usr/bin/env python3
"""Build a portable Windows-only delivery from an explicit, public asset list."""
from pathlib import Path
import hashlib, json, shutil, zipfile
ROOT=Path(__file__).resolve().parent
VERSION='1.3.0'
ASSETS=['shortcuts.js','shortcuts/SmartRevisionKeys.cs','host.js','main.js','js/main.js','live.js','plan.js','rich.js','ribbon.xml',
        'panel.html','panel.css','panel.js','compatibility.html','compatibility.css',
        'compatibility.js','compatibility-ui.js','vendor/diff-browser.js','vendor/LICENSE-jsdiff']
ASSETS += ['images/'+p.name for p in sorted((ROOT/'images').glob('*.svg'))]
def build(output=None):
    output=Path(output) if output else ROOT/'dist'
    output.mkdir(parents=True,exist_ok=True)
    folder=output/('WPS-Smart-Revision-Windows-'+VERSION)
    if folder.exists():shutil.rmtree(folder)
    payload=folder/'payload';payload.mkdir(parents=True)
    files=[]
    for name in ASSETS:
        content=(ROOT/name).read_text(encoding='utf-8')
        if name=='ribbon.xml':content=content.replace('label="本机自检"','label="Windows 自检"')
        data=content.replace('\r\n','\n').replace('\n','\r\n').encode('utf-8')
        target=payload/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        files.append({'path':name,'sha256':hashlib.sha256(data).hexdigest()})
    # Do not distribute personal paper names, papers, or Mac QA logs.
    report=(ROOT/'windows/test-report.html').read_bytes()
    (payload/'qa').mkdir();(payload/'qa/test-report.html').write_bytes(report)
    files.append({'path':'qa/test-report.html','sha256':hashlib.sha256(report).hexdigest()})
    (folder/'payload.json').write_text(json.dumps({'name':'local_smart_revision','version':VERSION,'files':files},indent=2),encoding='utf-8')
    (folder/'windows').mkdir()
    for name in ['installer-core.ps1','install.ps1']:
        data=(ROOT/'windows'/name).read_text(encoding='utf-8-sig').replace('\r\n','\n').replace('\n','\r\n')
        (folder/'windows'/name).write_bytes(data.encode('utf-8-sig'))
    for name in ['install-windows.cmd','uninstall-windows.cmd']:
        data=(ROOT/'windows'/name).read_text(encoding='ascii').replace('\r\n','\n').replace('\n','\r\n')
        (folder/name).write_bytes(data.encode('ascii'))
    shutil.copy2(ROOT/'windows/README.html',folder/'README.html')
    shutil.copy2(ROOT/'windows/README.html',folder/'部署与使用教程.html')
    quick=(ROOT/'windows/quick-start.txt').read_text(encoding='utf-8').replace('\r\n','\n').replace('\n','\r\n')
    (folder/'先看这里.txt').write_bytes(quick.encode('utf-8-sig'))
    (folder/'docs').mkdir()
    for name in ['SHORTCUTS.md','TESTING.md','RELATED_TOOLS.md']:
        shutil.copy2(ROOT/'docs'/name,folder/'docs'/name)
    shutil.copy2(ROOT/'LICENSE',folder/'LICENSE')
    archive=output/(folder.name+'.zip')
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for p in sorted(folder.rglob('*')):
            if p.is_file():z.write(p,p.relative_to(output))
    (output/(archive.name+'.sha256')).write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
    return folder,archive
if __name__=='__main__':
    folder,archive=build();print(archive);print('bytes:',archive.stat().st_size)
