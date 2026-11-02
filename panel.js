(function () {
  'use strict';
  function put(id, text) { document.getElementById(id).textContent = text; }
  function refresh() {
    try {
      var api = window.Application || window.wps;
      if (!api) throw Error('请在 WPS 的“智能修订”中打开此页。');
      var app = SmartHost.application();
      document.querySelectorAll('[data-modifier]').forEach(function(k){k.textContent=SmartHost.isWindows()?'Ctrl':'⌘';});
      var doc = app.Documents.Count ? app.ActiveDocument : null;
      put('document-name', doc ? String(doc.Name) : '未打开文档');
      put('tracking-status', doc ? (doc.TrackRevisions ? '已开启' : '未开启') : '—');
      // The host must publish this only after an actual keyboard-triggered test.
      var shortcut = api.PluginStorage && api.PluginStorage.getItem('SmartRevisionShortcutsEnabled');
      put('shortcut-status', shortcut==='1' ? (SmartHost.isWindows()?'Ctrl+Alt+Shift+V（需运行辅助程序）':'⌃⌥⌘V（需运行辅助程序）') : '从工具栏“开启快捷键”设置');
      var status=SmartHost.result(app);put('status-message',SmartHost.isWindows()&&(!status||!status.rich)?'首次使用请先点击本机自检；失败的功能不会用于原文。':'在正文选好段落后，点击上方对应操作。');
    } catch (error) {
      put('document-name', '无法读取');put('tracking-status', '—');
      put('status-message', error.message || '请返回 WPS 后重试。');
    }
  }
  document.getElementById('refresh-status').addEventListener('click', refresh);
  document.querySelectorAll('[data-action]').forEach(function(button){button.addEventListener('click',function(){try{window[button.dataset.action]();}catch(e){alert(e.message);}refresh();});});
  window.addEventListener('focus', refresh);
  refresh();
}());
