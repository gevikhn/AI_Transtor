import { loadConfig } from './config.js';

const meta = document.querySelector('meta[name="theme-color"]');
const media = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme){
  let mode = theme;
  if (mode === 'system' || !mode){
    mode = media.matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = mode;
  if (meta){ meta.setAttribute('content', mode === 'dark' ? '#0d0f11' : '#ffffff'); }
}

export function initTheme(){
  const cfg = loadConfig();
  applyTheme(cfg.theme || 'system');
  window.addEventListener('ai-tr:config-changed', e=>{
    applyTheme((e.detail.cfg && e.detail.cfg.theme) || 'system');
  });
  const handler = ()=>{
    const cfg = loadConfig();
    if ((cfg.theme||'system') === 'system') applyTheme('system');
  };
  if (media.addEventListener){ media.addEventListener('change', handler); }
  else if (media.addListener){ media.addListener(handler); }
}

initTheme();
