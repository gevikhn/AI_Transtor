const PENDING_JOB_KEY = 'AI_TR_PENDING_SELECTION_JOB';
const MESSAGE_SELECTION_JOB = 'AI_TR_SELECTION_JOB';
const MESSAGE_TRANSLATE_ACTIVE_SELECTION = 'AI_TR_TRANSLATE_ACTIVE_SELECTION';

function isExtensionPage(){
  return location.protocol === 'chrome-extension:' &&
    typeof chrome !== 'undefined' &&
    !!chrome.runtime?.id;
}

if (isExtensionPage()){
  const storageArea = chrome.storage?.session || chrome.storage?.local;
  const storageAreaName = chrome.storage?.session ? 'session' : 'local';
  let lastJobId = '';
  let lastActiveSelectionRequestAt = 0;

  function dispatchSelectionJob(job){
    if (!job || typeof job !== 'object') return;
    const text = String(job.text || '').trim();
    const images = Array.isArray(job.images) ? job.images : [];
    const error = String(job.error || '').trim();
    if (!text && !images.length && !error) return;

    const jobId = String(job.id || `${job.createdAt || Date.now()}-${text.slice(0, 24)}-${images.length}`);
    if (jobId === lastJobId) return;
    lastJobId = jobId;

    window.dispatchEvent(new CustomEvent('ai-tr:external-input', {
      detail: {
        jobId,
        text,
        html: job.html || '',
        images,
        error,
        autoTranslate: job.autoTranslate !== false,
        sourceTitle: job.sourceTitle || '',
        sourceUrl: job.sourceUrl || '',
        imageUrl: job.imageUrl || '',
        tabId: job.tabId,
        windowId: job.windowId
      }
    }));
  }

  function sendRuntimeMessage(message){
    return new Promise((resolve, reject)=>{
      try {
        chrome.runtime.sendMessage(message, response => {
          const error = chrome.runtime.lastError;
          if (error){
            reject(error);
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function requestActiveSelectionJob(){
    const now = Date.now();
    if (now - lastActiveSelectionRequestAt < 500) return;
    lastActiveSelectionRequestAt = now;
    try {
      await sendRuntimeMessage({ type: MESSAGE_TRANSLATE_ACTIVE_SELECTION });
    } catch {
      // Some extension surfaces can open without a readable web tab. Ignore and keep the side panel open.
    }
  }

  async function consumePendingJob(){
    if (!storageArea) return false;
    try {
      const result = await storageArea.get(PENDING_JOB_KEY);
      const job = result?.[PENDING_JOB_KEY];
      if (!job) return false;
      await storageArea.remove(PENDING_JOB_KEY);
      dispatchSelectionJob(job);
      return true;
    } catch (error) {
      console.warn('Failed to consume pending translation job', error);
      return false;
    }
  }

  function scheduleOpenSync(){
    setTimeout(() => {
      consumePendingJob().then(consumed => {
        if (!consumed) requestActiveSelectionJob();
      });
    }, 0);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', scheduleOpenSync, { once: true });
  } else {
    scheduleOpenSync();
  }

  window.addEventListener('focus', requestActiveSelectionJob);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestActiveSelectionJob();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MESSAGE_SELECTION_JOB) return;
    dispatchSelectionJob(message.job);
    if (typeof sendResponse === 'function') sendResponse({ ok: true });
  });

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== storageAreaName) return;
    const pending = changes[PENDING_JOB_KEY]?.newValue;
    if (!pending) return;
    Promise.resolve(storageArea?.remove(PENDING_JOB_KEY)).catch(error => {
      console.warn('Failed to clear pending translation job', error);
    });
    dispatchSelectionJob(pending);
  });
}
