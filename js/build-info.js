// build-info.js - runtime fallback build info injection (no inline script for CSP)
(async function(){
  const el = document.getElementById('buildInfo');
  if (!el || el.textContent.trim()) return;
  try {
    let ver = '0.0.0';
    try {
      const r = await fetch('package.json');
      if (r.ok){ const j = await r.json(); ver = j.version || ver; }
    } catch {}
    el.textContent = 'DEV v'+ver;
  } catch {}
})();
