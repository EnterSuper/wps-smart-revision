/* Host adapter. No network, registry access, keyboard hooks or document writes. */
(function(root){
  'use strict';
  var VERSION='1.3.0';
  function api(){
    if(root.wps)return root.wps;
    if(root.Application)return root.Application;
    throw Error('请在 WPS 桌面版的加载项中打开。');
  }
  function application(){
    var host=api();
    var app=typeof host.WpsApplication==='function'?host.WpsApplication():host;
    if(!app||!app.Documents)throw Error('当前宿主不是可用的 WPS 文字应用。');
    return app;
  }
  function windows(){return /Win/i.test((root.navigator&&root.navigator.platform)||'')||/Windows/i.test((root.navigator&&root.navigator.userAgent)||'');}
  function identity(app){
    var build='';try{build=String(app.Build||'');}catch(ignore){}
    return VERSION+'|'+String(app.Version||'unknown')+'|'+build+'|'+((root.navigator&&root.navigator.userAgent)||'unknown');
  }
  function storage(){var h=api();return h.PluginStorage||(root.Application&&root.Application.PluginStorage);}
  function result(app){
    try{var s=storage(),v=s&&s.getItem('SmartRevisionCompatibility');var r=v?JSON.parse(v):null;return r&&r.identity===identity(app)?r:null;}catch(ignore){return null;}
  }
  function save(app,report){
    var s=storage();if(!s||typeof s.setItem!=='function'||typeof s.getItem!=='function')throw Error('WPS 未提供可共享的自检状态存储接口。');
    report.identity=identity(app);s.setItem('SmartRevisionCompatibility',JSON.stringify(report));
    if(!result(app)||JSON.stringify(result(app))!==JSON.stringify(report))throw Error('自检结果无法保存，未启用正文操作。');
  }
  function ready(app,mode){
    if(!windows())return;
    var r=result(app);
    if(!r||r[mode]!==true)throw Error('请先在“智能修订 → Windows 自检”运行'+(mode==='rich'?'格式':'文字')+'自检。自检只使用新建示例文档；通过后才启用此操作。');
  }
  function show(file,title,width,height){
    var h=api();if(typeof h.ShowDialog!=='function')throw Error('当前 WPS 未提供加载项对话框接口。');
    return h.ShowDialog(new URL(file,root.location.href).href,title,width,height,false);
  }
  root.SmartHost={version:VERSION,api:api,application:application,isWindows:windows,identity:identity,result:result,save:save,ensureReady:ready,show:show};
  if(typeof module==='object'&&module.exports)module.exports=root.SmartHost;
})(typeof window==='object'?window:globalThis);
