const CACHE_NAME='class-support-shell-v56';
const SHELL=['./','./index.html','./styles.css?v=56','./db.js?v=56','./migration.js?v=56','./xlsx-reader.js?v=56','./csv-export.js?v=56','./app-core.js?v=56','./app-shell.js?v=56','./app-settings.js?v=56','./app-records.js?v=56','./app-seating.js?v=56','./app-reports.js?v=56','./app-data.js?v=56','./app.js?v=56','./manifest.webmanifest','./icon.svg'];

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
