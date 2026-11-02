"""Export public sources from an explicit allowlist; never copy private QA trees."""
from pathlib import Path
import shutil
from build_windows import ASSETS
ROOT=Path(__file__).resolve().parent
EXTRA=['vendor/diff-array.cjs','LICENSE','CONTRIBUTING.md','.gitignore','package.json','package-lock.json','plan.test.js',
       'install.py','安装或更新.command','build_windows.py','build_mac.py','build_public.py',
       'shortcuts/SmartRevisionKeys.m','shortcuts/SmartRevisionKeys.cs','shortcuts/build-mac.sh',
       'shortcuts/SmartRevisionKeys.app/Contents/Info.plist']
def export(target):
    target=Path(target)
    target.mkdir(parents=True,exist_ok=True)
    names=list(dict.fromkeys(ASSETS+EXTRA))
    names += [str(p.relative_to(ROOT)) for p in (ROOT/'qa').glob('*.cjs')]
    names += ['qa/windows-installer.test.ps1']
    names += [str(p.relative_to(ROOT)) for p in (ROOT/'windows').glob('*') if p.is_file()]
    names += [str(p.relative_to(ROOT)) for p in (ROOT/'docs').glob('*.md') if p.name!='PUBLIC_README.md']
    names += [str(p.relative_to(ROOT)) for p in (ROOT/'.github').rglob('*') if p.is_file()]
    names += [str(p.relative_to(ROOT)) for p in (ROOT/'docs/media').glob('*') if p.is_file()]
    for name in names:
        p=target/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/name,p)
    readme=ROOT/'docs/PUBLIC_README.md'
    if not readme.exists():readme=ROOT/'README.md'
    shutil.copy2(readme,target/'README.md')
    (target/'qa').mkdir(exist_ok=True);shutil.copy2(ROOT/'windows/test-report.html',target/'qa/test-report.html')
    return target
if __name__=='__main__':
    import sys
    if len(sys.argv)!=2:raise SystemExit('Usage: python3 build_public.py OUTPUT_DIRECTORY')
    print(export(sys.argv[1]))
