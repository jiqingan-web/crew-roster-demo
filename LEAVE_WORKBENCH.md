# 请假工作台改造说明（Lead 交付）

> 目标：把「请假调配」从**两套并行视图 + 5 个并列主按钮**，改成**单页三步**：① 选人与日期 → ② 登记 → ③ 补位。
> 不改业务规则、不改校验口径；请假仍是事实，缺口仍由校验报告可见。

## 1. 改了什么

| 文件 | 改动 |
|---|---|
| `js/app/11-leave.js` | **新增**。新请假工作台：请假单（人员/日期条/类型）+ 影响面（缺员座位 + 合规候选）+ 整体调配（推荐方案 + 对比表）+ 本页操作历史。覆盖旧 `rLeave/goLeave/genLeave/applyHoleCand/undoLeave`。 |
| `js/core.js` | **新增** `holeScan(st,pid,days,opt)`（快速影响面，不枚举方案）与 `leaveRegister(st,pid,days,kind)`（统一"登记请假/禁飞占位"，含重叠清理）。`holeRecommend` 行为不变。 |
| `js/app/05-ops.js` | 旧请假实现保留但标注为「已被 11-leave.js 覆盖」，用于回滚。 |
| `js/app/01-dashboard.js` | 主线第 4 步文案改为「请假调配 / 补位 · 选人 → 登记 → 补位」。 |
| `css/style.css` | 新增 `.lv*` 样式约 90 行。 |
| `lite/index.html` / `full.html` | 引入 `11-leave.js?v=655`。 |
| `intro/index.html` + `intro/assets/leave-*.jpg` | 介绍页文案与新截图同步（旧截图是旧版 UI，已替换）。 |
| `test/leaveflow.test.js` | **新增** 28 条断言：登记/幂等/清理/洞一致性/耗时/hold。 |

## 2. 交互对比

| 任务 | 改造前 | 改造后 |
|---|---|---|
| 只登记请假 | 生成 → 切「多方案卡片」→ 应用（4 步，还要算 1 秒方案） | 点「登记请假」（1 步，立即生效） |
| 看谁受影响 | 生成后才知道 | 选人/日期即出影响面（约 5–12 ms） |
| 补 1 个座位 | 点候选 → 确定 → **强制跳甘特** | 点候选人即补位，留在本页，可继续 |
| 处理 3 个座位 | 每洞 +4 步 + 1 次重算 + 1 次跳页 | 一次进出；或「生成整体方案」一键应用 |
| 选方案 | 5 张卡片、5 个主按钮、评分口径不可比 | 默认只显示推荐 + 「对比全部 N 个方案」 |
| 撤销 | 4 个入口共用一个全局栈 | 本页「本次操作」逐条回滚 |

## 3. 引擎新增 API

```js
C.holeScan(st, pid, days, { topK: 5 })  // 同 holeRecommend 的 holes，但跳过方案枚举；plan 恒为 null
C.leaveRegister(st, pid, days, 'leave') // 写假 + 清理 prefs/standby/training/control/sim/simHold 重叠；
                                        // 返回 {ok, written, skipped, cleared:{...}}；幂等
C.leaveRegister(st, pid, days, 'hold')  // 委托 reserveHold（跳过已飞日），用于「禁飞占位」
```
实测（lite 141 人）：holeScan 5–12 ms vs holeRecommend 96–208 ms；holes 逐字段一致。

## 4. 复验方式

```bash
cd crew-roster-demo-for-ai-review
python3 -m http.server 8765
# http://127.0.0.1:8765/lite/index.html#leave&auto   （自动填人后进入请假调配）
# http://127.0.0.1:8765/full.html#leave             （全量 1117 人）
node test/leaveflow.test.js                          # 28 条断言
```
浏览器手验路径：点日期条两次选起止 → 登记请假 → 点绿色候选人补位 → 看「本次操作」回滚。

## 5. 已知限制 / 下一步

1. 旧实现（05-ops.js 中 `leaveView/genLeave` 等）仍在文件里未删，仅供回滚；确认稳定后可删除约 320 行。
2. 「撤销」仍是全局 `leaveHist` 栈，与一键自动纠错共用；页内已列出每一步，但尚未按域隔离。
3. 方案评分仍沿用引擎内部口径（`score`），UI 已不展示绝对值，改为「硬性违规 前→后 / 基尼 Δ / 占意向休息」。
4. 验签/角色（排班员 vs 飞行员自助）未做，当前是单机演示形态。
