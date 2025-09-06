#!/usr/bin/env node
// build.mjs
// 增强：Windows 下偶发 dist 目录被占用导致 EPERM。rmDirSafe 添加重试 + 重命名回退；可通过 --no-clean 跳过删除。
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

// 尝试删除目录（Windows 可能出现 EPERM / EBUSY：文件被占用）
function rmDirSafe(p){
  if (!fs.existsSync(p)) return;
  const max = 5;
  for (let i=0;i<max;i++){
    try { fs.rmSync(p, { recursive:true, force:true }); return; }
    catch(e){
      if (e && (e.code==='EPERM'||e.code==='EBUSY')){
        // 等待后重试
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0, 30*(i+1));
        continue;
      }
      throw e;
    }
  }
  // 最后尝试重命名回退
  try { fs.renameSync(p, p+'__stale_'+Date.now()); } catch(_){}
}
function ensureDir(p){ fs.mkdirSync(p, { recursive:true }); }

function copyFile(src, dest){ ensureDir(path.dirname(dest)); fs.copyFileSync(src, dest); }
function copyDir(srcDir, destDir){
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes:true });
  for (const ent of entries){
    const s = path.join(srcDir, ent.name);
    const d = path.join(destDir, ent.name);
    if (ent.isDirectory()) copyDir(s,d); else copyFile(s,d);
  }
}

function copyStatics(){
  const staticFiles = ['index.html', 'default.prompt','README.md',"favicon.ico",'manifest.webmanifest','sw.js'];
  for (const f of staticFiles){ const src = path.join(root, f); if (fs.existsSync(src)) copyFile(src, path.join(distDir, f)); }
  copyDir(path.join(root,'assets'), path.join(distDir,'assets'));
  copyDir(path.join(root,'css'), path.join(distDir,'css'));
}

async function run({ watch=false }={}){
  const skipClean = process.argv.includes('--no-clean');
  if (!skipClean){ rmDirSafe(distDir); }
  ensureDir(distDir); copyStatics();
  // 注入构建日期到 index.html
  const idxPath = path.join(distDir,'index.html');
  if (fs.existsSync(idxPath)){
    try {
  const now = new Date();
  // 转为 UTC+8
  const tz = new Date(now.getTime() + 8*60*60*1000);
  const pad = n=>String(n).padStart(2,'0');
  // 读取版本号
  let version = '0.0.0';
  try { const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')); version = pkg.version || version; } catch {}
  const stamp = 'v'+version+' '+tz.getUTCFullYear()+ '-' + pad(tz.getUTCMonth()+1)+'-'+pad(tz.getUTCDate())+' '+pad(tz.getUTCHours())+':'+pad(tz.getUTCMinutes())+':'+pad(tz.getUTCSeconds());
      let html = fs.readFileSync(idxPath,'utf8');
      html = html.replace(/<small id="buildInfo"[^>]*><\/small>/, m=> m.replace('</small>', stamp + '</small>'));
      fs.writeFileSync(idxPath, html);
    } catch(e){ console.warn('inject build date failed', e); }
  }
  const ctx = await build({
    entryPoints: [
      path.join(root,'js','ui-translate.js'),
      path.join(root,'js','ui-settings-modal.js'),
      // path.join(root,'js','ui-settings.js'),
      path.join(root,'js','api.js'),
      path.join(root,'js','config.js'),
      path.join(root,'js','prompt.js'),
      path.join(root,'js','session.js'),
      path.join(root,'js','utils.js'),
      path.join(root,'js','pwa.js')
    ],
    bundle: true,
    format: 'esm',
    splitting: true,
    sourcemap: true,
    outdir: path.join(distDir,'js'),
    target: 'es2020',
    treeShaking: true,
    minify: true,
    chunkNames: 'chunks/[name]-[hash]',
    banner: { js: '// Built by build.mjs' }
  }).catch(e=>{ console.error(e); process.exit(1); });

  // generate chunk manifest for service worker precache
  try {
    const chunksDir = path.join(distDir, 'js', 'chunks');
    if (fs.existsSync(chunksDir)) {
      const files = fs.readdirSync(chunksDir)
        .filter(f => f.endsWith('.js'))
        .map(f => `./js/chunks/${f}`);
      const manifestPath = path.join(distDir, 'js', 'chunk-manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(files, null, 2));
    }
  } catch (e) {
    console.warn('chunk manifest generation failed', e);
  }
  if (watch){
    console.log('[watch] build completed. Watching for changes...');
    // 重新实现简单监听（可改用 esbuild context.watch）
    const debounce = (fn, ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
    const toWatch = ['js','css','index.html', 'default.prompt', 'sw.js', 'manifest.webmanifest'];
    const watcher = fs.watch(root,{ recursive:true }, debounce((evt, filename)=>{
      if (!filename) return; if (!toWatch.some(p=> filename.startsWith(p))) return;
      console.log('[watch] change detected:', filename);
      run(); // full rebuild
    },200));
    process.on('SIGINT', ()=>{ watcher.close(); console.log('Stopped.'); process.exit(0); });
  }
}

const watch = process.argv.includes('--watch');
run({ watch });
