if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.error('SW registration failed', err);
    });
  });
}

const brands = navigator.userAgentData.brands;
const sidebarBrandInfo = brands.find(b => b.brand === "Edge Side Panel");
if (sidebarBrandInfo) {
  console.log(sidebarBrandInfo); // { brand: "Edge Side Panel", version: "1" }
} else {
  console.log("App is not running in the Microsoft Edge sidebar");
}
