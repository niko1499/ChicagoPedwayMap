import json,math,numpy as np,cv2,collections
R=10.0; SH=4
rec=json.load(open('bake/rec.json'))
def fp(mask,x0,y0,pts):
    a=np.array([[(x-x0)*R*(1<<SH),(y-y0)*R*(1<<SH)] for x,y in pts]).round().astype(np.int32)
    return a
def seg_quads(path,w):
    n=len(path);P=np.array(path,float);hw=w/2
    def sg(a,b):
        d=b-a;L=math.hypot(*d);return np.array([-d[1]/L,d[0]/L]) if L>1e-9 else None
    L_=[];R_=[]
    for i in range(n):
        A=P[max(0,i-1)];B=P[i];C=P[min(n-1,i+1)]
        a=sg(A,B);b=sg(B,C)
        if a is None and b is None: nn=np.array([0,1.]);rf=nn
        else:
            rf=a if a is not None else b
            nn=(a if a is not None else b)
            if a is not None and b is not None: nn=a+b
        nl=math.hypot(*nn) or 1;nn=nn/nl
        dd=max(.35,abs(nn@rf))
        L_.append(B+nn*hw/dd);R_.append(B-nn*hw/dd)
    return [[L_[i],L_[i+1],R_[i+1],R_[i]] for i in range(n-1)]
levels=sorted(set([x['l'] for x in rec['lines']]+[x['l'] for x in rec['polys']]+[x['l'] for x in rec['boxes']]))
out={};stats={}
for l in levels:
    xs=[];ys=[]
    for x in rec['polys']:
        if x['l']==l:
            for r in x['ps']:
                for p in r: xs.append(p[0]);ys.append(p[1])
    for x in rec['lines']:
        if x['l']==l:
            for p in x['path']: xs.append(p[0]);ys.append(p[1])
    for b in rec['boxes']:
        if b['l']==l: xs+= [b['x']-b['w']/2,b['x']+b['w']/2];ys+=[b['z']-b['d']/2,b['z']+b['d']/2]
    pad=6
    x0,y0=min(xs)-pad,min(ys)-pad;W=int((max(xs)-x0+pad)*R)+2;H=int((max(ys)-y0+pad)*R)+2
    m=np.zeros((H,W),np.uint8)
    for x in rec['polys']:
        if x['l']!=l: continue
        ps=x['ps']
        allp=[p for r in ps for p in r]
        bx0=int(max(0,(min(p[0] for p in allp)-x0)*R-2));bx1=int(min(W,(max(p[0] for p in allp)-x0)*R+3))
        by0=int(max(0,(min(p[1] for p in allp)-y0)*R-2));by1=int(min(H,(max(p[1] for p in allp)-y0)*R+3))
        tmp=np.zeros((by1-by0,bx1-bx0),np.uint8)
        for i,r in enumerate(ps):
            a=fp(None,x0+bx0/R,y0+by0/R,r)
            cv2.fillPoly(tmp,[a],1 if i==0 else 0,shift=SH)
        m[by0:by1,bx0:bx1]|=tmp
    for x in rec['lines']:
        if x['l']!=l: continue
        for q in seg_quads(x['path'],x['w']):
            cv2.fillPoly(m,[fp(None,x0,y0,q)],1,shift=SH)
    for b in rec['boxes']:
        if b['l']!=l: continue
        q=[[b['x']-b['w']/2,b['z']-b['d']/2],[b['x']+b['w']/2,b['z']-b['d']/2],[b['x']+b['w']/2,b['z']+b['d']/2],[b['x']-b['w']/2,b['z']+b['d']/2]]
        cv2.fillPoly(m,[fp(None,x0,y0,q)],1,shift=SH)
    before=int(m.sum())/R/R
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    cs,hh=cv2.findContours(m,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE);hh=hh[0]
    polys=[]
    def conv(c):
        a=cv2.approxPolyDP(c,0.6,True).reshape(-1,2)/R+[x0,y0]
        pts=[]
        for p in a:
            q=[round(float(p[0]),1),round(float(p[1]),1)]
            if not pts or pts[-1]!=q: pts.append(q)
        if len(pts)>2 and pts[0]==pts[-1]: pts.pop()
        return pts if len(pts)>=3 else None
    for i,c in enumerate(cs):
        if hh[i][3]!=-1: continue
        if cv2.contourArea(c)<0.6*R*R: continue
        outer=conv(c)
        if not outer: continue
        rings=[outer]
        for j in range(len(cs)):
            if hh[j][3]==i and cv2.contourArea(cs[j])>=1.0*R*R:
                h=conv(cs[j])
                if h: rings.append(h)
        polys.append(rings)
    out[str(l)]=polys
    stats[l]=(len(polys),sum(len(r) for p in polys for r in p),round(before),round(int(m.sum())/R/R))
print(stats)
json.dump(out,open('bake/merged.json','w'),separators=(',',':'))
import os;print(os.path.getsize('bake/merged.json'))
