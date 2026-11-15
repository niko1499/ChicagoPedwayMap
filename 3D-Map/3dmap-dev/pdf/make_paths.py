"""Optional: read the vector shapes out of the PDF map so new areas can be traced exactly (as was done for the Merchandise Mart).
Needs poppler's pdftocairo on the PATH.   Run from 3dmap-dev/:   python pdf/make_paths.py ../PedwayMap.pdf
Writes pdf/paths.pkl: a list of {fill, stroke, sw, rings, bb} in MAP UNITS (the page is 1204 x 1007 map units)."""
import sys,subprocess,pickle,os
sys.path.insert(0,os.path.dirname(__file__))
import svgx
pdf=sys.argv[1] if len(sys.argv)>1 else '../PedwayMap.pdf'
subprocess.run(['pdftocairo','-svg',pdf,'pdf/map.svg'],check=True)
S=1.5575   # PDF points per map unit
paths=[]
for el,m in svgx.load('pdf/map.svg'):
    d=el.get('d')
    if len(d)>150000: continue
    rings=[[(p[0]/S,p[1]/S) for p in s if p!='Z'] for s in svgx.parse_d(d,m)]
    rings=[r for r in rings if len(r)>=3]
    if not rings: continue
    xs=[p[0] for r in rings for p in r];ys=[p[1] for r in rings for p in r]
    paths.append({'fill':el.get('fill'),'stroke':el.get('stroke'),'op':el.get('fill-opacity'),'sw':el.get('stroke-width'),'rings':rings,'bb':(min(xs),min(ys),max(xs),max(ys))})
pickle.dump(paths,open('pdf/paths.pkl','wb'));print(len(paths),'paths -> pdf/paths.pkl')
