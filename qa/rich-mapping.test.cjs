const test = require('node:test');
const assert = require('node:assert/strict');
const { visibleSegments, mapVisibleRun, fontValues, sameFont, properties, applyRichFormatting,
  paragraphProperties, paragraphValues, sameParagraph, fullParagraph, richOptions } = require('../rich.js');

test('plain paragraph has identity offsets shifted by document start', () => {
  const segments = visibleSegments(100, 110, []);
  assert.deepEqual(mapVisibleRun(2, 5, segments), [{start:102,end:105}]);
});
test('format does not include deleted characters inside a visible run', () => {
  const segments = visibleSegments(10, 25, [{start:13,end:17}, {start:20,end:22}]);
  assert.deepEqual(mapVisibleRun(1, 8, segments), [{start:11,end:13}, {start:17,end:20}, {start:22,end:24}]);
});
test('deletions at either edge are excluded', () => {
  const segments = visibleSegments(20, 30, [{start:20,end:22},{start:28,end:30}]);
  assert.deepEqual(mapVisibleRun(0, 6, segments), [{start:22,end:28}]);
});
test('adjacent deletions work and wholly deleted text has no mapped segments', () => {
  assert.deepEqual(visibleSegments(0, 4, [{start:0,end:2},{start:2,end:4}]), []);
  assert.deepEqual(mapVisibleRun(0, 0, []), []);
});
test('overlapping or partial deletions fail closed', () => {
  for (const dels of [[{start:0,end:3},{start:2,end:4}], [{start:-1,end:2}], [{start:3,end:6}], [{start:2,end:2}]])
    assert.throws(() => visibleSegments(0,5,dels));
});
test('incomplete mapping and invalid offsets are rejected', () => {
  const segments = visibleSegments(2,6,[]);
  assert.throws(() => mapVisibleRun(0,5,segments));
  assert.throws(() => mapVisibleRun(-1,1,segments));
  assert.throws(() => visibleSegments(0,1.5,[]));
});
test('UTF-16 offsets preserve emoji code units', () => {
  const segments = visibleSegments(0,'甲😀旧乙'.length,[{start:3,end:4}]);
  assert.deepEqual(mapVisibleRun(1,3,segments), [{start:1,end:3}]);
});
test('all font scalars must be present; mixed source fonts fail', () => {
  const font = Object.fromEntries(properties.map(p=>[p,0]));
  assert.ok(sameFont(fontValues(font,false),font));
  assert.throws(()=>fontValues({...font,Size:undefined},false));
  assert.throws(()=>fontValues({...font,Size:9999999},false));
  assert.equal(fontValues({...font,Size:9999999},true).Size,9999999);
});
test('native checks read hidden characters through the core helper on every fresh range', () => {
  const values = Object.fromEntries(properties.map(p=>[p,0]));
  let calls=0;
  global.smartText = range => { calls++; return range.includingHidden; };
  const doc = {
    TrackRevisions:true, Content:{End:5},
    Range(start,end) { return {Text:'甲乙',includingHidden:'甲隐乙',Font:values,Revisions:{Count:0}}; }
  };
  const payload={text:'甲隐乙',isClosed:()=>false,runs:[{start:0,end:3,font:values,values}]};
  try {
    assert.equal(applyRichFormatting(doc,0,3,payload),0);
    assert.equal(calls,2);
  } finally { delete global.smartText; }
});
test('paragraph boundary checks use native end including deleted text', () => {
  const p={Range:{Start:10,End:19}};
  const range={Paragraphs:{Count:1,Item:()=>p}};
  assert.equal(fullParagraph(range,10,18),p);
  assert.throws(()=>fullParagraph(range,10,15));
  assert.throws(()=>fullParagraph(range,11,18));
  assert.throws(()=>fullParagraph({Paragraphs:{Count:2}},10,18));
});
test('unsupported paragraph options fail before the core transaction starts', () => {
  assert.throws(()=>richOptions({paragraph:{unsupported:['numPr']}},{paragraphFormatting:true}));
  assert.throws(()=>richOptions({paragraph:{unsupported:['tabs']}},{paragraphFormatting:true}));
  assert.throws(()=>richOptions({paragraph:{unsupported:['pBdr']}},{paragraphFormatting:true}));
  const values=Object.fromEntries(paragraphProperties.map(p=>[p,0]));
  assert.deepEqual(paragraphValues(values),values);
  assert.throws(()=>paragraphValues({...values,Alignment:undefined}));
});
test('paragraph comparison tolerates native floating-point roundoff only', () => {
  const values=Object.fromEntries(paragraphProperties.map(p=>[p,0]));
  assert.equal(sameParagraph({...values,FirstLineIndent:18.6},{...values,FirstLineIndent:18.600000381}),true);
  assert.equal(sameParagraph({...values,FirstLineIndent:18.6},{...values,FirstLineIndent:18.61}),false);
});
test('format-only paragraph update coexists with native deleted and paragraph revisions', () => {
  const font=Object.fromEntries(properties.map(p=>[p,0]));
  const oldFormat=Object.fromEntries(paragraphProperties.map(p=>[p,0]));
  const newFormat={...oldFormat,Alignment:1,SpaceAfter:6};
  let writes=0;
  const current=new Proxy({...oldFormat},{set(target,key,value){target[key]=value;writes++;return true;}});
  const paragraph={Range:{Start:10,End:16},get Format(){return current;},set Format(v){throw Error('whole-object formatting must never be assigned');}};
  const revisions=[{Type:2,Range:{Start:11,End:13}},{Type:10,Range:{Start:10,End:16}}];
  const doc={TrackRevisions:true,Content:{End:100},Range(){return {
    includingHidden:'甲乙丙',Font:font,
    Paragraphs:{Count:1,Item:()=>paragraph},
    Revisions:{Count:revisions.length,Item:i=>revisions[i-1]}
  };}};
  const payload={text:'甲乙丙',isClosed:()=>false,metadata:{},
    runs:[{start:0,end:3,font,values:font}],paragraph:{format:newFormat,unsupported:[]}};
  global.smartText=r=>r.includingHidden;
  try {
    assert.equal(applyRichFormatting(doc,10,15,payload,{paragraphFormatting:true}),1);
    assert.equal(writes,2);
    assert.deepEqual(current,newFormat);
    assert.equal(payload.metadata.fullParagraphApplied,true);
    assert.deepEqual(payload.metadata.verifiedParagraphProperties,paragraphProperties);
    assert.equal(applyRichFormatting(doc,10,15,payload,{paragraphFormatting:true}),0);
    assert.equal(writes,2);
  } finally {delete global.smartText;}
});
test('deterministic random mapping covers exactly the nondeleted native coordinates', () => {
  let seed=4103;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let iteration=0;iteration<3000;iteration++) {
    const start=Math.floor(random()*200),length=1+Math.floor(random()*80);
    const removed=Array.from({length},()=>random()<0.3),deletions=[];
    for(let i=0;i<length;) {
      if(!removed[i]){i++;continue;}
      const a=i;while(i<length&&removed[i])i++;
      deletions.push({start:start+a,end:start+i});
    }
    const expected=removed.flatMap((v,i)=>v?[]:[start+i]);
    const segments=visibleSegments(start,start+length,deletions);
    const a=Math.floor(random()*(expected.length+1));
    const b=a+Math.floor(random()*(expected.length-a+1));
    const actual=mapVisibleRun(a,b,segments).flatMap(s=>Array.from({length:s.end-s.start},(_,i)=>s.start+i));
    assert.deepEqual(actual,expected.slice(a,b));
  }
});

test('unverified kerning changes stop before any format setter runs', () => {
  const current = Object.fromEntries(properties.map(p=>[p,0]));
  const wanted = {...current,Kerning:12,Spacing:2};
  let writes=0;
  const guarded = new Proxy(current,{set(){writes++;throw Error('unexpected mutation');}});
  const doc={TrackRevisions:true,Content:{End:4},Range(){return {includingHidden:'甲乙丙',Font:guarded,Revisions:{Count:0}};}};
  global.smartText=r=>r.includingHidden;
  try {assert.throws(()=>applyRichFormatting(doc,0,3,{text:'甲乙丙',isClosed:()=>false,runs:[{start:0,end:3,values:wanted}]}),/Kerning/);assert.equal(writes,0);}
  finally{delete global.smartText;}
});
