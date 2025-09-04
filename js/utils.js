// utils.js - 通用工具集合

export function uuid(){
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8);return v.toString(16);
  });
}

export function now(){ return performance.now(); }

export function estimateTokens(str){ return Math.ceil(str.length / 4); }

export async function copyToClipboard(text){
  try { await navigator.clipboard.writeText(text); return true; } catch(e){ return false; }
}

// 未来 SSE 解析占位
export function parseSSELines(rawChunk, buffer){
  const text = typeof rawChunk === 'string' ? rawChunk : new TextDecoder().decode(rawChunk);
  const lines = text.split(/\r?\n/);
  const events = [];
  for (const line of lines){
    if (line === ''){ // 事件结束
      if (buffer.current){ events.push(buffer.current); buffer.current=null; }
      continue;
    }
    if (!buffer.current) buffer.current = { event:null, data:[] };
    if (line.startsWith('event:')) buffer.current.event = line.slice(6).trim();
    else if (line.startsWith('data:')) buffer.current.data.push(line.slice(5).trim());
  }
  return events;
}

/**
 * 读取 fetch Response.body (ReadableStream) 并解析为 SSE 事件
 * @param {ReadableStream} stream
 * @param {(evt:{event:string|null,data:string[]})=>void} onEvent
 * @param {AbortSignal} signal
 */
export async function readSSEStream(stream, onEvent, signal){
  const reader = stream.getReader();
  const buffer = { current:null };
  try {
    while(true){
      if (signal?.aborted) throw new DOMException('Aborted','AbortError');
      const {done, value} = await reader.read();
      if (done){
        // flush
        if (buffer.current){ onEvent(buffer.current); buffer.current=null; }
        break;
      }
      const events = parseSSELines(value, buffer);
      for (const e of events) onEvent(e);
    }
  } finally {
    reader.releaseLock();
  }
}

/** 将事件回调包装为异步迭代器 */
export async function * sseIterator(stream, signal){
  const q = [];
  let push, done=false;
  const wait = ()=> new Promise(r=>push=r);
  readSSEStream(stream, evt=>{ q.push(evt); if (push){ push(); push=null;} }, signal).then(()=>{ done=true; if (push) push(); });
  while(!done || q.length){
    if (!q.length){ await wait(); if (!q.length && done) break; }
    while(q.length) yield q.shift();
  }
}
