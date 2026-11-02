// Independent property checks. No WPS APIs or user documents are used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plan } = require('../plan');
let state = 0x51A7C0DE;
function random() { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }
const atoms = ['甲', '乙', '甲', '。', '，', ' ', '\t', 'abc', 'abc', '2026', '2027', 'é', 'e\u0301', '😀', '👩‍🔬', 'α', '🇨🇳'];
function text(n) { return Array.from({length:n}, () => atoms[Math.floor(random() * atoms.length)]).join(''); }
function check(oldText, newText) {
  const edits = plan(oldText, newText);
  let cursor = 0;
  for (const e of edits) {
    assert.ok(Number.isSafeInteger(e.start) && Number.isSafeInteger(e.end));
    assert.ok(e.start >= cursor && e.end >= e.start && e.end <= oldText.length, JSON.stringify({oldText,newText,edits}));
    cursor = e.end;
  }
  let result = oldText;
  for (const e of edits.slice().reverse()) result = result.slice(0,e.start) + e.text + result.slice(e.end);
  assert.equal(result, newText);
  assert.deepEqual(plan(oldText, oldText), []);
}
test('10,000 reproducible independent Chinese/Latin/Unicode pairs round-trip', () => {
  for (let i=0; i<10000; i++) check(text(Math.floor(random()*65)), text(Math.floor(random()*65)));
});
test('2,000 local edits preserve exact prefix and suffix bytes', () => {
  for (let i=0; i<2000; i++) {
    const prefix=text(40), suffix=text(40);
    check(prefix+'独特待替换片段'+suffix, prefix+'新的内容'+suffix);
  }
});
test('long repeated Chinese paragraphs remain exact', () => {
  const a='中文论文内容，重复的句子。'.repeat(700);
  check(a, a.slice(0,3000)+'补充论证内容'+a.slice(3100));
});
test('over-limit input rejects before producing a plan', () => {
  assert.throws(()=>plan('中'.repeat(12001),'新文本'), /12000/);
  assert.throws(()=>plan('旧文本','中'.repeat(12001)), /12000/);
});
