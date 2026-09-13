const CACHE_NAME='class-support-shell-v49';
const SHELL=['./','./index.html','./styles.css?v=49','./db.js?v=49','./migration.js?v=49','./xlsx-reader.js?v=49','./csv-export.js?v=49','./app-core.js?v=49','./app-shell.js?v=49','./app-settings.js?v=49','./app-records.js?v=49','./app-seating.js?v=49','./app-reports.js?v=49','./app-data.js?v=49','./app.js?v=49','./manifest.webmanifest','./icon.svg'];

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
