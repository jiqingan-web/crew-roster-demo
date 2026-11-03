# Self-audit · v685 · 新机长可配 J3+（非仅 TL+）

**Date:** 2026-11-03 (Asia/Shanghai)  
**User correction:** 机长B / SPIC / US / J0 仍硬要 TL+ — **NO**；可搭配 **J3**（J3 足够，非仅 TL+）。

## 改动
| 项 | 行为 |
|---|---|
| `crewIssue` CR-20 | 同组须 `isJ3plus`（J3/TL/TB/TC），不再仅 `isInstr` |
| 自动补位 `needInstr` / 外中队补位 / blockReason / demo 异常 | 陪飞门槛改为 J3+ |
| `CR-20` 目录文案 | 「须 J3+（可配J3）」；机长A 仍不强制 |
| Dashboard KPI | 「含J3+同组」 |
| `seatOK` / `RANK_ALIAS` / 机长A 豁免 | **未改**（机长A→J0 巡航矩阵仍成立） |
| Cache bust | `?v=684` → **`?v=685`** |

## 可接受陪飞级别（NEW_CAPT = SPIC/US/J0/机长B）
**J3, TL, TB, TC**（即 `isJ3plus`）。J2 及以下 / 纯副驾不够。

## 单元 / 抽检
- 机长B+J3+F5 → 合规；机长B+F4+F5 → `[CR-20]`
- SPIC/US/J0 同口径；机长A+F4+F5 仍合规
- `seatOK('机长A','F4')` 仍 true（矩阵别名）
- `test/rules.test.js` ALL OK；`test/chain.test.js` OK

## URL
`http://127.0.0.1:8765/lite/index.html?v=685`
