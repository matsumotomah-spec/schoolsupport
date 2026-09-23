const CACHE_NAME='class-support-shell-v135';
const SHELL=['./','./index.html','./styles.css?v=135','./db.js?v=135','./migration.js?v=135','./xlsx-reader.js?v=135','./csv-export.js?v=135','./app-core.js?v=135','./app-shell.js?v=135','./app-settings-core.js?v=135','./app-help.js?v=135','./app-settings-display.js?v=135','./app-settings-records.js?v=135','./app-settings-security.js?v=135','./app-settings-classes.js?v=135','./app-settings.js?v=135','./app-data-import.js?v=135','./app-data-crypto.js?v=135','./app-data-sync.js?v=135','./app-data-migration.js?v=135','./app-notebook-history.js?v=135','./app-records.js?v=135','./app-behavior.js?v=135','./app-grades.js?v=135','./app-seating.js?v=135','./app-reports.js?v=135','./app-data.js?v=135','./app.js?v=135','./manifest.webmanifest','./icon.svg'];

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
