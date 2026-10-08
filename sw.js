"use strict";
const CACHE="iris-shell-v6-visuals";
const BASE=new URL(self.registration.scope).pathname;
const SHELL=["./","./index.html","./manifest.webmanifest","./icon.svg","./runtime-config.js","./supabase-adapter.js","./responsive-diagnostic.js","./assets/mock/iris-test-delivery.mp4","./assets/demo/cafe-storefront.jpg","./assets/demo/coffee-shot-1.jpg","./assets/demo/coffee-shot-2.jpg","./assets/demo/coffee-shot-3.jpg","./assets/demo/coffee-shot-4.jpg"].map(path=>new URL(path,self.registration.scope).pathname);
self.addEventListener("install",event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.all(SHELL.map(async url=>{
    try{
      const response=await fetch(url,{cache:"reload"});
      if(response.ok) await cache.put(url,response);
    }catch{ /* the fetch handler is network-first and can refill it later */ }
  }));
  await self.skipWaiting();
})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET"||new URL(event.request.url).origin!==self.location.origin) return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(response=>response||(event.request.mode==="navigate"?caches.match(new URL("./index.html",self.registration.scope).pathname):Response.error()))));
});

