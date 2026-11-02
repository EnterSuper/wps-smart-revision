const test=require('node:test');
const assert=require('node:assert/strict');
const xmljs=require('xml-js');
const rich=require('../rich');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const PKG='http://schemas.microsoft.com/office/2006/xmlPackage';
// Small DOM adapter over the bundled XML parser. Production uses WPS DOMParser.
function dom(xml){
  function convert(input,parent,scope){
    scope={...scope};for(const [key,value]of Object.entries(input.attributes||{})){if(key==='xmlns')scope['']=value;else if(key.startsWith('xmlns:'))scope[key.slice(6)]=value;}
    const [prefix,local]=input.name&&input.name.includes(':')?input.name.split(':'):['',input.name];
    const node={nodeType:input.type==='element'?1:input.type==='text'?3:9,localName:local,namespaceURI:scope[prefix]||null,parentNode:parent,attributes:[],childNodes:[]};
    for(const [key,value]of Object.entries(input.attributes||{})){
      const [p,l]=key.includes(':')?key.split(':'):['',key];node.attributes.push({localName:l,namespaceURI:p==='xmlns'||key==='xmlns'?'http://www.w3.org/2000/xmlns/':p?scope[p]:null,value});
    }
    node.getAttributeNS=(ns,key)=>node.attributes.find(a=>a.namespaceURI===ns&&a.localName===key)?.value||'';
    node.childNodes=(input.elements||[]).filter(x=>['element','text'].includes(x.type)).map(x=>convert(x,node,scope));
    node.childNodes.forEach((c,i)=>c.nextSibling=node.childNodes[i+1]||null);node.firstChild=node.childNodes[0]||null;
    node.textContent=input.type==='text'?input.text:node.childNodes.map(c=>c.textContent).join('');
    function descendants(){return node.childNodes.flatMap(c=>[c,...c.getElementsByTagName('*')]);}
    node.getElementsByTagName=name=>descendants().filter(c=>c.nodeType===1&&(name==='*'||c.localName===name));
    node.getElementsByTagNameNS=(ns,name)=>descendants().filter(c=>c.nodeType===1&&c.namespaceURI===ns&&(name==='*'||c.localName===name));
    return node;
  }
  return convert({elements:xmljs.xml2js(xml,{compact:false}).elements},null,{});
}
global.DOMParser=class{parseFromString(xml){return dom(xml);}};
function packageXml(styles,body){return `<pkg:package xmlns:pkg="${PKG}" xmlns:w="${W}"><pkg:part pkg:name="/word/styles.xml"><pkg:xmlData><w:styles>${styles}</w:styles></pkg:xmlData></pkg:part><pkg:part pkg:name="/word/document.xml"><pkg:xmlData><w:document><w:body>${body}</w:body></w:document></pkg:xmlData></pkg:part></pkg:package>`;}
const normal='<w:style w:type="paragraph" w:default="1" w:styleId="normal"><w:rPr><w:kern w:val="2"/><w:sz w:val="21"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:bidi="ar-SA"/></w:rPr></w:style>';
test('normal WPS default kerning and non-complex-script metadata are supported',()=>{
  const runs=rich.parseRuns(packageXml(normal,'<w:p><w:r><w:t>中文abc</w:t></w:r></w:p>'),'中文abc');assert.equal(runs.length,1);assert.deepEqual(runs.paragraphUnsupported,[]);
});
test('active unsupported docDefaults character format is rejected',()=>{
  assert.throws(()=>rich.parseRuns(packageXml('<w:docDefaults><w:rPrDefault><w:rPr><w:shadow/></w:rPr></w:rPrDefault></w:docDefaults>'+normal,'<w:p><w:r><w:t>甲</w:t></w:r></w:p>'),'甲'),/shadow/);
});
test('unsupported character formatting inherited through basedOn is rejected',()=>{
  const styles='<w:style w:type="paragraph" w:styleId="base"><w:rPr><w:shadow/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="child"><w:basedOn w:val="base"/></w:style>';
  assert.throws(()=>rich.parseRuns(packageXml(styles,'<w:p><w:pPr><w:pStyle w:val="child"/></w:pPr><w:r><w:t>甲</w:t></w:r></w:p>'),'甲'),/shadow/);
});
test('unreferenced unsupported styles are not treated as active formatting',()=>{
  const styles=normal+'<w:style w:type="paragraph" w:styleId="unused"><w:rPr><w:shadow/></w:rPr></w:style>';
  assert.equal(rich.parseRuns(packageXml(styles,'<w:p><w:r><w:t>甲</w:t></w:r></w:p>'),'甲').length,1);
});
test('an unrelated default style is not an implicit base of an explicit style',()=>{
  const styles='<w:style w:type="paragraph" w:default="1" w:styleId="default"><w:rPr><w:shadow/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="independent"/>';
  assert.equal(rich.parseRuns(packageXml(styles,'<w:p><w:pPr><w:pStyle w:val="independent"/></w:pPr><w:r><w:t>甲</w:t></w:r></w:p>'),'甲').length,1);
});
test('unknown run properties, missing styles and style cycles fail closed',()=>{
  assert.throws(()=>rich.parseRuns(packageXml(normal,'<w:p><w:r><w:rPr><w:unknownVisual/></w:rPr><w:t>甲</w:t></w:r></w:p>'),'甲'),/unknownVisual/);
  assert.throws(()=>rich.parseRuns(packageXml(normal,'<w:p><w:pPr><w:pStyle w:val="missing"/></w:pPr><w:r><w:t>甲</w:t></w:r></w:p>'),'甲'),/缺失的样式/);
  const styles='<w:style w:type="paragraph" w:default="1" w:styleId="a"><w:basedOn w:val="b"/></w:style><w:style w:type="paragraph" w:styleId="b"><w:basedOn w:val="a"/></w:style>';
  assert.throws(()=>rich.parseRuns(packageXml(styles,'<w:p><w:r><w:t>甲</w:t></w:r></w:p>'),'甲'),/循环/);
});
test('paragraph tabs inherited from styles are reported for explicit paragraph-mode rejection',()=>{
  const styles='<w:style w:type="paragraph" w:default="1" w:styleId="a"><w:pPr><w:tabs><w:tab w:pos="720"/></w:tabs></w:pPr></w:style>';
  const runs=rich.parseRuns(packageXml(styles,'<w:p><w:r><w:t>甲</w:t></w:r></w:p>'),'甲');assert.deepEqual(runs.paragraphUnsupported,['tabs']);
  assert.throws(()=>rich.richOptions({paragraph:{unsupported:runs.paragraphUnsupported}},{paragraphFormatting:true}),/tabs/);
});
test('complex-script typography and independent underline color are not silently ignored',()=>{
  assert.throws(()=>rich.parseRuns(packageXml(normal,'<w:p><w:r><w:t>عربي</w:t></w:r></w:p>'),'عربي'),/复杂文字脚本/);
  assert.throws(()=>rich.parseRuns(packageXml(normal,'<w:p><w:r><w:rPr><w:u w:val="single" w:color="FF0000"/></w:rPr><w:t>甲</w:t></w:r></w:p>'),'甲'),/下划线/);
});
test('font scalar application preserves unverified target properties and clears exclusive flags first',()=>{
  const wanted=Object.fromEntries(rich.properties.map(p=>[p,0]));Object.assign(wanted,{NameAscii:'Arial',NameFarEast:'宋体',Size:12,Subscript:-1,Bold:-1});
  const target={...wanted,NameAscii:'Times New Roman',Subscript:0,Superscript:-1,Shadow:-1,HighlightColorIndex:7};let writes=[];
  const proxy=new Proxy(target,{set(o,p,v){writes.push(p);o[p]=v;return true;}});rich.setSupportedFont(proxy,wanted);
  assert.equal(target.Shadow,-1);assert.equal(target.HighlightColorIndex,7);assert.ok(writes.every(p=>rich.properties.includes(p)));assert.ok(writes.indexOf('Superscript')<writes.indexOf('Subscript'));assert.ok(rich.sameFont(target,wanted));
});
test('paragraph scalar application clears active character units before point setters',()=>{
  const wanted=Object.fromEntries(rich.paragraphProperties.map(p=>[p,0]));wanted.FirstLineIndent=18;
  const target={...wanted,CharacterUnitFirstLineIndent:2,FirstLineIndent:21.6,Tabs:['keep'],Borders:'keep'};let writes=[];
  const proxy=new Proxy(target,{set(o,p,v){writes.push([p,v]);if(p==='FirstLineIndent'&&o.CharacterUnitFirstLineIndent!==0)return true;o[p]=v;return true;}});
  rich.setSupportedParagraph(proxy,wanted);assert.ok(rich.sameParagraph(target,wanted));assert.deepEqual(target.Tabs,['keep']);assert.equal(target.Borders,'keep');assert.ok(writes.findIndex(x=>x[0]==='CharacterUnitFirstLineIndent')<writes.findIndex(x=>x[0]==='FirstLineIndent'));
});
test('active character units allow destination-grid-derived points but require matching units',()=>{
  const a=Object.fromEntries(rich.paragraphProperties.map(p=>[p,0]));const source={...a,CharacterUnitFirstLineIndent:3,FirstLineIndent:27};
  assert.equal(rich.sameParagraph({...a,CharacterUnitFirstLineIndent:3,FirstLineIndent:32.4},source),true);
  assert.equal(rich.sameParagraph({...a,CharacterUnitFirstLineIndent:2,FirstLineIndent:27},source),false);
});

test('solid, white and explicit no-shading records allow ordinary rich text',()=>{
 for(const attrs of ['w:val="clear" w:fill="FFFFFF"','w:val="clear"','w:val="clear" w:color="auto" w:fill="auto"','w:val="clear" w:fill="FFFF00"','w:val="nil"']){
  const shd='<w:shd '+attrs+'/>';
  const runs=rich.parseRuns(packageXml(normal,`<w:p><w:pPr>${shd}</w:pPr><w:r><w:rPr><w:b/><w:i/>${shd}</w:rPr><w:t>字体加粗斜体</w:t></w:r></w:p>`),'字体加粗斜体');
  assert.equal(runs.length,1);assert.deepEqual(runs.paragraphUnsupported,[]);
 }
});
test('solid shading inherited from default, paragraph and character styles is inspected',()=>{
 const styles='<w:docDefaults><w:rPrDefault><w:rPr><w:shd w:val="clear" w:fill="FFFFFF"/></w:rPr></w:rPrDefault></w:docDefaults>'+normal;
 assert.equal(rich.parseRuns(packageXml(styles,'<w:p><w:r><w:t>甲</w:t></w:r></w:p>'),'甲').length,1);
});
test('pattern, theme, malformed and unknown shading must not be silently flattened',()=>{
 for(const attrs of ['w:val="pct20" w:fill="FFFFFF"','w:val="clear" w:themeFill="accent1"','w:val="clear" w:themeFillTint="FF"','w:val="clear" w:fill="oops"','w:val="clear" w:unexpected="1"','w:fill="FFFFFF"']){
  assert.throws(()=>rich.parseRuns(packageXml(normal,`<w:p><w:r><w:rPr><w:shd ${attrs}/></w:rPr><w:t>甲</w:t></w:r></w:p>`),'甲'),/底纹/);
 }
});
test('shading scalars are validated and an ignored native setter fails',()=>{
 const wanted={Texture:0,BackgroundPatternColor:16777215,ForegroundPatternColor:-16777216};
 const actual={...wanted,BackgroundPatternColor:65535};rich.setShading(actual,wanted);assert.deepEqual(actual,wanted);
 assert.throws(()=>rich.shadingValues({},false),/底纹属性/);
 assert.throws(()=>rich.shadingValues({...wanted,BackgroundPatternColor:9999999},false),/底纹属性/);
 const ignored=new Proxy({...wanted,BackgroundPatternColor:65535},{set(){return true;}});
 assert.throws(()=>rich.setShading(ignored,wanted),/未完整应用底纹/);
});
test('unchanged unsupported paragraph properties are preserved, changes remain blocked',()=>{
 const names=['kinsoku','textAlignment'];
 const source=packageXml(normal,'<w:p><w:pPr><w:kinsoku/><w:textAlignment w:val="auto"/></w:pPr><w:r><w:t>甲</w:t></w:r></w:p>');
 const payload={paragraph:{unsupported:names,preserved:rich.paragraphPropertySignatures(source,names)}};
 assert.doesNotThrow(()=>rich.verifyPreservedParagraph({WordOpenXML:source},payload));
 assert.throws(()=>rich.verifyPreservedParagraph({WordOpenXML:source.replace('w:val="auto"','w:val="center"')},payload),/与目标段落不同/);
 assert.throws(()=>rich.verifyPreservedParagraph({WordOpenXML:source.replace('<w:kinsoku/>','')},payload),/与目标段落不同/);
});
test('paragraph preservation resolves inheritance and retains unknown extension data',()=>{
 const names=['tabs'];
 const styles='<w:style w:type="paragraph" w:styleId="base"><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr></w:style><w:style w:type="paragraph" w:styleId="child"><w:basedOn w:val="base"/></w:style>';
 const inherited=packageXml(styles,'<w:p><w:pPr><w:pStyle w:val="child"/></w:pPr><w:r><w:t>甲</w:t></w:r></w:p>');
 const direct=packageXml(normal,'<w:p><w:pPr><w:tabs><w:tab w:pos="720" w:val="left"/></w:tabs></w:pPr><w:r><w:t>甲</w:t></w:r></w:p>');
 assert.deepEqual(rich.paragraphPropertySignatures(inherited,names),rich.paragraphPropertySignatures(direct,names));
 const ext=direct.replace('<w:tab w:pos="720" w:val="left"/>','<x:data xmlns:x="test" x:v="1"/>');
 assert.notDeepEqual(rich.paragraphPropertySignatures(ext,names),rich.paragraphPropertySignatures(ext.replace('x:v="1"','x:v="2"'),names));
});

test('verified OOXML highlighter colors and none are accepted with other character formatting',()=>{
 for(const color of ['none','black','blue','cyan','green','magenta','red','yellow','darkBlue','darkCyan','darkGreen','darkMagenta','darkRed','darkYellow','darkGray','lightGray']){
  const xml=packageXml(normal,`<w:p><w:r><w:rPr><w:b/><w:i/><w:highlight w:val="${color}"/><w:shd w:val="clear" w:fill="FFFFFF"/></w:rPr><w:t>中文ABC</w:t></w:r></w:p>`);
  assert.equal(rich.parseRuns(xml,'中文ABC')[0].text,'中文ABC');
 }
});
test('highlight inherited from styles or defaults is supported; unknown values still fail',()=>{
 const styles='<w:docDefaults><w:rPrDefault><w:rPr><w:highlight w:val="yellow"/></w:rPr></w:rPrDefault></w:docDefaults>'+normal;
 assert.equal(rich.parseRuns(packageXml(styles,'<w:p><w:r><w:t>甲</w:t></w:r></w:p>'),'甲').length,1);
 for(const attrs of ['w:val="white"','w:val="orange"','w:val="FF0000"','w:val="yellow" w:themeFill="accent1"',''])
  assert.throws(()=>rich.parseRuns(packageXml(normal,`<w:p><w:r><w:rPr><w:highlight ${attrs}/></w:rPr><w:t>甲</w:t></w:r></w:p>`),'甲'),/高亮/);
});
test('highlighter API handles mixed ranges, explicit removal and ignored setters',()=>{
 for(let color=0;color<=16;color++){if(color===8)continue;
  const range={HighlightColorIndex:9999999};rich.setHighlight(range,color);assert.equal(range.HighlightColorIndex,color);
 }
 for(const value of [undefined,null,'7',-1,8,17,9999999,NaN])assert.throws(()=>rich.highlightValue({HighlightColorIndex:value},false),/高亮/);
 assert.equal(rich.highlightValue({HighlightColorIndex:9999999},true),9999999);
 for(const value of [-1,8,17,9999999])assert.throws(()=>rich.setHighlight({HighlightColorIndex:0},value),/高亮/);
 const ignored={get HighlightColorIndex(){return 0;},set HighlightColorIndex(v){}};
 assert.throws(()=>rich.setHighlight(ignored,7),/未完整应用高亮/);
});
