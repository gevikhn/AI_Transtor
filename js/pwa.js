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
