// build-info.js - runtime fallback build info injection (no inline script for CSP)
(async function(){
  const el = document.getElementById('buildInfo');
  if (!el || el.textContent.trim()) return;
  try {
    const now = new Date();
    const tz = new Date(now.getTime() + 8*60*60*1000); // UTC+8
    const pad = n=>String(n).padStart(2,'0');
    let ver = '0.0.0';
    try {
      const r = await fetch('package.json');
      if (r.ok){ const j = await r.json(); ver = j.version || ver; }
    } catch {}
    el.textContent = 'DEV v'+ver+' '+tz.getUTCFullYear()+'-'+pad(tz.getUTCMonth()+1)+'-'+pad(tz.getUTCDate())+' '+pad(tz.getUTCHours())+':'+pad(tz.getUTCMinutes());
  } catch {}
})();
