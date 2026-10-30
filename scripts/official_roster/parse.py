import pandas as pd,re,json,collections,sys
v=pd.read_excel('/workspace/personnel-ingest/ref/roster_raw.xls',header=None)
nm=json.load(open('/workspace/personnel-ingest/name_map.json'))['map']
r2a={m['real']:m for m in nm}
dates=list(v.iloc[0,4:55])
DUTY=re.compile(r'^(\S+?)(\(随\))?\s+((?:\(V\))?\d{3,4}(?:/(?:\(V\))?\d{3,4})*)\s*$')
TIME=re.compile(r'^(\d\d):(\d\d)-(\d\d):(\d\d)$')
TR=re.compile(r'^(培训[（(]飞技[)）]|培训[（(]飞行[)）])\s+(\d\d:\d\d-\d\d:\d\d)$')
SIM=re.compile(r'^模拟机训练\(蓉-蓉\)\s+(\d\d:\d\d-\d\d:\d\d)$')
cells=[];unk=collections.Counter();people=[]
for i in range(1,len(v)):
  real=v.iat[i,1]; m=r2a.get(real) or (r2a.get('__ROW85__') if False else None)
  if not m and i==85: m=[q for q in nm if q['alias']=='邱海涛'][0]
  if not m: print('NOMAP row',i,file=sys.stderr); continue
  people.append(m['id'])
  for j,dt in enumerate(dates):
    x=v.iat[i,4+j]
    if pd.isna(x): continue
    lines=[l.strip() for l in str(x).split('\n') if l.strip()]
    k=0
    while k<len(lines):
      l=lines[k]; d=DUTY.match(l)
      if d:
        t=None
        if k+1<len(lines) and TIME.match(lines[k+1]): t=lines[k+1]; k+=1
        cells.append(dict(pid=m['id'],date=dt,kind='duty',route=d.group(1),dh=bool(d.group(2)),flts=d.group(3),time=t,raw=l))
      elif TR.match(l): cells.append(dict(pid=m['id'],date=dt,kind='training',sub=TR.match(l).group(1),time=TR.match(l).group(2)))
      elif SIM.match(l): cells.append(dict(pid=m['id'],date=dt,kind='sim',time=SIM.match(l).group(1)))
      else: cells.append(dict(pid=m['id'],date=dt,kind='other',text=l)); unk[re.sub(r'\d','9',l)]+=1
      k+=1
json.dump(dict(dates=dates,people=people,cells=cells),open('cells.json','w'),ensure_ascii=False)
print(len(cells),collections.Counter(c['kind'] for c in cells))
print(sum(1 for c in cells if c['kind']=='duty' and not c['time']),'duty w/o time')
for k,n in unk.most_common(): print(n,k)
