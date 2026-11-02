using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Threading;

// Windows 11 / .NET Framework 4.x. No keyboard hooks, clipboard access or network.
public sealed class SmartRevisionKeys : Form {
 [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr w,int id,uint mods,uint key);
 [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr w,int id);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr w,out uint pid);
 readonly string folder;
 readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=4096};
 readonly NotifyIcon icon=new NotifyIcon();
 readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
 bool enabled=true,alternate=false,registered=false;
 string pending;double sent,lastFire;
 static double Now(){return (DateTime.UtcNow-new DateTime(1970,1,1)).TotalMilliseconds;}
 string PathFor(string name){return Path.Combine(folder,"wps-smart-revision-"+name+".json");}
 Dictionary<string,object> Read(string name){try{var p=PathFor(name);if(!File.Exists(p)||new FileInfo(p).Length>4096)return null;return json.Deserialize<Dictionary<string,object>>(File.ReadAllText(p));}catch{return null;}}
 static object Value(Dictionary<string,object> r,string k){object v;return r!=null&&r.TryGetValue(k,out v)?v:null;}
 bool Front(){try{uint pid;GetWindowThreadProcessId(GetForegroundWindow(),out pid);return Process.GetProcessById((int)pid).ProcessName.Equals("wps",StringComparison.OrdinalIgnoreCase);}catch{return false;}}
 void Info(string message){icon.BalloonTipTitle="WPS 智能修订";icon.BalloonTipText=message;icon.ShowBalloonTip(4000);}
 void Unregister(){UnregisterHotKey(Handle,1);UnregisterHotKey(Handle,2);registered=false;}
 void RefreshKeys(){
  if(!enabled||!Front()){if(registered)Unregister();}
  else if(!registered){
   // MOD_NOREPEAT prevents a held key from inserting repeatedly.
   uint mods=0x4000|0x0001|0x0002|0x0004;
   uint first=alternate?0x78u:0x56u,second=alternate?0x79u:0x42u;
   if(RegisterHotKey(Handle,1,mods,first)&&RegisterHotKey(Handle,2,mods,second))registered=true;
   else {Unregister();enabled=false;Info("快捷键被占用，已暂停。右键托盘图标可选择备用组合。");}
  }
  if(pending!=null){
   var r=Read("response");if((string)Value(r,"id")==pending){
    var status=(string)Value(r,"status");
    if(status=="completed"){pending=null;icon.Text="WPS 智能修订：已完成";}
    else if(status=="stopped"||status=="rejected"){pending=null;Info("本次已停止，请查看 WPS 提示或重新选择段落。");}
   }
   if(pending!=null&&Now()-sent>10000){pending=null;Info("未确认完成；没有自动重试。请先检查 WPS 文档。");}
  }
 }
 void Fire(int id){
  if(!enabled||!Front()||pending!=null||Now()-lastFire<800)return;lastFire=Now();
  var r=Read("ready");
  if(Convert.ToInt32(Value(r,"protocol")??0)!=1||!true.Equals(Value(r,"selected"))||!false.Equals(Value(r,"busy"))||!(Value(r,"session") is string)||Value(r,"sequence")==null){Info("请先在 WPS 点击“开启快捷键”，再选中原段落。");return;}
  var uuid=Guid.NewGuid().ToString();
  var q=new Dictionary<string,object>{{"id",uuid},{"session",r["session"]},{"sequence",r["sequence"]},{"time",Now()},{"mode",id==1?"rich":"plain"}};
  string tmp=PathFor("request")+"."+uuid+".tmp";
  try{File.WriteAllText(tmp,json.Serialize(q),new System.Text.UTF8Encoding(false));if(File.Exists(PathFor("request")))File.Replace(tmp,PathFor("request"),null);else File.Move(tmp,PathFor("request"));pending=uuid;sent=Now();}
  catch{if(File.Exists(tmp))File.Delete(tmp);Info("无法写入快捷键请求。未自动重试，请使用工具栏按钮。");}
 }
 public SmartRevisionKeys(string directory){
  folder=directory;ShowInTaskbar=false;WindowState=FormWindowState.Minimized;Opacity=0;
  icon.Icon=System.Drawing.SystemIcons.Application;icon.Text="WPS 智能修订快捷键";icon.Visible=true;
  var menu=new ContextMenuStrip();
  menu.Items.Add("默认：Ctrl+Alt+Shift+V / B",null,delegate{alternate=false;enabled=true;Unregister();RefreshKeys();});
  menu.Items.Add("备用：Ctrl+Alt+Shift+F9 / F10",null,delegate{alternate=true;enabled=true;Unregister();RefreshKeys();});
  menu.Items.Add("暂停 / 启用",null,delegate{enabled=!enabled;Unregister();RefreshKeys();});
  menu.Items.Add("退出快捷键辅助程序",null,delegate{Close();});icon.ContextMenuStrip=menu;
  timer.Interval=150;timer.Tick+=delegate{RefreshKeys();};timer.Start();
 }
 protected override void SetVisibleCore(bool value){base.SetVisibleCore(false);}
 protected override void WndProc(ref Message m){if(m.Msg==0x0312)Fire(m.WParam.ToInt32());base.WndProc(ref m);}
 protected override void OnFormClosed(FormClosedEventArgs e){timer.Stop();Unregister();icon.Dispose();base.OnFormClosed(e);}
 [STAThread] public static void Main(string[] args){
  if(args.Length!=1||!Directory.Exists(args[0])){MessageBox.Show("请从 WPS 的“智能修订 → 开启快捷键”启动。","WPS 智能修订");return;}
  bool created;using(var mutex=new Mutex(true,"Local\\WpsSmartRevisionKeys",out created)){
   if(!created)return;Application.EnableVisualStyles();using(var f=new SmartRevisionKeys(args[0])){var h=f.Handle;Application.Run(f);}mutex.ReleaseMutex();
  }
 }
}
