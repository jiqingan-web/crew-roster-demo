const C=require('/workspace/crew-roster-demo/js/core.js'), LI=require('/workspace/crew-roster-demo/js/leg-import.js');
const fs=require('fs'); const D=JSON.parse(fs.readFileSync('cells.json'));
const BASES=new Set(['ZUUU','ZUTF']); const XAP={XQU1:['曲(源表简称·未识别)',30.6,104.1],XTA1:['桃(源表简称·未识别)',30.6,104.1]}; const T=LI.airportTable(C,{airports:XAP}); T.ab['曲']='XQU1'; T.ab['桃']='XTA1'; const ab=T.ab;
const NDAYS=30; const dayOf=s=>{const [m,d]=s.split('-').map(Number); return m===9?d:null;};
const issues=[]; const single=new Set(); const unmappedAp=new Set();
const tm=s=>{const [a,b]=s.split('-');const f=x=>+x.slice(0,2)*60+ +x.slice(3);let s0=f(a),e=f(b);if(e<=s0)e+=1440;return [s0,e];};
// per pilot per day duties
const duty={}; const other={}, training={}, tkind={}, sim={}, control={}, standby={}, leave={}, notes={};
const LEAVE=/停飞|病假|疗养|婚假|年假|空班|育儿假|陪产假|事假/; const TRN=/换季教育|体检|ICAO|会议/; const CTL=/中队控班|值班/;
D.cells.forEach(c=>{const d=dayOf(c.date); if(!d) return; const p=c.pid; const push=(o,v)=>{(o[p]=o[p]||[]); if(!o[p].includes(v)) o[p].push(v);};
  (notes[p]=notes[p]||{}); const txt=c.kind==='duty'?c.raw+' '+c.time:c.kind==='training'?c.sub+' '+c.time:c.kind==='sim'?'模拟机训练(蓉-蓉) '+c.time:c.text;
  notes[p][d]=(notes[p][d]?notes[p][d]+'\n':'')+txt;
  if(c.kind==='duty'){ (duty[p]=duty[p]||{}); (duty[p][d]=duty[p][d]||[]).push(c); }
  else if(c.kind==='training'){push(training,d);(tkind[p]=tkind[p]||{})[d]=c.sub.replace('（','(').replace('）',')');}
  else if(c.kind==='sim') push(sim,d);
  else { const t=c.text; if(LEAVE.test(t)) push(leave,d); else if(TRN.test(t)){push(training,d);(tkind[p]=tkind[p]||{})[d]=t;} else if(CTL.test(t)) push(control,d); else if(/可能抓飞/.test(t)) push(standby,d); /* bare route markers: note only */ }
});
// legs from a duty cell
function legsOf(c,d){ let ch=[...c.route]; if(ch.length<2){ ch=[ch[0],ch[0]]; single.add(c.route+' '+c.flts); } const codes=ch.map(x=>ab[x]||null); ch.forEach((x,i)=>{if(!codes[i])unmappedAp.add(x);});
  const fl=c.flts.split('/'); const n=ch.length-1; const [s,e]=tm(c.time); const base=(d-1)*1440;
  // distribute: block ∝ blockMin, 50-min turns, scaled to fit [s,e]
  const bm=[]; for(let i=0;i<n;i++) bm.push(Math.max(40,(codes[i]&&codes[i+1]&&C.AIRPORTS[codes[i]]&&C.AIRPORTS[codes[i+1]]?C.blockMin(codes[i],codes[i+1]):90)||90));
  const sumB=bm.reduce((a,b)=>a+b,0); const win=e-s; let gap=n>1?(win-sumB)/(n-1):0; let k=1;
  if(n>1&&gap<30){ k=Math.max(0.3,(win-30*(n-1))/sumB); gap=n>1?(win-sumB*k)/(n-1):0; } if(n===1) k=win/sumB;
  let t=s; const out=[]; for(let i=0;i<n;i++){ const b=Math.max(15,Math.round(bm[i]*k)); const arr=i===n-1?e:t+b;
    out.push({flt:fl[Math.min(i,fl.length-1)],from:codes[i]||('?'+ch[i]),to:codes[i+1]||('?'+ch[i+1]),dep:base+t,arr:base+arr,ac:'A320',dh:c.dh||undefined}); t=Math.round(arr+gap);}
  return out; }
// group per (day, duty cell) then chain day-groups with identical crew
const dg={}; Object.keys(duty).forEach(p=>Object.keys(duty[p]).forEach(d=>{ const cs=duty[p][d].slice().sort((a,b)=>tm(a.time)[0]-tm(b.time)[0]); const raw=cs.map(c=>c.raw).join(' + '); const k=d+'|'+raw+'|'+cs.map(c=>c.time).join(','); (dg[k]=dg[k]||{d:+d,cs,raw,ids:[]}).ids.push(p);}));
const items=Object.values(dg).sort((x,y)=>x.d-y.d); items.forEach(it=>{it.ids.sort(); it.L=[].concat(...it.cs.map(c=>legsOf(c,it.d))); it.c={raw:it.raw}; it.ck=it.ids.join(',');});
const chains=[]; const open={};
items.forEach(it=>{ const prev=open[it.ck]; const pl=prev&&prev.legs[prev.legs.length-1];
  if(prev && prev.last===it.d-1 && !BASES.has(pl.to) && pl.to===it.L[0].from){ prev.legs.push(...it.L.map(l=>Object.assign(l,{d:it.d-prev.start+1}))); prev.last=it.d; prev.keys.push(it.d+'|'+it.c.raw); }
  else { const ch={ids:it.ids,start:it.d,last:it.d,legs:it.L.map(l=>Object.assign(l,{d:1})),keys:[it.d+'|'+it.c.raw]}; chains.push(ch); open[it.ck]=ch; } });
const grp={}; let gi=0; chains.forEach(c=>{ const allDh=c.legs.every(l=>l.dh); const ids=c.ids.slice(); if(allDh&&ids.length>3){ for(let k=0;k<ids.length;k+=3) grp[gi++]=ids.slice(k,k+3).map(pid=>Object.assign({},c,{pid,dhSplit:true})); } else grp[gi++]=ids.map(pid=>Object.assign({},c,{pid})); });
const P={}; C.generateLiteSample(1,{reserves:false}).pilots.forEach(p=>P[p.id]=p);
const NEWC=['SPIC','US','J0','机长A','机长B']; const RO=['TC','TB','TL','J3','机长B','机长A','SPIC','US','J0','F8','F7','F6','F5','F4','F3','F2','F1'];
const pairings=[]; let over=0; const extraClones=[];
Object.values(grp).sort((a,b)=>a[0].legs[0].dep-b[0].legs[0].dep||a[0].keys[0].localeCompare(b[0].keys[0])).forEach(g=>{ const ids=g.map(c=>c.pid).sort((a,b)=>RO.indexOf(P[a].rank)-RO.indexOf(P[b].rank));
  const capt=ids.filter(i=>C.isCaptClass(P[i].rank)||C.INSTR.includes(P[i].rank)), fo=ids.filter(i=>C.isFO(P[i].rank)&&!capt.includes(i));
  const crew={C:null,F:null,T:null}; let rest=[];
  const nc=capt.find(i=>NEWC.includes(P[i].rank)), ins=capt.find(i=>C.INSTR.includes(P[i].rank));
  if(nc&&ins){crew.C=nc;crew.F=ins;rest=ids.filter(i=>i!==nc&&i!==ins);} else { crew.C=capt[0]||null; crew.F=fo[0]||capt[1]||null; rest=ids.filter(i=>i!==crew.C&&i!==crew.F); }
  if(!crew.C&&rest.length){} crew.T=rest.shift()||null; var rest0=rest.slice(); if(rest.length){over+=rest.length; extraClones.push({g:g[0],ids:rest.slice()}); issues.push('超3人同任务: '+g[0].keys.join(';')+' 未入座 '+rest.map(i=>P[i].name+'('+P[i].rank+')').join(','));}
  const c0=g[0]; pairings.push({id:'',start:c0.start,ndays:c0.last-c0.start+1,ac:'A320',legs:c0.legs.map(l=>Object.assign({},l)),crew,official:true,offRaw:c0.keys.map(k=>k.split('|')[1]),offExtra:rest0});
});
extraClones.forEach(x=>{const c0=x.g; pairings.push({id:'',start:c0.start,ndays:c0.last-c0.start+1,ac:'A320',legs:c0.legs.map(l=>Object.assign({},l)),crew:{C:null,F:x.ids[0]||null,T:x.ids[1]||null},official:true,offRaw:c0.keys.map(k=>k.split('|')[1]),offDup:true});}); pairings.sort((a,b)=>a.legs[0].dep-b.legs[0].dep);
pairings.forEach((p,i)=>{p.id='OF'+String(i+1).padStart(3,'0'); p.legs.forEach(l=>{l.reg='REG-'+p.id; if(!l.dh) delete l.dh;});});
const out={airports:XAP,source:'roster_raw.xls（正式班表，2026-09-01..09-30 → 第1–30日；化名）',pairings,training,trainingKind:tkind,sim,control,standby,leave,notes};
fs.writeFileSync('official.json',JSON.stringify(out));
console.log('pairings',pairings.length,'chains',chains.length,'overflow',over,'unmappedAp',[...unmappedAp]);
console.log('seats',['C','F','T'].map(s=>s+':'+pairings.filter(p=>p.crew[s]).length).join(' '), 'onlyDH', pairings.filter(p=>p.legs.every(l=>l.dh)).length);
console.log('ndays dist', JSON.stringify(pairings.reduce((m,p)=>(m[p.ndays]=(m[p.ndays]||0)+1,m),{})), 'endAway', pairings.filter(p=>!BASES.has(p.legs[p.legs.length-1].to)).length);
console.log('singleAirport',[...single]); issues.slice(0,10).forEach(x=>console.log(x));

const nd=pairings.filter(p=>!p.legs.every(l=>l.dh)); console.log('nonDH',nd.length,'noC',nd.filter(p=>!p.crew.C).length,'noF',nd.filter(p=>!p.crew.F).length,'noT',nd.filter(p=>!p.crew.T).length);
nd.filter(p=>!p.crew.C||!p.crew.F).slice(0,8).forEach(p=>console.log(p.start,p.offRaw.join(';'),JSON.stringify(Object.values(p.crew).map(i=>i&&P[i].rank))));