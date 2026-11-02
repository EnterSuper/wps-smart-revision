(function(root){
  'use strict';
  var diff=typeof module==='object'?require('./vendor/diff-array.cjs'):root.SmartDiff;
  function plan(oldText,newText){
    if(oldText.length>12000||newText.length>12000)throw Error('一次最多处理 12000 个字符，请按段落操作。');
    var tokens=function(t){return t.match(/[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_]/gu)||[];};
    var parts=diff.diffArrays(tokens(oldText),tokens(newText),{timeout:1000,maxEditLength:8000});
    if(!parts)throw Error('改写过大，未能及时对齐，请缩小选区。');
    var offset=0,edits=[],current=null;
    parts.forEach(function(p){var text=p.value.join('');
      if(!p.added&&!p.removed){current=null;offset+=text.length;return;}
      if(!current){current={start:offset,end:offset,text:''};edits.push(current);}
      if(p.removed){offset+=text.length;current.end=offset;}else current.text+=text;
    });
    return edits;
  }
  if(typeof module==='object')module.exports={plan:plan};else root.SmartPlan={plan:plan};
})(typeof window==='object'?window:globalThis);
