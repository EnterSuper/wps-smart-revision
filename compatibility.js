/* Synthetic native compatibility tests: never opens or saves a user's document. */
(function(root){
 'use strict';
 function assert(value,message){if(!value)throw Error(message);}
 // RejectAll may split adjacent plain-text runs while restoring every property.
 // Normalize only those identical runs for this self-test, never production rollback.
 function canonical(xml){
  var d=new DOMParser().parseFromString(xml,'application/xml'),ser=new XMLSerializer(),W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  assert(!d.getElementsByTagName('parsererror').length,'XML parse failed');
  function info(r){if(!r||r.namespaceURI!==W||r.localName!=='r'||r.attributes.length)return null;var els=Array.from(r.childNodes).filter(function(n){return n.nodeType===1;});if(els.length>2)return null;var t=els[els.length-1];if(!t||t.namespaceURI!==W||t.localName!=='t')return null;var p=els.length===2?els[0]:null;if(p&&(p.namespaceURI!==W||p.localName!=='rPr'))return null;return {text:t,key:(p?ser.serializeToString(p):'')+'|'+Array.from(t.attributes).map(function(a){return a.name+'='+a.value;}).join('|')};}
  var runs=Array.from(d.getElementsByTagNameNS(W,'r'));runs.forEach(function(r){if(!r.parentNode)return;var a=info(r),n=r.nextSibling,b=info(n);while(a&&b&&a.key===b.key){a.text.textContent+=b.text.textContent;n.parentNode.removeChild(n);n=r.nextSibling;b=info(n);}});return ser.serializeToString(d);
 }
 function run(){
  var app=SmartHost.application(),report={version:SmartHost.version,platform:SmartHost.isWindows()?'Windows':'macOS/other',wpsVersion:String(app.Version||''),time:new Date().toISOString(),text:false,rich:false,cases:[]};
  var original=app.Documents.Count?app.ActiveDocument:null,selection=null,owned=[],payload=null;
  if(original){try{selection=app.Selection.Range.Duplicate;}catch(ignore){}}
  // Clear old approvals before starting; an interrupted/failed rerun cannot retain them.
  SmartHost.save(app,report);
  function create(text){var d=app.Documents.Add();if(!d)throw Error('WPS 未返回新建测试文档。');owned.push(d);d.TrackRevisions=false;d.TrackFormatting=true;d.Content.Text=text;return d;}
  function select(d){d.Activate();d.Range(0,d.Content.End-1).Select();assert(app.ActiveDocument===d||String(app.ActiveDocument.Name)===String(d.Name),'无法激活测试文档。');return smartSelection(app);}
  function check(name,fn){try{fn();report.cases.push({name:name,status:'pass'});return true;}catch(e){report.cases.push({name:name,status:'fail',error:String(e.message||e)});return false;}}
  function unchanged(d,snapshot,label){var diffs=smartSnapshotDifferences(d,snapshot,true);if(label==='拒绝未恢复原文'&&diffs.length===1&&diffs[0]==='选区格式/结构'&&canonical(snapshot.xml)===canonical(smartDocumentXml(d.Range(snapshot.start,snapshot.end))))return;assert(!diffs.length,label+'：'+diffs.join('、'));}
  function lifecycle(d,newText,options,verify){
   var t=select(d),before=smartSnapshot(d,t);smartApply(app,t,newText,options);
   var after=smartSnapshot(d,select(d));assert(d.Revisions.Count>0,'未生成原生修订。');assert(smartText(d.Content)===newText+'\r','修改后文字不一致。');
   d.Revisions.RejectAll();unchanged(d,before,'拒绝未恢复原文');
   d.Undo(1);unchanged(d,after,'撤销拒绝后状态不一致');
   d.Revisions.AcceptAll();assert(smartText(d.Content)===newText+'\r','接受后文字不一致');if(verify)verify(d);
   d.Undo(1);unchanged(d,after,'撤销接受后状态不一致');
   d.Undo(1);unchanged(d,before,'单步撤销未恢复原文');
  }
  try{
   var old='这是中文测试段落：本项目拟于2026年启动，研究异构数据治理并提升协同效率。';
   var newer=old.replace('拟于2026','计划于2027').replace('协同效率','安全性和协同效率');
   var textDoc=create(old);
   var basic=check('文字修订、接受、拒绝及一次撤销',function(){lifecycle(textDoc,newer);});
   var repeated=basic&&check('同段连续改写保留最初原文',function(){
    var before=smartSnapshot(textDoc,select(textDoc));smartApply(app,select(textDoc),newer);
    var t=select(textDoc);assert(t.baseline===old,'第二轮未读到最初原文');smartApply(app,t,newer.replace('2027','2028'));
    assert(select(textDoc).baseline===old,'连续修订的原文不一致');textDoc.Undo(1);assert(select(textDoc).text===newer,'未恢复上一轮');textDoc.Undo(1);unchanged(textDoc,before,'两轮撤销未恢复');
   });
   var source=create(newer);
   var clip=basic&&repeated&&check('WPS 剪贴板纯文字粘贴',function(){
    source.Range(0,source.Content.End-1).Copy();var t=select(textDoc),before=smartSnapshot(textDoc,t);
    var content=smartClipboard(app,t);assert(content===newer,'剪贴板文字不一致');unchanged(textDoc,before,'读取剪贴板改变目标');lifecycle(textDoc,content);
   });
   report.text=Boolean(basic&&repeated&&clip);
   if(report.text){
    report.rich=check('WPS 加粗、斜体、高亮添加/取消、白底及完整撤销',function(){
     var d=create(old);
     source.Range(0,source.Content.End-1).Font=d.Range(0,d.Content.End-1).Font.Duplicate;
     d.Range(0,4).Font.Bold=0;d.Range(8,10).Font.Bold=-1;
     // Use a uniform baseline so a mixed Font.Duplicate is never imported.
     source.Range(0,source.Content.End-1).Font.Bold=0;source.Range(0,4).Font.Bold=-1;
     source.Content.ParagraphFormat.Alignment=1;
     source.Range(0,4).Font.Shading.BackgroundPatternColor=16777215;
     source.Range(4,8).Font.Italic=-1;
     source.Range(0,4).HighlightColorIndex=7;d.Range(8,10).HighlightColorIndex=3;
     // Include the paragraph mark: WPS carries paragraph formatting with it.
     source.Content.Copy();var t=select(d),before=smartSnapshot(d,t);
     payload=smartReadRichClipboard(app,t);unchanged(d,before,'读取富文本改变目标');
     assert(payload.runs.some(function(r){return r.values.Bold===-1||r.values.Bold===true;}),'富文本剪贴板未读到加粗。');
     lifecycle(d,payload.text,smartRichOptions(payload,{paragraphFormatting:true}),function(doc){assert(doc.Range(0,4).Font.Bold===-1,'加粗未保留');assert(doc.Range(8,10).Font.Bold===0,'取消加粗未生效');assert(doc.Range(0,4).Font.Shading.BackgroundPatternColor===16777215,'白色底纹未保留');assert(doc.Range(4,8).Font.Italic===-1,'斜体未保留');assert(doc.Range(0,4).HighlightColorIndex===7,'高亮未保留');assert(doc.Range(8,10).HighlightColorIndex===0,'取消高亮未生效');assert(doc.Paragraphs.Item(1).Format.Alignment===1,'段落居中未生效');});
    });
   }
  }catch(e){report.text=false;report.rich=false;report.cases.push({name:'环境检查',status:'fail',error:String(e.message||e)});}
  finally{
   var cleanup=[];
   if(payload){try{payload.close();}catch(e){cleanup.push('临时剪贴板文档关闭失败：'+e.message);}}
   for(var i=owned.length-1;i>=0;i--){try{owned[i].Close(0);}catch(e){cleanup.push('自检文档关闭失败：'+e.message);}}
   if(original){try{original.Activate();if(selection)selection.Select();}catch(e){cleanup.push('未能恢复原窗口选区：'+e.message);}}
   if(cleanup.length){report.text=false;report.rich=false;report.cases.push({name:'恢复原窗口',status:'fail',error:cleanup.join('；')});}
  }
  SmartHost.save(app,report);return report;
 }
 root.SmartCompatibility={run:run};
 if(typeof module==='object'&&module.exports)module.exports=root.SmartCompatibility;
})(typeof window==='object'?window:globalThis);
