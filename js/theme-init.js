(function(){
  const THEME_KEY = 'AI_TR_THEME_MODE';
  const meta = document.querySelector('meta[name="theme-color"]');
  let mode = localStorage.getItem(THEME_KEY);
  if (mode !== 'light' && mode !== 'dark') {
    mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = mode;
  if (meta) {
    meta.setAttribute('content', mode === 'dark' ? '#0d0f11' : '#f6f8fa');
  }
})();
