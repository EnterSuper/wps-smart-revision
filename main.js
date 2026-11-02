document.write('<script src="host.js"></script>');
document.write('<script src="vendor/diff-browser.js"></script>');
document.write('<script src="plan.js"></script>');
document.write('<script src="rich.js"></script>');
document.write('<script src="live.js"></script>');
document.write('<script src="shortcuts.js"></script>');
function OnSmartLoad(ui){window.SmartRibbon=ui;try{if(SmartHost.api().PluginStorage.getItem("SmartRevisionShortcutsEnabled")==="1")SmartShortcuts.start();}catch(e){}return true;}
var SmartLoading=false;
function smartInvoke(name){
 if(SmartLoading)return;SmartLoading=true;
 function load(src,done){var s=document.createElement('script');s.src=src+'?v='+Date.now();s.onload=function(){s.remove();done();};s.onerror=function(){s.remove();SmartLoading=false;alert('无法读取本地智能修订脚本。');};document.head.appendChild(s);}
 load('rich.js',function(){load('live.js',function(){try{window[name]();}catch(e){alert('智能修订：'+e.message);}finally{SmartLoading=false;}});});
}
function OnSmartTest(){smartInvoke('smartTest');}
function OnSmartPaste(){smartInvoke('smartPaste');}
function OnSmartPlainPaste(){smartInvoke('smartPlainPaste');}
function OnSmartRichPaste(){smartInvoke('smartRichPaste');}
function OnSmartNativeTracking(){smartInvoke('smartNativeTracking');}
function OnSmartHelp(){smartInvoke('smartHelp');}
function OnSmartTestResults(){smartInvoke('smartTestResults');}
function OnSmartCompatibility(){smartInvoke('smartCompatibility');}
function SmartGetImage(control){var names={localSmartPaste:'paste',localSmartRichPaste:'format',localSmartPlainPaste:'paste',localSmartCompatibility:'report',localSmartNativeTracking:'tracking',localSmartHelp:'help',localSmartTest:'example',localSmartTestResults:'report'};return 'images/'+(names[control.Id]||'help')+'.svg';}

function OnSmartShortcutStart(){smartInvoke('smartShortcutStart');}

function OnSmartShortcutStop(){smartInvoke('smartShortcutStop');}
