"""Render README illustrations from plan.js. Requires Node.js and Pillow.
Set DEMO_FONT to a CJK font path when not running on macOS.
These are explanatory illustrations, not WPS screenshots.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, os, subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
FONT = os.environ.get('DEMO_FONT', '/System/Library/Fonts/STHeiti Light.ttc')
OLD = '本项目拟于2026年启动，提升数据质量。'
NEW = '本项目计划于2027年启动，提升数据质量和安全性。'
script = "const {plan}=require('./plan');console.log(JSON.stringify(plan(" + json.dumps(OLD) + ',' + json.dumps(NEW) + ')));'
edits = json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT))
parts, pos = [], 0
for edit in edits:
    parts += [(OLD[pos:edit['start']], 'same'), (OLD[edit['start']:edit['end']], 'del'), (edit['text'], 'ins')]
    pos = edit['end']
parts.append((OLD[pos:], 'same'))
# Both readings of the illustration must match the example inputs.
assert ''.join(t for t,k in parts if k != 'ins') == OLD
assert ''.join(t for t,k in parts if k != 'del') == NEW

W, H = 1200, 680
INK, MUTED, BLUE = '#202a36', '#687686', '#245a9c'
def font(n): return ImageFont.truetype(FONT, n)
def label(d, xy, value, size=24, fill=INK): d.text(xy, value, font=font(size), fill=fill)
def base(title, sub):
    im = Image.new('RGB', (W,H), '#f6f7f9'); d = ImageDraw.Draw(im)
    label(d,(48,32),'WPS 智能修订',22,BLUE)
    label(d,(48,80),title,38)
    label(d,(48,137),sub,23,MUTED)
    d.line((48,621,1152,621),fill='#dde2e8',width=1)
    label(d,(48,641),'wps-smart-revision',18,MUTED)
    label(d,(925,641),'操作与效果示意',18,MUTED)
    return im,d

def richline(d, xy, pieces, size=30, width=1056, selected=False):
    x,y=xy; left=x; f=font(size)
    colors={'same':INK,'del':'#b33139','ins':'#176943'}
    for text,kind in pieces:
        for ch in text:
            cw=d.textlength(ch,font=f)
            if x+cw>left+width: x=left;y+=50
            bg='#dce9fa' if selected else {'del':'#fbe6e8','ins':'#dff2e6'}.get(kind)
            if bg: d.rectangle((x,y-2,x+cw+1,y+size+5),fill=bg)
            d.text((x,y),ch,font=f,fill=colors[kind])
            if kind=='del': d.line((x,y+size*.54,x+cw,y+size*.54),fill=colors[kind],width=2)
            if kind=='ins': d.line((x,y+size+4,x+cw,y+size+4),fill=colors[kind],width=2)
            x+=cw

def row(d, y, name, pieces, number):
    d.rounded_rectangle((48,y,1152,y+118),radius=12,fill='white',outline='#e1e5eb',width=1)
    label(d,(70,y+17),number,18,BLUE); label(d,(105,y+15),name,21,MUTED)
    richline(d,(72,y+61),pieces,29,width=1056)

im,d=base('整段贴回，只标出改动','相同的文字保留下来，增删落到具体字词。')
row(d,195,'原文',[(OLD,'same')],'01')
row(d,329,'改写后',[(NEW,'same')],'02')
row(d,463,'智能修订',parts,'03')
im.save(OUT/'revision-example.png',optimize=True)

frames=[]
steps=[('复制改写后的段落','从 WPS 复制，可以一起带入加粗、斜体和高亮。',[(NEW,'same')],'新段落',False),
       ('选中原文','回到正在修改的文档，选中要替换的段落。',[(OLD,'same')],'原段落',True),
       ('智能粘贴','相同文字保留，改动生成可接受、拒绝的原生修订。',parts,'修订结果',False)]
for n,(title,sub,content,caption,selected) in enumerate(steps):
    im,d=base(title,sub)
    for i,name in enumerate(['复制新段落','选中原文','智能粘贴']):
        x=48+i*374
        d.rounded_rectangle((x,194,x+354,246),radius=9,fill=BLUE if i==n else '#e9edf2')
        label(d,(x+18,207),str(i+1)+'  '+name,22,'white' if i==n else MUTED)
    d.rounded_rectangle((48,274,1152,486),radius=12,fill='white',outline='#e1e5eb',width=1)
    label(d,(72,300),caption,21,MUTED)
    richline(d,(72,361),content,30,width=1056,selected=selected)
    if n==2:
        label(d,(48,521),'工具栏：含格式智能粘贴',25,BLUE)
        label(d,(48,565),'Mac  Ctrl + Option + Cmd + V     ·     Windows  Ctrl + Alt + Shift + V',22,MUTED)
    else:
        label(d,(48,531),'复制 → 选中 → 粘贴',26,BLUE)
    frames.append(im.quantize(colors=128))
frames[0].save(OUT/'smart-paste.gif',save_all=True,append_images=frames[1:],duration=[2300,2300,4400],loop=0,optimize=True,disposal=2)
# Local previews are not publication assets.
frames[-1].convert('RGB').save('/tmp/wps-demo-last-frame.png')
print('Generated revision-example.png and smart-paste.gif from plan.js')
