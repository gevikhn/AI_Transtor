// ui-translate.js - 翻译页逻辑 (v0.1 非流式)
import { loadConfig } from './config.js';
import { translateOnce, translateStream } from './api.js';
import { copyToClipboard, estimateTokens } from './utils.js';

const langSelect = document.getElementById('langSelect');
const inputEl = document.getElementById('inputText');
const outputEl = document.getElementById('outputText');
const statusBar = document.getElementById('statusBar');
const btnTranslate = document.getElementById('btnTranslate');
const btnClear = document.getElementById('btnClear');
const btnCopy = document.getElementById('btnCopy');

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

function setStatus(msg){ statusBar.textContent = msg; }

let currentAbort = null;
let streaming = false;

async function doTranslate(){
  if (streaming){ cancelStream(); return; }
  const text = inputEl.value.trim();
  if (!text){ setStatus('请输入内容'); return; }
  const cfg = loadConfig();
  const maxRetries = Number(cfg.retries||0);
  outputEl.value='';
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
  outputEl.value = result;
  // 不再持久化输出
        const ms = Math.round(performance.now()-start);
        setStatus(`完成 ${ms}ms | ~${estimateTokens(result)} tok` + (attempt?` | 重试${attempt}`:''));
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
  if (buffer.pending){ outputEl.value += buffer.pending; buffer.pending=''; }
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
            const outPreviewLen = outputEl.value.length + buffer.pending.length;
            setStatus(`流式中... ~in:${estimateTokens(text)} tok / out:${estimateTokens(outPreviewLen+'')} tok`);
        }
      }
      if (buffer.pending){ outputEl.value += buffer.pending; buffer.pending=''; }
      const ms = Math.round(performance.now()-start);
      setStatus(`完成 ${ms}ms | ~${estimateTokens(outputEl.value)} tok` + (attempt?` | 重试${attempt}`:''));
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
          outputEl.value = result;
          // 不再持久化输出
          const ms = Math.round(performance.now()-start);
          setStatus(`回退完成 ${ms}ms | ~${estimateTokens(result)} tok`);
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
btnClear.addEventListener('click', ()=>{ inputEl.value=''; outputEl.value=''; setStatus('已清空'); inputEl.focus(); });
btnCopy.addEventListener('click', async()=>{ if (!outputEl.value) return; const ok = await copyToClipboard(outputEl.value); setStatus(ok?'已复制':'复制失败'); });

window.addEventListener('keydown', e=>{
  if ((e.metaKey||e.ctrlKey) && e.key==='Enter'){ doTranslate(); }
  else if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='l'){ inputEl.focus(); }
  else if (e.key==='Escape'){ if (streaming) cancelStream(); }
});

// 拖拽 txt 文件
inputEl.addEventListener('dragover', e=>{ e.preventDefault(); });
inputEl.addEventListener('drop', e=>{
  e.preventDefault();
  const f = e.dataTransfer.files[0]; if (!f) return;
  if (f.type === 'text/plain' || f.name.endsWith('.txt')){
    const reader = new FileReader();
  reader.onload = ()=>{ inputEl.value = reader.result; setStatus('文件已载入'); };
    reader.readAsText(f);
  } else setStatus('仅支持 .txt');
});

(function init(){
  const cfg = loadConfig();
  populateLangs(cfg);
  // 不再恢复上次输入/输出
})();

// 输入监听持久化（节流）
// 取消输入节流持久化
