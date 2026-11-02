const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture({windows=true,alias=false,storage=true}={}){
 const data=new Map(),app={Documents:{Count:0},Version:'12.0',Build:'test-build'},host={WpsApplication:()=>app};
 if(storage)host.PluginStorage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const scope={navigator:{platform:windows?'Win32':'MacIntel',userAgent:windows?'Windows test browser':'Mac test browser'},URL,location:{href:'file:///C:/plugin/index.html'},module:{exports:{}}};
 if(alias){scope.Application=Object.assign(app,{PluginStorage:host.PluginStorage});}else scope.wps=host;
 vm.createContext(scope);vm.runInContext(fs.readFileSync(require.resolve('../host.js'),'utf8'),scope);
 return {scope,app,host,data,api:scope.SmartHost};
}
test('Windows global Application host and WpsApplication host resolve',()=>{for(const alias of [false,true]){const f=fixture({alias});assert.equal(f.api.application(),f.app);assert.equal(f.api.isWindows(),true);}});
test('Windows has no approval before a successful native check',()=>{const f=fixture();assert.throws(()=>f.api.ensureReady(f.app,'text'),/自检/);assert.throws(()=>f.api.ensureReady(f.app,'rich'),/自检/);});
test('text approval does not enable rich paste',()=>{const f=fixture();f.api.save(f.app,{text:true,rich:false});f.api.ensureReady(f.app,'text');assert.throws(()=>f.api.ensureReady(f.app,'rich'),/格式/);});
test('successful native checks enable both entries; rerun failure revokes approval',()=>{const f=fixture();f.api.save(f.app,{text:true,rich:true});f.api.ensureReady(f.app,'rich');f.api.save(f.app,{text:false,rich:false});assert.throws(()=>f.api.ensureReady(f.app,'rich'));});
test('a changed WPS build cannot reuse previous approval',()=>{const f=fixture();f.api.save(f.app,{text:true,rich:true});f.app.Build='new-build';assert.equal(f.api.result(f.app),null);assert.throws(()=>f.api.ensureReady(f.app,'text'));});
test('invalid storage contents never enable document operations',()=>{const f=fixture();f.data.set('SmartRevisionCompatibility','bad JSON');assert.throws(()=>f.api.ensureReady(f.app,'text'));f.data.set('SmartRevisionCompatibility',JSON.stringify({identity:f.api.identity(f.app),text:'true'}));assert.throws(()=>f.api.ensureReady(f.app,'text'));});
test('unavailable shared storage fails explicitly',()=>{const f=fixture({storage:false});assert.throws(()=>f.api.save(f.app,{text:true,rich:true}),/存储/);});
test('Mac existing workflow does not require Windows approval',()=>{const f=fixture({windows:false});f.api.ensureReady(f.app,'text');f.api.ensureReady(f.app,'rich');});
test('ShowDialog uses host API and resolves path relative to plugin, not cwd',()=>{const f=fixture();let got;f.host.ShowDialog=(...args)=>got=args;f.api.show('compatibility.html','test',680,720);assert.equal(got[0],'file:///C:/plugin/compatibility.html');});
test('default smart paste delegates to the rich handler',()=>{const f=fixture();vm.runInContext(fs.readFileSync(require.resolve('../live.js'),'utf8'),f.scope);let called=0;f.scope.smartRichPaste=()=>{called++;};f.scope.smartPaste();assert.equal(called,1);assert.equal(typeof f.scope.smartPlainPaste,'function');});
test('Windows plain entry checks approval before selecting or editing any document',()=>{const f=fixture();vm.runInContext(fs.readFileSync(require.resolve('../live.js'),'utf8'),f.scope);let message='',selected=false;f.scope.smartAlert=s=>message=s;f.scope.smartSelection=()=>{selected=true;throw Error('unexpected selection');};f.scope.smartPlainPaste();assert.match(message,/自检/);assert.equal(selected,false);});
test('Windows rich entry checks approval before reading clipboard or editing a document',()=>{const f=fixture();vm.runInContext(fs.readFileSync(require.resolve('../live.js'),'utf8'),f.scope);let message='',selected=false;f.scope.smartAlert=s=>message=s;f.scope.smartSelection=()=>{selected=true;throw Error('unexpected selection');};f.scope.smartRichPaste();assert.match(message,/自检/);assert.equal(selected,false);});
