// session.js - 管理 previous_response_id 与已存响应 ID
// localStorage key
const KEY = 'AI_TR_SESSION_V1';

function load(){
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
function save(data){ localStorage.setItem(KEY, JSON.stringify(data)); }

export function currentSession(){ return load(); }

export function newSession(){
  const s = { sessionId: crypto.randomUUID(), previousResponseId: null, storedResponseIds: [] };
  save(s); return s;
}

export function resetSession(){ localStorage.removeItem(KEY); }

export function recordResponse(id, { store }){
  if (!id) return;
  const s = load() || newSession();
  s.previousResponseId = id;
  if (store) s.storedResponseIds.push(id);
  save(s);
}

export function previousResponseId(){
  const s = load(); return s?.previousResponseId || null;
}

// 伪删除占位：真实删除需调用供应商 delete endpoint（OpenAI Responses 暂未公开批删标准，这里仅清空本地记录）
export async function purgeStoredResponses(){
  const s = load(); if (!s) return 0;
  const count = s.storedResponseIds.length; s.storedResponseIds = []; save(s); return count;
}
