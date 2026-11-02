/* Rich clipboard support for WPS. Does not save files or alter the clipboard.
 * The caller owns the document transaction and enables native format tracking.
 */
(function (root) {
  'use strict';
  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var PKG = 'http://schemas.microsoft.com/office/2006/xmlPackage';
  var PROPS = ['Bold', 'Italic', 'Underline', 'NameAscii', 'NameFarEast', 'Size',
    'Color', 'StrikeThrough', 'DoubleStrikeThrough', 'Subscript', 'Superscript',
    'SmallCaps', 'AllCaps', 'Kerning', 'Spacing', 'Scaling', 'Position', 'Hidden'];
  var PARA_PROPS = ['Alignment', 'LeftIndent', 'RightIndent', 'FirstLineIndent',
    'SpaceBefore', 'SpaceAfter', 'LineSpacingRule', 'LineSpacing', 'KeepTogether',
    'KeepWithNext', 'PageBreakBefore', 'WidowControl', 'OutlineLevel', 'Hyphenation',
    'SpaceBeforeAuto', 'SpaceAfterAuto', 'CharacterUnitLeftIndent',
    'CharacterUnitRightIndent', 'CharacterUnitFirstLineIndent', 'LineUnitBefore', 'LineUnitAfter', 'HangingPunctuation'];
  var SUPPORTED_PPR = ['pStyle', 'rPr', 'jc', 'ind', 'spacing', 'keepLines',
    'keepNext', 'pageBreakBefore', 'widowControl', 'outlineLvl', 'suppressAutoHyphens', 'doNotImportParagraphEnd', 'overflowPunct'];
  var UNSUPPORTED_BODY = ['tbl', 'hyperlink', 'fldSimple', 'fldChar', 'instrText',
    'drawing', 'pict', 'object', 'footnoteReference', 'endnoteReference',
    'bookmarkStart', 'bookmarkEnd', 'commentRangeStart', 'commentRangeEnd',
    'commentReference', 'sdt', 'customXml', 'ins', 'del', 'moveFrom', 'moveTo',
    'moveFromRangeStart', 'moveFromRangeEnd', 'moveToRangeStart', 'moveToRangeEnd',
    'rPrChange', 'pPrChange', 'sectPrChange', 'permStart', 'permEnd', 'sym',
    'br', 'cr', 'lastRenderedPageBreak'];

  function fail(message) { throw Error('格式修订：' + message); }
  var SHADING_PROPS = ['Texture', 'BackgroundPatternColor', 'ForegroundPatternColor'];
  function inspectShading(node) {
    var val=node.getAttributeNS(W,'val');
    if(val!=='clear'&&val!=='nil')fail('来源底纹使用了尚未支持的图案（'+(val||'未指定')+'），未粘贴。');
    for(var i=0;i<node.attributes.length;i++){
      var a=node.attributes[i];
      if(a.namespaceURI==='http://www.w3.org/2000/xmlns/')continue;
      if(a.namespaceURI!==W||!['val','color','fill'].includes(a.localName))
        fail('来源底纹包含尚未支持的主题色或扩展属性（'+a.localName+'），未粘贴。');
      if(a.localName!=='val'&&!/^(auto|[0-9a-fA-F]{6})$/.test(a.value))fail('来源底纹颜色无效，未粘贴。');
    }
    for(var c=node.firstChild;c;c=c.nextSibling)if(c.nodeType===1)fail('来源底纹结构无效，未粘贴。');
  }
  function shadingValues(shading, allowMixed) {
    if(!shading)fail('当前 WPS 未提供底纹接口。');
    var result={};SHADING_PROPS.forEach(function(p){
      var v=shading[p];
      if(!integer(v)||(!allowMixed&&v===9999999))fail('无法确定底纹属性 '+p+'。');
      result[p]=v;
    });return result;
  }
  function sameShading(a,b){return SHADING_PROPS.every(function(p){return a[p]===b[p];});}
  function setShading(shading,wanted){
    SHADING_PROPS.forEach(function(p){if(shading[p]!==wanted[p])shading[p]=wanted[p];});
    if(!sameShading(shadingValues(shading,false),wanted))fail('WPS 未完整应用底纹，请由事务撤销。');
  }
  var HIGHLIGHT_NAMES=['none','black','blue','cyan','green','magenta','red','yellow','darkBlue','darkCyan','darkGreen','darkMagenta','darkRed','darkYellow','darkGray','lightGray'];
  function inspectHighlight(node){
    if(node.getAttributeNS(W,'val')==='white')fail('白色高亮未通过当前 WPS 原生接口验证；白色背景请使用底纹，未粘贴。');
    if(!HIGHLIGHT_NAMES.includes(node.getAttributeNS(W,'val')))fail('来源高亮颜色无效或尚未支持，未粘贴。');
    for(var i=0;i<node.attributes.length;i++){var a=node.attributes[i];if(a.namespaceURI==='http://www.w3.org/2000/xmlns/')continue;if(a.namespaceURI!==W||a.localName!=='val')fail('来源高亮包含未支持的扩展属性，未粘贴。');}
    for(var c=node.firstChild;c;c=c.nextSibling)if(c.nodeType===1)fail('来源高亮结构无效，未粘贴。');
  }
  function highlightValue(range,allowMixed){
    var value=range.HighlightColorIndex;
    if(!integer(value)||value===8||(!((value>=0&&value<=16)||(allowMixed&&value===9999999))))fail('当前 WPS 无法确定文字高亮颜色。');
    return value;
  }
  function setHighlight(range,value){
    if(!integer(value)||value===8||value<0||value>16)fail('要应用的文字高亮颜色无效。');
    if(highlightValue(range,true)!==value)range.HighlightColorIndex=value;
    if(highlightValue(range,false)!==value)fail('WPS 未完整应用高亮颜色，请由事务撤销。');
  }
  function integer(n) { return typeof n === 'number' && Number.isSafeInteger(n); }
  function readText(range) {
    // A fresh WPS Range does not inherit TextRetrievalMode from another Range.
    // The core helper enables IncludeHiddenText on this exact range instance.
    if (typeof root.smartText !== 'function') fail('核心尚未提供包含隐藏文字的读取接口。');
    return String(root.smartText(range));
  }

  // Word/WPS native offsets include deleted revision text; Range.Text does not.
  // Every returned segment contains only visible text and has equal UTF-16 lengths.
  function visibleSegments(start, end, deletions) {
    if (!integer(start) || !integer(end) || start < 0 || end < start) fail('文字范围无效。');
    var sorted = deletions.slice().sort(function (a, b) { return a.start - b.start; });
    var cursor = start, visible = 0, result = [];
    sorted.forEach(function (d) {
      if (!integer(d.start) || !integer(d.end) || d.start < cursor || d.end <= d.start || d.end > end)
        fail('删除修订重叠或越过选区，不能可靠映射格式。');
      if (cursor < d.start) {
        result.push({ nativeStart: cursor, nativeEnd: d.start, visibleStart: visible, visibleEnd: visible + d.start - cursor });
        visible += d.start - cursor;
      }
      cursor = d.end;
    });
    if (cursor < end) result.push({ nativeStart: cursor, nativeEnd: end, visibleStart: visible, visibleEnd: visible + end - cursor });
    return result;
  }

  function mapVisibleRun(start, end, segments) {
    if (!integer(start) || !integer(end) || start < 0 || end < start) fail('来源格式范围无效。');
    var result = [], covered = 0;
    segments.forEach(function (s) {
      var a = Math.max(start, s.visibleStart), b = Math.min(end, s.visibleEnd);
      if (a < b) {
        result.push({ start: s.nativeStart + a - s.visibleStart, end: s.nativeStart + b - s.visibleStart });
        covered += b - a;
      }
    });
    if (covered !== end - start) fail('格式范围未完整对应到目标文字。');
    return result;
  }

  function fontValues(font, allowMixed) {
    var result = {};
    PROPS.forEach(function (name) {
      var value;
      try { value = font[name]; } catch (e) { fail('当前 WPS 不能读取字体属性 ' + name + '。'); }
      if (value === null || value === undefined || !['number', 'string', 'boolean'].includes(typeof value))
        fail('当前 WPS 未提供字体属性 ' + name + '，未将此项当作通过。');
      if (typeof value === 'number' && (!Number.isFinite(value) || (!allowMixed && value === 9999999)))
        fail('字体属性 ' + name + ' 无法确定。');
      result[name] = value;
    });
    return result;
  }
  function sameFont(a, b) { return PROPS.every(function (p) { return a[p] === b[p]; }); }
  function paragraphValues(format) {
    var result = {};
    PARA_PROPS.forEach(function (name) {
      var value;
      try { value = format[name]; } catch (e) { fail('当前 WPS 不能读取段落属性 ' + name + '。'); }
      if (value === null || value === undefined || !['number', 'string', 'boolean'].includes(typeof value))
        fail('当前 WPS 未提供段落属性 ' + name + '，不能验证。');
      if (typeof value === 'number' && (!Number.isFinite(value) || value === 9999999))
        fail('段落属性 ' + name + ' 无法确定。');
      result[name] = value;
    });
    return result;
  }
  function sameParagraph(a, b) {
    return PARA_PROPS.every(function (p) {
      // Points are derived from the destination document grid when character/line units are active.
      var units={LeftIndent:'CharacterUnitLeftIndent',RightIndent:'CharacterUnitRightIndent',FirstLineIndent:'CharacterUnitFirstLineIndent',SpaceBefore:'LineUnitBefore',SpaceAfter:'LineUnitAfter'};
      if(units[p]&&b[units[p]]!==0)return true;
      return typeof a[p] === 'number' && typeof b[p] === 'number'
        ? Math.abs(a[p] - b[p]) <= 0.0001 : a[p] === b[p];
    });
  }
  function setSupportedFont(font, wanted) {
    var toggles=['Bold','Italic','StrikeThrough','DoubleStrikeThrough','Subscript','Superscript','SmallCaps','AllCaps','Hidden'];
    function set(name){if(font[name]!==wanted[name])font[name]=wanted[name];}
    // Clear mutually exclusive flags before enabling the requested member.
    toggles.forEach(function(name){if(wanted[name]===0||wanted[name]===false)set(name);});
    ['NameAscii','NameFarEast','Size'].forEach(set);
    PROPS.forEach(function(name){if(!toggles.includes(name)&&!['NameAscii','NameFarEast','Size'].includes(name))set(name);});
    toggles.forEach(function(name){if(wanted[name]!==0&&wanted[name]!==false)set(name);});
  }
  function setSupportedParagraph(format, wanted) {
    var units=['CharacterUnitLeftIndent','CharacterUnitRightIndent','CharacterUnitFirstLineIndent','LineUnitBefore','LineUnitAfter'];
    var points=['LeftIndent','RightIndent','FirstLineIndent','SpaceBefore','SpaceAfter'];
    function set(name){if(format[name]!==wanted[name])format[name]=wanted[name];}
    // WPS ignores some point setters while character/line units are active.
    units.forEach(function(name){if(format[name]!==0)format[name]=0;});
    ['SpaceBeforeAuto','SpaceAfterAuto'].forEach(function(name){if(format[name]!==false&&format[name]!==0)format[name]=0;});
    PARA_PROPS.forEach(function(name){if(!units.includes(name)&&!points.includes(name)&&!['SpaceBeforeAuto','SpaceAfterAuto','LineSpacing'].includes(name))set(name);});
    points.forEach(set);set('LineSpacing');
    units.forEach(function(name){if(wanted[name]!==0)set(name);});
    ['SpaceBeforeAuto','SpaceAfterAuto'].forEach(set);
  }
  function fullParagraph(range, start, end) {
    if (!range.Paragraphs || range.Paragraphs.Count !== 1) fail('段落格式需要完整选择一个段落。');
    var paragraph = range.Paragraphs.Item(1), nativeRange = paragraph.Range;
    // End is a native coordinate, including deleted revisions. Never infer it
    // from visible text.length, which excludes deleted text in WPS.
    if (start !== nativeRange.Start || end !== nativeRange.End - 1)
      fail('段落格式只可用于完整的一段正文；请选中整段后重试。');
    return paragraph;
  }

  function inspectSourceProperties(document, body, paragraph, text) {
    var unsupportedParagraph=[],styles=document.getElementsByTagNameNS(W,'styles');
    if(styles.length!==1)fail('剪贴板缺少唯一的样式定义，不能验证继承格式。');
    // Only Chinese/Latin and other non-complex scripts have been validated.
    // Complex-script-specific size/bold properties are not applied to those glyphs.
    if(/[\u0590-\u109f\u1780-\u18af\u1c00-\u1cff\ua800-\uaaff\ufb1d-\ufdff\ufe70-\ufeff]/.test(text))
      fail('新文字包含尚未完成字体保真验证的复杂文字脚本。');
    var supportedRPr=['rFonts','b','i','caps','smallCaps','strike','dstrike','vanish','sz','color','u','spacing','w','position','vertAlign','kern','rStyle'];
    var metadataRPr=['lang','noProof','bCs','iCs','szCs'];
    function children(node,name){var out=[];for(var c=node.firstChild;c;c=c.nextSibling)if(c.nodeType===1&&(!name||c.localName===name))out.push(c);return out;}
    function inspectRPr(node){
      children(node).forEach(function(c){
        if(c.namespaceURI===W&&c.localName==='shd'){inspectShading(c);return;}
        if(c.namespaceURI===W&&c.localName==='highlight'){inspectHighlight(c);return;}
        if(c.namespaceURI!==W||(!supportedRPr.includes(c.localName)&&!metadataRPr.includes(c.localName)))fail('来源直接格式或继承样式含未验证字符格式 '+c.localName+'。');
        if(c.localName==='u'){
          for(var a=0;a<c.attributes.length;a++){
            var attr=c.attributes[a];
            if(attr.namespaceURI===W&&attr.localName!=='val')fail('彩色/主题下划线尚未完成保真验证。');
          }
        }
      });
    }
    function inspectPPr(node){children(node).forEach(function(c){
      if(c.namespaceURI===W&&c.localName==='shd'){inspectShading(c);return;}
      if(c.namespaceURI!==W||!SUPPORTED_PPR.includes(c.localName))unsupportedParagraph.push(c.localName);
      if(c.localName==='rPr')inspectRPr(c);
    });}
    var styleMap={},defaults={paragraph:[],character:[]},nodes=styles[0].getElementsByTagNameNS(W,'style');
    for(var i=0;i<nodes.length;i++){
      var id=nodes[i].getAttributeNS(W,'styleId');if(!id||styleMap[id])fail('样式标识缺失或重复。');styleMap[id]=nodes[i];
      if(['1','true','on'].includes(nodes[i].getAttributeNS(W,'default'))&&['paragraph','character'].includes(nodes[i].getAttributeNS(W,'type')))defaults[nodes[i].getAttributeNS(W,'type')].push(id);
    }
    var visited={},visiting={};
    function visit(id){
      if(visiting[id])fail('来源样式继承形成循环。');if(visited[id])return;
      var style=styleMap[id];if(!style)fail('来源引用了缺失的样式 '+id+'。');visiting[id]=true;
      children(style,'basedOn').forEach(function(base){visit(base.getAttributeNS(W,'val'));});
      children(style,'rPr').forEach(inspectRPr);children(style,'pPr').forEach(inspectPPr);
      visiting[id]=false;visited[id]=true;
    }
    var dd=styles[0].getElementsByTagNameNS(W,'docDefaults');
    for(i=0;i<dd.length;i++){
      var rpr=dd[i].getElementsByTagNameNS(W,'rPr');for(var j=0;j<rpr.length;j++)inspectRPr(rpr[j]);
      var ppr=dd[i].getElementsByTagNameNS(W,'pPr');for(j=0;j<ppr.length;j++)inspectPPr(ppr[j]);
    }
    if(!body.getElementsByTagNameNS(W,'pStyle').length)defaults.paragraph.forEach(visit);
    var bodyRuns=body.getElementsByTagNameNS(W,'r'),needsCharacterDefault=false;
    for(i=0;i<bodyRuns.length;i++)if(!bodyRuns[i].getElementsByTagNameNS(W,'rStyle').length)needsCharacterDefault=true;
    if(needsCharacterDefault)defaults.character.forEach(visit);
    ['pStyle','rStyle'].forEach(function(name){var refs=body.getElementsByTagNameNS(W,name);for(var n=0;n<refs.length;n++)visit(refs[n].getAttributeNS(W,'val'));});
    var directRPr=body.getElementsByTagNameNS(W,'rPr');for(i=0;i<directRPr.length;i++)inspectRPr(directRPr[i]);
    children(paragraph,'pPr').forEach(inspectPPr);
    return Array.from(new Set(unsupportedParagraph));
  }
  // Unsupported paragraph properties may be preserved only when the source
  // and target resolve to exactly the same property, including inherited styles.
  function paragraphPropertySignatures(xml,names){
    var doc=new root.DOMParser().parseFromString(String(xml),'application/xml');
    if(doc.getElementsByTagName('parsererror').length)fail('无法核对段落属性。');
    var styles=doc.getElementsByTagNameNS(W,'styles'),bodies=doc.getElementsByTagNameNS(W,'body');
    if(styles.length!==1||bodies.length!==1)fail('无法核对段落样式。');
    function children(n,name){var out=[];for(var c=n.firstChild;c;c=c.nextSibling)if(c.nodeType===1&&c.namespaceURI===W&&(!name||c.localName===name))out.push(c);return out;}
    function signature(n){var attrs=[];for(var i=0;i<n.attributes.length;i++){var a=n.attributes[i];if(a.namespaceURI!=='http://www.w3.org/2000/xmlns/')attrs.push([a.namespaceURI,a.localName,a.value]);}attrs.sort(function(a,b){return JSON.stringify(a).localeCompare(JSON.stringify(b));});var nested=[];for(var c=n.firstChild;c;c=c.nextSibling){if(c.nodeType===1)nested.push(signature(c));else if(c.nodeType===3&&c.textContent.trim())nested.push(c.textContent);}return JSON.stringify([n.namespaceURI,n.localName,attrs,nested]);}
    var result={},map={},all=styles[0].getElementsByTagNameNS(W,'style'),defaults=[];
    names.forEach(function(n){result[n]=null;});
    function apply(p){children(p).forEach(function(n){if(names.includes(n.localName))result[n.localName]=signature(n);});}
    for(var i=0;i<all.length;i++){var id=all[i].getAttributeNS(W,'styleId');if(!id||map[id])fail('段落样式标识缺失或重复。');map[id]=all[i];if(all[i].getAttributeNS(W,'type')==='paragraph'&&['1','true','on'].includes(all[i].getAttributeNS(W,'default')))defaults.push(id);}
    var dd=styles[0].getElementsByTagNameNS(W,'docDefaults');for(i=0;i<dd.length;i++){var pp=dd[i].getElementsByTagNameNS(W,'pPr');for(var j=0;j<pp.length;j++)apply(pp[j]);}
    var visiting={};function visit(id){if(visiting[id]||!map[id])fail('无法核对段落继承样式。');visiting[id]=true;children(map[id],'basedOn').forEach(function(n){visit(n.getAttributeNS(W,'val'));});children(map[id],'pPr').forEach(apply);delete visiting[id];}
    var para=children(bodies[0],'p');if(para.length!==1)fail('仅可核对一个段落。');
    var ppr=children(para[0],'pPr'),refs=[];ppr.forEach(function(p){refs=refs.concat(children(p,'pStyle'));});
    if(refs.length)refs.forEach(function(n){visit(n.getAttributeNS(W,'val'));});else defaults.forEach(visit);
    ppr.forEach(apply);return result;
  }
  function verifyPreservedParagraph(range,payload){
    var names=payload.paragraph.unsupported;
    if(!names.length)return;
    var wanted=payload.paragraph.preserved,current=paragraphPropertySignatures(range.WordOpenXML,names);
    if(!wanted||names.some(function(n){return wanted[n]!==current[n];}))
      fail('来源段落含暂不能修改的排版属性（'+names.join('、')+'），与目标段落不同。请保持段落排版一致后重试。');
  }
  function parseRuns(xml, expectedText) {
    if (typeof root.DOMParser !== 'function') fail('当前加载项环境没有 XML 解析器。');
    var document = new root.DOMParser().parseFromString(String(xml), 'application/xml');
    if (document.getElementsByTagName('parsererror').length) fail('WPS 导出的文字结构无法解析。');
    var parts = document.getElementsByTagNameNS(PKG, 'part'), documentPart = null;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].getAttributeNS(PKG, 'name') === '/word/document.xml') documentPart = parts[i];
    }
    var owner = documentPart || document;
    var bodies = owner.getElementsByTagNameNS(W, 'body');
    if (bodies.length !== 1) fail('未找到唯一的剪贴板正文。');
    var body = bodies[0];
    UNSUPPORTED_BODY.forEach(function (name) {
      if (body.getElementsByTagNameNS(W, name).length) fail('剪贴板包含复杂结构 ' + name + '，不能作为纯文字格式粘贴。');
    });
    if (body.getElementsByTagNameNS('http://schemas.openxmlformats.org/officeDocument/2006/math', '*').length)
      fail('剪贴板包含公式，不能作为普通字符格式粘贴。');
    // These are separate native formats, not covered by the scalar contract below.
    // Reject instead of silently reporting a successful rich-format application.
    ['bdr', 'effect', 'outline', 'shadow', 'emboss', 'imprint',
      'em', 'eastAsianLayout', 'fitText', 'rtl', 'cs', 'webHidden'].forEach(function (name) {
      var nodes = body.getElementsByTagNameNS(W, name);
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j].parentNode && nodes[j].parentNode.localName === 'rPr')
          fail('字符格式 ' + name + ' 尚未完成保真验证，不能静默忽略。');
      }
    });
    var elements = body.getElementsByTagName('*');
    for (i = 0; i < elements.length; i++) {
      var element = elements[i];
      // Check element semantics only. Namespace declarations and mso/w14/etc.
      // attributes on ordinary w: elements are permitted and are not content.
      // Extensions such as text effects/alternate content cannot be verified by scalar Font values.
      if (element.namespaceURI !== W) fail('剪贴板包含未验证的扩展格式 ' + element.localName + '。');
    }
    var paragraphs = body.getElementsByTagNameNS(W, 'p');
    if (paragraphs.length !== 1) fail('一次只支持一段普通正文。');
    var unsupportedParagraph = inspectSourceProperties(document,body,paragraphs[0],expectedText);
    var r = body.getElementsByTagNameNS(W, 'r'), offset = 0, text = '', result = [];
    for (i = 0; i < r.length; i++) {
      var runText = '';
      for (var c = r[i].firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        if (c.localName === 't') runText += c.textContent;
        else if (c.localName === 'tab') runText += '\t';
        else if (c.localName !== 'rPr') fail('剪贴板含不能可靠定位的字符结构 ' + c.localName + '。');
      }
      if (runText) {
        result.push({ start: offset, end: offset + runText.length, text: runText });
        offset += runText.length; text += runText;
      }
    }
    if (text !== expectedText) fail('剪贴板 XML 与 WPS 可见文字不一致。');
    result.paragraphUnsupported = unsupportedParagraph;
    return result;
  }

  function readRichClipboard(app, target) {
    var temp = null, payload = null, pendingError = null;
    try {
      temp = app.Documents.Add(undefined, false, 0, false);
      temp.TrackRevisions = false;
      temp.Range(0, 0).Paste();
      var text = readText(temp.Content).replace(/\r+$/, '');
      if (!text || text.length > 12000 || /[\r\n\x07\x13\x14\x15\ufffc]/.test(text))
        fail('剪贴板必须是一段普通正文，最多 12000 个字符。');
      var content = temp.Range(0, text.length);
      if (readText(content) !== text || content.End - content.Start !== text.length)
        fail('剪贴板文字包含隐藏结构，不能定位。');
      if (temp.Revisions.Count !== 0) fail('剪贴板自带未处理修订，请先复制没有修订标记的新段落。');
      var sourceXml=content.WordOpenXML;
      var runs = parseRuns(sourceXml, text);
      runs.forEach(function (run) {
        var range = temp.Range(run.start, run.end), font = range.Font.Duplicate;
        if (!font) fail('当前 WPS 无法复制字体格式。');
        run.font = font; run.values = fontValues(font, false);
        run.shading = shadingValues(range.Font.Shading, false);
        run.highlight=highlightValue(range,false);
      });
      if (content.Paragraphs.Count !== 1) fail('来源必须是一个段落。');
      var paragraph = content.Paragraphs.Item(1).Format.Duplicate;
      if (!paragraph) fail('当前 WPS 无法复制段落格式。');
      // Capture the duplicate immediately; scalar extraction is lazy so a
      // character-only paste does not depend on optional paragraph APIs.
      var paragraphSnapshot = { format: paragraph, values: null, shading: shadingValues(content.ParagraphFormat.Shading,false), unsupported: runs.paragraphUnsupported || [] };
      paragraphSnapshot.preserved=paragraphSnapshot.unsupported.length?paragraphPropertySignatures(sourceXml,paragraphSnapshot.unsupported):{};
      var closed = false;
      payload = {
        text: text, runs: runs, paragraph: paragraphSnapshot,
        metadata: {
          mode: 'character-formatting', fullParagraphApplied: false,
          paragraphFormatting: 'available-for-explicit-full-paragraph-mode',
          paragraphUnsupported: paragraphSnapshot.unsupported.slice(),
          verifiedFontProperties: PROPS.slice(),
          verifiedShadingProperties: SHADING_PROPS.slice(),
          verifiedRangeProperties: ['HighlightColorIndex'],
          verifiedParagraphProperties: [],
          source: 'WPS native rich clipboard', requiresNativeFormatTracking: true
        },
        close: function () {
          if (closed) return;
          temp.Close(0); closed = true;
        },
        isClosed: function () { return closed; }
      };
    } catch (e) { pendingError = e; }
    try { target.doc.Activate(); target.range.Select(); }
    catch (e) { if (!pendingError) pendingError = e; }
    if (pendingError) {
      if (temp) {
        try { temp.Close(0); }
        catch (cleanup) { throw Error(pendingError.message + '；临时剪贴板文档未能关闭：' + cleanup.message); }
      }
      throw pendingError;
    }
    return payload;
  }

  function applyRichFormatting(doc, start, end, payload, options) {
    options = options || {};
    if (payload.isClosed()) fail('字体来源文档已关闭。');
    var before = readText(doc.Range(start, end)), docEnd = doc.Content.End;
    if (before !== payload.text) fail('目标文字与新段落不同，未应用字体。');
    if (doc.TrackRevisions !== true && doc.TrackRevisions !== -1) fail('原生修订未开启。');
    var range = doc.Range(start, end), deletions = [], paragraphOperation = null, paragraphShadingOperation=null;
    var trackShading=payload.runs.some(function(r){return Boolean(r.shading);});
    var expectedParagraphShading=trackShading?shadingValues(range.ParagraphFormat.Shading,false):null;
    if (options.paragraphFormatting) {
      if (!payload.paragraph) fail('来源没有可验证的段落格式。');
      verifyPreservedParagraph(range,payload);
      var targetParagraph = fullParagraph(range, start, end);
      var wantedParagraph = paragraphValues(payload.paragraph.format);
      var currentParagraph = paragraphValues(targetParagraph.Format);
      payload.paragraph.values = wantedParagraph;
      if(payload.paragraph.shading){
        expectedParagraphShading=payload.paragraph.shading;
        if(!sameShading(shadingValues(targetParagraph.Format.Shading,false),expectedParagraphShading))
          paragraphShadingOperation={shading:targetParagraph.Format.Shading,values:expectedParagraphShading};
      }
      if (!sameParagraph(currentParagraph, wantedParagraph))
        paragraphOperation = { paragraph: targetParagraph, format: payload.paragraph.format, values: wantedParagraph };
    }
    for (var i = 1; i <= range.Revisions.Count; i++) {
      var rev = range.Revisions.Item(i);
      if (rev.Type === 2) deletions.push({ start: rev.Range.Start, end: rev.Range.End });
      else if (rev.Type !== 1 && rev.Type !== 3 && rev.Type !== 10) fail('目标含未支持的修订类型 ' + rev.Type + '。');
    }
    var segments = visibleSegments(start, end, deletions);
    var finalLength = segments.length ? segments[segments.length - 1].visibleEnd : 0;
    if (finalLength !== payload.text.length) fail('可见文字偏移校验失败。');
    var operations = [];
    // Resolve every target mapping and property before the first write.
    payload.runs.forEach(function (run) {
      mapVisibleRun(run.start, run.end, segments).forEach(function (mapped) {
        var targetRange = doc.Range(mapped.start, mapped.end);
        var current = fontValues(targetRange.Font, true);
        if(current.Kerning!==run.values.Kerning)fail('当前 WPS 的字偶距（Kerning）组合修订未通过完整撤销验证，暂不支持改变字偶距。请使用仅文字粘贴保留原稿格式，或在 WPS 中单独调整。');
        if(run.shading)shadingValues(targetRange.Font.Shading,true);
        if(run.highlight!==undefined)highlightValue(targetRange,true);
        operations.push({ start: mapped.start, end: mapped.end, font: run.font, values: run.values, shading:run.shading, highlight:run.highlight });
      });
    });
    if (paragraphOperation) {
      setSupportedParagraph(paragraphOperation.paragraph.Format,paragraphOperation.values);
      if (!sameParagraph(paragraphValues(paragraphOperation.paragraph.Format), paragraphOperation.values))
        fail('WPS 未完整应用要求的段落格式，请由事务撤销。');
    }
    if(paragraphShadingOperation)setShading(paragraphShadingOperation.shading,paragraphShadingOperation.values);
    var applied=0;
    operations.forEach(function (op) {
      var targetRange = doc.Range(op.start, op.end);
      if(!sameFont(fontValues(targetRange.Font,true),op.values)){setSupportedFont(targetRange.Font,op.values);applied++;}
      if (!sameFont(fontValues(targetRange.Font, false), op.values))
        fail('WPS 未完整应用要求的字体格式，请由事务撤销。');
      if(op.shading&&!sameShading(shadingValues(targetRange.Font.Shading,true),op.shading)){setShading(targetRange.Font.Shading,op.shading);applied++;}
      if(op.highlight!==undefined&&highlightValue(targetRange,true)!==op.highlight){setHighlight(targetRange,op.highlight);applied++;}
      if(!sameFont(fontValues(targetRange.Font,false),op.values)||(op.shading&&!sameShading(shadingValues(targetRange.Font.Shading,false),op.shading)))fail('高亮或底纹影响了字体格式，请由事务撤销。');
    });
    if(options.paragraphFormatting)verifyPreservedParagraph(range,payload);
    if(expectedParagraphShading&&!sameShading(shadingValues(range.ParagraphFormat.Shading,false),expectedParagraphShading))fail('字符底纹影响了段落底纹，请由事务撤销。');
    if(paragraphOperation&&!sameParagraph(paragraphValues(paragraphOperation.paragraph.Format),paragraphOperation.values))
      fail('字符格式影响了段落设置，请由事务撤销。');
    if (readText(doc.Range(start, end)) !== before || doc.Content.End !== docEnd)
      fail('字体处理改变了文字或范围长度，请由事务撤销。');
    if (options.paragraphFormatting && payload.metadata) {
      payload.metadata.fullParagraphApplied = true;
      payload.metadata.paragraphFormatting = 'verified-full-paragraph';
      payload.metadata.verifiedParagraphProperties = PARA_PROPS.slice();
    }
    return applied + (paragraphOperation ? 1 : 0) + (paragraphShadingOperation ? 1 : 0);
  }

  function richOptions(payload, options) {
    if (options && options.paragraphFormatting) {
      if (!payload.paragraph) fail('来源没有可验证的段落格式。');
      if (payload.paragraph.unsupported.length&&!payload.paragraph.preserved)
        fail('来源段落含未实现的格式：' + payload.paragraph.unsupported.join('、') + '。');
      payload.paragraph.values = paragraphValues(payload.paragraph.format);
    }
    return { force: true, afterText: function (doc, start, end) { return applyRichFormatting(doc, start, end, payload, options); } };
  }
  var api = { inspectHighlight:inspectHighlight,highlightValue:highlightValue,setHighlight:setHighlight,paragraphPropertySignatures:paragraphPropertySignatures,verifyPreservedParagraph:verifyPreservedParagraph,inspectShading:inspectShading,shadingValues:shadingValues,sameShading:sameShading,setShading:setShading,visibleSegments: visibleSegments, mapVisibleRun: mapVisibleRun, parseRuns: parseRuns,
    properties: PROPS.slice(), fontValues: fontValues, sameFont: sameFont,
    paragraphProperties: PARA_PROPS.slice(), paragraphValues: paragraphValues,
    sameParagraph: sameParagraph, fullParagraph: fullParagraph,
    setSupportedFont:setSupportedFont,setSupportedParagraph:setSupportedParagraph,inspectSourceProperties:inspectSourceProperties,
    readRichClipboard: readRichClipboard, applyRichFormatting: applyRichFormatting, richOptions: richOptions };
  root.SmartRich = api;
  root.smartReadRichClipboard = readRichClipboard;
  root.smartApplyRichFormatting = applyRichFormatting;
  root.smartRichOptions = richOptions;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
