"use strict";
function recordResponsiveDiagnostic(){
  document.documentElement.dataset.responsiveOverflow=String(document.documentElement.scrollWidth>window.innerWidth+1);
  const selectors=[...document.querySelectorAll(".step-btn"),...['#bk-assets','#bk-rec'].map(s=>document.querySelector(s)).filter(Boolean)];
  const stage=document.querySelector("#stage");
  if(stage?.closest(".panel.active"))selectors.push(stage);
  document.documentElement.dataset.responsiveCapabilities=String(selectors.every(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=-1&&r.right<=window.innerWidth+1;}));
}
recordResponsiveDiagnostic();
addEventListener("DOMContentLoaded",()=>requestAnimationFrame(()=>{recordResponsiveDiagnostic();setTimeout(recordResponsiveDiagnostic,500);}));
addEventListener("resize",recordResponsiveDiagnostic);
