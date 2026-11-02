(function(){
 function render(report){
  document.getElementById('check-status').textContent=report?(report.text?'文字检查通过；':'文字检查未通过；')+(report.rich?'格式检查通过。':'格式检查未通过。'):'尚未运行，请先自检。';
  document.getElementById('check-json').value=report?JSON.stringify(report,null,2):'';
  var list=document.getElementById('check-cases');list.textContent='';
  (report&&report.cases||[]).forEach(function(c){var li=document.createElement('li');li.textContent=(c.status==='pass'?'✓ ':'✕ ')+c.name+(c.error?'：'+c.error:'');list.appendChild(li);});
 }
 try{render(SmartHost.result(SmartHost.application()));}catch(e){document.getElementById('check-status').textContent=e.message;}
 document.getElementById('run-check').addEventListener('click',function(){
  var b=this;b.disabled=true;document.getElementById('check-status').textContent='正在使用新建示例自检…';
  setTimeout(function(){try{render(SmartCompatibility.run());}catch(e){document.getElementById('check-status').textContent='自检未完成：'+e.message;}finally{b.disabled=false;}},50);
 });
})();
