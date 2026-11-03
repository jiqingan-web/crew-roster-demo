# Self-audit · v680 · 个人月工时排行：本中队口径 + Bottom 末位标签

**Date:** 2026-11-01 (Asia/Shanghai)  
**User note:** 总览「个人月工时排行」Bottom 显示 145→138，像全库含外中队候补；应为本中队 ~101。

## Root cause
`js/app/04-taskview.js` `rOverview` 用 `st.pilots` 全量排序；Bottom 序号为 `ranked.length - i`（绝对名次），外中队/候补进池后长度≈145。

## Fix
| 项 | 行为 |
|---|---|
| 排行范围 | `homePilots = st.pilots.filter(!isOuterPilot)`（本中队真实人员） |
| Top 8 | 本中队内最高工时，序号 1…8 |
| Bottom 8 | 本中队内最低工时；标签 **末1…末8**（tooltip：倒数第 k · 本中队第 abs/N） |
| 全假 0h | 仍可垫底（如 田海涛/郝建国/郭帅） |
| 副标题 | `本中队 ${nHome} 人` |
| Qwen 摘要 | `10-qwen.js` 高低工时 Top5 同步排除外中队 |
| CSS | `.rk` 首列 22→30px，容纳「末8」 |

## Self-check（official roster + lite sample）
| 指标 | 值 |
|---|---|
| all / home / outer | 145 / **101** / 44 |
| 9月 Bottom 末1–3 | 田海涛 / 郝建国 / 郭帅 · 0.0h（本中队） |
| 修复前 Bottom 绝对名次暗示 | 145 |
| 修复后副标题 | 本中队 101 人；末位标签不暗示 145 |

## Cache bust
`lite/index.html` / `full.html`：`?v=679` → **`?v=680`**  
Open `lite/index.html?v=680`（或硬刷新）。

## Desktop sync
`ref/crew-roster-demo-sync680.tgz` → 用户 Desktop。
