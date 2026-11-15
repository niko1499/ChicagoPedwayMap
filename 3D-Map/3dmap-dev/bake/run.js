
const fs=require('fs'),vm=require('vm');
globalThis.__REC={lines:[],polys:[],boxes:[],links:[],elev:[]};
const mkStub=()=>{const f=function(){};return new Proxy(f,{get(t,k){if(k===Symbol.toPrimitive)return()=>0;if(k==='then')return undefined;if(k==='length')return 0;if(k===Symbol.iterator)return function*(){};if(k==='prototype')return {};return mkStub()},apply(){return mkStub()},construct(){return mkStub()},set(){return true},has(){return true}})};
class V3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z}}
const T=mkStub();
globalThis.THREE=new Proxy({},{get(t,k){if(k==='Vector3')return V3;return mkStub()}});
globalThis.document=mkStub();globalThis.window=mkStub();globalThis.innerWidth=1200;globalThis.innerHeight=800;globalThis.devicePixelRatio=1;
globalThis.requestAnimationFrame=()=>0;globalThis.addEventListener=()=>{};globalThis.localStorage=mkStub();globalThis.performance={now:()=>0};
const src=fs.readFileSync('bake/inst.js','utf8');
try{vm.runInThisContext(src,{timeout:20000})}catch(e){console.error('ERR',e.message,(e.stack||'').split('\n').slice(0,4).join(' | '))}
fs.writeFileSync('bake/rec.json',JSON.stringify(__REC));
console.log('lines',__REC.lines.length,'polys',__REC.polys.length,'boxes',__REC.boxes.length);
