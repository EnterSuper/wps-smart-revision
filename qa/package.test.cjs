const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('host, installers and builders use the release package version',()=>{
 const root=path.join(__dirname,'..'),version=require('../package.json').version;
 for(const name of ['host.js','install.py','build_windows.py','build_mac.py','windows/installer-core.ps1']){
  const source=fs.readFileSync(path.join(root,name),'utf8');
  const found=source.match(/(?:VERSION|version)='([0-9.]+)'/);
  assert.ok(found,name+' must declare a release version');assert.equal(found[1],version,name+' release mismatch');
 }
});
