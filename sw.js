// Network-first application shell; IndexedDB trade data is not touched.
const CACHE='tj-mobile-v1.0';
const ASSETS=['./index.html','./app.js?v=1.0','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tj-mobile-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{const response=await fetch(req,{cache:'no-store'});if(response.ok)await cache.put(req,response.clone());return response}
  catch(err){const saved=await cache.match(req,{ignoreSearch:true});if(saved)return saved;throw err}
 })());
});
