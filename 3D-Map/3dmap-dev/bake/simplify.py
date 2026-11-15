"""Straighten and simplify the merged corridor outlines.

 * Douglas-Peucker (EPS) removes the traced / rasterised stair-step noise.
 * Edges within ANG of horizontal / vertical become exactly horizontal / vertical (right angles stay right angles).
 * Parallel neighbours that are only a tiny jog apart (<= JOG) are merged into one straight edge, so a wobbly or
   stair-stepped wall turns into a single line.  Real offsets bigger than JOG are kept.
 * Rings that would end up self-intersecting, or whose boundary moved more than MEANDEV on average, keep their old shape.
Runs after square.py (chamfers) in build.py; operates on bake/merged.json in place.
"""
import json,math,sys,numpy as np,cv2
R2=math.sqrt(2)
EPS=0.35; ANG=math.radians(12); JOG=1.0; JDEV=0.7; MINLEN=0.6; MEANDEV=0.35; MAXDEV=1.3; R=10.0
def typ(a,b):
    dx,dy=b[0]-a[0],b[1]-a[1]
    if math.hypot(dx,dy)<1e-9: return 'D'
    ang=math.atan2(abs(dy),abs(dx))
    return 'H' if ang<=ANG else ('V' if ang>=math.pi/2-ANG else 'D')
def mk(a,b):
    t=typ(a,b);L=math.hypot(b[0]-a[0],b[1]-a[1])
    if t=='H' and abs(a[1]-b[1])/2<=MAXDEV: return {'t':'H','c':(a[1]+b[1])/2,'k':[((a[1]+b[1])/2,L)],'a':a,'b':b}
    if t=='V' and abs(a[0]-b[0])/2<=MAXDEV: return {'t':'V','c':(a[0]+b[0])/2,'k':[((a[0]+b[0])/2,L)],'a':a,'b':b}
    d=abs(math.atan2(abs(b[1]-a[1]),abs(b[0]-a[0]))-math.pi/4)          # near 45 degrees: snap to an exact diagonal
    if d<=ANG:
        if (b[0]-a[0])*(b[1]-a[1])>0: ca,cb=(a[0]-a[1])/R2,(b[0]-b[1])/R2;t='P'
        else: ca,cb=(a[0]+a[1])/R2,(b[0]+b[1])/R2;t='N'
        if abs(ca-cb)/2<=MAXDEV: return {'t':t,'c':(ca+cb)/2,'k':[((ca+cb)/2,L)],'a':a,'b':b}
    return {'t':'D','a':a,'b':b}
def length(e): return math.hypot(e['b'][0]-e['a'][0],e['b'][1]-e['a'][1])
def merged(A,C):
    ks=A['k']+C['k'];w=sum(l for _,l in ks) or 1;c=sum(x*l for x,l in ks)/w
    if any(abs(x-c)>JDEV for x,_ in ks): return None
    return {'t':A['t'],'c':c,'k':ks,'a':A['a'],'b':C['b']}
def simplify_edges(E):
    ch=True
    while ch and len(E)>4:
        ch=False;n=len(E)
        for i in range(n):                       # 1) consecutive near-collinear edges of the same axis type
            A,C=E[i],E[(i+1)%n]
            if A['t'] in 'HVPN' and A['t']==C['t'] and abs(A['c']-C['c'])<=JOG*0.6:
                m=merged(A,C)
                if m: E[i]=m;del E[(i+1)%n if (i+1)%n>i else 0];ch=True;break
        if ch: continue
        for i in range(n):                       # 2) jog:  A  B(short)  C  with A,C parallel and close
            A,B,C=E[i],E[(i+1)%n],E[(i+2)%n]
            if A['t'] in 'HVPN' and A['t']==C['t'] and length(B)<=1.6 and abs(A['c']-C['c'])<=JOG:
                m=merged(A,C)
                if m:
                    idx=sorted([(i+1)%n,(i+2)%n],reverse=True);E[i]=m
                    for j in idx:
                        if j!=i: del E[j]
                    if (i+1)%n==0 or (i+2)%n==0: pass
                    ch=True;break
        if ch: continue
        for i in range(n):                       # 3) tiny edge between two non-parallel edges: drop (corners meet)
            A,B,C=E[i],E[(i+1)%n],E[(i+2)%n]
            if length(B)<MINLEN and not(A['t']==C['t'] and A['t'] in 'HVPN'):
                del E[(i+1)%n];ch=True;break
    return E
def line_x(e,f):
    """intersection of the supporting lines of two edges, or None"""
    def L(e):
        if e['t']=='H': return ((0.0,e['c']),(1.0,0.0))
        if e['t']=='V': return ((e['c'],0.0),(0.0,1.0))
        if e['t']=='P': return ((e['c']*R2,0.0),(1.0,1.0))
        if e['t']=='N': return ((e['c']*R2,0.0),(1.0,-1.0))
        return (tuple(e['a']),(e['b'][0]-e['a'][0],e['b'][1]-e['a'][1]))
    p,d=L(e);q,g=L(f);den=d[0]*g[1]-d[1]*g[0]
    if abs(den)<1e-6*max(1,math.hypot(*d)*math.hypot(*g)): return None
    t=((q[0]-p[0])*g[1]-(q[1]-p[1])*g[0])/den
    return [p[0]+d[0]*t,p[1]+d[1]*t]
def segx(a,b,c,d):
    def o(p,q,r): return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
    return o(a,b,c)*o(a,b,d)<-1e-9 and o(c,d,a)*o(c,d,b)<-1e-9
def simple(r):
    n=len(r)
    for i in range(n):
        a,b=r[i],r[(i+1)%n]
        for j in range(i+2,n):
            if i==0 and j==n-1: continue
            if segx(a,b,r[j],r[(j+1)%n]): return False
    return True
def area(r): return 0.5*sum(r[i][0]*r[(i+1)%len(r)][1]-r[(i+1)%len(r)][0]*r[i][1] for i in range(len(r)))
def xor_area(r,s):
    pts=np.array(r+s);x0,y0=pts.min(0)-1;x1,y1=pts.max(0)+1
    W=int((x1-x0)*R)+2;H=int((y1-y0)*R)+2
    if W*H>4e7: return 0.0
    a=np.zeros((H,W),np.uint8);b=np.zeros((H,W),np.uint8)
    cv2.fillPoly(a,[((np.array(r)-[x0,y0])*R).round().astype(np.int32)],1)
    cv2.fillPoly(b,[((np.array(s)-[x0,y0])*R).round().astype(np.int32)],1)
    return float((a^b).sum())/R/R
def simplify_ring(r):
    if len(r)<5: return r
    a=cv2.approxPolyDP(np.array(r,np.float32).reshape(-1,1,2),EPS,True).reshape(-1,2).tolist()
    if len(a)<4: return r
    n=len(a);E=[mk(a[i],a[(i+1)%n]) for i in range(n)]
    E=simplify_edges(E)
    if len(E)<4: return r
    out=[]
    for i,e in enumerate(E):
        f=E[(i+1)%len(E)]
        if e['t'] in 'PN' and e['t']==f['t']:      # parallel diagonals that survived: square jog between them
            s0=e['b']
            for g in (e,f):
                (px,py),(dx,dy)=((g['c']*R2,0.0),(1.0,1.0 if g['t']=='P' else -1.0));t=((s0[0]-px)*dx+(s0[1]-py)*dy)/2
                out.append([px+dx*t,py+dy*t])
            continue
        if e['t'] in 'HV' and e['t']==f['t']:      # parallel neighbours that survived: keep a right-angle jog
            s=e['b']
            out.append([s[0],e['c']] if e['t']=='H' else [e['c'],s[1]]);out.append([s[0],f['c']] if e['t']=='H' else [f['c'],s[1]]);continue
        P=line_x(e,f)
        if P is None or math.hypot(P[0]-e['b'][0],P[1]-e['b'][1])>2.0: return r
        out.append(P)
    res=[]
    for p in out:
        p=[round(p[0],2),round(p[1],2)]
        if not res or res[-1]!=p: res.append(p)
    if len(res)>1 and res[0]==res[-1]: res.pop()
    # drop vertices that became collinear
    k=0
    while k<len(res) and len(res)>3:
        p,q,s=res[k-1],res[k],res[(k+1)%len(res)]
        if abs((q[0]-p[0])*(s[1]-p[1])-(q[1]-p[1])*(s[0]-p[0]))<1e-6: del res[k]
        else: k+=1
    if len(res)<3 or not simple(res): return r
    per=sum(math.hypot(res[i][0]-res[i-1][0],res[i][1]-res[i-1][1]) for i in range(len(res)))
    if xor_area(r,res)>MEANDEV*per+0.5: return r
    return res
def rdp_only(r):
    a=cv2.approxPolyDP(np.array(r,np.float32).reshape(-1,1,2),0.3,True).reshape(-1,2).tolist()
    a=[[round(x,2),round(y,2)] for x,y in a]
    if len(a)<3 or len(a)>=len(r) or not simple(a): return r
    per=sum(math.hypot(a[i][0]-a[i-1][0],a[i][1]-a[i-1][1]) for i in range(len(a)))
    return a if xor_area(r,a)<=0.2*per+0.5 else r
def main(path):
    M=json.load(open(path));vb=va=0;same=0;rings=0
    for l,polys in M.items():
        for p in polys:
            for i,r in enumerate(p):
                vb+=len(r);rings+=1;q=simplify_ring(r)
                if q is r and len(r)>6: q=rdp_only(r)
                if q is r: same+=1
                p[i]=q;va+=len(q)
    json.dump(M,open(path,'w'),separators=(',',':'))
    print('simplify: vertices',vb,'->',va,'| rings',rings,'unchanged',same)
if __name__=='__main__': main(sys.argv[1])
