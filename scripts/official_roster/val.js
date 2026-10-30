const C=require('/workspace/crew-roster-demo/js/core.js'),O=require('/workspace/crew-roster-demo/js/official-roster.js');
const st=O.build(C,C.generateLiteSample());
const before=JSON.stringify(st.pairings.map(p=>p.crew));
const v=C.validate(st); const s=C.summarize(st);
console.log('after-validate unchanged', before===JSON.stringify(st.pairings.map(p=>p.crew)));
console.log('total',s.total,'full',s.full,'coverage',s.coverage.toFixed(3),'hard',s.hard);
const by={}; v.forEach(x=>{const k=x.level+' '+x.type; by[k]=(by[k]||0)+1;}); console.log(by);
const ex={}; v.filter(x=>x.level==='hard'&&x.type!=='未满员').forEach(x=>{(ex[x.type]=ex[x.type]||[]).push(x.msg)}); for(const k in ex) console.log(k, ex[k].slice(0,3));
