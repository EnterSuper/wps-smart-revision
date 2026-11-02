#!/usr/bin/env python3
"""Install the offline add-in using a staged directory; never modifies documents."""
from pathlib import Path
import shutil, sys, tempfile, uuid
import xml.etree.ElementTree as ET
NAME='local_smart_revision'
VERSION='1.3.0'
SOURCE=Path(__file__).resolve().parent
BASE=Path.home()/'Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons'
def main():
    BASE.mkdir(parents=True,exist_ok=True)
    manifest=BASE/'publish.xml'
    tree=ET.parse(manifest) if manifest.exists() else ET.ElementTree(ET.Element('jsplugins'))
    root=tree.getroot()
    if root.tag!='jsplugins':raise RuntimeError('配置格式异常，未修改')
    previous=[x for x in root if x.get('name')==NAME]
    # Offline WPS packages use name_version for both the registered URL and
    # the installed folder. Never retain an older folder after a version bump.
    folder=NAME+'_'+VERSION
    destination=BASE/folder
    if '--remove' not in sys.argv:
        staged=Path(tempfile.mkdtemp(prefix='.smart-stage-',dir=BASE))
        files=['shortcuts.js','host.js','compatibility.html','compatibility.css','compatibility.js','compatibility-ui.js','ribbon.xml','main.js','js/main.js','live.js','rich.js','plan.js','panel.html','panel.css','panel.js','qa/test-report.html','vendor/diff-browser.js','vendor/LICENSE-jsdiff']
        files += [str(p.relative_to(SOURCE)) for p in sorted((SOURCE/'images').glob('*.svg'))]
        for name in files:
            target=staged/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(SOURCE/name,target)
        shutil.copytree(SOURCE/'shortcuts/SmartRevisionKeys.app',staged/'shortcuts/SmartRevisionKeys.app')
        # Seed the same entry used by WPS-generated offline pages, including
        # on a clean install where no previous generated index exists.
        (staged/'index.html').write_text("<!DOCTYPE html>\n<html><head><meta charset='utf-8'>\n<script src='js/main.js'></script></head><body></body></html>\n",encoding='utf-8')
        backup=BASE/('.smart-previous-'+uuid.uuid4().hex)
        if destination.exists():destination.rename(backup)
        try:staged.rename(destination)
        except Exception:
            if backup.exists():backup.rename(destination)
            raise
    for item in previous:root.remove(item)
    if '--remove' not in sys.argv:ET.SubElement(root,'jsplugin',name=NAME,type='wps',url=folder,version=VERSION,enable='enable_dev',install='null',customDomain='')
    if manifest.exists():shutil.copy2(manifest,BASE/'publish.before-smart-revision.xml.bak')
    temporary=BASE/('publish.'+uuid.uuid4().hex+'.tmp');tree.write(temporary,encoding='utf-8',xml_declaration=True);temporary.replace(manifest)
    print('已停用插件，文档未修改。' if '--remove' in sys.argv else '已安装智能修订 '+VERSION+'。')
    print('WPS 下次启动会读取新版；开发热重载可在不退出 WPS 的情况下刷新。')
if __name__=='__main__':main()
