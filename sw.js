const CACHE_NAME='class-support-shell-v149';
const SHELL=['./','./index.html','./styles.css?v=149','./db.js?v=149','./migration.js?v=149','./xlsx-reader.js?v=149','./csv-export.js?v=149','./app-core.js?v=149','./app-shell.js?v=149','./app-settings-core.js?v=149','./app-help.js?v=149','./app-settings-display.js?v=149','./app-settings-records.js?v=149','./app-settings-security.js?v=149','./app-settings-classes.js?v=149','./app-settings.js?v=149','./app-data-import.js?v=149','./app-data-crypto.js?v=149','./app-data-sync.js?v=149','./app-data-transfer.js?v=149','./app-notebook-history.js?v=149','./app-records.js?v=149','./app-behavior.js?v=149','./app-grades.js?v=149','./app-seating.js?v=149','./app-cleaning.js?v=149','./app-reports.js?v=149','./app-data.js?v=149','./app.js?v=149','./manifest.webmanifest','./icon.svg'];

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
