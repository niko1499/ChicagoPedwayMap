"""Square off chamfered / rounded corners in the merged corridor outlines (fewer polygon vertices).

A corner chamfer is a short run of short edges (each < LSHORT, run < MAXCHAIN) sitting between two long
edges that are roughly perpendicular.  The run is replaced by one vertex at the intersection of the two
long edges, provided that vertex is within MAXMOVE of both ends of the run.  Convex corners therefore grow
to the full square corner (a slightly larger room); reflex corners become sharp.
Jogs (the two long edges parallel) and long runs of tiny edges (diagonal walls) are left alone.
Rings that would self-intersect after squaring keep their original shape.
"""
import json,math,sys
LSHORT=1.35; MAXCHAIN=2.6; MAXMOVE=1.4
def dist(a,b): return math.hypot(a[0]-b[0],a[1]-b[1])
def inter(p,d,q,e):
    den=d[0]*e[1]-d[1]*e[0]
    if abs(den)<1e-9: return None
    t=((q[0]-p[0])*e[1]-(q[1]-p[1])*e[0])/den
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
def square_ring(r):
    n=len(r)
    if n<5: return r
    L=[dist(r[i],r[(i+1)%n]) for i in range(n)]
    longs=[i for i in range(n) if L[i]>=LSHORT]
    if len(longs)<2 or len(longs)==n: return r
    out=[]
    for k,a in enumerate(longs):
        b=longs[(k+1)%len(longs)]
        # vertices between long edge a and long edge b : r[a+1] .. r[b]  (indices mod n)
        cnt=(b-a)%n
        if cnt==0: cnt=n
        cv=[r[(a+1+j)%n] for j in range(cnt)]
        if cnt==1: out.append(cv[0]);continue
        chain=sum(dist(cv[j],cv[j+1]) for j in range(cnt-1))
        pa,pa1=r[a],r[(a+1)%n]; pb,pb1=r[b%n],r[(b+1)%n]
        d=(pa1[0]-pa[0],pa1[1]-pa[1]); e=(pb1[0]-pb[0],pb1[1]-pb[1])
        la=math.hypot(*d); lb=math.hypot(*e)
        cosang=(d[0]*e[0]+d[1]*e[1])/(la*lb)
        P=inter(pa,d,pb,e) if abs(cosang)<0.5 else None       # roughly perpendicular only
        if P and chain<=MAXCHAIN and dist(P,cv[0])<=MAXMOVE and dist(P,cv[-1])<=MAXMOVE:
            out.append([round(P[0],2),round(P[1],2)])
        else: out.extend(cv)
    # drop duplicate / collinear leftovers
    res=[]
    for p in out:
        if not res or dist(res[-1],p)>1e-6: res.append(p)
    if len(res)>1 and dist(res[0],res[-1])<1e-6: res.pop()
    return res if len(res)>=3 and simple(res) else r
def main(path):
    M=json.load(open(path)); before=after=0; kept=0
    for l,polys in M.items():
        for p in polys:
            for i,r in enumerate(p):
                before+=len(r); q=square_ring(r)
                if q is r: kept+=1
                p[i]=q; after+=len(q)
    json.dump(M,open(path,'w'),separators=(',',':'))
    print('square: vertices',before,'->',after,'| rings left untouched',kept)
if __name__=='__main__': main(sys.argv[1])
