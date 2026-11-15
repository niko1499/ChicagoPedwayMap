"""Generate the Merchandise Mart block from the PDF's vector paths (pdf/paths.pkl) -> JS text."""
import pickle,re,json,sys
paths=pickle.load(open('pdf/paths.pkl','rb'))
WIN=(160,55,353,130)
def sh(c):
    if c in(None,'none'): return None
    v=[float(x) for x in re.findall(r'[\d.]+',c)];return '#%02x%02x%02x'%tuple(round(x*2.55) for x in v)
def inwin(b): return b[0]>=WIN[0] and b[2]<=WIN[2] and b[1]>=WIN[1] and b[3]<=WIN[3]
def clean(r):
    pts=[]
    for p in r:
        p=(round(p[0],2),round(p[1],2))
        if not pts or pts[-1]!=p: pts.append(p)
    if pts and pts[0]==pts[-1]: pts.pop()
    return [list(p) for p in pts]
def area(r): return 0.5*sum(r[i][0]*r[(i+1)%len(r)][1]-r[(i+1)%len(r)][0]*r[i][1] for i in range(len(r)))
fills={'#66bdff':[], '#ffeeaa':[], '#ffe680':[]}
for q in paths:
    if not inwin(q['bb']): continue
    c=sh(q['fill'])
    if c in fills and q['stroke'] in (None,'none'): fills[c].append(q)
def big(q,minv=8): return sum(len(r) for r in q['rings'])>=minv and len(q['rings'][0])<30
def poly(q): return [clean(r) for r in q['rings']]
def find(c,bb,tol=0.3):
    for q in fills[c]:
        if all(abs(q['bb'][i]-bb[i])<tol for i in range(4)): return q
    raise SystemExit('missing '+c+str(bb))
L1=[];L0=[];Lm=[]
for q in fills['#66bdff']:
    b=q['bb'];n=len(clean(q['rings'][0]))
    if (b[2]-b[0])>25 or n==8 or (n==4 and ((b[2]-b[0])>5 and (b[3]-b[1])>5)): L1.append(poly(q))   # B1 (big, 2 rings), B2, hub, connectors
L1=[p for p in L1 if not (len(p)==1 and len(p[0])==4 and abs(area(p[0]))<9)]
for q in fills['#ffeeaa']:
    b=q['bb'];n=len(clean(q['rings'][0]))
    if n==17 or (n==8 and b[0]<240): L0.append(poly(q))
L0.append(poly(find('#ffeeaa',[292.8,94.5,297.0,98.7])))
# the 20-vertex pale outline minus the part the darker (mezzanine) hall is drawn over
L0.append([[[237.57,59.49],[234.8,61.24],[259.66,89.42],[256.81,89.42],[256.81,94.35],[287.88,94.35],[287.88,89.42],[263.53,89.42]]])
L0.append([[[312.1,94.35],[345.31,94.35],[345.31,89.42],[342.95,89.42],[342.95,69.28],[350.38,61.85],[348.06,59.53],[339.67,67.92],[339.67,89.42],[312.1,89.42]]])
for q in fills['#ffe680']:
    b=q['bb'];n=len(clean(q['rings'][0]))
    if n==10 or (n==8 and b[0]>340) or (n==4 and abs(b[0]-296.5)<.3 and b[3]>120): Lm.append(poly(q))
# -1 pads: cells around the elevators / stairs of the lower loop, as exact rectangles
def rect(x0,y0,x1,y1): return [[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]]
pads=[(261.08,94.43,265.45,98.8),(265.54,94.5,269.73,98.8),(279.97,94.5,284.15,98.8),(301.46,94.43,305.82,98.8),(305.91,94.5,310.1,98.8),(328.4,94.5,332.58,98.8),(332.67,94.43,337.04,98.8),(337.04,94.43,345.69,98.8)]
for r in pads: Lm.append(rect(*r))
def fmt(p): return json.dumps(p,separators=(',',':'))
js=[]
js.append("/* ===== Merchandise Mart: rebuilt from the PDF's vector outlines (+1 blue, 0 pale yellow, darker yellow = sunken mezzanine at -0.25: a few steps below surface, shown with level 0) ===== */")
for lv,ps in ((1,L1),(0,L0),(-0.25,Lm)):
    js.append("polyRoom(%s,%s);"%(lv,fmt(ps)))
# thin parts (< MIN_CORRIDOR_W) are widened by line(): centre lines of the PDF corridors
js.append("line(1,2.37,[[261.17,93.16],[336.95,93.16]],null,5);line(1,2.36,[[221.74,102.16],[347.73,102.16]],null,5);line(1,2.36,[[193.18,95.48],[217.5,95.48],[222.4,100.75]],null,5,undefined,.5);")
js.append("line(0,3.24,[[236.19,60.37],[261.6,89.42]],null,5);line(0,3.28,[[341.31,89.4],[341.31,68.6],[349.2,60.71]],null,5,undefined,.5);line(0,1.9,[[217.0,70.48],[203.03,70.48],[203.03,86.0]],null,5);")
js.append("line(-0.25,1.9,[[251.9,99.85],[351.0,99.85]],null,5);")
# vertical connections
js.append("[[263.26,96.6],[303.64,96.6],[334.85,96.6]].forEach(([x,y])=>{new Elevator(x,y,-0.25,1,4.4,4.4)});")
js.append("new Escalator(195.27,94.3,1,195.27,89.9,0,3.4);new Escalator(295.1,89.2,1,295.1,84.9,-0.25,3.4);new Escalator(341.4,92.25,0,337.04,92.25,1,3.4);new Escalator(345.9,64,0,349.5,60.2,-0.25,3.4);")
js.append("new Stairs(292.1,107.9,1,296.4,107.9,-0.25,8.7);[267.63,282.06,330.49].forEach(x=>new Stairs(x,94.4,1,x,98.8,-0.25,4));[258.9,294.9].forEach(x=>new Stairs(x,97.9,0,x,100.6,-0.25,4));")
js.append("new Stairs(286,90,0,289.2,90,-0.25,2.4);new Stairs(314,90,0,310.8,90,-0.25,2.4);new Stairs(347.4,99.85,-0.25,350.4,99.85,0,2.2);")
js.append("/* ADA doors (blue on the PDF): north hall, south hall, west building */[[295.1,58.75],[301.75,122.6],[192.6,122.5]].forEach(([x,y])=>mk('A',x,y,0));")
open('bake/mart_block.js','w',encoding='utf-8').write('\n'.join(js)+'\n')
print('L1 polys',len(L1),'L0',len(L0),'L-1',len(Lm))
for l,n in (('L1',L1),('L0',L0),('Lm',Lm)): print(l,[ (len(p),len(p[0])) for p in n])
