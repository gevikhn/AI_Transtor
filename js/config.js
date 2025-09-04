// config.js
// 负责：配置数据结构、默认值、加载/保存、校验、占位加密（v0.4 前为直存）

const STORAGE_KEY = 'AI_TR_CFG_V1';

/** 默认 Prompt 模板 */
export let DEFAULT_PROMPT_TEMPLATE = `加载中...`;
// 异步加载外部默认 prompt 文件（非阻塞）；首次调用 loadConfig 后若仍是占位会被替换
fetch('./default.prompt').then(r=>r.text()).then(t=>{ if (t && DEFAULT_PROMPT_TEMPLATE==='加载中...') { DEFAULT_PROMPT_TEMPLATE = t.trim(); const raw = localStorage.getItem(STORAGE_KEY); if (!raw){ // 未保存过配置，写入默认
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultConfig, promptTemplate: DEFAULT_PROMPT_TEMPLATE })); } }}).catch(()=>{});

/** @typedef {Object} AppConfig */
/** @type {AppConfig} */
const defaultConfig = {
  apiType: 'openai-responses', // 可选: openai-responses | openai-chat | claude
  baseUrl: 'https://api.openai.com/v1',
  apiKeyEnc: '',
  masterPasswordEnc: '', // 混淆加密后的主密码（不再明文存储）
  model: 'gpt-4o-mini',
  targetLanguage: 'zh-CN',
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
  stream: true,
  temperature: 0,
  maxTokens: undefined,
  timeoutMs: 30000,
  retries: 2, // 新增：失败重试次数（非 4xx）
  useMasterPassword: false,
  storeResponses: false
};

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...defaultConfig };
    const data = JSON.parse(raw);
  // 迁移旧值 'openai' -> 'openai-responses'
  if (data.apiType === 'openai') data.apiType = 'openai-responses';
  // 迁移：如果存在 legacy 明文 masterPassword，则即时迁移为 masterPasswordEnc
  if (data.masterPassword && !data.masterPasswordEnc){
    // 暂存明文，稍后调用 encryptMasterPassword（同步返回前不阻塞 UI）
    (async ()=>{
      try { const encMp = await encryptMasterPassword(data.masterPassword); const updated = { ...data, masterPasswordEnc: encMp }; delete updated.masterPassword; localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); }
      catch{ /* ignore migration failure */ }
    })();
    delete data.masterPassword; // 立即从返回对象移除
  }
  if (data.masterPassword) delete data.masterPassword; // 强制移除残留
  // 如果旧存储里没有 promptTemplate 则补上文件默认
  if (!data.promptTemplate || data.promptTemplate === '加载中...') data.promptTemplate = DEFAULT_PROMPT_TEMPLATE;
  ['temperature','maxTokens','timeoutMs','retries'].forEach(k=>{ if (data[k]!==undefined && data[k]!=='' ) data[k] = Number(data[k]); });
  return { ...defaultConfig, ...data };
  } catch (e) {
    console.warn('Failed to load config', e);
    return { ...defaultConfig };
  }
}

export function saveConfig(cfg) {
  const clean = { ...defaultConfig, ...cfg };
  // 永不写出 legacy 明文字段
  if ('masterPassword' in clean) delete clean.masterPassword;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg.baseUrl) errors.push('Base URL 不能为空');
  if (!cfg.model) errors.push('模型不能为空');
  if (!cfg.apiKeyEnc) errors.push('API Key 未设置');
  return errors;
}

export const ENC_META_KEY = 'AI_TR_ENC_META_V1'; // 存储 salt/nonce (导出供导出/导入使用)
const DEFAULT_FALLBACK_SECRET = 'AI_TR_DEFAULT_SECRET_v1'; // 默认混淆基底（可迭代升级）
let cachedPlainKey = null; let cachedPasswordTag = null; let cachedMasterPassword = null;

async function deriveKey(password, salt){
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:150000, hash:'SHA-256' }, baseKey, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}

function mixPassword(userPwd){
  // 简单混淆：fallback 与 userPwd 交错 + 长度前缀；非安全密钥派生，仅防止纯明文直接复制
  const up = userPwd || '';
  const base = DEFAULT_FALLBACK_SECRET;
  let out='';
  const max = Math.max(up.length, base.length);
  for (let i=0;i<max;i++){
    if (i<base.length) out+=base[i];
    if (i<up.length) out+=up[i];
  }
  return `v1$${up.length}$${btoa(out)}`; // 记录原长度便于未来升级（当前未用）
}

async function sha256Hex(str){
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function encryptApiKey(key, masterPassword){
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const mixed = mixPassword(masterPassword); // 即使为空也混入默认密钥
  const k = await deriveKey(mixed, salt);
  // 封装携带校验位（hash 前 10 字符 + 版本）
  const hash = await sha256Hex(key);
  const payloadObj = { v:1, key, chk: hash.slice(0,10) };
  const cipher = await crypto.subtle.encrypt({ name:'AES-GCM', iv: nonce }, k, enc.encode(JSON.stringify(payloadObj)));
  const out = btoa(String.fromCharCode(...new Uint8Array(cipher)));
  localStorage.setItem(ENC_META_KEY, JSON.stringify({ salt: Array.from(salt), nonce: Array.from(nonce) }));
  cachedPlainKey = key; cachedPasswordTag = mixed;
  return out;
}

export async function decryptApiKey(encValue, masterPassword){
  if (!encValue) return '';
  const mixed = mixPassword(masterPassword);
  if (cachedPlainKey && cachedPasswordTag === mixed) return cachedPlainKey;
  const metaRaw = localStorage.getItem(ENC_META_KEY);
  if (!metaRaw) throw new Error('缺少加密元数据');
  const { salt, nonce } = JSON.parse(metaRaw);
  const k = await deriveKey(mixed, new Uint8Array(salt));
  const bin = Uint8Array.from(atob(encValue), c=>c.charCodeAt(0));
  let decoded;
  try {
    const plainBuf = await crypto.subtle.decrypt({ name:'AES-GCM', iv: new Uint8Array(nonce) }, k, bin);
    decoded = new TextDecoder().decode(plainBuf);
  } catch(e){ throw new Error('主密码不正确'); }
  let obj;
  try { obj = JSON.parse(decoded); } catch { throw new Error('密文格式不支持'); }
  if (!(obj && obj.v===1 && obj.key && obj.chk)) throw new Error('密文格式不支持');
  const h = await sha256Hex(obj.key);
  if (h.slice(0,10) !== obj.chk) throw new Error('主密码不正确');
  cachedPlainKey = obj.key; cachedPasswordTag = mixed; return obj.key;
}

// ========== 主密码混淆加密（与 API Key 加密分离，使用默认混淆密钥派生） ==========
export const MP_META_KEY = 'AI_TR_MP_META_V1'; // 主密码元数据 key (导出供导出/导入使用)
async function deriveStaticKey(salt){
  return deriveKey(mixPassword(''), salt); // 使用默认混淆基底派生（与用户主密码无关）
}

export async function encryptMasterPassword(mp){
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const k = await deriveStaticKey(salt);
  const hash = await sha256Hex(mp);
  const payload = JSON.stringify({ v:1, mp, chk: hash.slice(0,8) });
  const cipher = await crypto.subtle.encrypt({ name:'AES-GCM', iv: nonce }, k, enc.encode(payload));
  localStorage.setItem(MP_META_KEY, JSON.stringify({ salt: Array.from(salt), nonce: Array.from(nonce) }));
  cachedMasterPassword = mp;
  return btoa(String.fromCharCode(...new Uint8Array(cipher)));
}

export async function decryptMasterPassword(enc){
  if (!enc) return '';
  if (cachedMasterPassword) return cachedMasterPassword;
  const metaRaw = localStorage.getItem(MP_META_KEY); if (!metaRaw) throw new Error('主密码元数据缺失');
  const { salt, nonce } = JSON.parse(metaRaw);
  const k = await deriveStaticKey(new Uint8Array(salt));
  const bin = Uint8Array.from(atob(enc), c=>c.charCodeAt(0));
  let decoded;
  try { const buf = await crypto.subtle.decrypt({ name:'AES-GCM', iv:new Uint8Array(nonce) }, k, bin); decoded = new TextDecoder().decode(buf); } catch { throw new Error('主密码数据损坏'); }
  let obj; try { obj = JSON.parse(decoded); } catch { throw new Error('主密码数据损坏'); }
  if (!(obj && obj.v===1 && obj.mp && obj.chk)) throw new Error('主密码数据损坏');
  const h = await sha256Hex(obj.mp); if (h.slice(0,8)!==obj.chk) throw new Error('主密码数据损坏');
  cachedMasterPassword = obj.mp; return obj.mp;
}

export async function getMasterPasswordPlain(){
  const cfg = loadConfig();
  if (!cfg.useMasterPassword) return '';
  return await decryptMasterPassword(cfg.masterPasswordEnc);
}

export async function getApiKey(masterPassword){
  const cfg = loadConfig();
  if (!cfg.apiKeyEnc) return '';
  const mp = cfg.useMasterPassword ? masterPassword : '';
  return await decryptApiKey(cfg.apiKeyEnc, mp);
}

export async function getApiKeyAuto(){
  const cfg = loadConfig();
  if (!cfg.apiKeyEnc) return '';
  let mp = '';
  if (cfg.useMasterPassword){
    try { mp = await getMasterPasswordPlain(); } catch(e){ if (Date.now() - (window.__AI_TR_LAST_PW_ALERT||0) > 2000){ alert('主密码读取失败，请重新输入并保存'); window.__AI_TR_LAST_PW_ALERT = Date.now(); } throw e; }
  }
  if (!window.__AI_TR_LAST_PW_ALERT) window.__AI_TR_LAST_PW_ALERT = 0;
  const now = Date.now();
  try {
    return await decryptApiKey(cfg.apiKeyEnc, mp);
  } catch(e){
    if (/主密码不正确/.test(e.message)){
      if (now - window.__AI_TR_LAST_PW_ALERT > 2000){ alert('主密码错误'); window.__AI_TR_LAST_PW_ALERT = now; }
      throw e;
    }
    if (/密文格式不支持/.test(e.message)){
      if (now - window.__AI_TR_LAST_PW_ALERT > 2000){ alert('密文格式不支持，请重新输入并保存 API Key'); window.__AI_TR_LAST_PW_ALERT = now; }
      throw e;
    }
    throw e;
  }
}

// 导出/导入
export function exportConfig(cfg, { safe=false } = {}) {
  const toSave = { ...cfg };
  // 附加加密元数据（用于跨设备恢复），即使 safe 导出也保留元数据方便后续导入再次输入主密码即可使用
  try {
    const apiMeta = localStorage.getItem(ENC_META_KEY);
    if (apiMeta) toSave.__apiKeyMeta = JSON.parse(apiMeta);
  } catch { /* ignore meta */ }
  try {
    const mpMeta = localStorage.getItem(MP_META_KEY);
    if (mpMeta) toSave.__masterPasswordMeta = JSON.parse(mpMeta);
  } catch { /* ignore meta */ }
  if (safe){ toSave.apiKeyEnc = ''; }
  const blob = new Blob([JSON.stringify(toSave, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safe ? 'ai_tr_config_safe.json' : 'ai_tr_config.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}

export function importConfig(file) {
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=>reject(reader.error);
    reader.onload = ()=>{
      try { resolve(JSON.parse(String(reader.result))); } catch(e){ reject(e);} };
    reader.readAsText(file);
  });
}
