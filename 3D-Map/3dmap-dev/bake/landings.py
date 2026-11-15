"""Landing pads at stair / escalator / ramp ends + hand-placed lobby connectors.

Runs between the two bake passes (see build.py):
  pass 1  bake.py  -> merged.json from the recorded footprints
  here             -> reads rec.json + merged.json, appends extra footprint polygons to rec.json
  pass 2  bake.py  -> final merged.json (extras unioned with everything else)

Rule: at every Stairs / Escalator / Ramp end a person must have room for a corridor of
MIN_CORRIDOR_W, either straight on from the end or turning along it.  So a 4 x 4 square
either centred on the end, or just beyond it (away from the run), must be >= 90 % floor.
If neither is, a pad (width max(4, link width), length 4.2, starting 0.2 inside the run)
is added at that level.
"""
import json,math,numpy as np,cv2,sys
MIN_W=4.0; R=10.0; NEED=0.78; PAD_LEN=4.0; BACK=0.2
rec=json.load(open('bake/rec.json'))
json.dump(rec,open('bake/rec_orig.json','w'))
M=json.load(open('bake/merged.json'))

# ---- hand-placed Ogilvie lobby connectors (level 0), map units: x0,y0,x1,y1 -------------------------
#  existing L0 pieces: stair pad 109.7-116.8 x 472.7-477.2 ; south corridor 108.7-112.7 x 480.3-489.3
#  (door 110.5,489.7) ; ramp-foot stub 130-134.2 x 477.2-480.3 (door 134.2,478.8).
#  The ramp-foot lobby (east door) does NOT connect to the stair lobby at surface level on the PDF map, so no link between them.
MANUAL=[
 (0,108.67,476.9,112.67,480.6),   # south corridor  <-> stair pad
]
def rect(x0,y0,x1,y1): return [[x0,y0],[x1,y0],[x1,y1],[x0,y1]]
extra=[{'l':l,'ps':[rect(*r)]} for l,*r in MANUAL]

# ---- coverage masks (merged footprints + manual pieces) ---------------------------------------------
H=int(1007*R);W=int(1204*R)
masks={}
for l,polys in M.items():
    m=np.zeros((H,W),np.uint8)
    for p in polys:
        for i,r in enumerate(p):
            cv2.fillPoly(m,[(np.array(r)*R).round().astype(np.int32)],1 if i==0 else 0)
    masks[float(l)]=m
for e in extra:
    cv2.fillPoly(masks[e['l']],[(np.array(e['ps'][0])*R).round().astype(np.int32)],1)

def quad(c,d,Wd,Ll):
    d=np.array(d);p=np.array([-d[1],d[0]])
    return [c+d*Ll/2+p*Wd/2,c+d*Ll/2-p*Wd/2,c-d*Ll/2-p*Wd/2,c-d*Ll/2+p*Wd/2]
def cov(m,q):
    t=np.zeros_like(m);cv2.fillPoly(t,[(np.array(q)*R).round().astype(np.int32)],1)
    return float((t&m).sum())/max(int(t.sum()),1)

added=0;rows=[];rects=[]
for i,k in enumerate(rec['links']):
    A=np.array([k['ax'],k['az']]);B=np.array([k['bx'],k['bz']])
    L=np.linalg.norm(B-A)
    if L<1e-6: continue
    d=(B-A)/L
    for e,lv,dd in ((A,k['la'],-d),(B,k['lb'],d)):
        m=masks.get(lv)
        if m is None: continue
        c1=cov(m,quad(e,dd,MIN_W,MIN_W)); c2=cov(m,quad(e+dd*2,dd,MIN_W,MIN_W))
        if max(c1,c2)>=NEED: continue
        Wd=max(MIN_W,k['w']); Ll=PAD_LEN+BACK
        q=quad(e+dd*(PAD_LEN-BACK)/2,dd,Wd,Ll)          # from e-BACK*dd to e+PAD_LEN*dd
        added+=1;rows.append((i,k['t'],lv,round(float(e[0]),1),round(float(e[1]),1)))
        xs=[p[0] for p in q];ys=[p[1] for p in q]
        if max(abs(dd[0]),abs(dd[1]))>0.995:            # axis-aligned: rectangle, can be merged / snapped
            cq=quad(e+dd*MIN_W/2,dd,MIN_W,MIN_W);cxs=[p[0] for p in cq];cys=[p[1] for p in cq]   # required landing square
            rects.append([lv,min(xs),min(ys),max(xs),max(ys),[min(cxs),min(cys),max(cxs),max(cys)]])
        else:
            extra.append({'l':lv,'ps':[[[round(float(x),2),round(float(y),2)] for x,y in q]]})

# ---- square off: overlapping / near-touching pads become ONE larger room (bounding rectangle) ----------
GAP=0.8
def near(a,b): return a[0]==b[0] and a[1]-GAP<=b[3] and b[1]-GAP<=a[3] and a[2]-GAP<=b[4] and b[2]-GAP<=a[4]
ch=True
while ch:
    ch=False
    for i in range(len(rects)):
        for j in range(i+1,len(rects)):
            if near(rects[i],rects[j]):
                a,b=rects[i],rects[j]
                rects[i]=[a[0],min(a[1],b[1]),min(a[2],b[2]),max(a[3],b[3]),max(a[4],b[4]),[min(a[5][0],b[5][0]),min(a[5][1],b[5][1]),max(a[5][2],b[5][2]),max(a[5][3],b[5][3])]]
                del rects[j];ch=True;break
        if ch: break
nroom=len(rects)
# ---- align each pad side with a touching / overlapping wall of the existing footprint (removes tiny jogs) ----
#  wall further out than the pad side  -> the pad grows to it
#  wall further in                     -> the pad shrinks to it (never into its required landing square),
#                                         else a short wall is pushed out to the pad (a slightly larger room)
SNAP=0.8; TOUCH=0.15; MAXFILL=14.0
def wall_edges(l):
    V=[];Hh=[];m=masks[l]
    def inside(x,y):
        xi,yi=int(round(x*R)),int(round(y*R))
        return 0<=yi<m.shape[0] and 0<=xi<m.shape[1] and m[yi,xi]>0
    for p in M.get(str(l),[]):
        for r in p:
            for i in range(len(r)):
                a,b=r[i],r[(i+1)%len(r)]
                if abs(a[0]-b[0])<0.05 and abs(a[1]-b[1])>=1.0:
                    ym=(a[1]+b[1])/2;V.append((a[0],min(a[1],b[1]),max(a[1],b[1]),1 if inside(a[0]+0.25,ym) else -1))
                elif abs(a[1]-b[1])<0.05 and abs(a[0]-b[0])>=1.0:
                    xm=(a[0]+b[0])/2;Hh.append((a[1],min(a[0],b[0]),max(a[0],b[0]),1 if inside(xm,a[1]+0.25) else -1))
    return V,Hh
WE={}
def pick(v,span,edges,inner):
    best=None
    for pos,lo,hi,sd in edges:
        d=pos-v
        if sd==inner and 0.02<abs(d)<=SNAP and min(hi,span[1])-max(lo,span[0])>=-TOUCH and (best is None or abs(d)<abs(best[0])): best=(d,lo,hi)
    return best
nsnap=0;nfill=0;fills=[]
for r in rects:
    V,Hh=WE.setdefault(r[0],wall_edges(r[0]))
    for side in (1,2,3,4):
        vert=side in (1,3); out=-1 if side in (1,2) else 1; inner=-out
        b=pick(r[side],(r[2],r[4]) if vert else (r[1],r[3]),V if vert else Hh,inner)
        if b is None: continue
        d,lo,hi=b
        if d*out>0: r[side]+=d;nsnap+=1                      # wall is further out: pad grows to it
        else:
            n=list(r);n[side]+=d
            lim=(n[3]-n[1]>=MIN_W-1e-6 and n[1]<=r[5][0]+1e-6 and n[3]>=r[5][2]-1e-6) if vert else (n[4]-n[2]>=MIN_W-1e-6 and n[2]<=r[5][1]+1e-6 and n[4]>=r[5][3]-1e-6)
            if lim: r[side]+=d;nsnap+=1
            elif hi-lo<=MAXFILL:                                # push the short wall out to the pad
                pos=r[side]+d
                fills.append((r[0],(min(pos,r[side]),lo,max(pos,r[side]),hi) if vert else (lo,min(pos,r[side]),hi,max(pos,r[side]))));nfill+=1
for lv,f in fills:
    rects.append([lv,f[0],f[1],f[2],f[3],[f[0],f[1],f[0],f[1]]])
for lv,x0,y0,x1,y1,_ in rects:
    extra.append({'l':lv,'ps':[rect(round(x0,2),round(y0,2),round(x1,2),round(y1,2))]})
rec['polys'].extend(extra)
json.dump(rec,open('bake/rec.json','w'))
print('landings: manual',len(MANUAL),'auto pads',added,'-> rooms',nroom,'(aligned sides',nsnap,', pushed-out walls',nfill,')')
