"""演示版特殊机场资质：按公司资质表「各职级 × 各机场 × 角色」的比例，生成与真人脱钩的资质档案池（不含姓名）。
用法：python3 synth_quals.py <资质表.xlsx> <机场名映射.json> <输出 pool.json>
输出：{"airports": [ICAO...], "pool": {职级: [{"role": {ICAO: [角色...]}}, ...]}}；同职级内顺序打乱，供 build_demo.js 按职级分配。"""
import openpyxl, json, sys, random, collections
qual, apmap, out = sys.argv[1:4]
Q = list(openpyxl.load_workbook(qual, read_only=True).worksheets[0].iter_rows(values_only=True))
hdr = Q[0]; AP = json.load(open(apmap, encoding='utf-8'))
cols = [(j, AP.get(str(h).strip())) for j, h in enumerate(hdr) if j >= 3 and h]
pool = collections.defaultdict(list)
for r in Q[1:]:
    rank = str(r[2] or '').replace('(A320)', '').strip()
    if not rank: continue
    role = {}
    for j, code in cols:
        v = r[j]
        if code and v not in (None, ''): role[code] = [x.strip() for x in str(v).split('\n') if x.strip()]
    pool[rank].append({'role': role})
rnd = random.Random(20261104)
for k in pool: rnd.shuffle(pool[k])
airports = sorted({c for _, c in cols if c})
json.dump({'airports': airports, 'pool': pool}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print('ranks', {k: len(v) for k, v in pool.items()}, 'airports', len(airports))
