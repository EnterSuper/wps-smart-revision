#import <Cocoa/Cocoa.h>
#import <Carbon/Carbon.h>
#import <sys/file.h>
// RegisterHotKey only: no accessibility/event tap, clipboard, network or document access.
@interface Keys : NSObject <NSApplicationDelegate>
@property NSStatusItem *item;
@property NSString *folder;
@property NSMutableArray *refs;
@property NSString *pending;
@property double sent, lastFire;
@property BOOL enabled, alternate;
@property NSMutableSet *down;
@property int lock;
@property NSWindow *diagnostic;
@property NSTextField *label;
@end
static OSStatus hotkey(EventHandlerCallRef next, EventRef ev, void *data) {
 EventHotKeyID key; GetEventParameter(ev,kEventParamDirectObject,typeEventHotKeyID,NULL,sizeof(key),NULL,&key);
 Keys *owner=(__bridge Keys*)data;
 if(GetEventKind(ev)==kEventHotKeyReleased){[owner.down removeObject:@(key.id)];return noErr;}
 if([owner.down containsObject:@(key.id)])return noErr;[owner.down addObject:@(key.id)];
 [owner performSelector:@selector(fire:) withObject:@(key.id)];return noErr;
}
@implementation Keys
-(NSString*)path:(NSString*)name{return [self.folder stringByAppendingPathComponent:[NSString stringWithFormat:@"wps-smart-revision-%@.json",name]];}
-(NSDictionary*)read:(NSString*)name {
 NSString *p=[self path:name];NSDictionary *a=[[NSFileManager defaultManager] attributesOfItemAtPath:p error:nil];
 if(!a||[a[NSFileSize] unsignedLongLongValue]>4096)return nil;
 NSData *d=[NSData dataWithContentsOfFile:p];id o=d?[NSJSONSerialization JSONObjectWithData:d options:0 error:nil]:nil;
 return [o isKindOfClass:[NSDictionary class]]?o:nil;
}
-(BOOL)front{return [[[NSWorkspace sharedWorkspace] frontmostApplication].bundleIdentifier isEqual:@"com.kingsoft.wpsoffice.mac"];}
-(void)message:(NSString*)s{self.item.button.title=@"修订!";self.item.button.toolTip=s;}
-(void)unregister{for(NSValue *v in self.refs)UnregisterEventHotKey(v.pointerValue);[self.refs removeAllObjects];[self.down removeAllObjects];}
-(void)refresh {
 NSString *bid=NSWorkspace.sharedWorkspace.frontmostApplication.bundleIdentifier;
 self.label.stringValue=[NSString stringWithFormat:@"含格式：⌃⌥⌘V    仅文字：⌃⌥⇧⌘V\n\n%@\n\n冲突时可从菜单栏“修订”切换备用 F9 / F10 组合。\n退出辅助程序即可释放组合键，不修改普通粘贴。",[self front]?@"WPS 在前台，快捷键已就绪。":@"等待 WPS 位于前台；其他应用中不占用组合键。"];
 BOOL active=self.enabled&&[self front];if(!active)[self unregister];
 if(active&&!self.refs.count){
  for(int i=1;i<=2;i++){
   EventHotKeyRef ref=NULL;UInt32 code=self.alternate?(i==1?kVK_F9:kVK_F10):kVK_ANSI_V;
   UInt32 mods=controlKey|optionKey|cmdKey|(!self.alternate&&i==2?shiftKey:0);
   OSStatus r=RegisterEventHotKey(code,mods,(EventHotKeyID){0x53525053,(UInt32)i},GetApplicationEventTarget(),0,&ref);
   if(r!=noErr){[self unregister];[self message:@"快捷键被占用，点击菜单选择备用组合。"];return;}
   [self.refs addObject:[NSValue valueWithPointer:ref]];
  }
 }
 if(self.pending){
  NSDictionary *r=[self read:@"response"];
  if([r[@"id"] isEqual:self.pending]){
   if([r[@"status"] isEqual:@"completed"]){self.pending=nil;self.item.button.title=@"修订✓";self.item.button.toolTip=@"智能粘贴完成，请在 WPS 中查看修订。";}
   else if([@[@"stopped",@"rejected"] containsObject:r[@"status"]]){self.pending=nil;[self message:@"本次已停止，请查看 WPS 提示或重新选中段落。"];}
  }
  if(self.pending&&NSDate.date.timeIntervalSince1970-self.sent>10){self.pending=nil;[self message:@"未确认完成；没有自动重试。请先检查 WPS 文档。"];}
 }
}
-(void)fire:(NSNumber*)key {
 double now=NSDate.date.timeIntervalSince1970;
 if(![self front]||!self.enabled||self.pending||now-self.lastFire<0.8)return;self.lastFire=now;
 NSDictionary *r=[self read:@"ready"];
 if([r[@"protocol"] intValue]!=1||![r[@"selected"] boolValue]||[r[@"busy"] boolValue]||![r[@"session"] isKindOfClass:NSString.class]||![r[@"sequence"] isKindOfClass:NSNumber.class]){
  [self message:@"先在 WPS 点击“开启快捷键”，再选中原段落。"];return;
 }
 NSString *uuid=NSUUID.UUID.UUIDString.lowercaseString;
 NSDictionary *q=@{@"id":uuid,@"session":r[@"session"],@"sequence":r[@"sequence"],@"time":@(now*1000),@"mode":key.intValue==1?@"rich":@"plain"};
 NSData *d=[NSJSONSerialization dataWithJSONObject:q options:0 error:nil];NSError *err=nil;
 if([d writeToFile:[self path:@"request"] options:NSDataWritingAtomic error:&err]){self.pending=uuid;self.sent=now;self.item.button.title=@"修订…";}
 else [self message:[@"无法写入请求：" stringByAppendingString:err.localizedDescription]];
}
-(void)applicationDidFinishLaunching:(NSNotification*)n {
 NSArray *args=NSProcessInfo.processInfo.arguments;
 self.folder=args.count==2?args[1]:[NSHomeDirectory() stringByAppendingPathComponent:@"Library/Containers/com.kingsoft.wpsoffice.mac/Data"];
 self.lock=open([[self.folder stringByAppendingPathComponent:@"wps-smart-revision-helper.lock"] fileSystemRepresentation],O_CREAT|O_RDWR,0600);
 if(self.lock<0||flock(self.lock,LOCK_EX|LOCK_NB)!=0){[NSApp terminate:nil];return;}
 self.diagnostic=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,680,220) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];self.diagnostic.title=@"WPS 智能修订 · 快捷键";self.label=[[NSTextField alloc] initWithFrame:NSMakeRect(10,10,660,180)];self.label.editable=NO;self.label.selectable=YES;[self.diagnostic.contentView addSubview:self.label];[self.diagnostic center];
 self.down=[NSMutableSet set];self.enabled=YES;self.refs=[NSMutableArray array];self.item=[NSStatusBar.systemStatusBar statusItemWithLength:NSVariableStatusItemLength];self.item.button.title=@"修订";
 NSMenu *menu=[NSMenu new];[menu addItemWithTitle:@"WPS 智能修订 · 快捷键" action:nil keyEquivalent:@""];[menu addItem:NSMenuItem.separatorItem];
 NSArray *titles=@[@"状态与使用说明",@"默认：⌃⌥⌘V / 加 ⇧ 仅文字",@"备用：⌃⌥⌘F9 / F10",@"暂停 / 启用",@"退出快捷键辅助程序"];
 NSArray *selectors=@[@"showStatus",@"primary",@"secondary",@"toggle",@"quit"];
 for(int i=0;i<5;i++){NSMenuItem *m=[menu addItemWithTitle:titles[i] action:NSSelectorFromString(selectors[i]) keyEquivalent:@""];m.target=self;}
 self.item.menu=menu;EventTypeSpec event[2]={{kEventClassKeyboard,kEventHotKeyPressed},{kEventClassKeyboard,kEventHotKeyReleased}};
 InstallEventHandler(GetApplicationEventTarget(),hotkey,2,event,(__bridge void*)self,NULL);
 [NSWorkspace.sharedWorkspace.notificationCenter addObserver:self selector:@selector(refresh) name:NSWorkspaceDidActivateApplicationNotification object:nil];
 [NSTimer scheduledTimerWithTimeInterval:0.2 target:self selector:@selector(refresh) userInfo:nil repeats:YES];[self refresh];
}
-(void)showStatus{[self.diagnostic makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];}
-(void)primary{self.alternate=NO;[self unregister];[self refresh];}
-(void)secondary{self.alternate=YES;[self unregister];[self refresh];}
-(void)toggle{self.enabled=!self.enabled;[self unregister];self.item.button.title=self.enabled?@"修订":@"修订暂停";[self refresh];}
-(void)quit{[self unregister];[NSApp terminate:nil];}
@end
int main(int argc,const char**argv){@autoreleasepool{NSApplication *app=NSApplication.sharedApplication;Keys *keys=[Keys new];app.delegate=keys;[app setActivationPolicy:NSApplicationActivationPolicyAccessory];[app run];}}
