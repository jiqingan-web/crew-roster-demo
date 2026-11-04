"""公司机场基础表（xlsx）→ 引擎机场时间配置 JSON
用法：python3 parse_airport_table.py <机场表.xlsx> <输出 airport_times.json>
字段：report=报到时间（分钟，起飞前）；preCar=航前车程（休息期止于报到前该分钟数）；leave=离场时间；postCar=航后车程（休息期始于关车后 leave+postCar）；
     nonFirst=非首飞报到时间；abbr=机场简称；name=中文名；intl=国际/地区；type=机场类型"""
import openpyxl, json, sys
r = list(openpyxl.load_workbook(sys.argv[1], read_only=True).worksheets[0].iter_rows(values_only=True))
h = [str(x).replace('\n', '') for x in r[0]]; ix = {x: j for j, x in enumerate(h)}
num = lambda v: None if v in (None, '') else int(float(v))
out = {}
for x in r[1:]:
    code = (x[ix['机场四码']] or '').strip()
    if len(code) != 4: continue
    out[code] = {k: v for k, v in dict(report=num(x[ix['报到时间']]), preCar=num(x[ix['航前车程时间']]), leave=num(x[ix['离场时间']]), postCar=num(x[ix['航后车程时间']]),
        nonFirst=num(x[ix['非首飞报道时间']]), abbr=(x[ix['机场简称']] or None), name=x[ix['机场中文名称']], intl=(x[ix['国际/国内']] != '国内'), type=x[ix['机场类型']]).items() if v is not None}
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('airports', len(out))
