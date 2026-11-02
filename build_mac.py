"""Package a built public source tree for macOS. Build the helper first."""
from pathlib import Path
import hashlib,zipfile
ROOT=Path(__file__).resolve().parent
VERSION='1.3.0'
def build():
    helper=ROOT/'shortcuts/SmartRevisionKeys.app/Contents/MacOS/SmartRevisionKeys'
    if not helper.is_file():raise SystemExit('Run sh shortcuts/build-mac.sh first.')
    folder='WPS-Smart-Revision-Mac-'+VERSION
    out=ROOT/'dist';out.mkdir(exist_ok=True);archive=out/(folder+'.zip')
    # Exclude development/local state; this builder is intended for the clean public export.
    names=['README.md','LICENSE','CONTRIBUTING.md','install.py','安装或更新.command','ribbon.xml','host.js','main.js','js/main.js','live.js','rich.js','plan.js','shortcuts.js','panel.html','panel.css','panel.js','compatibility.html','compatibility.css','compatibility.js','compatibility-ui.js','qa/test-report.html','vendor/diff-browser.js','vendor/LICENSE-jsdiff']
    names += [str(p.relative_to(ROOT)) for p in (ROOT/'images').glob('*.svg')]
    names += [str(p.relative_to(ROOT)) for p in (ROOT/'docs').glob('*.md')]
    names += [str(p.relative_to(ROOT)) for p in (ROOT/'shortcuts/SmartRevisionKeys.app').rglob('*') if p.is_file()]
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for n in sorted(names):z.write(ROOT/n,folder+'/'+n)
    (out/(archive.name+'.sha256')).write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
    return archive
if __name__=='__main__':print(build())
