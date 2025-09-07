#!/usr/bin/env node
import http from 'http';
import path from 'path';
import fs from 'fs';
import finalhandler from 'finalhandler';
import serveStatic from 'serve-static';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname,'..');
const distDir = path.join(root,'dist');
const isWatch = process.argv.includes('--watch');

if (!fs.existsSync(distDir)){
  console.log('dist 不存在，先执行 build');
  const cp = await import('child_process');
  cp.execSync('node scripts/build.mjs', { stdio:'inherit', cwd: root });
}

// SSE 客户端管理
const clients = new Set();
function sendReload(){
  for (const res of clients){
    try {
      res.write(`event: reload\n`);
      res.write(`data: now\n\n`);
    } catch(_){}
  }
}

// 简单构建队列，避免并发构建
let buildRunning = false;
let pending = false;
function buildOnce({ initial=false }={}){
  if (buildRunning){ pending = true; return; }
  buildRunning = true;
  const args = ['scripts/build.mjs', '--no-clean'];
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
  child.on('exit', (code)=>{
    buildRunning = false;
    if (code === 0){
      if (!initial) console.log('[preview] rebuild done. triggering reload...');
      sendReload();
    } else {
      console.error('[preview] build failed with code', code);
    }
    if (pending){ pending = false; buildOnce(); }
  });
}

const serve = serveStatic(distDir, {
  fallthrough: true,
  index:['index.html'],
  setHeaders(res){
    // 避免开发时缓存
    res.setHeader('Cache-Control', 'no-store');
  }
});

function injectLiveReload(html){
  const snippet = `\n<script>
  (()=>{
    if (!window.EventSource) { return; }
    const es = new EventSource('/__livereload');
    const reload = ()=> window.location.reload();
    es.addEventListener('reload', reload);
    es.onmessage = reload;
    es.onerror = ()=>{ /* 断线后浏览器会自动重连 */ };
  })();
</script>\n`;
  if (html.includes('</body>')) return html.replace('</body>', snippet + '</body>');
  return html + snippet;
}

const server = http.createServer(function onRequest (req, res) {
  // SSE 端点
  if (req.url === '/__livereload'){
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(': connected\n\n');
    clients.add(res);
    const heartbeat = setInterval(()=>{ try{ res.write(': ping\n\n'); } catch(_){} }, 20000);
    req.on('close', ()=>{ clearInterval(heartbeat); clients.delete(res); });
    return;
  }

  // 对 HTML 响应注入 livereload 脚本
  const urlPath = decodeURIComponent((req.url||'').split('?')[0]);
  const isHtmlReq = urlPath === '/' || urlPath.endsWith('.html');
  if (isHtmlReq){
    const filePath = urlPath === '/' ? path.join(distDir,'index.html') : path.join(distDir, urlPath);
    const safePath = path.resolve(filePath);
    if (safePath.startsWith(distDir) && fs.existsSync(safePath)){
      try {
        let html = fs.readFileSync(safePath, 'utf8');
        if (isWatch) html = injectLiveReload(html);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
        return;
      } catch(e){ /* fallback to static */ }
    }
  }

  serve(req, res, finalhandler(req, res));
});
let port = Number(process.env.PORT) || 5173;
function tryListen(){
  server.listen(port, ()=>{ console.log('本地预览 http://localhost:'+port); });
}
server.on('error', (err)=>{
  if (err && err.code === 'EADDRINUSE'){
    console.warn(`[preview] 端口 ${port} 被占用，尝试下一个...`);
    try { server.close(); } catch(_){}
    port += 1;
    // 轻微延迟后重试
    setTimeout(tryListen, 50);
  } else {
    console.error('[preview] server error', err);
    process.exit(1);
  }
});
tryListen();

// watch + rebuild + reload
if (isWatch){
  // 首次构建（不清理）以确保静态资源到位
  buildOnce({ initial:true });
  const toWatch = ['js','css','assets','index.html','default.prompt','sw.js','manifest.webmanifest'];
  const debounce = (fn, ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const watcher = fs.watch(root, { recursive:true }, debounce((evt, filename)=>{
    if (!filename) return;
    if (!toWatch.some(p=> filename.startsWith(p))) return;
    console.log('[preview] change:', filename);
    buildOnce();
  }, 150));
  process.on('SIGINT', ()=>{ try{ watcher.close(); }catch(_){} console.log('Stopped preview.'); process.exit(0); });
}
