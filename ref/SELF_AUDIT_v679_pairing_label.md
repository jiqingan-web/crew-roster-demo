# Self-audit · v679 · 可见 OF 标签：OF289 府威春 + 春威府(随)

**Date:** 2026-11-01 (Asia/Shanghai)  
**User note:** 交互上全部标成 `OF289 府威春 + 春威府(随)`；后台统计仍用数字/OF id。

## Helpers（`js/core.js`）
| API | 作用 |
|---|---|
| `fmtOffRaw(pr, st)` | 优先从 `offRaw` 抽中文航线链（去航班号）；无则 `fmtOffFromLegs` |
| `fmtOffFromLegs(pr, st)` | legs+dh → 同日同置位段合并，置位加 `(随)`，日内 ` + `，跨日 ` / ` |
| `pairingLabel(pr, st)` | `OF289 府威春 + 春威府(随)` |
| `pairingLabelOf(st, id)` | 按 id 查任务再标 |
| `apAbbrSimple` | 无 offRaw 时的单字简称（蓉/府…） |

UI 薄封装（`00-base.js`）：`pairLabel` / `pairLabelOf` / `escPair` / `escPairOf`。

## 可见面替换（逻辑字段仍为 `pr.id`）
甘特条/悬停、任务视图卡片与抽屉、编辑器表头与 toast、问题面板、校验文案（`validate` msg）、个人审计、请假空洞/toast/历史、运控告警与处置方案卡、换班预览、Excel 甘特批注与任务列、补位历史等。  
`data-pr` / `pairing` / 统计键仍为 `OF289`。

## 样例
| id | label |
|---|---|
| OF289 | OF289 府威春 + 春威府(随) |
| OF005 | OF005 府兰(随) + 兰莎兰 + 兰府(随) |
| OF287 | OF287 福济犁 + 犁府(随) |
| OF001 | OF001 府盐春 / 春盐府 |
| OF008 | OF008 蓉峡岩峡蓉 |

## Cache bust
`lite/index.html` / `full.html`：`?v=678` → **`?v=679`**  
Open `lite/index.html?v=679`（或硬刷新）。

## Desktop sync
`ref/crew-roster-demo-sync679.tgz` → 用户 Desktop。
