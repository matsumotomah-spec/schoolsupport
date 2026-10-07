// v175 build 2026-10-07: add v153 reproduction baseline regression.
const CACHE_NAME='class-support-shell-v175';
const SHELL=['./','./index.html','./styles.css?v=175','./db.js?v=175','./migration.js?v=175','./xlsx-reader.js?v=175','./csv-export.js?v=175','./app-core.js?v=175','./app-shell.js?v=175','./app-settings-core.js?v=175','./app-help.js?v=175','./app-settings-display.js?v=175','./app-settings-records.js?v=175','./app-settings-security.js?v=175','./app-settings-classes.js?v=175','./app-settings.js?v=175','./app-data-import.js?v=175','./app-data-crypto.js?v=175','./app-data-sync.js?v=175','./app-data-text-transfer.js?v=175','./app-data-migration.js?v=175','./app-data-transfer.js?v=175','./app-notebook-history.js?v=175','./app-records.js?v=175','./app-weekly.js?v=175','./app-behavior.js?v=175','./app-grades.js?v=175','./app-seating.js?v=175','./app-cleaning.js?v=175','./app-reports.js?v=175','./app-data.js?v=175','./app.js?v=175','./manifest.webmanifest','./icon.svg'];

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
