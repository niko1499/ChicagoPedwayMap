import re,sys,json,math
import xml.etree.ElementTree as ET
NS='{http://www.w3.org/2000/svg}'
S=1.5575
def mat_mul(a,b):  # a*b, matrices (a,b,c,d,e,f)
    return (a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5])
def parse_tf(s):
    m=(1,0,0,1,0,0)
    for name,args in re.findall(r'(\w+)\(([^)]*)\)',s or ''):
        v=[float(x) for x in re.split(r'[ ,]+',args.strip()) if x]
        if name=='matrix': t=tuple(v)
        elif name=='translate': t=(1,0,0,1,v[0],v[1] if len(v)>1 else 0)
        elif name=='scale': t=(v[0],0,0,v[1] if len(v)>1 else v[0],0,0)
        else: continue
        m=mat_mul(m,t)
    return m
tok=re.compile(r'[MLCZmlczHVhv]|-?\d*\.?\d+(?:e-?\d+)?')
def parse_d(d,m):
    t=tok.findall(d);i=0;cmd=None;subs=[];cur=[];pos=(0,0)
    def tf(x,y): return (m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5])
    while i<len(t):
        if t[i].isalpha(): cmd=t[i];i+=1
        if cmd in 'Mm':
            x,y=float(t[i]),float(t[i+1]);i+=2
            if cur: subs.append(cur)
            cur=[tf(x,y)];pos=(x,y);cmd='L'
        elif cmd=='L':
            x,y=float(t[i]),float(t[i+1]);i+=2;cur.append(tf(x,y));pos=(x,y)
        elif cmd=='C':
            p=[float(v) for v in t[i:i+6]];i+=6
            x0,y0=pos
            for k in range(1,9):
                u=k/8;a=(1-u)**3;b=3*u*(1-u)**2;c=3*u*u*(1-u);dd=u**3
                cur.append(tf(a*x0+b*p[0]+c*p[2]+dd*p[4],a*y0+b*p[1]+c*p[3]+dd*p[5]))
            pos=(p[4],p[5])
        elif cmd in 'Zz':
            if cur: subs.append(cur+['Z']);cur=[]
        else: i+=1
    if cur: subs.append(cur)
    return subs
def walk(el,m,out):
    for ch in el:
        tag=ch.tag.replace(NS,'')
        mm=mat_mul(m,parse_tf(ch.get('transform')))
        if tag=='path' and ch.get('d'):
            out.append((ch,mm))
        elif tag in('g','a','svg'): walk(ch,mm,out)
def load(path='nxg.svg'):
    root=ET.parse(path).getroot()
    out=[];walk(root,(1,0,0,1,0,0),out)
    return out
