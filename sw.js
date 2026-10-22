// v177 build 2026-10-22: restore homework medal after a forgotten record is resolved.
const CACHE_NAME='class-support-shell-v177';
const SHELL=['./','./index.html','./styles.css?v=177','./db.js?v=177','./migration.js?v=177','./xlsx-reader.js?v=177','./csv-export.js?v=177','./app-core.js?v=177','./app-shell.js?v=177','./app-settings-core.js?v=177','./app-help.js?v=177','./app-settings-display.js?v=177','./app-settings-records.js?v=177','./app-settings-security.js?v=177','./app-settings-classes.js?v=177','./app-settings.js?v=177','./app-data-import.js?v=177','./app-data-crypto.js?v=177','./app-data-sync.js?v=177','./app-data-text-transfer.js?v=177','./app-data-migration.js?v=177','./app-data-transfer.js?v=177','./app-notebook-history.js?v=177','./app-records.js?v=177','./app-weekly.js?v=177','./app-behavior.js?v=177','./app-grades.js?v=177','./app-seating.js?v=177','./app-cleaning.js?v=177','./app-reports.js?v=177','./app-data.js?v=177','./app.js?v=177','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('class-support-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
    if(response&&response.ok){
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
    }
    return response;
  }).catch(async()=>{
    const cached=await caches.match(event.request);
    if(cached)return cached;
    if(event.request.mode==='navigate')return caches.match('./index.html');
    throw new Error('offline resource unavailable');
  }));
});
