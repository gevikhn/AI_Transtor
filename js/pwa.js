if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.error('SW registration failed', err);
    });
  });
}

// Edge Side Panel 检测，兼容性处理
if (navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)) {
  const brands = navigator.userAgentData.brands;
  const sidebarBrandInfo = brands.find(b => b.brand === "Edge Side Panel");
  if (sidebarBrandInfo) {
    console.log(sidebarBrandInfo); // { brand: "Edge Side Panel", version: "1" }
  } else {
    console.log("App is not running in the Microsoft Edge sidebar");
  }
} else {
  // 兼容 Safari、Firefox、旧版 Chromium
  // console.debug('navigator.userAgentData 未定义，跳过 Edge Side Panel 检测');
}

const MIN_W = 300, MIN_H = 600;

function clampWindowSize() {
  let isBrowser = matchMedia("(display-mode: browser)").matches;
  if (isBrowser || navigator.standalone === false) return; // 避免在普通网页里触发
  const w = window.outerWidth || window.innerWidth;
  const h = window.outerHeight || window.innerHeight;
  const tw = Math.max(w, MIN_W);
  const th = Math.max(h, MIN_H);
  console.debug(`clampWindowSize: ${w}x${h} -> ${tw}x${th}`);
  if (tw !== w || th !== h) window.resizeTo(tw, th);
}

// addEventListener('DOMContentLoaded', clampWindowSize);
// addEventListener('resize', () => {
//   clearTimeout(clampWindowSize._t);
//   clampWindowSize._t = setTimeout(clampWindowSize, 50); // 防抖避免抖动
// });

