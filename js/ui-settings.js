// ui-settings.js - 设置页逻辑 (v0.1 仅基础保存/加载 + 连通性占位)
import { loadConfig, saveConfig, validateConfig, exportConfig, importConfig, DEFAULT_PROMPT_TEMPLATE, encryptApiKey, encryptMasterPassword, decryptMasterPassword, getActiveService, getActiveConfig, getApiKeyAuto } from './config.js';

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
  const svc = getActiveService(cfg);
  [...form.querySelectorAll('[data-field]')].forEach(el=>{
    const key = el.getAttribute('data-field');
    if (['apiType','baseUrl','model','temperature','maxTokens'].includes(key)){
      if (el.type==='checkbox') el.checked = !!svc[key];
      else el.value = svc[key] == null ? '' : svc[key];
    } else {
      if (el.type==='checkbox') el.checked = !!cfg[key];
      else el.value = cfg[key] == null ? '' : cfg[key];
    }
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
  const svc = getActiveService(cfg);
  [...form.querySelectorAll('[data-field]')].forEach(el=>{
    const key = el.getAttribute('data-field');
    if (key === 'apiKey') return; // 不保存明文字段
    const val = el.type==='checkbox' ? el.checked : el.value.trim();
    if (['apiType','baseUrl','model','temperature','maxTokens'].includes(key)) svc[key] = val; else next[key] = val;
  });
  // 兼容：html 用 apiKey，配置字段是 apiKeyEnc（未加密时直接存）
  if ('apiKey' in next){ if (next.apiKey) svc.apiKeyEnc = next.apiKey; delete next.apiKey; }
  // 规范化数字字段
  // 数字规范化：全局与服务级分别处理
  ['timeoutMs','retries'].forEach(k=>{ if (next[k] !== undefined && next[k] !== '') next[k] = Number(next[k]); });
  if (svc.temperature!==undefined && svc.temperature!=='') svc.temperature = Number(svc.temperature); else svc.temperature = 0;
  if (svc.maxTokens!==undefined && svc.maxTokens!=='') svc.maxTokens = Number(svc.maxTokens); else svc.maxTokens = undefined;
    // 主密码自动加密
    const mp = document.getElementById('masterPassword');
    const apiInput = form.querySelector('[data-field=apiKey]') || form.querySelector('[data-field=apiKeyEnc]');
    if (mp && (mp.value || cfg.masterPasswordEnc) && apiInput && (apiInput.dataset.changed==='1' || !svc.apiKeyEnc?.startsWith('sk-'))){
      try {
        const mpPlain = mp.value ? mp.value.trim() : await decryptMasterPassword(cfg.masterPasswordEnc);
        svc.apiKeyEnc = await encryptApiKey(apiInput.value.trim(), mpPlain, svc.id);
        next.masterPasswordEnc = await encryptMasterPassword(mpPlain);
      }
      catch(e){ statusEl.textContent='加密失败: '+e.message; return; }
    } else {
      next.masterPasswordEnc = cfg.masterPasswordEnc || '';
    }
    next.useMasterPassword = !!next.masterPasswordEnc;
    const errs = validateConfig(next);
  if (errs.length){ statusEl.textContent = errs.join(' / '); return; }
  next.services = (next.services||cfg.services||[]).map(s=> s.id===svc.id ? { ...s, ...svc } : s);
  saveConfig(next);
  if (apiInput) apiInput.dataset.changed='0';
  statusEl.textContent = '已保存';
});

btnTest.addEventListener('click', async()=>{
  statusEl.textContent = '测试中...';
  // 简易探测：不发送真实文本，仅 HEAD/OPTIONS 可能被拒绝，使用一个最小 POST 再说
  const cfg = getActiveConfig();
  try {
    const apiKey = await getApiKeyAuto();
    const resp = await fetch(cfg.baseUrl.replace(/\/$/,'') + '/models', { headers:{'Authorization':'Bearer '+apiKey}});
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
