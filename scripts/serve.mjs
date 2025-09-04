#!/usr/bin/env node
import http from 'http';
import path from 'path';
import fs from 'fs';
import finalhandler from 'finalhandler';
import serveStatic from 'serve-static';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname,'..');
const distDir = path.join(root,'dist');

if (!fs.existsSync(distDir)){
  console.log('dist 不存在，先执行 build');
  const cp = await import('child_process');
  cp.execSync('node scripts/build.mjs', { stdio:'inherit', cwd: root });
}

const serve = serveStatic(distDir, { fallthrough: true, index:['index.html'] });
const server = http.createServer(function onRequest (req, res) {
  serve(req, res, finalhandler(req, res));
});
const port = process.env.PORT || 5173;
server.listen(port, ()=>{ console.log('本地预览 http://localhost:'+port); });
