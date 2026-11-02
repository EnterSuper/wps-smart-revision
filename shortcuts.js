/* Local hotkey mailbox. No document/selection polling and no document text on disk. */
(function(root){
'use strict';
if(root.SmartShortcuts)root.SmartShortcuts.stop();
var prefix='wps-smart-revision-',session='',timer=null,fs,events,sequence=0,lastId='',seen={},stamp=null;
function read(name){if(!fs.Exists(prefix+name+'.json'))return null;var s=fs.ReadFile(prefix+name+'.json');if(typeof s!=='string'||s.length>4096)return null;try{return JSON.parse(s);}catch(e){return null;}}
function write(name,value){fs.WriteFile(prefix+name+'.json',JSON.stringify(value));}
function snapshot(){var a=SmartHost.application();if(!a.Documents.Count)return null;var r=a.Selection.Range;return {doc:String(a.ActiveDocument.FullName),start:r.Start,end:r.End,story:r.StoryType};}
function same(a,b){return !!a&&!!b&&a.doc===b.doc&&a.start===b.start&&a.end===b.end&&a.story===b.story;}
function publish(){write('ready',{protocol:1,session:session,sequence:sequence,selected:!!stamp&&stamp.end>stamp.start,busy:false,version:SmartHost.version});}
function selectionChanged(){if(root.SmartBusy||root.SmartLoading)return;try{stamp=snapshot();sequence++;publish();}catch(e){stamp=null;}}
function lostFocus(){if(root.SmartBusy||root.SmartLoading)return;try{stamp=null;sequence++;publish();}catch(e){stamp=null;}}
function tick(){
 try{
  var req=read('request');if(!req||typeof req.id!=='string'||!/^[a-f0-9-]{36}$/.test(req.id)||req.id===lastId||seen[req.id])return;
  lastId=req.id;seen[req.id]=true;if(Object.keys(seen).length>256)seen={};seen[req.id]=true;
  var age=Date.now()-req.time,status='rejected';
  if(req.session===session&&req.sequence===sequence&&typeof req.time==='number'&&age>=0&&age<=1000&&!root.SmartBusy&&!root.SmartLoading&&(req.mode==='rich'||req.mode==='plain')&&same(stamp,snapshot())){
   write('response',{id:req.id,status:'received'});
   var ok=req.mode==='rich'?root.smartRichPaste():root.smartPlainPaste();status=ok===true?'completed':'stopped';
   sequence++;stamp=snapshot();publish();
  }
  write('response',{id:req.id,status:status});
 }catch(e){/* Failed reads and closing documents do not cause edits or retries. */}
}
function start(){
 if(timer)return;
 fs=SmartHost.api().FileSystem;events=SmartHost.api().ApiEvent;
 if(!fs||!events)throw Error('当前 WPS 未提供快捷键所需接口。');
 session=String(Date.now())+'-'+Math.random().toString(36).slice(2);
 var old=read('request');if(old&&old.id)seen[old.id]=true;
 stamp=snapshot();sequence++;publish();
 events.AddApiEventListener('WindowSelectionChange',selectionChanged);
 events.AddApiEventListener('WindowActivate',selectionChanged);
 events.AddApiEventListener('WindowDeactivate',lostFocus);
 events.AddApiEventListener('DocumentViewFocusIn',selectionChanged);
 events.AddApiEventListener('DocumentViewFocusOut',lostFocus);
 timer=root.setInterval(tick,200);
}
function stop(){if(timer)root.clearInterval(timer);timer=null;if(events){events.RemoveApiEventListener('WindowSelectionChange');events.RemoveApiEventListener('WindowActivate');events.RemoveApiEventListener('WindowDeactivate');events.RemoveApiEventListener('DocumentViewFocusIn');events.RemoveApiEventListener('DocumentViewFocusOut');}try{write('ready',{protocol:1,session:session,selected:false,stopped:true});}catch(e){}}
function directory(){return String(SmartHost.api().FileSystem.absoluteFilePath(prefix+'ready.json')).replace(/[^\\/]+$/,'');}
root.SmartShortcuts={start:start,stop:stop,directory:directory,tick:tick};
if(typeof module==='object'&&module.exports)module.exports=root.SmartShortcuts;
})(typeof window==='object'?window:globalThis);
