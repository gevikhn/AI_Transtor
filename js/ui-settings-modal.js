// ui-settings-modal.js - 设置模态控制与表单逻辑复用
import { loadConfig, saveConfig, validateConfig, exportConfig, importConfig, DEFAULT_PROMPT_TEMPLATE, encryptApiKey, encryptMasterPassword, decryptMasterPassword, ENC_META_KEY, MP_META_KEY, decryptApiKey } from './config.js';

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

const LANGS = [ ['zh-CN','中文'],['en','English'],['ja','日本語'],['ko','한국어'],['fr','Français'],['de','Deutsch'] ];

function fillLanguages(select, cfg){
  if (!select) return;
  select.innerHTML='';
  for (const [v,l] of LANGS){ const o=document.createElement('option'); o.value=v; o.textContent=l; if (cfg.targetLanguage===v) o.selected=true; select.appendChild(o);} }

let unlockedPlainKey = null; // 运行期缓存
const MASK = '******';

function qsMaster(){ return form.querySelector('[data-field=masterPassword]') || document.getElementById('masterPassword'); }

function loadIntoForm(){
  const cfg = loadConfig();
  [...form.querySelectorAll('[data-field]')].forEach(el=>{
    const key = el.getAttribute('data-field');
    if (el.type==='checkbox') el.checked = !!cfg[key]; else el.value = cfg[key] == null ? '' : cfg[key];
  });
  // 已保存的加密 apiKey / 主密码用掩码显示，避免误解“为空”
  const apiInput = form.querySelector('[data-field=apiKey]');
  if (apiInput){
    apiInput.dataset.changed = '0';
    if (loadConfig().apiKeyEnc) apiInput.value = MASK; else if (!apiInput.value) apiInput.value='';
  }
  const mpInput = qsMaster();
  if (mpInput){
    mpInput.dataset.changed = '0';
  const cfgNow = loadConfig();
  if (cfgNow.useMasterPassword && cfgNow.masterPasswordEnc){ mpInput.value = MASK; }
  }
  if (!form.querySelector('[data-field=promptTemplate]').value){
    form.querySelector('[data-field=promptTemplate]').value = DEFAULT_PROMPT_TEMPLATE;
  }
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
  [...form.querySelectorAll('[data-field]')].forEach(el=>{
    const key = el.getAttribute('data-field');
    if (el.type==='checkbox') next[key] = el.checked; else next[key] = el.value.trim();
  });
  if (next.apiKey) { next.apiKeyEnc = next.apiKey; delete next.apiKey; }
  ['temperature','maxTokens','timeoutMs','retries'].forEach(k=>{ if (next[k]!==undefined && next[k] !== '') next[k] = Number(next[k]); });
  const mp = qsMaster();
  const apiInput = form.querySelector('[data-field=apiKey]');
  // 仅当用户真正修改（脱离掩码）才重新加密
  if (apiInput){
    if (apiInput.dataset.changed==='1'){
      const raw = apiInput.value.trim();
      let mpPlain = '';
      if (next.useMasterPassword){
        if (mp?.dataset.changed==='1'){ mpPlain = mp.value.trim(); }
        else if (cfg.useMasterPassword && cfg.masterPasswordEnc){ try { mpPlain = await decryptMasterPassword(cfg.masterPasswordEnc); } catch { mpPlain=''; } }
      }
      try { next.apiKeyEnc = await encryptApiKey(raw, next.useMasterPassword ? mpPlain : ''); }
      catch(e){ statusEl.textContent='加密失败: '+e.message; return; }
      unlockedPlainKey = raw;
    } else {
      // 没改：保持原 apiKeyEnc
      next.apiKeyEnc = cfg.apiKeyEnc;
    }
  }
  // 主密码：如果启用并修改了才覆盖；如果取消启用则清空
  if (!next.useMasterPassword){
    // 如果用户输入了主密码但未勾选开关，提示而不保存
    const mpInput = qsMaster();
    if (mpInput && mpInput.value && mpInput.value!==MASK){
      statusEl.textContent='未勾选“主密码加密”，输入的主密码未被保存';
    }
    next.masterPasswordEnc = '';
  } else if (mp){
    if (mp.dataset.changed==='1'){
      const plainMp = mp.value===MASK ? '' : mp.value.trim();
      if (plainMp){
        try { next.masterPasswordEnc = await encryptMasterPassword(plainMp); }
        catch(e){ statusEl.textContent='主密码加密失败: '+e.message; return; }
      } else {
        next.masterPasswordEnc = cfg.masterPasswordEnc; // 未真正修改
      }
      // 如果修改了主密码且没改 API Key，需要用新密码重新加密（保持可解）
      if (mp.dataset.changed==='1' && apiInput && apiInput.dataset.changed!=='1'){
        try {
          const mpPlain = plainMp || (cfg.masterPasswordEnc ? await decryptMasterPassword(cfg.masterPasswordEnc) : '');
          if (unlockedPlainKey){
            next.apiKeyEnc = await encryptApiKey(unlockedPlainKey, mpPlain);
          } else {
            statusEl.textContent='主密码已改，需重新输入 API Key 以重新加密';
            return;
          }
        } catch { statusEl.textContent='主密码重加密失败'; return; }
      }
    } else {
      next.masterPasswordEnc = cfg.masterPasswordEnc;
    }
  }
  const errs = validateConfig(next);
  if (errs.length){ statusEl.textContent = errs.join(' / '); return; }
  saveConfig(next); if (apiInput) apiInput.dataset.changed='0';
  if (mp) mp.dataset.changed='0';
  statusEl.textContent = '已保存';
});

btnTest.addEventListener('click', async()=>{
  statusEl.textContent='测试中...';
  const cfg = loadConfig();
  try { const resp = await fetch(cfg.baseUrl.replace(/\/$/,'') + '/models', { headers:{ 'Authorization':'Bearer '+cfg.apiKeyEnc }}); statusEl.textContent = resp.ok ? '连通成功 '+resp.status : '连通失败 '+resp.status; }
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
    if (imported.__apiKeyMeta){ try { localStorage.setItem(ENC_META_KEY, JSON.stringify(imported.__apiKeyMeta)); } catch { /* ignore */ } }
    if (imported.__masterPasswordMeta){ try { localStorage.setItem(MP_META_KEY, JSON.stringify(imported.__masterPasswordMeta)); } catch { /* ignore */ } }
    // 如果需要主密码验证
    if (imported.useMasterPassword && imported.masterPasswordEnc){
      let mp = prompt('请输入导入配置的主密码以验证解锁');
      if (mp == null){ throw new Error('已取消'); }
      mp = mp.trim();
      if (!mp){ throw new Error('主密码为空'); }
      // 验证主密码密文
      try { const plainMp = await decryptMasterPassword(imported.masterPasswordEnc); if (plainMp !== mp){ throw new Error('主密码不匹配'); } } catch(e){ throw new Error('主密码验证失败'); }
      // 验证 API Key 是否可用（如果存在）
      if (imported.apiKeyEnc){
        try { await decryptApiKey(imported.apiKeyEnc, mp); } catch(e){ throw new Error('API Key 解密失败，可能主密码不正确'); }
      }
    } else {
      // 未启用主密码：如果带有 apiKeyEnc 仍直接接受；如果没有则继续
    }
    // 清理临时字段
    delete imported.__apiKeyMeta; delete imported.__masterPasswordMeta;
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
  mpField.addEventListener('focus', e=>{ if (e.target.value===MASK){ e.target.value=''; e.target.dataset.changed='1'; }});
  mpField.addEventListener('input', e=>{ e.target.dataset.changed='1'; });
}

// 首次不自动打开
