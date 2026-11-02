from PIL import Image, ImageDraw, ImageFont
import numpy as np, math, subprocess, wave, json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'media'; OUT.mkdir(exist_ok=True)
WORK=ROOT/'work/promo'; WORK.mkdir(parents=True,exist_ok=True)
FPS=24; DURATION=30
FONT='/System/Library/Fonts/Hiragino Sans GB.ttc'
LATIN='/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
fonts={}
LOGO=Image.open(ROOT/'assets/brand/pinecone-mark.png').convert('RGBA')
logo_cache={}
def ease(x):
 x=max(0,min(1,x)); return x*x*(3-2*x)
def mix(a,b,t): return a+(b-a)*t
def smooth(t,a,b): return ease((t-a)/(b-a))
class Canvas:
 def __init__(self,vertical):
  self.w,self.h=(900,1600) if vertical else (1600,900); self.s=1.2; self.v=vertical
  self.im=Image.new('RGB',(round(self.w*self.s),round(self.h*self.s)), '#fafbfc'); self.d=ImageDraw.Draw(self.im)
 def col(self,c,alpha=1):
  if isinstance(c,str): c=tuple(int(c[i:i+2],16) for i in (1,3,5))
  return tuple(round(mix(250,x,alpha)) for x in c)
 def box(self,r,fill='#ffffff',outline=None,radius=0,width=1,alpha=1):
  rr=tuple(round(x*self.s) for x in r)
  self.d.rounded_rectangle(rr,round(radius*self.s),fill=self.col(fill,alpha) if fill else None,outline=self.col(outline,alpha) if outline else None,width=max(1,round(width*self.s)))
 def line(self,pts,c='#dce1e9',width=1,alpha=1):
  self.d.line([(round(x*self.s),round(y*self.s)) for x,y in pts],fill=self.col(c,alpha),width=max(1,round(width*self.s)))
 def circle(self,x,y,r,c='#747c89',alpha=1):
  self.d.ellipse(tuple(round(z*self.s) for z in (x-r,y-r,x+r,y+r)),fill=self.col(c,alpha))
 def text(self,txt,x,y,size=24,c='#252b34',align='left',alpha=1,latin=False,bold=False):
  key=(LATIN if latin else FONT,round(size*self.s),bold)
  if key not in fonts: fonts[key]=ImageFont.truetype(BOLD if bold and latin else key[0],key[1])
  ft=fonts[key]; bb=self.d.textbbox((0,0),txt,font=ft); ww=bb[2]-bb[0]
  xx=x*self.s-(ww/2 if align=='center' else ww if align=='right' else 0)
  self.d.text((round(xx),round(y*self.s-bb[1])),txt,font=ft,fill=self.col(c,alpha))
 def logo(self,x,y,size=25,alpha=1):
  side=round(size*1.65*self.s)
  if side not in logo_cache:logo_cache[side]=LOGO.resize((side,side),Image.Resampling.LANCZOS)
  im=logo_cache[side]
  if alpha<1:
   im=im.copy();im.putalpha(im.getchannel('A').point(lambda a:round(a*alpha)))
  self.im.paste(im,(round((x-size*.25)*self.s),round((y-size*.18)*self.s)),im)
 def footer(self,n):
  self.logo(50,self.h-52,18)
  self.text('Pinecone',80,self.h-49,16,c='#848b95',latin=True)
  self.text(f'0{n} / 06',self.w-50,self.h-47,13,c='#a4abb5',align='right',latin=True)
 def heading(self,kicker,title,subtitle,t,start):
  a=smooth(t,start,start+.6); dy=(1-a)*18
  self.text(kicker, self.w/2, (145 if self.v else 63)+dy,16,c='#7c899d',align='center',alpha=a,latin=True)
  self.text(title,self.w/2,(200 if self.v else 101)+dy,49 if self.v else 52,align='center',alpha=a)
  if subtitle:self.text(subtitle,self.w/2,(281 if self.v else 178)+dy,21 if self.v else 19,c='#818896',align='center',alpha=a)
 def shell(self,t):
  x,y,w,h=(52,365,796,1005) if self.v else (125,248,1350,540)
  self.box((x+2,y+10,x+w+2,y+h+10),'#f0f2f5',radius=20)
  self.box((x,y,x+w,y+h),'#ffffff',outline='#e5e8ed',radius=18)
  self.line([(x,y+49),(x+w,y+49)],'#eff1f4')
  for i in range(3): self.circle(x+22+i*15,y+24,4,'#dce1e7')
  self.text('松果 Pinecone',x+w/2,y+18,15,c='#7c8490',align='center')
  if not self.v:
   sw=176
   self.box((x+1,y+50,x+sw,y+h-1),'#f8f9fa',radius=0)
   self.logo(x+24,y+80,20);self.text('松果',x+58,y+83,18)
   for i,lab in enumerate(['全局搜索','四象限','笔记','我的项目']):self.text(lab,x+26,y+145+i*48,15,c='#767e89')
   return (x+sw+35,y+83,w-sw-70,h-116)
  return (x+29,y+86,w-58,h-119)

def points(rect):
 x,y,w,h=rect
 return [(x+w*a,y+h*b) for a,b in [( .18,.28),(.33,.39),(.20,.44),(.68,.23),(.82,.38),(.60,.40),(.23,.72),(.37,.85),(.69,.77)]]
NAMES=['学习一项新技能','设计下一版交互','整理课程资料','完成本周提案','明天写完论文','发布新版本','整理灵感收藏','记录一个想法','回复待办消息']
RAD=[9,6,5,12,8,7,6,4,6]
EDGES=[(0,1),(1,2),(3,4),(4,5),(6,7)]
def graph(c,rect,t,entry=False,focus=False):
 x,y,w,h=rect; pts=points(rect); axes=smooth(t,4.5,5.5) if entry else 1
 c.line([(x,y+h*.53),(x+w,y+h*.53)],'#d6dce5',1,axes);c.line([(x+w*.5,y),(x+w*.5,y+h)],'#d6dce5',1,axes)
 c.line([(x+w-7,y+h*.53-5),(x+w,y+h*.53),(x+w-7,y+h*.53+5)],'#bcc6d5',1,axes)
 c.line([(x+w*.5-5,y+7),(x+w*.5,y),(x+w*.5+5,y+7)],'#bcc6d5',1,axes)
 c.text('重要性',x+w*.5+12,y-2,14,c='#929bab',alpha=axes)
 c.text('紧急性',x+w,y+h*.53+12,14,c='#929bab',align='right',alpha=axes)
 for lab,xx,yy in [('计划安排',.04,.05),('立即行动',.55,.05),('稍后再说',.04,.58),('高效处理',.55,.58)]:c.text(lab,x+w*xx,y+h*yy,15,c='#939baa',alpha=axes)
 move=smooth(t,4.25,6.4) if entry else 1
 ps=[]
 for i,(px,py) in enumerate(pts):
  ox=x+w*(.15+(i%3)*.32);oy=y+h*(.25+(i//3)*.23)
  ps.append((mix(ox,px,move),mix(oy,py,move)))
 for j,(a,b) in enumerate(EDGES):
  reveal=smooth(t,10+j*.23,10.85+j*.23) if focus else (smooth(t,6.5+j*.13,7.4+j*.13) if entry else 1)
  p,q=ps[a],ps[b]; hot=focus and a in (3,4)
  c.line([p,(mix(p[0],q[0],reveal),mix(p[1],q[1],reveal))],'#9bb59f' if hot else '#dfe4ec',2 if hot else 1)
 for i,(px,py) in enumerate(ps):
  hot=focus and i in (3,4,5); a=1 if not focus or hot else .32
  r=RAD[i]*(1.3 if c.v else 1)
  if hot and i==4:
   c.circle(px,py,r+8,'#eef3ed');c.circle(px,py,r+4,'#ccdacc')
   r+=smooth(t,11.5,13)*4
  c.circle(px,py,r,'#516b57' if hot else '#727c8a',a)
  c.text(NAMES[i],px,py+r+12,15 if not c.v else 17,c='#516b57' if hot else '#687381',align='center',alpha=a)
 return ps

def render_frame(t,vertical):
 c=Canvas(vertical);w,h=c.w,c.h
 if t<4:
  a=smooth(t,.15,1); out=1-smooth(t,3.4,4)
  # Sparse fragments resolve into a single point of attention.
  for i,(xx,yy) in enumerate([(.14,.30),(.84,.25),(.80,.73),(.18,.75),(.51,.16),(.52,.84)]):
   p=smooth(t,1.6,3.2);xx=mix(xx,.5,p);yy=mix(yy,.56 if vertical else .58,p)
   c.circle(w*xx,h*yy,3+i%3,'#bcc8d8',out*.6)
  c.text('事情很多。',w/2,h*.36,62 if vertical else 70,align='center',alpha=a*out)
  b=smooth(t,1.0,2.1)
  c.text('重要的，先浮现。',w/2,h*.46,52 if vertical else 66,align='center',alpha=b*out)
  c.text('A LITTLE CLARITY. A LOT OF FOCUS.',w/2,h*.66,14,c='#8a95a5',align='center',latin=True,alpha=b*out)
  c.footer(1)
 elif t<10:
  c.heading('01  /  FIND YOUR FOCUS','轻重缓急，一眼清楚。','把任务放回它该在的位置。',t,4)
  rect=c.shell(t);graph(c,rect,t,entry=True);c.footer(2)
 elif t<15:
  c.heading('02  /  CONNECT THE DOTS','每件事，都有联系。','按时间连接，也按你的想法连接。',t,10)
  rect=c.shell(t);graph(c,rect,t,focus=True);c.footer(3)
 elif t<21:
  c.heading('03  /  A NEW PERSPECTIVE','换个视角，思路继续。','四象限与笔记，共用一份任务。',t,15)
  rect=c.shell(t);x,y,rw,rh=rect;p=smooth(t,15.3,16.9)
  ps=points(rect)
  rows=[('紧急重要',[3,4,5]),('重要不紧急',[0,1,2]),('紧急不重要',[8]),('不紧急不重要',[6,7])]
  # Morph the same task nodes into a structured outline.
  step=39 if vertical else 27
  baseY=y+35; positions={}; yy=baseY
  for gi,(lab,indices) in enumerate(rows):
   c.text(lab,x+30,yy,19 if vertical else 16,c='#394456',alpha=p)
   yy+=step+6
   for j in indices:
    positions[j]=(x+40,yy);yy+=step
   yy+=22 if vertical else 10
  for i,(px,py) in enumerate(ps):
   tx,ty=positions[i];xx=mix(px,tx,p);yy=mix(py,ty,p)
   c.circle(xx,yy+5,mix(RAD[i],3,p),'#75879e')
   c.text(NAMES[i],mix(px,tx+20,p),mix(py+RAD[i]+12,ty-3,p),17 if vertical else 15,c='#5e6979',align='left' if p>.65 else 'center')
  c.footer(4)
 elif t<26:
  c.heading('04  /  KEEP IT TOGETHER','任务，与文件在一起。','关联本地文件夹，点击即可打开。',t,21)
  yy=565 if vertical else 395; gap=0 if vertical else 200
  a=smooth(t,21.2,22.1)
  # A task and its directory, visually joined.
  if vertical: tx,ty,fx,fy=w/2,yy,w/2,yy+400
  else: tx,ty,fx,fy=500,yy,1100,yy
  c.box((tx-210,ty-65,tx+210,ty+120),'#ffffff',outline='#e4e8ee',radius=16,alpha=a)
  c.circle(tx-167,ty-22,7,'#516b57',a)
  c.text('发布松果',tx-145,ty-32,24,alpha=a)
  c.text('所属项目  /  产品研发',tx-169,ty+30,17,c='#8891a0',alpha=a)
  c.text('关联文件夹',tx-169,ty+73,16,c='#5f7f66',alpha=a)
  p=smooth(t,22,23.25)
  if vertical:c.line([(tx,ty+120),(tx,mix(ty+120,fy-45,p))],'#a3b7d5',2)
  else:c.line([(tx+210,ty+25),(mix(tx+210,fx-140,p),ty+25)],'#a3b7d5',2)
  b=smooth(t,22.7,23.6);rise=(1-b)*18
  c.box((fx-130,fy-45+rise,fx-23,fy-12+rise),'#e4ebf4',radius=9,alpha=b)
  c.box((fx-130,fy-25+rise,fx+130,fy+122+rise),'#eaf0f7',outline='#d6e1ee',radius=13,alpha=b)
  c.text('Pinecone',fx,fy+40+rise,26,c='#607a9f',align='center',latin=True,alpha=b)
  c.text('本地文件夹',fx,fy+150+rise,16,c='#8b95a4',align='center',alpha=b)
  c.footer(5)
 else:
  a=smooth(t,26,26.7); cy=h*.37
  c.logo(w/2-33,cy-150,65,a)
  c.text('松果',w/2,cy,87 if vertical else 96,align='center',alpha=a)
  c.text('Pinecone',w/2,cy+108,32,c='#516B57',align='center',latin=True,alpha=a)
  b=smooth(t,26.7,27.5)
  c.text('让重要的事，浮现。',w/2,cy+183,39 if vertical else 43,align='center',alpha=b)
  c.text('开源 · 本地优先 · 你的工作台',w/2,cy+258,20,c='#828c99',align='center',alpha=b)
  c.text('github.com/AOIWB/focusdesk',w/2,h*.79,19,c='#617a66',align='center',latin=True,alpha=smooth(t,27.4,28.3))
 # Brief white transitions to make chapter changes feel intentional.
 for cut in (4,10,15,21,26):
  d=abs(t-cut)
  if d<.16:
   c.im=Image.blend(c.im,Image.new('RGB',c.im.size,'#fafbfc'),(1-d/.16)*.86)
 return c.im

def music():
 sr=48000; tt=np.arange(sr*DURATION)/sr; l=np.zeros_like(tt);r=l.copy()
 # Original quiet ambient bed: slow pads and sparse bell notes.
 for start,notes in [(0,[146.83,220,293.66]),(6,[130.81,196,261.63]),(12,[164.81,246.94,329.63]),(18,[130.81,196,293.66]),(24,[146.83,220,293.66])]:
  dt=tt-start;env=np.where(dt>=0,np.minimum(np.maximum(dt,0)/1.2,1)*np.exp(-np.maximum(dt,0)/5),0)
  for f in notes:
   l+=.022*env*np.sin(2*np.pi*f*dt+.15*np.sin(2*np.pi*.12*tt))
   r+=.022*env*np.sin(2*np.pi*(f+.13)*dt)
 for i,start in enumerate([.8,2.1,4.1,5.4,7.1,10.1,11.4,13.1,15.1,16.6,18,21.1,22.7,24,26.1,27.3]):
  f=[587.33,440,659.25,493.88,523.25][i%5];dt=tt-start;env=np.where(dt>=0,(1-np.exp(-np.maximum(dt,0)*60))*np.exp(-np.maximum(dt,0)*1.8),0)
  tone=.044*env*(np.sin(2*np.pi*f*dt)+.18*np.sin(2*np.pi*f*2*dt))
  l+=tone*(.8 if i%2 else 1);r+=tone*(1 if i%2 else .8)
 fade=np.minimum(tt/.8,1)*np.minimum(np.maximum((30-tt)/1.5,0),1)
 data=np.stack([l*fade,r*fade],axis=1); data=np.tanh(data*1.8)*.8
 with wave.open(str(WORK/'music.wav'),'wb') as f:
  f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((data*32767).astype('<i2').tobytes())

def render(vertical):
 name='Pinecone-vertical-1080x1920.mp4' if vertical else 'Pinecone-landscape-1920x1080.mp4'
 size='1080x1920' if vertical else '1920x1080'
 cmd=['/opt/homebrew/bin/ffmpeg','-y','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',size,'-r',str(FPS),'-i','-','-i',str(WORK/'music.wav'),'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-af','volume=10dB','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',str(OUT/name)]
 proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 for i in range(FPS*DURATION):
  im=render_frame(i/FPS,vertical);proc.stdin.write(im.tobytes())
  if i in [60,170,290,430,560,675] and not vertical:im.save(WORK/f'frame-{i}.jpg',quality=92)
  if i%(FPS*5)==0: print(name, i//FPS,'seconds',flush=True)
 proc.stdin.close()
 if proc.wait()!=0: raise RuntimeError('ffmpeg failed')
 print('COMPLETE',name,flush=True)
if __name__=='__main__':
 import sys
 music()
 if '--stills' in sys.argv:
  for v in (False,True):
   for t in (2,8,12,19,24,28):render_frame(t,v).save(WORK/f'check-{int(v)}-{t}.jpg',quality=90)
 else:
  render(False);render(True)
