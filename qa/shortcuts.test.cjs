const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 const files=new Map(),events={},calls=[],timers=[],app={Documents:{Count:1},ActiveDocument:{FullName:'temporary-test'},Selection:{Range:{Start:0,End:5,StoryType:1}}};
 let snapshots=0;Object.defineProperty(app,'ActiveDocument',{get(){snapshots++;return {FullName:'temporary-test'};}});
 const host={FileSystem:{Exists:p=>files.has(p),ReadFile:p=>files.get(p),WriteFile:(p,v)=>files.set(p,v),absoluteFilePath:p=>'/test/'+p},ApiEvent:{AddApiEventListener:(e,f)=>events[e]=f,RemoveApiEventListener:e=>delete events[e]}};
 const scope={Date,Math,JSON,setInterval:f=>{timers.push(f);return 1;},clearInterval:()=>{},SmartHost:{api:()=>host,application:()=>app,version:'test'},smartRichPaste:()=>{calls.push('rich');return true;},smartPlainPaste:()=>{calls.push('plain');return true;}};
 scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync(require.resolve('../shortcuts.js'),'utf8'),scope);scope.SmartShortcuts.start();
 function ready(){return JSON.parse(files.get('wps-smart-revision-ready.json'));}
 function request(patch={}){const r=ready();const q={id:'00000000-0000-4000-8000-000000000001',session:r.session,sequence:r.sequence,time:Date.now(),mode:'rich',...patch};files.set('wps-smart-revision-request.json',JSON.stringify(q));scope.SmartShortcuts.tick();return q;}
 return {scope,files,events,calls,app,ready,request,snapshots:()=>snapshots};
}
test('rich and plain modes dispatch synchronously to the existing native entry',()=>{for(const mode of ['rich','plain']){let f=fixture();f.request({mode});assert.deepEqual(f.calls,[mode]);assert.match(f.files.get('wps-smart-revision-response.json'),/completed/);}});
test('one request cannot execute twice',()=>{let f=fixture();f.request();f.scope.SmartShortcuts.tick();assert.equal(f.calls.length,1);});
test('stale, future, wrong session, bad mode and malformed ids never edit',()=>{for(const q of [{time:Date.now()-2000},{time:Date.now()+5000},{session:'old'},{mode:'eval'},{id:'bad'}]){const f=fixture();f.request(q);assert.equal(f.calls.length,0);}});
test('a changed selection without an event still prevents dispatch',()=>{const f=fixture();f.app.Selection.Range.End=4;f.request();assert.equal(f.calls.length,0);});
test('selection event rotates context and invalidates a captured request',()=>{const f=fixture(),old=f.ready();f.app.Selection.Range.End=4;f.events.WindowSelectionChange();f.request({sequence:old.sequence});assert.equal(f.calls.length,0);});
test('busy handlers never dispatch or queue a retry',()=>{const f=fixture();f.scope.SmartBusy=true;f.request();f.scope.SmartBusy=false;f.scope.SmartShortcuts.tick();assert.equal(f.calls.length,0);});
test('idle ticks do not inspect the document or write heartbeat files',()=>{const f=fixture(),before=f.snapshots(),content=[...f.files];for(let i=0;i<100;i++)f.scope.SmartShortcuts.tick();assert.equal(f.snapshots(),before);assert.deepEqual([...f.files],content);});
test('stop removes listeners and makes readiness unavailable',()=>{const f=fixture();f.scope.SmartShortcuts.stop();assert.deepEqual(Object.keys(f.events),[]);assert.equal(f.ready().selected,false);assert.equal(f.ready().stopped,true);});
test('malformed or oversized local requests are ignored',()=>{const f=fixture();for(const s of ['{', 'x'.repeat(5000),'null']){f.files.set('wps-smart-revision-request.json',s);f.scope.SmartShortcuts.tick();}assert.equal(f.calls.length,0);});
test('paste failure is reported as stopped rather than completed',()=>{const f=fixture();f.scope.smartRichPaste=()=>false;f.request();assert.match(f.files.get('wps-smart-revision-response.json'),/stopped/);});
test('leaving the document focus disables requests until a fresh context exists',()=>{const f=fixture();const old=f.ready();f.events.DocumentViewFocusOut();assert.equal(f.ready().selected,false);f.request({sequence:old.sequence});assert.equal(f.calls.length,0);f.events.DocumentViewFocusIn();assert.equal(f.ready().selected,true);});
