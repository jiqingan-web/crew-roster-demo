"""Prototype: parse roster_grid xlsx files (人 × 日) for a whole year into
pseudonymised cells + data-quality stats.  Real names never leave memory:
output uses P### ids assigned by row order (same order in both files)."""
import openpyxl, re, sys, json, collections, datetime, statistics as stx

YEAR = 2026
ACTUAL_UNTIL = '11-03'          # 之后时刻落在 5 分钟网格 → 计划数据
ABBR = set('蓉府呼湘沈福郑武贡济琼犁春杭三筑皖石包奇连盐阿宁圳津北坤岩苏渝图威兰甬陕塔哈丽浦昆峡泉密海穗韶卫河厦田瓯辽常池汕迈乌喀吉曼青珠沪吕忻京舟版鸡昭抚吐莎曲桃内')
BASES = set('蓉府')
DUTY = re.compile(r'^(\S+?)(\(随\))?\s+((?:\(V\))?\d{3,4}(?:/(?:\(V\))?\d{3,4})*)\s*$')
TIME = re.compile(r'^(\d\d):(\d\d)-(\d\d):(\d\d)$')
TIMED = re.compile(r'^(\S+?)\s{2,}(\d\d):(\d\d)-(\d\d):(\d\d)$')
VOCAB = [  # import_spec.yaml vocabulary, priority order
    ('leave', ['停飞', '病假', '疗养', '婚假', '年假', '空班', '育儿假', '陪产假', '事假']),
    ('training', ['培训(飞技)', '培训（飞技）', '培训(飞行)', '培训（飞行）', '换季教育', '体检', 'ICAO', '会议']),
    ('sim', ['模拟机训练']),
    ('control', ['中队控班', '值班']),
    ('standby', ['可能抓飞']),
]
def classify(t):
    for k, ws in VOCAB:
        if any(w in t for w in ws): return k
    return None

def mins(h, m): return int(h) * 60 + int(m)

def load(path):
    ws = openpyxl.load_workbook(path, read_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True)); hdr = rows[0]
    dcols = [(j, h) for j, h in enumerate(hdr) if h and re.match(r'^\d\d-\d\d$', str(h))]
    scols = {h: j for j, h in enumerate(hdr) if j >= 4 and h and not re.match(r'^\d\d-\d\d$', str(h))}
    return rows[1:], dcols, scols

def main(paths, out):
    people = {}; cells = []; Q = collections.Counter(); ex = collections.defaultdict(list)
    summ = collections.defaultdict(lambda: collections.Counter())
    declared = collections.Counter()
    for path in paths:
        rows, dcols, scols = load(path)
        for i, r in enumerate(rows):
            pid = 'P%03d' % (i + 1)
            people[pid] = {'rank': re.sub(r'\(A320\)', '', r[2] or '')}
            hh = str(r[3] or '0:0').split(':'); declared[pid] += mins(*hh) if len(hh) == 2 else 0
            for k in ['病假天数', '年假天数', '停飞天数', '其他休假天数', '过夜天数', '模拟机小时', '其他培训小时']:
                if k in scols and r[scols[k]] not in (None, ''):
                    try: summ[pid][k] += float(r[scols[k]])
                    except ValueError: Q['summary_non_numeric'] += 1
            for j, md in dcols:
                x = r[j]
                if x is None or not str(x).strip(): continue
                lines = [l.strip() for l in str(x).split('\n') if l.strip()]
                k = 0
                while k < len(lines):
                    l = lines[k]; d = DUTY.match(l)
                    if d:
                        t = None
                        if k + 1 < len(lines) and TIME.match(lines[k + 1]):
                            t = TIME.match(lines[k + 1]).groups(); k += 1
                        route, flts = d.group(1), d.group(3).split('/')
                        unk = [c for c in route if c not in ABBR]
                        if unk: Q['unknown_abbr'] += 1; ex['unknown_abbr'].append(''.join(unk) + ' ← ' + route)
                        if len(route) - 1 != len(flts):
                            Q['route_flt_mismatch'] += 1; ex['route_flt_mismatch'].append(l)
                        if '(V)' in d.group(3): Q['V_marked'] += 1
                        if t is None: Q['duty_without_time'] += 1; ex['duty_without_time'].append(l)
                        s = e = None
                        if t:
                            s, e = mins(t[0], t[1]), mins(t[2], t[3])
                            if e <= s: e += 1440; Q['cross_midnight'] += 1
                        cells.append(dict(pid=pid, md=md, kind='duty', route=route, dh=bool(d.group(2)),
                                          flts=flts, s=s, e=e, actual=md <= ACTUAL_UNTIL))
                    else:
                        m = TIMED.match(l); kind = classify(l)
                        if m:
                            s, e = mins(m.group(2), m.group(3)), mins(m.group(4), m.group(5))
                            if e <= s: e += 1440
                            cells.append(dict(pid=pid, md=md, kind=kind or 'timed_other', text=m.group(1), s=s, e=e))
                        elif kind:
                            cells.append(dict(pid=pid, md=md, kind=kind, text=l))
                        elif re.fullmatch(r'[一-鿿]{2,5}', l) and all(c in ABBR for c in l):
                            Q['bare_route_no_flt'] += 1; ex['bare_route_no_flt'].append(l)
                            cells.append(dict(pid=pid, md=md, kind='bare_route', text=l))
                        else:
                            Q['unresolved_label'] += 1; ex['unresolved_label'].append(l)
                            cells.append(dict(pid=pid, md=md, kind='unresolved', text=l))
                    k += 1
    json.dump(dict(year=YEAR, actual_until=ACTUAL_UNTIL, people=people, cells=cells), open(out, 'w'), ensure_ascii=False)

    duties = [c for c in cells if c['kind'] == 'duty']
    print('people', len(people), 'cells', len(cells), collections.Counter(c['kind'] for c in cells))
    print('quality', dict(Q))
    for k, v in ex.items():
        print(' ex', k, collections.Counter(v).most_common(12))
    # crew groups: same (date, route, flts, window) => flew together
    g = collections.defaultdict(list)
    for c in duties:
        if c['s'] is not None and not c['dh']:
            g[(c['md'], c['route'], '/'.join(c['flts']), c['s'], c['e'])].append(c['pid'])
    sz = collections.Counter(min(len(v), 4) for v in g.values())
    print('operating crew groups', len(g), 'size dist (4=4+)', dict(sorted(sz.items())))
    # unique operating flights per month (dedupe by date+flt number)
    fm = collections.defaultdict(set)
    for c in duties:
        if not c['dh']:
            for f in c['flts']: fm[c['md'][:2]].add((c['md'], f.replace('(V)', ''), c['route']))
    print('unique (date,flt) per month', {m: len(v) for m, v in sorted(fm.items())})
    # per person per month: duty days, sim days, leave days, window hours
    pm = collections.defaultdict(lambda: collections.defaultdict(set)); win = collections.Counter()
    for c in cells:
        key = (c['pid'], c['md'][:2])
        pm[key][c['kind']].add(c['md'])
        if c['kind'] == 'duty' and not c['dh'] and c['s'] is not None: win[key] += c['e'] - c['s']
    byrank = collections.defaultdict(lambda: collections.defaultdict(list))
    for (pid, m), kinds in pm.items():
        if m > '10': continue  # 只用实际执行月
        rk = people[pid]['rank']; grp = 'F' if rk.startswith('F') else ('INSTR' if rk in ('TC', 'TB', 'TL') else 'CAPT')
        b = byrank[grp]
        b['duty_days'].append(len(kinds['duty'])); b['sim_days'].append(len(kinds['sim']))
        b['train_days'].append(len(kinds['training'])); b['leave_days'].append(len(kinds['leave']))
        b['window_h'].append(win[(pid, m)] / 60)
    def pct(a, q): a = sorted(a); return a[min(len(a) - 1, int(q * (len(a) - 1) + 0.5))]
    print('per person-month (Jan–Oct actuals): p10 / median / p90')
    for grp, b in byrank.items():
        print(' ', grp, ' | '.join('%s %s/%s/%s' % (k, round(pct(v, .1), 1), round(stx.median(v), 1), round(pct(v, .9), 1)) for k, v in b.items()))
    # share of person-months with any sim
    simshare = collections.Counter()
    for (pid, m), kinds in pm.items():
        if m <= '10': simshare['pm'] += 1; simshare['with_sim'] += bool(kinds['sim'])
    print('person-months with sim', simshare['with_sim'], '/', simshare['pm'])
    # summary column cross-check
    cnt = collections.defaultdict(collections.Counter)
    for c in cells:
        if c['kind'] == 'leave':
            for k, w in [('病假天数', '病假'), ('年假天数', '年假'), ('停飞天数', '停飞')]:
                if w in c['text']: cnt[c['pid']][k] += 1
        if c['kind'] == 'sim' and c.get('s') is not None: cnt[c['pid']]['模拟机小时'] += (c['e'] - c['s']) / 60
    for k in ['病假天数', '年假天数', '停飞天数', '模拟机小时']:
        diffs = [(pid, summ[pid][k], round(cnt[pid][k], 1)) for pid in people if abs(summ[pid][k] - cnt[pid][k]) > (0.6 if k != '模拟机小时' else 1)]
        print('crosscheck', k, 'mismatch persons', len(diffs), diffs[:5])
    # declared flight hours vs window hours (spec window_vs_declared_ratio [1.10,1.80])
    wtot = collections.Counter()
    for c in duties:
        if not c['dh'] and c['s'] is not None and c['actual']: wtot[c['pid']] += c['e'] - c['s']
    ratios = sorted(round(wtot[p] / declared[p], 2) for p in people if declared[p] > 600)
    print('window/declared ratio n', len(ratios), 'min', ratios[:3], 'median', ratios[len(ratios) // 2], 'max', ratios[-3:],
          'outside [1.10,1.80]', sum(1 for r in ratios if not 1.10 <= r <= 1.80))

if __name__ == '__main__':
    main(sys.argv[1:-1], sys.argv[-1])
