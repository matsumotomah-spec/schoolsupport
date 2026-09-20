const CACHE_NAME='class-support-shell-v74';
const SHELL=['./','./index.html','./styles.css?v=74','./db.js?v=74','./migration.js?v=74','./xlsx-reader.js?v=74','./csv-export.js?v=74','./app-core.js?v=74','./app-shell.js?v=74','./app-settings.js?v=74','./app-records.js?v=74','./app-behavior.js?v=74','./app-seating.js?v=74','./app-reports.js?v=74','./app-data.js?v=74','./app.js?v=74','./manifest.webmanifest','./icon.svg'];

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
