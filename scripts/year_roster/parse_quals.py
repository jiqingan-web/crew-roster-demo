"""特殊机场资质表（人 × 机场，值为 副驾驶 / 责任机长 / 被带飞机长 / 重获资格机长 / 含 RNP-AR）→ 化名资质 JSON。
用法：python3 parse_quals.py <班表.xlsx（定 P### 行序）> <资质表.xlsx> <机场名映射.json> <输出 quals.json>
真实姓名只在内存中用于对应 P###，输出不含姓名。机场名映射：{"丽江": "ZPLJ", ...}"""
import openpyxl, json, sys, collections

roster, qual, apmap, out = sys.argv[1:5]
rows = list(openpyxl.load_workbook(roster, read_only=True).worksheets[0].iter_rows(values_only=True))[1:]
pid = {r[1]: 'P%03d' % (i + 1) for i, r in enumerate(rows)}
Q = list(openpyxl.load_workbook(qual, read_only=True).worksheets[0].iter_rows(values_only=True))
hdr = Q[0]; AP = json.load(open(apmap, encoding='utf-8'))
cols = [(j, AP.get(str(h).strip())) for j, h in enumerate(hdr) if j >= 3]
covered = sorted({c for _, c in cols if c})
res = {}; unmatched = 0; stat = collections.Counter()
for r in Q[1:]:
    p = pid.get(r[1])
    if not p: unmatched += 1; continue
    q = {'auth': [], 'rnp': [], 'role': {}}
    for j, code in cols:
        v = r[j]
        if not code or v in (None, ''): continue
        roles = [x.strip() for x in str(v).split('\n') if x.strip()]
        q['auth'].append(code); q['role'][code] = roles
        if any('RNP' in x for x in roles): q['rnp'].append(code)
        for x in roles: stat[x] += 1
    res[p] = q
missing = sorted(set(pid.values()) - set(res))
json.dump({'covered': covered, 'quals': res, 'missing': missing}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print('matched', len(res), 'unmatched rows', unmatched, 'roster people without quals', len(missing), 'covered airports', len(covered), dict(stat))
