// ui-translate.js - 翻译页逻辑 (v0.1 非流式)
import { loadConfig, setActiveService } from './config.js';
import { translateOnce, translateStream } from './api.js';
import { copyToClipboard, estimateTokens } from './utils.js';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import MarkdownIt from 'markdown-it';

const langSelect = document.getElementById('langSelect');
const serviceSelect = document.getElementById('serviceSelect');
const inputEl = document.getElementById('inputText');
const outputView = document.getElementById('outputView');
const statusBar = document.getElementById('statusBar');
const btnTranslate = document.getElementById('btnTranslate');
const btnClear = document.getElementById('btnClear');
const btnCopy = document.getElementById('btnCopy');

// 支持在输出区域使用 Ctrl+A 仅选择翻译结果
outputView?.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(outputView);
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

const LANGS = [
  ['zh-CN','中文'],['en','English'],['ja','日本語'],['ko','한국어'],['fr','Français'],['de','Deutsch']
];

// 已移除输入/输出本地持久化（模态设置页场景不再需要恢复上次内容）

function populateLangs(cfg){
  langSelect.innerHTML = '';
  for (const [val,label] of LANGS){
    const o = document.createElement('option');
    o.value = val; o.textContent = label; if (val===cfg.targetLanguage) o.selected = true; langSelect.appendChild(o);
  }
}

function populateServices(cfg){
  if (!serviceSelect) return;
  serviceSelect.innerHTML='';
  const list = cfg.services || [];
  for (const s of list){
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.name || s.id; if (s.id===cfg.activeServiceId) o.selected = true; serviceSelect.appendChild(o);
  }
}

function setStatus(msg){ statusBar.textContent = msg; }

let currentAbort = null;
let streaming = false;
let outputRaw = '';

// Markdown 工具
const turndown = new TurndownService({ headingStyle:'atx', codeBlockStyle:'fenced' });
// 启用 GFM 支持（表格/删除线/任务列表等）
turndown.use(gfm);
const mdRender = new MarkdownIt({ html:false, linkify:true, breaks:true });

function renderMarkdown(text){
  if (!outputView) return;
  if (!text){ outputView.innerHTML=''; return; }
  outputView.innerHTML = mdRender.render(text);
}

// 轻量 TSV -> Markdown 表格转换（用于无 HTML 时的粘贴/拖拽兜底）
function tsvToMarkdownIfTable(text){
  if (!text || text.indexOf('\t') === -1) return null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l=>l.trim().length>0);
  if (lines.length < 2) return null;
  const cols = lines.map(l=>l.split('\t').length);
  const colCount = cols[0];
  if (colCount < 2) return null;
  const consistent = cols.every(c=>c===colCount);
  if (!consistent) return null;
  const esc = s=>s.replace(/\|/g,'\\|').trim();
  const rows = lines.map(l=>l.split('\t').map(esc));
  const header = rows[0];
  const sep = Array(colCount).fill('---');
  const body = rows.slice(1);
  const toLine = arr => `| ${arr.join(' | ')} |`;
  return [toLine(header), toLine(sep), ...body.map(toLine)].join('\n');
}

// 在 textarea 光标处插入文本
function insertAtCursor(textarea, text){
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  textarea.value = before + text + after;
  const pos = start + text.length;
  textarea.selectionStart = textarea.selectionEnd = pos;
}

// 替换整个输入内容并保留撤销栈
function replaceInputText(text){
  inputEl.focus();
  // setRangeText 会创建撤销点并触发 input 事件
  inputEl.setRangeText(text, 0, inputEl.value.length, 'end');
}

// 粘贴模式：'plain' 或 'markdown'
const PASTE_MODE_KEY = 'AI_TR_PASTE_MODE';
function getPasteMode(){ const v = localStorage.getItem(PASTE_MODE_KEY); return v==='markdown' ? 'markdown' : 'plain'; }
function setPasteMode(v){ localStorage.setItem(PASTE_MODE_KEY, v==='markdown'?'markdown':'plain'); updatePasteToggleUI(); }
function updatePasteToggleUI(){
  const btn = document.getElementById('btnMdModeToggle'); if (!btn) return;
  const mode = getPasteMode();
  const iconMd = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 19V5l5 5 5-5v14"></path><path d="M21 5v14"></path></svg>';
  const iconPlain = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M3 12h14M3 18h10"></path></svg>';
  const isMd = mode==='markdown';
  btn.title = isMd ? '粘贴保留格式 (Markdown)' : '粘贴为纯文本';
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = isMd ? iconMd : iconPlain;
  btn.setAttribute('aria-pressed', String(isMd));
}
function bindPasteToggle(){
  const btn = document.getElementById('btnMdModeToggle'); if (!btn) return;
  btn.addEventListener('click', ()=>{
    const cur = getPasteMode();
    setPasteMode(cur==='markdown' ? 'plain' : 'markdown');
  });
  updatePasteToggleUI();
}

async function doTranslate(){
  if (streaming){ cancelStream(); return; }
  const text = inputEl.value.trim();
  if (!text){ setStatus('请输入内容'); return; }
  const cfg = loadConfig();
  const maxRetries = Number(cfg.retries||0);
  outputRaw='';
  renderMarkdown('');
  // 不再持久化输出
  btnTranslate.textContent = cfg.stream ? '取消 (Esc)' : '翻译 (Ctrl+Enter)';
  btnTranslate.classList.toggle('danger', cfg.stream);
  btnTranslate.disabled = false;
  setStatus(cfg.stream ? '流式中...' : '请求中...');
  const start = performance.now();
  if (!cfg.stream){
    streaming = true;
    let attempt=0;
    while(true){
      try {
  const result = await translateOnce(text,{ targetLanguage: langSelect.value });
  outputRaw = result;
  renderMarkdown(outputRaw);
  // 不再持久化输出
        const ms = Math.round(performance.now()-start);
        setStatus(`完成 ${ms}ms | ~${estimateTokens(result)} token` + (attempt?` | 重试${attempt}`:''));
        break;
      } catch(e){
        if (e.name==='AbortError'){ setStatus('已取消'); break; }
        if (/主密码错误|密文格式不支持/.test(e.message||'') || /AuthError/.test(e.name)){
          setStatus(e.message||'主密码错误'); break;
        }
        if (attempt < maxRetries && !/AuthError|ConfigError/.test(e.name)){
          attempt++; setStatus(`失败(${e.name}) 重试 ${attempt}/${maxRetries}`); continue;
        } else { setStatus(e.message||'翻译失败'); break; }
      } finally { /* loop end */ }
    }
    streaming = false; resetButton();
    return;
  }
  // 流式路径
  streaming = true;
  currentAbort = new AbortController();
  const buffer = { pending:'' };
  let flushScheduled = false;
  const scheduleFlush = ()=>{
    if (flushScheduled) return; flushScheduled = true;
    requestAnimationFrame(()=>{
      if (buffer.pending){ outputRaw += buffer.pending; buffer.pending=''; renderMarkdown(outputRaw); }
      // 不再持久化输出
      flushScheduled = false;
    });
  };
  let attempt=0;
  while(true){
    let produced=false;
    try {
      for await (const chunk of translateStream(text,{ targetLanguage: langSelect.value, signal: currentAbort.signal })){
        if (typeof chunk === 'string'){ 
          produced=true; 
            buffer.pending += chunk; 
            scheduleFlush();
            // 实时 token 估算（输出 + 输入）
    const outPreviewLen = outputRaw.length + buffer.pending.length;
            setStatus(`流式中... ~in:${estimateTokens(text)} token / out:${estimateTokens(outPreviewLen+'')} token`);
        }
      }
  if (buffer.pending){ outputRaw += buffer.pending; buffer.pending=''; renderMarkdown(outputRaw); }
      const ms = Math.round(performance.now()-start);
  setStatus(`完成 ${ms}ms | ~${estimateTokens(outputRaw)} token` + (attempt?` | 重试${attempt}`:''));
      break;
    } catch(e){
      if (e.name === 'AbortError'){ setStatus('已取消'); break; }
  if (/主密码错误|密文格式不支持/.test(e.message||'')) { setStatus(e.message||'主密码错误'); break; }
      if (!produced && attempt < maxRetries && !/AuthError|ConfigError/.test(e.name)){
        attempt++; setStatus(`失败(${e.name}) 重试 ${attempt}/${maxRetries}`); continue;
      } 
      // 回退：若仍未产出任何增量，尝试非流式一次
      if (!produced){
        try {
          setStatus('流式失败，回退非流式...');
          const result = await translateOnce(text,{ targetLanguage: langSelect.value });
          outputRaw = result;
          renderMarkdown(outputRaw);
          // 不再持久化输出
          const ms = Math.round(performance.now()-start);
          setStatus(`回退完成 ${ms}ms | ~${estimateTokens(result)} token`);
        } catch(e2){ setStatus(e.message||'流式失败'); }
      } else {
        setStatus(e.message||'流式失败');
      }
      break;
    }
  }
  streaming = false; currentAbort=null; resetButton();
}

function cancelStream(){
  if (currentAbort){ currentAbort.abort(); }
}

function resetButton(){
  btnTranslate.textContent = '翻译 (Ctrl+Enter)';
  btnTranslate.classList.remove('danger');
}

btnTranslate.addEventListener('click', doTranslate);
btnClear.addEventListener('click', ()=>{
  replaceInputText('');
  outputRaw='';
  renderMarkdown('');
  setStatus('已清空');
});
btnCopy.addEventListener('click', async()=>{ if (!outputRaw) return; const ok = await copyToClipboard(outputRaw); setStatus(ok?'已复制':'复制失败'); });

window.addEventListener('keydown', e=>{
  if ((e.metaKey||e.ctrlKey) && e.key==='Enter'){ doTranslate(); }
  else if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='l'){ inputEl.focus(); }
  else if (e.key==='Escape'){ if (streaming) cancelStream(); }
});

// 拖拽 txt 文件或文本内容
inputEl.addEventListener('dragover', e=>{ e.preventDefault(); });
inputEl.addEventListener('drop', e=>{
  e.preventDefault();
  // 需求：拖拽前先清空输入与输出
  replaceInputText('');
  outputRaw = '';
  renderMarkdown('');
  const dt = e.dataTransfer;
  const f = dt.files[0];
  if (f){
    if (
      f.type === 'text/plain' ||
      f.type === 'text/markdown' ||
      f.type === 'text/x-markdown' ||
      f.name.endsWith('.txt') ||
      f.name.endsWith('.md') ||
      f.name.endsWith('.markdown')
    ){
      const reader = new FileReader();
      reader.onload = ()=>{ replaceInputText(reader.result); setStatus('文件已载入'); };
      reader.readAsText(f);
    } else {
      setStatus('仅支持 .txt / .md');
    }
    return;
  }
  const mode = getPasteMode();
  const text = dt.getData('text/plain');
  if (mode==='markdown'){
    const md = dt.getData('text/markdown');
    if (md){ replaceInputText(md); setStatus('Markdown 已载入'); return; }
    const html = dt.getData('text/html');
    if (html){ const md2 = turndown.turndown(html); replaceInputText(md2); setStatus('HTML 已转换为 Markdown'); return; }
    const mdFromTsv = tsvToMarkdownIfTable(text);
    if (mdFromTsv){ replaceInputText(mdFromTsv); setStatus('检测到表格 (TSV) · 已转换为 Markdown'); return; }
  }
  if (text){ replaceInputText(text); setStatus('文本已载入'); }
});

// 粘贴事件：保留 Markdown（或将 HTML 转为 Markdown）
inputEl.addEventListener('paste', (e)=>{
  const cd = e.clipboardData; if (!cd) return;
  // 需求：粘贴前先清空输入与输出
  replaceInputText('');
  outputRaw = '';
  renderMarkdown('');
  const mode = getPasteMode();
  const text = cd.getData('text/plain');
  if (mode==='markdown'){
    const md = cd.getData('text/markdown');
    if (md){ e.preventDefault(); replaceInputText(md); setStatus('已粘贴 Markdown'); return; }
    const html = cd.getData('text/html');
    if (html){ e.preventDefault(); const md2 = turndown.turndown(html); replaceInputText(md2); setStatus('已从 HTML 转 Markdown'); return; }
    const mdFromTsv = tsvToMarkdownIfTable(text);
    if (mdFromTsv){ e.preventDefault(); replaceInputText(mdFromTsv); setStatus('检测到表格 (TSV) · 已转换为 Markdown'); return; }
  }
  // 否则默认（纯文本）
  if (text){ e.preventDefault(); replaceInputText(text); setStatus('已粘贴文本'); }
});

(function init(){
  const cfg = loadConfig();
  populateLangs(cfg);
  populateServices(cfg);
  // 不再恢复上次输入/输出
  bindPasteToggle();
})();

// 输入监听持久化（节流）
// 取消输入节流持久化

// 服务切换
serviceSelect?.addEventListener('change', (e)=>{
  const id = e.target.value;
  setActiveService(id);
});

// 监听配置变更事件，动态刷新服务下拉与语言（如默认语言修改）
window.addEventListener('ai-tr:config-changed', ()=>{
  const cfg = loadConfig();
  populateServices(cfg);
  populateLangs(cfg);
});

// 跨标签页/窗口更新：监听 localStorage 变更
window.addEventListener('storage', (e)=>{
  if (e.key === 'AI_TR_CFG_V1'){
    const cfg = loadConfig();
    populateServices(cfg);
    populateLangs(cfg);
  }
});
