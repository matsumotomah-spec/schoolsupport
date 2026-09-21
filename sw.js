const CACHE_NAME='class-support-shell-v129';
const SHELL=['./','./index.html','./styles.css?v=129','./db.js?v=129','./migration.js?v=129','./xlsx-reader.js?v=129','./csv-export.js?v=129','./app-core.js?v=129','./app-shell.js?v=129','./app-settings-core.js?v=129','./app-help.js?v=129','./app-settings-display.js?v=129','./app-settings-records.js?v=129','./app-settings-security.js?v=129','./app-settings-classes.js?v=129','./app-settings.js?v=129','./app-data-import.js?v=129','./app-data-crypto.js?v=129','./app-data-sync.js?v=129','./app-data-migration.js?v=129','./app-notebook-history.js?v=129','./app-records.js?v=129','./app-behavior.js?v=129','./app-grades.js?v=129','./app-seating.js?v=129','./app-reports.js?v=129','./app-data.js?v=129','./app.js?v=129','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))));
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
