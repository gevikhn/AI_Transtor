// ui-settings-modal.js - 设置模态控制与表单逻辑复用
import { loadConfig, saveConfig, validateConfig, exportConfig, importConfig, DEFAULT_PROMPT_TEMPLATE, encryptApiKey, encryptMasterPassword, decryptMasterPassword, ENC_META_KEY, MP_META_KEY, decryptApiKey, getActiveService, getActiveConfig, setActiveService, getApiKeyAuto } from './config.js';

const overlay = document.getElementById('settingsOverlay');
const openBtn = document.getElementById('openSettings');
const closeBtn = document.getElementById('closeSettings');
const form = document.getElementById('settingsForm');
const statusEl = document.getElementById('settingsStatus');
const importFile = document.getElementById('importFile');

const btnTest = document.getElementById('btnTest');
const btnExport = document.getElementById('btnExport');
const btnExportSafe = document.getElementById('btnExportSafe');
const btnImport = document.getElementById('btnImport');
const btnNewSession = document.getElementById('btnNewSession');
const btnDeleteSession = document.getElementById('btnDeleteSession');
// 多服务 UI
const svcSelect = document.getElementById('svcSelect');
const svcName = document.getElementById('svcName');
const btnAddSvc = document.getElementById('btnAddSvc');
const btnDelSvc = document.getElementById('btnDelSvc');

const LANGS = [ ['zh-CN','中文'],['en','English'],['ja','日本語'],['ko','한국어'],['fr','Français'],['de','Deutsch'] ];

function fillLanguages(select, cfg){
  if (!select) return;
  select.innerHTML='';
  for (const [v,l] of LANGS){ const o=document.createElement('option'); o.value=v; o.textContent=l; if (cfg.targetLanguage===v) o.selected=true; select.appendChild(o);} }

let unlockedPlainKey = null; // 仅缓存当前服务的明文 Key
const MASK = '******';

function qsMaster(){ return form.querySelector('[data-field=masterPassword]') || document.getElementById('masterPassword'); }

function loadIntoForm(){
  const cfg = loadConfig();
  const svc = getActiveService(cfg);
  // 多服务选择
  if (svcSelect){
    svcSelect.innerHTML='';
    for (const s of cfg.services||[]){
      const o = document.createElement('option'); o.value = s.id; o.textContent = s.name || s.id; if (s.id===cfg.activeServiceId) o.selected = true; svcSelect.appendChild(o);
    }
  }
  if (svcName){ svcName.value = svc.name || ''; }
  // 全局字段
  [...form.querySelectorAll('[data-field]')].forEach(el=>{
    const key = el.getAttribute('data-field');
    if (['apiKey','masterPassword'].includes(key)) return; // 这些字段单独处理
    const serviceKeys = ['apiType','baseUrl','model','temperature','maxTokens'];
    if (serviceKeys.includes(key)){
      if (el.type==='checkbox') el.checked = !!svc[key]; else el.value = svc[key] == null ? '' : svc[key];
    } else {
      if (el.type==='checkbox') el.checked = !!cfg[key]; else el.value = cfg[key] == null ? '' : cfg[key];
    }
  });
  // 已保存的加密 apiKey / 主密码用掩码显示
  const apiInput = form.querySelector('[data-field=apiKey]');
  if (apiInput){
    apiInput.dataset.changed = '0';
    if (svc.apiKeyEnc) apiInput.value = MASK; else if (!apiInput.value) apiInput.value='';
  }
  const mpInput = qsMaster();
  if (mpInput){
    mpInput.dataset.changed = '0';
    if (mpInput.dataset.raw) delete mpInput.dataset.raw;
    if (cfg.masterPasswordEnc){ mpInput.value = MASK; }
  }
  if (!form.querySelector('[data-field=promptTemplate]').value){ form.querySelector('[data-field=promptTemplate]').value = DEFAULT_PROMPT_TEMPLATE; }
  fillLanguages(form.querySelector('[data-field=targetLanguage]'), cfg);
  statusEl.textContent = '已加载';
}

function open(){
  loadIntoForm();
  overlay.hidden=false; document.body.style.overflow='hidden';
}
function close(){ overlay.hidden=true; document.body.style.overflow=''; }

openBtn.addEventListener('click', open);
closeBtn.addEventListener('click', close);
overlay.addEventListener('click', e=>{ if (e.target===overlay) close(); });
window.addEventListener('keydown', e=>{ if (e.key==='Escape' && !overlay.hidden) close(); });

form.addEventListener('submit', async e=>{
  e.preventDefault();
  const cfg = loadConfig();
  const next = { ...cfg };
  const svc = getActiveService(cfg);
  // 更新服务名
  if (svcName && svcName.value.trim()){ svc.name = svcName.value.trim(); }
  // 回写表单字段（禁止将明文 apiKey 写入配置）
  [...form.querySelectorAll('[data-field]')].forEach(el=>{
    const key = el.getAttribute('data-field');
    if (key === 'apiKey' || key === 'masterPassword') return; // 跳过保存明文字段
    const val = el.type==='checkbox' ? el.checked : el.value.trim();
    if (['apiType','baseUrl','model','temperature','maxTokens'].includes(key)) svc[key] = val;
    else next[key] = val;
  });
  // 兜底：移除可能残留的全局 apiKey/masterPassword 字段
  if ('apiKey' in next) delete next.apiKey;
  if ('masterPassword' in next) delete next.masterPassword;
  // 表单兼容：apiKey 输入映射到 svc.apiKeyEnc（明文或密文）
  const apiInput = form.querySelector('[data-field=apiKey]');
  if (apiInput && apiInput.value && apiInput.value !== MASK){ svc.apiKeyEnc = apiInput.value.trim(); }
  // 数字规范化：全局与服务级分别处理
  ['timeoutMs','retries'].forEach(k=>{ if (next[k]!==undefined && next[k] !== '') next[k] = Number(next[k]); });
  if (svc.temperature!==undefined && svc.temperature!=='') svc.temperature = Number(svc.temperature); else svc.temperature = 0;
  if (svc.maxTokens!==undefined && svc.maxTokens!=='') svc.maxTokens = Number(svc.maxTokens); else svc.maxTokens = undefined;
  const mp = qsMaster();
  let masterChanged = false;
  let newMasterPlain = '';
  if (mp){
    if (mp.dataset.changed==='1'){
      masterChanged = true;
      const rawVal = mp.dataset.raw !== undefined ? mp.dataset.raw : (mp.value===MASK ? '' : mp.value);
      newMasterPlain = rawVal.trim();
      if (newMasterPlain){
        try { next.masterPasswordEnc = await encryptMasterPassword(newMasterPlain); }
        catch(e){ statusEl.textContent='主密码加密失败: '+e.message; return; }
      } else {
        next.masterPasswordEnc = '';
      }
    } else {
      next.masterPasswordEnc = cfg.masterPasswordEnc;
      if (cfg.masterPasswordEnc){ try { newMasterPlain = await decryptMasterPassword(cfg.masterPasswordEnc); } catch { newMasterPlain=''; } }
    }
  }
  if (apiInput){
    if (apiInput.dataset.changed==='1'){
      const raw = apiInput.value.trim();
      try { svc.apiKeyEnc = await encryptApiKey(raw, newMasterPlain, svc.id); }
      catch(e){ statusEl.textContent='加密失败: '+e.message; return; }
      unlockedPlainKey = raw;
    } else if (masterChanged && svc.apiKeyEnc){
      try {
        const oldMaster = cfg.masterPasswordEnc ? await decryptMasterPassword(cfg.masterPasswordEnc) : '';
        const raw = await decryptApiKey(getActiveService(cfg).apiKeyEnc, oldMaster, svc.id);
        svc.apiKeyEnc = await encryptApiKey(raw, newMasterPlain, svc.id);
        unlockedPlainKey = raw;
      } catch { statusEl.textContent='主密码重加密失败'; return; }
    } else {
      const prevSvc = getActiveService(cfg);
      svc.apiKeyEnc = prevSvc.apiKeyEnc;
    }
  }
  const errs = validateConfig(next);
  if (errs.length){ statusEl.textContent = errs.join(' / '); return; }
  // 写回服务数组（替换当前 active 项）
  next.services = (next.services||cfg.services||[]).map(s=> s.id===svc.id ? { ...s, ...svc } : s);
  saveConfig(next);
  if (apiInput){
    apiInput.dataset.changed='0';
    if (svc.apiKeyEnc) apiInput.value = MASK;
  }
  if (mp){
    mp.dataset.changed='0';
    if (mp.dataset.raw) delete mp.dataset.raw;
    mp.value = next.masterPasswordEnc ? MASK : '';
  }
  statusEl.textContent = '已保存';
});

btnTest.addEventListener('click', async()=>{
  statusEl.textContent='测试中...';
  const cfg = getActiveConfig();
  try {
    const apiKey = await getApiKeyAuto();
    const resp = await fetch(cfg.baseUrl.replace(/\/$/,'') + '/models', { headers:{ 'Authorization':'Bearer '+apiKey }});
    statusEl.textContent = resp.ok ? '连通成功 '+resp.status : '连通失败 '+resp.status;
  }
  catch{ statusEl.textContent='网络错误'; }
});
btnExport.addEventListener('click', ()=> exportConfig(loadConfig()));
btnExportSafe.addEventListener('click', ()=> exportConfig(loadConfig(), { safe:true }));
btnImport.addEventListener('click', ()=> importFile.click());
importFile.addEventListener('change', async()=>{
  if (!importFile.files[0]) return; statusEl.textContent='导入中...';
  const prevCfgRaw = localStorage.getItem('AI_TR_CFG_V1');
  const prevApiMeta = localStorage.getItem(ENC_META_KEY);
  const prevMpMeta = localStorage.getItem(MP_META_KEY);
  let imported;
  try { imported = await importConfig(importFile.files[0]); } catch(e){ statusEl.textContent='导入失败: 文件解析错误'; importFile.value=''; return; }
  try {
    // 写入元数据（如果有）
    if (imported.__masterPasswordMeta){ try { localStorage.setItem(MP_META_KEY, JSON.stringify(imported.__masterPasswordMeta)); } catch { /* ignore */ } }
    // 新结构：按服务写入 meta
    if (imported.__apiKeyMetaMap){
      try {
        for (const [sid, meta] of Object.entries(imported.__apiKeyMetaMap)){
          localStorage.setItem(`${ENC_META_KEY}__${sid}`, JSON.stringify(meta));
        }
      } catch { /* ignore */ }
    }
    // 兼容旧：若存在旧单一 meta
    if (imported.__apiKeyMeta){ try { localStorage.setItem(ENC_META_KEY, JSON.stringify(imported.__apiKeyMeta)); } catch { /* ignore */ } }

    // 如果需要主密码验证
    if (imported.masterPasswordEnc){
      let mp = prompt('请输入导入配置的主密码以验证解锁');
      if (mp == null){ throw new Error('已取消'); }
      mp = mp.trim();
      if (!mp){ throw new Error('主密码为空'); }
      // 验证主密码密文
      try { const plainMp = await decryptMasterPassword(imported.masterPasswordEnc); if (plainMp !== mp){ throw new Error('主密码不匹配'); } } catch(e){ throw new Error('主密码验证失败'); }
      // 验证 API Key 是否可用（如果存在）
      if (Array.isArray(imported.services)){
        for (const s of imported.services){ if (s.apiKeyEnc){ try { await decryptApiKey(s.apiKeyEnc, mp, s.id); } catch(e){ throw new Error(`服务 ${s.name||s.id} API Key 解密失败`); } } }
      } else if (imported.apiKeyEnc){
        try { await decryptApiKey(imported.apiKeyEnc, mp); } catch(e){ throw new Error('API Key 解密失败，可能主密码不正确'); }
      }
    }
    // 清理临时字段
    delete imported.__apiKeyMeta; delete imported.__apiKeyMetaMap; delete imported.__masterPasswordMeta;
    saveConfig(imported); loadIntoForm(); statusEl.textContent='导入成功';
  } catch(e){
    // 回滚元数据与配置
    if (prevCfgRaw) localStorage.setItem('AI_TR_CFG_V1', prevCfgRaw); else localStorage.removeItem('AI_TR_CFG_V1');
    if (prevApiMeta) localStorage.setItem(ENC_META_KEY, prevApiMeta); else localStorage.removeItem(ENC_META_KEY);
    if (prevMpMeta) localStorage.setItem(MP_META_KEY, prevMpMeta); else localStorage.removeItem(MP_META_KEY);
    statusEl.textContent = '导入失败: ' + (e.message||'未知错误');
  } finally { importFile.value=''; }
});
btnNewSession.addEventListener('click', ()=>{ statusEl.textContent='(未来: 新建会话)'; });
btnDeleteSession.addEventListener('click', ()=>{ statusEl.textContent='(未来: 删除会话)'; });

// 监听 API Key 输入变更标记
const apiField = form.querySelector('[data-field=apiKey]');
if (apiField){
  apiField.addEventListener('focus', e=>{ if (e.target.value===MASK){ e.target.value=''; e.target.dataset.changed='1'; }});
  apiField.addEventListener('input', e=>{ e.target.dataset.changed='1'; });
}
const mpField = qsMaster();
if (mpField){
  mpField.addEventListener('focus', e=>{
    if (e.target.value===MASK){ e.target.value=''; }
    if (e.target.dataset.raw){ e.target.value = e.target.dataset.raw; }
    e.target.dataset.changed='1';
  });
  mpField.addEventListener('blur', e=>{
    if (e.target.dataset.changed==='1'){
      e.target.dataset.raw = e.target.value;
      if (e.target.value) e.target.value = MASK;
    }
  });
  mpField.addEventListener('input', e=>{ e.target.dataset.changed='1'; });
}

// 服务切换/新增/删除
svcSelect?.addEventListener('change', (e)=>{ setActiveService(e.target.value); loadIntoForm(); unlockedPlainKey=null; });
btnAddSvc?.addEventListener('click', ()=>{
  const cfg = loadConfig();
  const idx = (cfg.services||[]).length + 1;
  const id = `svc-${Date.now()}-${idx}`;
  const base = { id, name:`服务${idx}`, apiType:'openai-responses', baseUrl:'https://api.openai.com/v1', apiKeyEnc:'', model:'gpt-4o-mini', temperature: 0, maxTokens: undefined };
  cfg.services = [...(cfg.services||[]), base];
  cfg.activeServiceId = id;
  saveConfig(cfg); loadIntoForm(); statusEl.textContent = '已新增服务配置';
});
btnDelSvc?.addEventListener('click', ()=>{
  const cfg = loadConfig();
  if ((cfg.services||[]).length<=1){ statusEl.textContent='至少保留一个服务配置'; return; }
  const id = cfg.activeServiceId;
  cfg.services = (cfg.services||[]).filter(s=>s.id!==id);
  cfg.activeServiceId = cfg.services[0].id;
  saveConfig(cfg); loadIntoForm(); unlockedPlainKey=null; statusEl.textContent='已删除当前服务配置';
});

// 首次不自动打开
