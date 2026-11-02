// Structural intersection and transaction fault injection; no WPS/docx writes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {plan}=require('../plan');
const source=fs.readFileSync(path.join(__dirname,'../live.js'),'utf8');
function collection(items=[]){return {get Count(){return items.length;},Item(i){return items[i-1];}};}
function fixture(options={}){
  let value='甲乙丙',bold=false,tracking=false,formatTracking=false,undos=0,ended=0;
  const empty=()=>collection();
  const doc={ShowRevisions:false,Revisions:empty(),Bookmarks:Object.assign(empty(),{ShowHidden:false})};
  for(const n of ['Hyperlinks','Fields','Comments','ContentControls','Footnotes','Endnotes','Shapes','InlineShapes','OMaths'])doc[n]=empty();
  function range(start,end,override){
    const r={Start:start,End:end,StoryType:1,Revisions:empty(),Tables:empty(),TextRetrievalMode:{IncludeHiddenText:false},
      get Text(){return override===undefined?value.slice(this.Start,this.End):override;},
      set Text(v){if(options.setterBefore)throw Error('setter-before');value=value.slice(0,this.Start)+v+value.slice(this.End);if(options.setterAfter)throw Error('setter-after');},
      get WordOpenXML(){return '<w:document xmlns:w="w"><w:p><w:r><w:rPr><w:b w:val="'+bold+'"/></w:rPr><w:t>'+this.Text+'</w:t></w:r></w:p></w:document>';},
      get Duplicate(){return this;},Select(){app.Selection.Range=options.selectFailure?{Start:0,End:0}:this;},
    };return r;
  }
  doc.Range=range;
  Object.defineProperties(doc,{
    Content:{get(){return {End:value.length,Text:value,TextRetrievalMode:{IncludeHiddenText:false}};}},
    TrackRevisions:{get(){return tracking;},set(v){tracking=v;}},
    TrackFormatting:{get(){return formatTracking;},set(v){if(options.restoreFormatting&&v===false)throw Error('format-restore');formatTracking=v;}},
  });
  doc.Undo=()=>{undos++;if(!options.undoNoop){value='甲乙丙';if(!options.undoLeavesFormat)bold=false;}return true;};
  const app={ActiveDocument:doc,Selection:{Range:range(0,3)},UndoRecord:{
    StartCustomRecord(){if(options.startFailure)throw Error('start-failure');},
    EndCustomRecord(){ended++;if(options.endFailure)throw Error('end-failure');},
  }};
  const scope={SmartPlan:{plan}};vm.createContext(scope);vm.runInContext(source,scope);
  return {doc,app,scope,range,setBold(v){bold=v;},state(){return {value,bold,tracking,formatTracking,undos,ended};}};
}
test('format-only force executes within tracking and restores both switches',()=>{
  const f=fixture();let called=0;
  f.scope.smartApply(f.app,f.scope.smartSelection(f.app),'甲乙丙',{force:true,afterText(){called++;assert.equal(f.doc.TrackRevisions,true);assert.equal(f.doc.TrackFormatting,true);f.setBold(true);}});
  assert.equal(called,1);assert.deepEqual(f.state(),{value:'甲乙丙',bold:true,tracking:false,formatTracking:false,undos:0,ended:1});
});
test('format callback failure rolls back format-only mutation',()=>{
  const f=fixture();assert.throws(()=>f.scope.smartApply(f.app,f.scope.smartSelection(f.app),'甲乙丙',{force:true,afterText(){f.setBold(true);throw Error('format-failed');}}),/已撤回/);
  assert.equal(f.state().bold,false);assert.equal(f.state().undos,1);
});
test('format callback failing without changes cannot undo earlier user work',()=>{
  const f=fixture();assert.throws(()=>f.scope.smartApply(f.app,f.scope.smartSelection(f.app),'甲乙丙',{force:true,afterText(){throw Error('format-failed');}}),/已撤回/);
  assert.equal(f.state().undos,0);
});
test('EndCustomRecord failure after an empty operation cannot undo earlier work',()=>{
  const f=fixture({endFailure:true});assert.throws(()=>f.scope.smartApply(f.app,f.scope.smartSelection(f.app),'甲乙丙',{force:true,afterText(){}}));assert.equal(f.state().undos,0);
});
for(const [label,opt,undoCount] of [['before native write',{setterBefore:true},0],['after partial native write',{setterAfter:true},1],['before record starts',{startFailure:true},0]])test(label+' failure preserves text and uses correct rollback scope',()=>{
  const f=fixture(opt);assert.throws(()=>f.scope.smartApply(f.app,f.scope.smartSelection(f.app),'甲丁丙'));
  assert.equal(f.state().value,'甲乙丙');assert.equal(f.state().undos,undoCount);assert.equal(f.state().tracking,false);
});
test('a successful Undo return cannot hide failed text restoration',()=>{
  const f=fixture({setterAfter:true,undoNoop:true});assert.throws(()=>f.scope.smartApply(f.app,f.scope.smartSelection(f.app),'甲丁丙'),/不能确认完整恢复/);
});
test('a successful Undo return cannot hide failed format restoration',()=>{
  const f=fixture({undoLeavesFormat:true});assert.throws(()=>f.scope.smartApply(f.app,f.scope.smartSelection(f.app),'甲乙丙',{force:true,afterText(){f.setBold(true);throw Error('format-failed');}}),/选区格式\/结构/);
});
test('format-tracking cleanup error does not bypass text rollback',()=>{
  const f=fixture({restoreFormatting:true});assert.throws(()=>f.scope.smartApply(f.app,f.scope.smartSelection(f.app),'甲丁丙',{force:true,afterText(){f.setBold(true);}}),/不能确认完整恢复/);
  assert.equal(f.state().value,'甲乙丙');assert.equal(f.state().bold,false);assert.equal(f.state().undos,1);
});
test('hidden bookmark intersections are checked and ShowHidden is restored',()=>{
  const f=fixture();f.doc.Bookmarks={ShowHidden:false,get Count(){return this.ShowHidden?1:0;},Item(){return {Range:f.range(0,2)};}};
  assert.throws(()=>f.scope.smartSelection(f.app),/隐藏交叉引用/);assert.equal(f.doc.Bookmarks.ShowHidden,false);
});
for(const [name,property,label] of [['Hyperlinks','Range','超链接'],['Comments','Scope','批注'],['ContentControls','Range','内容控件'],['Footnotes','Reference','脚注'],['Endnotes','Reference','尾注'],['Shapes','Anchor','锚点'],['InlineShapes','Range','嵌入'],['OMaths','Range','公式']])test(label+' overlap is blocked before mutation',()=>{
  const f=fixture();f.doc[name]=collection([{[property]:f.range(1,2)}]);assert.throws(()=>f.scope.smartSelection(f.app),new RegExp(label));assert.equal(f.state().undos,0);
});
test('partially selected field result is blocked using whole-document fields',()=>{
  const f=fixture();f.doc.Fields=collection([{Code:f.range(0,1),Result:f.range(2,5)}]);assert.throws(()=>f.scope.smartSelection(f.app),/引用域/);
});
test('zero-width floating shape anchors are blocked',()=>{
  const f=fixture();f.doc.Shapes=collection([{Anchor:f.range(1,1)}]);assert.throws(()=>f.scope.smartSelection(f.app),/锚点/);
});
test('unavailable structure API is not silently treated as an empty collection',()=>{
  const f=fixture();f.doc.OMaths=undefined;assert.throws(()=>f.scope.smartSelection(f.app),/未提供可靠/);
});
test('hidden deleted paragraph mark is rejected',()=>{
  const f=fixture();f.app.Selection.Range.End=4;f.app.Selection.Range.Revisions=collection([{Type:2,Range:f.range(1,2,'\r')}]);assert.throws(()=>f.scope.smartSelection(f.app),/已有修订含有段落/);
});
test('format revisions do not participate in text offset reconstruction',()=>{
  const f=fixture();f.app.Selection.Range.Revisions=collection([{Type:3,Range:f.range(1,2)}]);const t=f.scope.smartSelection(f.app);assert.equal(t.baseline,'甲乙丙');assert.equal(t.textRevisionCount,0);
});
test('a failed native Select is detected even if document text was restored',()=>{
  const f=fixture({selectFailure:true});assert.throws(()=>f.scope.smartApply(f.app,f.scope.smartSelection(f.app),'甲丁丙'),/选区恢复失败/);
  assert.equal(f.state().value,'甲乙丙');assert.equal(f.state().undos,1);
});
test('uncertain custom record closure is never reported as complete recovery',()=>{
  const f=fixture({endFailure:true});assert.throws(()=>f.scope.smartApply(f.app,f.scope.smartSelection(f.app),'甲丁丙'),/不能确认完整恢复.*撤销记录边界/);
  assert.equal(f.state().value,'甲乙丙');
});
test('hidden text is explicitly included by the shared reader',()=>{
  const f=fixture();const r={TextRetrievalMode:{IncludeHiddenText:false},get Text(){return this.TextRetrievalMode.IncludeHiddenText?'隐藏文字':'';}};
  assert.equal(f.scope.smartText(r),'隐藏文字');assert.equal(r.TextRetrievalMode.IncludeHiddenText,true);
});
test('missing hidden-text retrieval support blocks rather than losing text',()=>{
  const f=fixture();assert.throws(()=>f.scope.smartText({Text:'可见文字'}),/未提供可验证隐藏文字/);
});
test('plain text wholly inside a table cell is rejected even without a cell marker',()=>{
  const f=fixture();f.app.Selection.Range.Tables=collection([{}]);
  assert.equal(f.app.Selection.Range.Text,'甲乙丙');
  assert.throws(()=>f.scope.smartSelection(f.app),/不支持表格单元格/);
  assert.equal(f.state().value,'甲乙丙');assert.equal(f.state().undos,0);
});
test('missing table detection does not silently accept a possibly structured selection',()=>{
  const f=fixture();f.app.Selection.Range.Tables=undefined;
  assert.throws(()=>f.scope.smartSelection(f.app),/选区表格检查接口/);
});
