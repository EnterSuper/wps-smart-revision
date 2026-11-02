/* Local WPS add-in. No network requests, automatic saves, or document history. */
var SmartBusy=false;
function smartApp(){if(typeof SmartHost!=='undefined')return SmartHost.application();return typeof wps.WpsApplication==='function'?wps.WpsApplication():Application;}
function smartAlert(text){alert(String(text));}
function smartHelp(){if(typeof SmartHost!=='undefined')return SmartHost.show('panel.html','智能修订',510,700);wps.ShowDialog(new URL('panel.html',location.href).href,'智能修订',510,700,false);}
function smartCompatibility(){SmartHost.show('compatibility.html','智能修订 · 本机自检',680,720);}
function smartTestResults(){if(typeof SmartHost!=='undefined')return SmartHost.show('qa/test-report.html','智能修订 · 测试记录',780,640);wps.ShowDialog(new URL('qa/test-report.html',location.href).href,'智能修订 · 测试记录',780,640,false);}
// Compatibility for an already-loaded older ribbon; do not toggle author settings.
function smartNativeTracking(){smartAlert('请在 WPS 的“审阅 → 修订”中设置修订模式。新版已移除此重复开关。');}
function smartRichPaste(){
 if(SmartBusy)return;SmartBusy=true;var payload=null,error=null;
 try{var app=smartApp();if(typeof SmartHost!=='undefined')SmartHost.ensureReady(app,'rich');var target=smartSelection(app);payload=smartReadRichClipboard(app,target);
 var p=target.range.Paragraphs.Item(1).Range;
 var whole=target.start===p.Start&&target.end===p.End-1;
 smartApply(app,target,payload.text,smartRichOptions(payload,{paragraphFormatting:whole}));
 }catch(e){error=e;}
 finally{if(payload){try{payload.close();}catch(e){error=Error((error?error.message+'；':'')+'临时格式文档关闭失败：'+e.message);}}SmartBusy=false;}
 if(error)smartAlert('智能修订：'+error.message);
 return !error;
}

function smartText(range){
  var mode=range.TextRetrievalMode;
  if(!mode||typeof mode.IncludeHiddenText!=='boolean')throw Error('WPS 未提供可验证隐藏文字的读取接口，未修改文档。');
  mode.IncludeHiddenText=true;
  if(mode.IncludeHiddenText!==true)throw Error('无法包含隐藏文字，未修改文档。');
  var text=range.Text;
  if(typeof text!=='string')throw Error('WPS 返回了无效的文字内容，未修改文档。');
  return text;
}
function smartPlainText(text,label){
  if(/[\x00-\x08\x0a-\x1f\u2028\u2029\ufffc]/.test(text))throw Error(label+'含有段落、换行、域或对象标记，请只选择一段普通正文。');
}
function smartCount(collection,label){
  if(!collection||typeof collection.Count!=='number'||!Number.isSafeInteger(collection.Count)||collection.Count<0)throw Error('WPS 未提供可靠的'+label+'检查接口，本次未修改文档。');
  return collection.Count;
}
function smartBounds(range,label){
  if(!range||!Number.isSafeInteger(range.Start)||!Number.isSafeInteger(range.End)||range.Start>range.End)throw Error('无法读取'+label+'的准确范围，本次未修改文档。');
  return {start:range.Start,end:range.End};
}
function smartIntersects(selection,range,label){
  var b=smartBounds(range,label);
  if(typeof range.StoryType!=='number')throw Error('无法确认'+label+'所属正文，本次未修改文档。');
  if(range.StoryType!==selection.StoryType)return false;
  return b.start===b.end ? b.start>=selection.Start&&b.start<=selection.End : b.start<selection.End&&b.end>selection.Start;
}
function smartProtectStructures(doc,selection){
  function inspect(collection,label,getRanges){
    var count=smartCount(collection,label);
    if(count&&typeof collection.Item!=='function')throw Error('无法枚举'+label+'，本次未修改文档。');
    for(var i=1;i<=count;i++){
      var ranges=getRanges(collection.Item(i));
      for(var j=0;j<ranges.length;j++)if(smartIntersects(selection,ranges[j],label))throw Error('选区与'+label+'相交，请只选择不含该结构的文字。');
    }
  }
  var bookmarks=doc.Bookmarks,hidden,bookmarksError=null,hiddenChanged=false;
  smartCount(bookmarks,'书签');
  try{
    hidden=bookmarks.ShowHidden;
    if(typeof hidden!=='boolean')throw Error('无法检查隐藏书签，本次未修改文档。');
    if(!hidden){bookmarks.ShowHidden=true;hiddenChanged=true;if(bookmarks.ShowHidden!==true)throw Error('无法枚举隐藏书签，本次未修改文档。');}
    inspect(bookmarks,'书签（含隐藏交叉引用书签）',function(x){return [x.Range];});
  }catch(e){bookmarksError=e;}
  finally{
    if(hiddenChanged){try{bookmarks.ShowHidden=hidden;if(bookmarks.ShowHidden!==hidden)throw Error('书签显示状态恢复失败');}catch(e){bookmarksError=Error((bookmarksError?bookmarksError.message+'；':'')+'未能恢复书签显示状态：'+e.message);}}
  }
  if(bookmarksError)throw bookmarksError;
  inspect(doc.Hyperlinks,'超链接',function(x){return [x.Range];});
  inspect(doc.Fields,'引用域',function(x){
    var code=x.Code,result=x.Result,c=smartBounds(code,'域代码'),r=smartBounds(result,'域结果');
    return [{Start:Math.max(0,Math.min(c.start,r.start)-1),End:Math.max(c.end,r.end)+1,StoryType:code.StoryType}];
  });
  inspect(doc.Comments,'批注',function(x){return [x.Scope];});
  inspect(doc.ContentControls,'内容控件',function(x){return [x.Range];});
  inspect(doc.Footnotes,'脚注引用',function(x){return [x.Reference];});
  inspect(doc.Endnotes,'尾注引用',function(x){return [x.Reference];});
  inspect(doc.Shapes,'浮动图片或图形锚点',function(x){return [x.Anchor];});
  inspect(doc.InlineShapes,'嵌入图片或对象',function(x){return [x.Range];});
  inspect(doc.OMaths,'公式',function(x){return [x.Range];});
}
function smartRevisionSignature(collection){
  var result=[],count=smartCount(collection,'修订');
  for(var i=1;i<=count;i++){
    var rev=collection.Item(i),range=rev.Range,b=smartBounds(range,'修订');
    result.push([rev.Type,b.start,b.end,smartText(range)]);
  }
  return JSON.stringify(result);
}
function smartDocumentXml(range){
  var xml=range.WordOpenXML;
  if(typeof xml!=='string')throw Error('WPS 未提供可验证格式的 WordOpenXML，本次未修改文档。');
  var match=xml.match(/<((?:[A-Za-z_][\w.-]*:)?)document\b[\s\S]*?<\/\1document\s*>/);
  if(!match)throw Error('无法读取选区文档 XML，本次未修改文档。');
  // Ignore editing-session identifiers, but retain text, run properties, paragraph
  // properties and revision markup. Differences left over fail closed on rollback.
  return match[0].replace(/\s+(?:[\w.-]+:)?(?:rsid\w*|paraId|textId)=(?:"[^"]*"|'[^']*')/g,'');
}
function smartSelection(app){
  var doc=app.ActiveDocument,range=app.Selection.Range.Duplicate;
  smartBounds(range,'选区');
  if(range.Start===range.End)throw Error('请先选中要替换的原段落正文。');
  if(range.StoryType!==1)throw Error('当前仅支持正文中的段落。');
  var text=smartText(range);
  if(text.endsWith('\r')){range.End-=1;text=smartText(range);}
  if(!text)throw Error('请选中一段非空的正文。');
  smartPlainText(text,'选区');
  if(smartCount(range.Tables,'选区表格')>0)throw Error('当前不支持表格单元格中的智能修订；请在表格外选择一段正文。');
  smartProtectStructures(doc,range);
  var revisions=[],deletedLength=0,textRevisionCount=0;
  for(var i=1;i<=smartCount(range.Revisions,'选区修订');i++){
    var rev=range.Revisions.Item(i),r=rev.Range;
    if(rev.Type!==1&&rev.Type!==2&&rev.Type!==3&&rev.Type!==10)throw Error('选区含移动、段落等复杂修订，暂不支持重新对齐。');
    if(rev.Type===10){
      var paragraph=range.Paragraphs.Item(1).Range;
      if(range.Start!==paragraph.Start||range.End!==paragraph.End-1||r.Start<paragraph.Start||r.End>paragraph.End)throw Error('已有段落格式修订，请完整选择这一段正文。');
      continue;
    }
    if(r.Start<range.Start||r.End>range.End)throw Error('选区只覆盖了部分已有修订，请完整选中相关文字。');
    var revText=smartText(r);smartPlainText(revText,'已有修订');
    if(rev.Type===3)continue; // Keep formatting revisions; they do not change text offsets.
    revisions.push({type:rev.Type,start:r.Start,end:r.End,text:revText});textRevisionCount++;
    if(rev.Type===2)deletedLength+=r.End-r.Start;
  }
  if(range.End-range.Start!==text.length+deletedLength)throw Error('选区含有不能按普通文字定位的结构，请只选择纯文字部分。');
  revisions.sort(function(a,b){return a.start-b.start;});
  var baseline='',cursor=range.Start;
  revisions.forEach(function(r){
    if(r.start<cursor)throw Error('存在重叠文字修订，暂不支持处理。');
    baseline+=smartText(doc.Range(cursor,r.start));
    if(r.type===2)baseline+=r.text;
    cursor=r.end;
  });
  baseline+=smartText(doc.Range(cursor,range.End));smartPlainText(baseline,'修订前原文');
  return {doc:doc,range:range,text:text,baseline:baseline,start:range.Start,end:range.End,textRevisionCount:textRevisionCount,
    revisionSignature:smartRevisionSignature(range.Revisions),documentXml:smartDocumentXml(range)};
}
function smartClipboard(app,target){
  var temp=null,result;
  try{
    temp=app.Documents.Add(undefined,false,0,false);
    temp.TrackRevisions=false;
    temp.Range(0,0).PasteSpecial(undefined,false,0,false,2);
    result=smartText(temp.Content).replace(/\r$/,'');
  }finally{
    if(temp)temp.Close(0);
    target.doc.Activate();target.range.Select();
  }
  result=result.replace(/\r\n/g,'\n').replace(/[\r\n]+$/,'');
  if(!result||/[\r\n\x07\x13\x14\x15\ufffc]/.test(result))throw Error('剪贴板应是一段普通文字。请重新复制新段落，避免带入多个段落、图片或表格。');
  return result;
}
function smartFinalText(doc,start,end){
  // WPS Range.Text returns final text, while its offsets include deleted revisions.
  return smartText(doc.Range(start,end));
}
function smartSnapshot(doc,target){
  var range=doc.Range(target.start,target.end);
  return {start:target.start,end:target.end,text:smartText(range),xml:smartDocumentXml(range),
    contentText:smartText(doc.Content),contentEnd:doc.Content.End,revisionSignature:smartRevisionSignature(doc.Revisions),
    rangeRevisions:smartRevisionSignature(range.Revisions),tracking:doc.TrackRevisions,formatTracking:doc.TrackFormatting,showRevisions:doc.ShowRevisions};
}
function smartSnapshotDifferences(doc,before,includeSettings){
  var differences=[],range=before.end<=doc.Content.End?doc.Range(before.start,before.end):null;
  if(doc.Content.End!==before.contentEnd)differences.push('全文范围');
  if(smartText(doc.Content)!==before.contentText)differences.push('全文文字');
  if(!range||range.Start!==before.start||range.End!==before.end||smartText(range)!==before.text)differences.push('选区范围/文字');
  if(smartRevisionSignature(doc.Revisions)!==before.revisionSignature)differences.push('全文修订');
  if(range&&smartRevisionSignature(range.Revisions)!==before.rangeRevisions)differences.push('选区修订');
  if(range&&smartDocumentXml(range)!==before.xml)differences.push('选区格式/结构');
  if(includeSettings&&doc.TrackRevisions!==before.tracking)differences.push('文字修订开关');
  if(includeSettings&&doc.TrackFormatting!==before.formatTracking)differences.push('格式修订开关');
  return differences;
}
function smartApply(app,target,newText,options){
  options=options||{};smartPlainText(newText,'新文字');
  if(newText===target.text&&!options.force)return 0;
  var doc=target.doc,edits=SmartPlan.plan(target.baseline,newText);
  if(!edits.length&&!target.textRevisionCount&&!options.force)return 0;
  var undo=app.UndoRecord;
  if(!undo||typeof undo.StartCustomRecord!=='function'||typeof undo.EndCustomRecord!=='function')throw Error('此版本 WPS 未提供合并撤销接口，未修改文档。');
  var before=smartSnapshot(doc,target);
  if(before.text!==target.text||(target.revisionSignature&&before.rangeRevisions!==target.revisionSignature)||(target.documentXml&&before.xml!==target.documentXml))throw Error('选区文字、格式或修订已变化，请重新选择。');
  if(typeof before.tracking!=='boolean'||typeof before.formatTracking!=='boolean')throw Error('无法确认 WPS 修订开关，未修改文档。');
  var started=false,changed=false,attemptedMutation=false,undoBoundaryUnknown=false,errors=[];
  try{
    undoBoundaryUnknown=true;undo.StartCustomRecord('智能粘贴修订');started=true;undoBoundaryUnknown=false;
    // Never RejectAll(): Type 3 formatting revisions must remain independent.
    for(var j=target.range.Revisions.Count;j>=1;j--){
      var oldRevision=target.range.Revisions.Item(j);
      if(oldRevision.Type===1||oldRevision.Type===2){attemptedMutation=true;oldRevision.Reject();changed=true;}
    }
    if(smartText(doc.Range(target.start,target.start+target.baseline.length))!==target.baseline)throw Error('无法可靠还原选区原文。');
    doc.TrackRevisions=true;
    for(var i=edits.length-1;i>=0;i--){var e=edits[i];attemptedMutation=true;doc.Range(target.start+e.start,target.start+e.end).Text=e.text;changed=true;}
    var end=target.end+(doc.Content.End-before.contentEnd);
    if(smartFinalText(doc,target.start,end)!==newText)throw Error('WPS 的文字位置与预期不一致。');
    if(typeof options.afterText==='function'){
      doc.TrackRevisions=true;doc.TrackFormatting=true;attemptedMutation=true;
      options.afterText(doc,target.start,end,newText);changed=true;
      if(smartFinalText(doc,target.start,end)!==newText)throw Error('格式处理意外改变了正文。');
    }
    doc.ShowRevisions=true;doc.Range(target.start,end).Select();
    if(app.Selection.Range.Start!==target.start||app.Selection.Range.End!==end)throw Error('修改后的实际选区与预期不一致。');
  }catch(e){errors.push(e.message||String(e));}
  finally{
    // Cleanup errors must never escape the finally block and bypass rollback.
    try{if(doc.TrackRevisions!==before.tracking)doc.TrackRevisions=before.tracking;if(doc.TrackRevisions!==before.tracking)throw Error('状态未恢复');}catch(e){errors.push('恢复文字修订开关失败：'+e.message);}
    try{if(doc.TrackFormatting!==before.formatTracking)doc.TrackFormatting=before.formatTracking;if(doc.TrackFormatting!==before.formatTracking)throw Error('状态未恢复');}catch(e){errors.push('恢复格式修订开关失败：'+e.message);}
    if(started){try{undo.EndCustomRecord();}catch(e){undoBoundaryUnknown=true;errors.push('结束合并撤销失败：'+e.message);}}
  }
  if(errors.length){
    var stateChanges=null,recoveryErrors=[];
    if(undoBoundaryUnknown)recoveryErrors.push('撤销记录边界未能确认，即使文字已恢复也不能确认撤销栈正常');
    try{stateChanges=smartSnapshotDifferences(doc,before,false);}catch(e){recoveryErrors.push('无法检查修改状态：'+e.message);}
    // A failing setter can fail before it mutates anything. Never undo an older
    // user action merely because a write was attempted.
    if(stateChanges&&stateChanges.length){
      try{doc.Undo(1);}catch(e){recoveryErrors.push('自动撤销失败：'+e.message);}
    }else if(attemptedMutation&&stateChanges===null){recoveryErrors.push('无法判定本次修改状态，未盲目撤销之前的用户操作');}
    try{if(doc.TrackRevisions!==before.tracking)doc.TrackRevisions=before.tracking;}catch(e){recoveryErrors.push('文字修订开关恢复失败：'+e.message);}
    try{if(doc.TrackFormatting!==before.formatTracking)doc.TrackFormatting=before.formatTracking;}catch(e){recoveryErrors.push('格式修订开关恢复失败：'+e.message);}
    try{doc.ShowRevisions=before.showRevisions;doc.Range(before.start,before.end).Select();if(app.Selection.Range.Start!==before.start||app.Selection.Range.End!==before.end)throw Error('实际选区与操作前不一致');}catch(e){recoveryErrors.push('选区恢复失败：'+e.message);}
    var remaining=null;
    try{remaining=smartSnapshotDifferences(doc,before,true);}catch(e){recoveryErrors.push('恢复核验失败：'+e.message);}
    if(remaining===null||remaining.length||recoveryErrors.length)throw Error('操作未完成，不能确认完整恢复；请停止编辑并检查文档。未核验项：'+(remaining||[]).concat(recoveryErrors).join('；')+'。原因：'+errors.join('；'));
    throw Error('本次未完成；已撤回，并核对全文文字、选区格式、修订和修订开关与操作前一致。原因：'+errors.join('；'));
  }
  return edits.length;
}
function smartPaste(){return smartRichPaste();}
function smartPlainPaste(){
  if(SmartBusy)return;SmartBusy=true;
  try{var app=smartApp();if(typeof SmartHost!=='undefined')SmartHost.ensureReady(app,'text');var target=smartSelection(app),text=smartClipboard(app,target);smartApply(app,target,text);return true;}
  catch(e){smartAlert('智能修订：'+e.message);}
  finally{SmartBusy=false;}
}
function smartTest(){
  if(SmartBusy)return;SmartBusy=true;
  try{
    var app=smartApp(),doc=app.Documents.Add();
    doc.TrackRevisions=false;
    var old='本项目拟于2026年启动，重点研究示例数据处理问题，提升数据质量和协同效率。';
    var newer='本项目计划于2027年启动，重点研究示例数据处理问题，提升数据质量、安全性和协同效率。';
    doc.Content.Text=old;doc.Range(0,old.length).Select();
    var count=smartApply(app,smartSelection(app),newer);
    smartAlert('示例完成：'+count+' 处变化，'+doc.Revisions.Count+' 条原生修订。\n这是新建的示例，未改动其他文档。按 ⌘Z 可一次撤销；无需保存。');
  }catch(e){smartAlert('示例未通过：'+e.message);}
  finally{SmartBusy=false;}
}

function smartShortcutStart(){
 try{
  if(!window.SmartShortcuts)throw Error('请先保存文档并重启 WPS，以加载新版快捷键模块。');
  SmartShortcuts.start();SmartHost.api().PluginStorage.setItem("SmartRevisionShortcutsEnabled","1");
  if(!SmartHost.isWindows()){smartAlert('快捷键接收已开启。请双击 Mac 安装包中的“WPS 修订快捷键”应用。菜单栏出现“修订”后，回到 WPS 选中原段落，再按 Control + Option + Command + V。');return;}
  var base=decodeURIComponent(new URL('.',location.href).pathname);
  if(SmartHost.isWindows()&&/^\/[A-Za-z]:/.test(base))base=base.slice(1);
  var exe=base+'shortcuts/'+(SmartHost.isWindows()?'SmartRevisionKeys.exe':'SmartRevisionKeys.app/Contents/MacOS/SmartRevisionKeys');
  var dir=SmartShortcuts.directory();
  if(/["\r\n]/.test(dir))throw Error('通信路径包含不支持的字符，请使用按钮。');
  SmartHost.api().OAAssist.ShellExecute(exe,'"'+dir.replace(/[\\\/]+$/,'')+'"');
 }catch(e){smartAlert('快捷键：'+e.message);}
}

function smartShortcutStop(){if(window.SmartShortcuts)SmartShortcuts.stop();SmartHost.api().PluginStorage.setItem('SmartRevisionShortcutsEnabled','0');smartAlert('快捷键接收已停止。可从菜单栏／托盘退出辅助程序。');}
