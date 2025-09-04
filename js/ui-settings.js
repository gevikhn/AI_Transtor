// ui-settings.js - 设置页逻辑 (v0.1 仅基础保存/加载 + 连通性占位)
import { loadConfig, saveConfig, validateConfig, exportConfig, importConfig, DEFAULT_PROMPT_TEMPLATE, encryptApiKey } from './config.js';

const form = document.getElementById('settingsForm');
const statusEl = document.getElementById('settingsStatus');
const btnTest = document.getElementById('btnTest');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const btnNewSession = document.getElementById('btnNewSession');
const btnDeleteSession = document.getElementById('btnDeleteSession');
const importFile = document.getElementById('importFile');

const LANGS = [ ['zh-CN','中文'],['en','English'],['ja','日本語'],['ko','한국어'],['fr','Français'],['de','Deutsch'] ];

function fillLanguages(select, cfg){
  select.innerHTML='';
  for (const [v,l] of LANGS){ const o=document.createElement('option'); o.value=v; o.textContent=l; if (cfg.targetLanguage===v) o.selected=true; select.appendChild(o);} }

function loadIntoForm(){
  const cfg = loadConfig();
  [...form.querySelectorAll('[data-field]')].forEach(el=>{
    const key = el.getAttribute('data-field');
    if (el.type==='checkbox') el.checked = !!cfg[key];
    else el.value = cfg[key] == null ? '' : cfg[key];
  });
  // 兼容旧字段：如果没有 promptTemplate 内容则用默认
  const promptEl = form.querySelector('[data-field=promptTemplate]');
  if (promptEl && !promptEl.value) promptEl.value = DEFAULT_PROMPT_TEMPLATE;
  fillLanguages(form.querySelector('[data-field=targetLanguage]'), cfg);
  statusEl.textContent = '已加载';
}

form.addEventListener('submit', async e=>{
  e.preventDefault();
  const cfg = loadConfig();
  const next = { ...cfg };
  [...form.querySelectorAll('[data-field]')].forEach(el=>{
    const key = el.getAttribute('data-field');
    if (el.type==='checkbox') next[key] = el.checked; else next[key] = el.value.trim();
  });
  // 兼容：html 用 apiKey，配置字段是 apiKeyEnc（未加密时直接存）
  if (next.apiKey) { next.apiKeyEnc = next.apiKey; delete next.apiKey; }
  // 规范化数字字段
  ['temperature','maxTokens','timeoutMs','retries'].forEach(k=>{ if (next[k] !== undefined && next[k] !== '') next[k] = Number(next[k]); });
  // 如果启用主密码并且用户填写了 masterPassword 与 apiKeyVisible 原值（假设 data-field=apiKeyEnc 输入的是明文）
  const mp = document.getElementById('masterPassword');
  const apiInput = form.querySelector('[data-field=apiKey]') || form.querySelector('[data-field=apiKeyEnc]');
  if (next.useMasterPassword && mp && mp.value && apiInput && (apiInput.dataset.changed==='1' || !next.apiKeyEnc.startsWith('sk-'))){
    try { next.apiKeyEnc = await encryptApiKey(apiInput.value.trim(), mp.value.trim()); }
    catch(e){ statusEl.textContent='加密失败: '+e.message; return; }
  }
  const errs = validateConfig(next);
  if (errs.length){ statusEl.textContent = errs.join(' / '); return; }
  saveConfig(next);
  if (apiInput) apiInput.dataset.changed='0';
  statusEl.textContent = '已保存';
});

btnTest.addEventListener('click', async()=>{
  statusEl.textContent = '测试中...';
  // 简易探测：不发送真实文本，仅 HEAD/OPTIONS 可能被拒绝，使用一个最小 POST 再说
  const cfg = loadConfig();
  try {
    const resp = await fetch(cfg.baseUrl.replace(/\/$/,'') + '/models', { headers:{'Authorization':'Bearer '+cfg.apiKeyEnc}});
    statusEl.textContent = resp.ok ? '连通成功 (HTTP '+resp.status+')' : '连通失败 '+resp.status;
  } catch(e){ statusEl.textContent = '网络错误'; }
});

btnExport.addEventListener('click', ()=>{ exportConfig(loadConfig()); });
btnImport.addEventListener('click', ()=> importFile.click());
importFile.addEventListener('change', async()=>{
  if (!importFile.files[0]) return; statusEl.textContent='导入中...';
  try { const data = await importConfig(importFile.files[0]); saveConfig(data); loadIntoForm(); statusEl.textContent='导入成功'; }
  catch(e){ statusEl.textContent='导入失败: '+e.message; }
  finally { importFile.value=''; }
});

btnNewSession.addEventListener('click', ()=>{ statusEl.textContent='(未来版本实现会话)'; });
btnDeleteSession.addEventListener('click', ()=>{ statusEl.textContent='(未来版本删除会话)'; });

form.querySelector('[data-field=apiKey]')?.addEventListener('input', e=>{ e.target.dataset.changed='1'; });
loadIntoForm();
