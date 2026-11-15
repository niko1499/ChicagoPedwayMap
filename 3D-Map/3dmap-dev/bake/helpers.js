/* wall openings: where a ramp / stair / escalator meets a corridor, the corridor's walls inside the link's end zone are not drawn */
function linkOpen(l){const o=[];ramps.forEach(r=>{if(!(r instanceof Link))return;const ax=r.a.x,az=r.a.z,bx=r.b.x,bz=r.b.z,L=Math.hypot(bx-ax,bz-az);if(!L)return;const ux=(bx-ax)/L,uz=(bz-az)/L,w=r instanceof Ramp?Math.max(r.w,MIN_CORRIDOR_W):r.w,hw=Math.max(.5,w/2-.1),Z=Math.min(L*.4,8),m=.25;
 if(r.la==l)o.push({ox:ax,oz:az,ux,uz,s0:-m,s1:Z,hw});if(r.lb==l)o.push({ox:bx,oz:bz,ux:-ux,uz:-uz,s0:-m,s1:Z,hw})});return o}
function openClip(ax,az,bx,bz,O){let t0=0,t1=1;const dx=ax-O.ox,dz=az-O.oz,ex=bx-O.ox,ez=bz-O.oz,sA=dx*O.ux+dz*O.uz,sB=ex*O.ux+ez*O.uz,vA=-dx*O.uz+dz*O.ux,vB=-ex*O.uz+ez*O.ux;
 const cl=(a,b,lo,hi)=>{const d=b-a;if(Math.abs(d)<1e-9)return a>=lo&&a<=hi;let ta=(lo-a)/d,tb=(hi-a)/d;if(ta>tb){const q=ta;ta=tb;tb=q}t0=Math.max(t0,ta);t1=Math.min(t1,tb);return t0<t1};
 return cl(sA,sB,O.s0,O.s1)&&cl(vA,vB,-O.hw,O.hw)?[t0,t1]:null}
function wallMesh(l,ps,hg,mat){const op=linkOpen(l),pos=[],idx=[],y1=hg/2,y0=-hg/2;
 ps.forEach(r=>{for(let i=0;i<r.length;i++){const A=r[i],B=r[(i+1)%r.length],ax=A[0]-cx,az=A[1]-cz,bx=B[0]-cx,bz=B[1]-cz;
  let iv=[];op.forEach(O=>{const c=openClip(ax,az,bx,bz,O);if(c)iv.push(c)});iv.sort((p,q)=>p[0]-q[0]);
  let t=0;const keep=[];iv.forEach(([a,b])=>{if(a>t)keep.push([t,a]);t=Math.max(t,b)});if(t<1)keep.push([t,1]);
  keep.forEach(([a,b])=>{if(b-a<1e-4)return;const px=ax+(bx-ax)*a,pz=az+(bz-az)*a,qx=ax+(bx-ax)*b,qz=az+(bz-az)*b,n=pos.length/3;pos.push(px,y1,pz,qx,y1,qz,qx,y0,qz,px,y0,pz);idx.push(n,n+1,n+2,n,n+2,n+3)})}});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return new THREE.Mesh(g,mat)}
