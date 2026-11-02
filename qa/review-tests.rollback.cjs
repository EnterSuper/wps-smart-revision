// Fault-injection regression tests; no WPS UI or user files are changed.
// These assertions expose cleanup/rollback failures in the initial implementation.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {plan}=require('../plan');
function scenario(fail) {
  let value='甲乙丙', tracking=false, undoCalls=0, restoreAttempts=0, bold=false;
  const empty={Count:0,Item(){throw Error('out of bounds');}};
  const doc={
    Revisions:empty,
    TrackFormatting:false,
    get Content(){return {End:value.length,Text:value,TextRetrievalMode:{IncludeHiddenText:false}};},
    get TrackRevisions(){return tracking;},
    set TrackRevisions(v){
      if(v===false){restoreAttempts++;if(fail==='restore')throw Error('injected TrackRevisions restore failure');}
      tracking=v;
    },
    set ShowRevisions(v){if(fail==='restore')throw Error('injected validation-display failure');},
    Range(start,end){return {
      Start:start,End:end,Revisions:empty,TextRetrievalMode:{IncludeHiddenText:false},
      get Text(){return value.slice(start,end);},
      set Text(v){value=value.slice(0,start)+v+value.slice(end);},
      get WordOpenXML(){return '<w:document><w:p><w:r><w:rPr><w:b w:val="'+bold+'"/></w:rPr><w:t>'+value.slice(start,end)+'</w:t></w:r></w:p></w:document>';},
      Select(){app.Selection={Range:{Start:start,End:end}};},
    };},
    Undo(){undoCalls++;value='甲乙丙';bold=false;return true;},
  };
  const app={Selection:{Range:{Start:0,End:3}},UndoRecord:{StartCustomRecord(){},EndCustomRecord(){if(fail==='end')throw Error('injected EndCustomRecord failure');}}};
  const target={doc,range:doc.Range(0,3),text:value,baseline:value,start:0,end:3};
  const scope={SmartPlan:{plan}};vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../live.js'),'utf8'),scope);
  let error;try{scope.smartApply(app,target,'甲丁丙');}catch(e){error=e;}
  return {value,undoCalls,restoreAttempts,error:String(error)};
}
test('cleanup exception after an edit must not skip rollback',()=>{
  const result=scenario('restore');
  assert.equal(result.value,'甲乙丙',JSON.stringify(result));
  assert.equal(result.undoCalls,1);
});
test('EndCustomRecord failure must not report an unhandled half-completion',()=>{
  const result=scenario('end');
  assert.equal(result.value,'甲乙丙',JSON.stringify(result));
  assert.equal(result.undoCalls,1);
});
