const CACHE_NAME='class-support-shell-v140';
const SHELL=['./','./index.html','./styles.css?v=140','./db.js?v=140','./migration.js?v=140','./xlsx-reader.js?v=140','./csv-export.js?v=140','./app-core.js?v=140','./app-shell.js?v=140','./app-settings-core.js?v=140','./app-help.js?v=140','./app-settings-display.js?v=140','./app-settings-records.js?v=140','./app-settings-security.js?v=140','./app-settings-classes.js?v=140','./app-settings.js?v=140','./app-data-import.js?v=140','./app-data-crypto.js?v=140','./app-data-sync.js?v=140','./app-data-migration.js?v=140','./app-notebook-history.js?v=140','./app-records.js?v=140','./app-behavior.js?v=140','./app-grades.js?v=140','./app-seating.js?v=140','./app-cleaning.js?v=140','./app-reports.js?v=140','./app-data.js?v=140','./app.js?v=140','./manifest.webmanifest','./icon.svg'];

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
