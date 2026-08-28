"use strict";
(function(){
  const config=window.IRIS_RUNTIME_CONFIG||{};
  function configured(){return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl||"")&&/^sb_publishable_/i.test(config.supabasePublishableKey||"");}
  function functionUrl(name){if(!configured())return null;return `${config.supabaseUrl}/functions/v1/${encodeURIComponent(name)}`;}
  async function invoke(name,{method="POST",body,accessToken,idempotencyKey}={}){
    const url=functionUrl(name);if(!url)throw Object.assign(new Error("Supabase is not configured; no network request was sent."),{code:"SECURITY_LOCKED"});
    if(!accessToken)throw Object.assign(new Error("Sign in is required."),{code:"AUTH_REQUIRED"});
    const response=await fetch(url,{method,headers:{"Content-Type":"application/json","apikey":config.supabasePublishableKey,"Authorization":`Bearer ${accessToken}`,...(idempotencyKey?{"Idempotency-Key":idempotencyKey}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.message||"Request failed"),{status:response.status,code:data.error});return data;
  }
  window.IRIS_SUPABASE=Object.freeze({configured,functionUrl,invoke,mode:configured()?"supabase":"local-mock"});
})();
