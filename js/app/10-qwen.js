/* 机组排班助手 - 界面 · qwen.js（千问 AI 排班助手；经典 <script> 共享全局词法作用域，按 lite/index.html 顺序加载）
* 纯前端调用阿里通义千问 DashScope OpenAI 兼容接口：
* POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
* API Key 由用户在面板中填写，仅保存在本机 localStorage，不随代码提交。
* 每次提问自动附带当前排班数据摘要作为上下文，千问据此作答。
*/
(function () {
'use strict';
const LS_KEY = 'qwenApiKey', LS_MODEL = 'qwenModel';
const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODELS = [
['qwen-plus', 'qwen-plus（均衡·推荐）'],
['qwen-turbo', 'qwen-turbo（快速·省钱）'],
['qwen-max', 'qwen-max（最强）'],
];
const QUICK = [
['📊', '排班概况解读', '请解读当前排班的整体情况：满员率、违规、工时分布，用中文分点说明，最后给出3条最值得关注的结论。'],
['⚠️', '违规处理优先级', '当前有哪些硬性违规？请按优先级排序，并给每项一句话处理建议。'],
['💡', '请假调配建议', '如果临时有人请假，从数据看应优先考虑哪些人员补位？请给出调配思路和注意事项。'],
['⚖️', '工时公平性分析', '分析机组月工时分布的公平性，指出工时明显偏高/偏低的人员，并给出均衡建议。'],
];
const SYS_PROMPT = '你是「机组智能排班助手」的 AI 顾问，由阿里通义千问驱动。你会收到一份当前排班的数据摘要（演示用示例数据，人员为化名）。要求：用中文回答，简洁、分点；只基于摘要中的数据作答，不要编造摘要中没有的数字、人员或任务；数据不足时请如实说明。';

const getKey = () => (localStorage.getItem(LS_KEY) || '').trim();
const getModel = () => localStorage.getItem(LS_MODEL) || 'qwen-plus';
let hist = []; // [{role, content}] 内存中的多轮上下文（不持久化）
let sending = false;

// ---------------- 排班数据摘要（token 友好的紧凑中文） ----------------
function buildRosterContext() {
try {
const s = C.summarize(st);
const L = [];
L.push('当前排班数据摘要（演示示例数据，人员为化名）：');
L.push(`人员 ${st.pilots.length} 人，任务 ${st.pairings.length} 个，满员率 ${s.full}/${s.total}（${(s.coverage * 100).toFixed(1)}%）`);
L.push(`硬性违规 ${s.hard} 项，软提示 ${s.soft} 项，意向休息满足率 ${(s.prefRate * 100).toFixed(1)}%`);
const hard = (s.violations || []).filter(v => v.level === 'hard').slice(0, 8);
if (hard.length) {
L.push('硬性违规 Top：');
hard.forEach(v => L.push(`- [${v.pairing || '-'}] ${v.type || ''}：${v.msg || ''}${v.pilot? '（' + v.pilot + '）': ''}`));
} else L.push('硬性违规：无');
const outerIds = new Set((st.pilots || []).filter(p => (typeof isOuterPilot === 'function' ? isOuterPilot(p) : (C.isOuterPilot && C.isOuterPilot(p)))).map(p => p.id));
const ranked = (s.per || []).filter(x => !outerIds.has(x.id)).slice().sort((a, b) => b.hours - a.hours);
if (ranked.length) {
L.push('月工时最高5人：' + ranked.slice(0, 5).map(x => `${x.name}(${x.rank})${x.hours.toFixed(1)}h`).join('、'));
L.push('月工时最低5人：' + ranked.slice(-5).reverse().map(x => `${x.name}(${x.rank})${x.hours.toFixed(1)}h`).join('、'));
}
const holes = st.pairings.filter(p => !C.pairingFull(p)).slice(0, 10);
if (holes.length) L.push('未满员任务 Top10：' + holes.map(p => `${p.id}(缺${['C', 'F', 'T'].filter(k => !C.slotTaken(p, k)).join('/')})`).join('、'));
return L.join('\n');
} catch (e) { return '（排班数据摘要生成失败：' + String(e && e.message || e) + '）';}
}

// ---------------- 极简 markdown 渲染（先转义再套标签，防 XSS） ----------------
function mdLite(src) {
let h = esc(src);
h = h.replace(/```([\s\S]*?)```/g, (m, c) => `<pre class="qw-pre">${c.replace(/^\n+|\n+$/g, '')}</pre>`);
h = h.replace(/`([^`\n]+)`/g, '<code class="qw-code">$1</code>');
h = h.replace(/^#{1,3} (.*)$/gm, '<div class="qw-h">$1</div>');
h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
h = h.replace(/^(?:-|\*) (.+)$/gm, '<div class="qw-li">• $1</div>');
h = h.replace(/^\d+\. (.+)$/gm, '<div class="qw-li">$&</div>');
h = h.replace(/\n/g, '<br>');
return h;
}

// ---------------- UI ----------------
function ensureUI() {
if ($('#qwBtn')) return;
const btn = document.createElement('button');
btn.id = 'qwBtn'; btn.type = 'button'; btn.className = 'qw-fab';
btn.title = '千问 AI 排班助手'; btn.innerHTML = '🤖<span>千问AI</span>';
btn.onclick = () => { const d = $('#qwDrawer'); d.classList.toggle('hidden'); if (!d.classList.contains('hidden')) setTimeout(() => d._q('#qwInput').focus(), 50);};
document.body.appendChild(btn);

const dw = document.createElement('div');
dw.id = 'qwDrawer'; dw.className = 'qw-drawer hidden';
dw.innerHTML = `
<div class="qw-hd"><div><b>🤖 千问 AI 排班助手</b><div class="mut">Powered by 通义千问 · 回答基于当前排班数据</div></div><button class="btn sm" id="qwX" type="button">✕</button></div>
<details class="qw-cfg" id="qwCfgWrap">
<summary>⚙️ 千问 API 配置 <span class="mut" id="qwKeyState"></span></summary>
<div class="qw-cfg-bd">
<input type="password" id="qwKey" class="qw-in" placeholder="DashScope API Key（sk-开头）" autocomplete="off">
<div class="qw-row">
<select id="qwModel" class="qw-in">${MODELS.map(m => `<option value="${m[0]}">${m[1]}</option>`).join('')}</select>
<button class="btn sm" id="qwSave" type="button">保存</button>
<button class="btn sm" id="qwTest" type="button">测试连接</button>
</div>
<div class="mut">Key 仅保存在本机浏览器 localStorage，不会上传或随代码提交。<br>获取 Key：阿里云「百炼」控制台 → API-KEY 管理（比赛现场可用评委/自己的 Key）。</div>
</div>
</details>
<div class="qw-chips">${QUICK.map((q, i) => `<button class="qw-chip" data-q="${i}" type="button">${q[0]} ${q[1]}</button>`).join('')}</div>
<div class="qw-msgs" id="qwMsgs"><div class="qw-msg ai"><div class="qw-bub">你好，我是千问 AI 排班助手 👋<br>配置好 API Key 后，你可以问我：<br>• 本月排班整体情况怎么样？<br>• 哪些违规要优先处理？<br>• 谁的工时偏高/偏低？<br>我会结合<b>当前排班实时数据</b>来回答。</div></div></div>
<div class="qw-ft">
<textarea id="qwInput" class="qw-in" rows="2" placeholder="问一问当前排班…（Enter 发送，Shift+Enter 换行）"></textarea>
<button class="btn primary" id="qwSend" type="button">发送</button>
</div>`;
document.body.appendChild(dw);
const q = s => dw.querySelector(s); // 抽屉内元素走局部查询，更稳健
dw._q = q;

q('#qwX').onclick = () => dw.classList.add('hidden');
q('#qwModel').value = getModel();
const refreshState = () => { q('#qwKeyState').textContent = getKey()? '（已配置 ✓）': '（未配置）';};
const hasKey =!!getKey();
q('#qwCfgWrap').open =!hasKey;
if (hasKey) q('#qwKey').value = getKey();
refreshState();
q('#qwSave').onclick = () => {
const k = q('#qwKey').value.trim();
if (!k) { toast('请先填写 API Key'); return;}
localStorage.setItem(LS_KEY, k); localStorage.setItem(LS_MODEL, q('#qwModel').value);
q('#qwCfgWrap').open = false; refreshState(); toast('千问 API 配置已保存（仅本机）');
};
q('#qwTest').onclick = () => {
const k = q('#qwKey').value.trim() || getKey();
if (!k) { toast('请先填写 API Key'); return;}
localStorage.setItem(LS_KEY, k); localStorage.setItem(LS_MODEL, q('#qwModel').value); refreshState();
ask('你好，请用一句话介绍你自己。', true);
};
dw.querySelectorAll('.qw-chip').forEach(ch => ch.onclick = () => ask(QUICK[+ch.dataset.q][2]));
q('#qwSend').onclick = () => send();
q('#qwInput').addEventListener('keydown', e => { if (e.key === 'Enter' &&!e.shiftKey) { e.preventDefault(); send();}});
}

function addMsg(role, html) {
const box = $('#qwDrawer')._q('#qwMsgs');
const d = document.createElement('div');
d.className = 'qw-msg ' + role;
d.innerHTML = `<div class="qw-bub">${html}</div>`;
box.appendChild(d); box.scrollTop = box.scrollHeight;
return d;
}

function send() {
const ta = $('#qwDrawer')._q('#qwInput'); const t = ta.value.trim();
if (!t || sending) return;
ta.value = '';
ask(t);
}

async function ask(userText, silent) {
ensureUI();
const dw = $('#qwDrawer'); if (dw.classList.contains('hidden')) dw.classList.remove('hidden');
const key = getKey();
if (!key) {
addMsg('ai', '请先在上方 ⚙️ 配置中填写 <b>DashScope API Key</b>（sk-开头），保存后再提问。');
dw._q('#qwCfgWrap').open = true;
return;
}
if (!silent) addMsg('user', esc(userText).replace(/\n/g, '<br>'));
const thinking = addMsg('ai', '<span class="qw-think">千问思考中…</span>');
sending = true;
try {
const ctx = buildRosterContext();
const msgs = [{ role: 'system', content: SYS_PROMPT},
{ role: 'user', content: ctx },
...hist.slice(-12),
{ role: 'user', content: userText}];
const r = await fetch(API_URL, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key},
body: JSON.stringify({ model: getModel(), messages: msgs, temperature: 0.7, max_tokens: 1500}),
});
const j = await r.json().catch(() => ({}));
if (!r.ok) {
const msg = (j && j.message) || (j && j.error && j.error.message) || ('HTTP ' + r.status);
throw new Error(r.status === 401? 'API Key 无效或欠费（401）：' + msg: msg);
}
const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '（千问返回为空）';
thinking.querySelector('.qw-bub').innerHTML = mdLite(txt);
if (!silent) { hist.push({ role: 'user', content: userText}, { role: 'assistant', content: txt});}
} catch (e) {
thinking.querySelector('.qw-bub').innerHTML = '请求失败：' + esc(String(e && e.message || e)) + '<br><span class="mut">请检查网络 / API Key / 余额后重试。</span>';
} finally {
sending = false;
const _box = dw._q('#qwMsgs'); _box.scrollTop = _box.scrollHeight;
}
}

// 对外暴露（控制台可用）：QWEN.ask('...')
window.QWEN = { ask, buildRosterContext};
ensureUI();
})();
