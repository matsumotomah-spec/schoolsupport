const CACHE_NAME='class-support-shell-v54';
const SHELL=['./','./index.html','./styles.css?v=54','./db.js?v=54','./migration.js?v=54','./xlsx-reader.js?v=54','./csv-export.js?v=54','./app-core.js?v=54','./app-shell.js?v=54','./app-settings.js?v=54','./app-records.js?v=54','./app-seating.js?v=54','./app-reports.js?v=54','./app-data.js?v=54','./app.js?v=54','./manifest.webmanifest','./icon.svg'];

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
