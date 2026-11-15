"""Build the 3D Pedway viewer.   Run from the 3dmap-dev folder:   python bake/build.py
Reads bake/pre_bake.html (THE SOURCE - edit this), merges corridor footprints offline, writes ../3d/index.html."""
import re,subprocess,json,shutil,sys,os
PY=sys.executable
B='bake/'
OUT='../3d/index.html'
src=open(B+'pre_bake.html',encoding='utf-8').read()
def rep(s,a,b,n=1):
    assert s.count(a)==n,(a[:70],s.count(a));return s.replace(a,b)
# 0. source-level tweaks (pre-bake): short corridor boxes also reach the minimum width
src=rep(src,"if(Math.min(w,d)<m&&Math.max(w,d)>=2*m){if(w<d)w=m;else d=m}","if(Math.min(w,d)<m&&Math.max(w,d)>=1.05*m){if(w<d)w=m;else d=m}")
open(B+'src2.html','w',encoding='utf-8').write(src)
# 0b. ground image: re-render ../Images/Background.svg to bake/ground.webp if the SVG changed (needs Inkscape); embedded in step 2
r=subprocess.run([PY,B+'background.py'],capture_output=True,text=True);print(r.stdout.strip(),r.stderr.strip()[-400:])
# 1. record footprints
js=max(re.findall(r'<script>(.*?)</script>',src,re.S),key=len)
for a,b in [
 ("const pd=!CAT;return sweep(","const pd=!CAT;if(pd&&col==LV[l][1]){__REC.lines.push({l:+l,w,h,path:sm(p,rad||Math.max(8,w0*3),1.22)})}return sweep("),
 ("polys.forEach(ps=>{if(!pk)ps=widenRect(ps);","polys.forEach(ps=>{if(!pk)ps=widenRect(ps);if(!pk)__REC.polys.push({l:+l,ps});"),
 ("function box(g,w,h,d,col,x,y,z,op){","function box(g,w,h,d,col,x,y,z,op){{const k=Object.keys(G).find(q=>G[q]===g);if(k!==undefined&&col==LV[k][1])__REC.boxes.push({l:+k,w,h,d,x:x+cx,z:z+cz,rot:0})}"),
 ("this.stops=st;this.la=st[0];","__REC.elev.push({x,y,st,w,d});this.stops=st;this.la=st[0];"),
 ("this.init();ramps.push(this)}","this.init();__REC.links.push({t:this.constructor.name,ax:this.a.x+cx,az:this.a.z+cz,bx:this.b.x+cx,bz:this.b.z+cz,la:this.la,lb:this.lb,w:this.w});ramps.push(this)}")]:
    js=rep(js,a,b)
open(B+'inst.js','w',encoding='utf-8').write(js)
print(subprocess.run(['node',B+'run.js'],capture_output=True,text=True).stdout.strip())
print(subprocess.run([PY,B+'bake.py'],capture_output=True,text=True).stdout.strip())
# 1b. landing pads at link ends + lobby connectors, then bake again
r=subprocess.run([PY,B+'landings.py'],capture_output=True,text=True);print(r.stdout.strip(),r.stderr.strip()[-400:])
print(subprocess.run([PY,B+'bake.py'],capture_output=True,text=True).stdout.strip())
# 1c. square off chamfered corners (fewer vertices)
print(subprocess.run([PY,B+'square.py',B+'merged.json'],capture_output=True,text=True).stdout.strip())
# 1d. straighten near-axis edges, merge tiny jogs / stair-steps, simplify (fewer vertices)
print(subprocess.run([PY,B+'simplify.py',B+'merged.json'],capture_output=True,text=True).stdout.strip())
merged=open(B+'merged.json').read()
# 2. patch final page
s=src
s=rep(s,"const MIN_CORRIDOR_W=4.0;","const MIN_CORRIDOR_W=4.0;\n/* BAKED: all corridor footprints on a level (polyRoom outlines, line() corridors, corridor boxes) are unioned offline into MERGED so overlaps share one floor/ceiling and no inner walls. While BAKED is true those individual calls draw nothing; to add or change a corridor, edit the source call and re-bake (or append outlines to MERGED). */\nconst BAKED=true;")
s=rep(s,"const pd=!CAT;return sweep(","const pd=!CAT;if(BAKED&&pd&&col==LV[l][1])return;return sweep(")
s=rep(s,"function box(g,w,h,d,col,x,y,z,op){","function box(g,w,h,d,col,x,y,z,op){if(BAKED&&!g.isBld){const k=Object.keys(G).find(q=>G[q]===g);if(k!==undefined&&col==LV[k][1])return new THREE.Object3D()}")
helpers=open(B+'helpers.js',encoding='utf-8').read()
s=rep(s,"function polyRoom(l,polys,col,hg){",helpers+"function polyRoom(l,polys,col,hg){if(BAKED&&!col&&!polyRoom.b)return;")
a="const wl=new THREE.ExtrudeGeometry(sh,{depth:hg,bevelEnabled:false,curveSegments:6});wl.rotateX(Math.PI/2);wl.translate(0,hg/2,0);\n{const ms=[new THREE.Mesh(fl,m[3]),new THREE.Mesh(cl,m[2]),new THREE.Mesh(wl,[hid,m[0]])];"
b="let wm;if(pk){const wl=new THREE.ExtrudeGeometry(sh,{depth:hg,bevelEnabled:false,curveSegments:6});wl.rotateX(Math.PI/2);wl.translate(0,hg/2,0);wm=new THREE.Mesh(wl,[hid,m[0]])}else wm=wallMesh(l,ps,hg,m[0]);\n{const ms=[new THREE.Mesh(fl,m[3]),new THREE.Mesh(cl,m[2]),wm];"
s=rep(s,a,b)
s=rep(s,"// labels\n","/* merged corridor footprints per level (see BAKED) */\nconst MERGED="+merged+";\npolyRoom.b=1;Object.keys(MERGED).forEach(l=>polyRoom(+l,MERGED[l],undefined,5));polyRoom.b=0;\n// labels\n")
# ground image embedded as a data URI: a separate file cannot be used as a WebGL texture when the page is opened from disk
if os.path.exists(B+'ground.webp'):
    import base64
    s=rep(s,"gImg.src='ground.webp';","gImg.src='data:image/webp;base64,"+base64.b64encode(open(B+'ground.webp','rb').read()).decode()+"';")
else:print('WARNING: bake/ground.webp missing (run python bake/background.py); the ground falls back to the drawn street grid')
# ramp deck sits on the floor plane (like stairs/escalators) instead of a slab centred on the level origin
# (ramp deck shift removed: Ramp is a hollow tube whose bottom face is the floor, so +-2.5 about the level origin was already right)
open(B+'final.html','w',encoding='utf-8').write(s)
os.makedirs(os.path.dirname(OUT),exist_ok=True);shutil.copyfile(B+'final.html',OUT);print('wrote',OUT)
js=max(re.findall(r'<script>(.*?)</script>',s,re.S),key=len);open(B+'final.js','w',encoding='utf-8').write(js)
print(len(s))
