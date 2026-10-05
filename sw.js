// v161 build 2026-10-05: recoverable draft for weekly homework creation.
const CACHE_NAME='class-support-shell-v161';
const SHELL=['./','./index.html','./styles.css?v=161','./db.js?v=161','./migration.js?v=161','./xlsx-reader.js?v=161','./csv-export.js?v=161','./app-core.js?v=161','./app-shell.js?v=161','./app-settings-core.js?v=161','./app-help.js?v=161','./app-settings-display.js?v=161','./app-settings-records.js?v=161','./app-settings-security.js?v=161','./app-settings-classes.js?v=161','./app-settings.js?v=161','./app-data-import.js?v=161','./app-data-crypto.js?v=161','./app-data-sync.js?v=161','./app-data-text-transfer.js?v=161','./app-data-migration.js?v=161','./app-data-transfer.js?v=161','./app-notebook-history.js?v=161','./app-records.js?v=161','./app-weekly.js?v=161','./app-behavior.js?v=161','./app-grades.js?v=161','./app-seating.js?v=161','./app-cleaning.js?v=161','./app-reports.js?v=161','./app-data.js?v=161','./app.js?v=161','./manifest.webmanifest','./icon.svg'];

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
