(function (root) {
  'use strict';
  const SIGNS = Object.freeze({
    heal: { label:'回復', svg:'<path d="M16 4h8v12h12v8H24v12h-8V24H4v-8h12Z"/>' },
    damage: { label:'ダメージ', svg:'<path d="m23 2-18 22h13l-2 14 19-24H22Z"/>' },
    shield: { label:'星護', svg:'<path d="m20 3 14 6-2 16-12 12L8 25 6 9Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="m20 10 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>' }
  });
  // 表示専用。退場した対象の位置も予告時から保持し、ルール状態には触れない。
  function createPowerEffects({ document, window, resolveElement, reducedMotion=false }) {
    const layer=document.getElementById('power-effect-layer');
    let current=null, rectangles={};
    function capture() {
      if(!current)return;
      for(const part of ['source','target']) {
        const element=resolveElement(current[part]);
        const rect=element?.getBoundingClientRect();
        if(rect)rectangles[part]={x:rect.x+rect.width/2,y:rect.y+rect.height/2,scrollX:window.scrollX||0,scrollY:window.scrollY||0};
      }
    }
    function position() {
      if(!current)return;
      capture();
      if(!rectangles.source||!rectangles.target){layer.hidden=true;return;}
      const point=part=>{const p=rectangles[part];return {x:p.x+p.scrollX-(window.scrollX||0),y:p.y+p.scrollY-(window.scrollY||0)};};
      const source=point('source'), target=point('target');
      const width=document.documentElement?.clientWidth||window.innerWidth||1200;
      const deltaX=target.x-source.x, deltaY=target.y-source.y, distance=Math.hypot(deltaX,deltaY);
      for(const [key,value] of Object.entries({sx:source.x+'px',sy:source.y+'px',tx:target.x+'px',ty:target.y+'px',distance:distance+'px',travel:Math.max(0,distance-14)+'px',angle:Math.atan2(deltaY,deltaX)+'rad',labelShift:(Math.max(96,Math.min(width-96,target.x))-target.x)+'px'}))layer.style.setProperty('--'+key,value);
      layer.classList.toggle('self-power',current.source===current.target);
      layer.hidden=false;
    }
    function clear() { current=null;rectangles={};layer.hidden=true;layer.replaceChildren(); }
    function show(visual,phase) {
      if(!Object.hasOwn(SIGNS,visual.kind)){clear();return;}
      if(current!==visual)rectangles={};
      current=visual;
      if(phase==='preview') {
        const target=resolveElement(visual.target), rect=target?.getBoundingClientRect();
        if(rect&&window.innerHeight&&(rect.y<70||rect.y+rect.height>window.innerHeight-140))target.scrollIntoView?.({block:'center',behavior:'instant'});
      }
      const sign=SIGNS[visual.kind];
      layer.dataset.kind=visual.kind;layer.dataset.phase=phase;
      layer.classList.toggle('motion-reduced',reducedMotion);
      layer.innerHTML=`<div class="power-link"></div><div class="power-origin"><span>${visual.sourceName}のパワー</span></div><div class="power-impact"><span class="power-sigil"><svg viewBox="0 0 40 40" aria-hidden="true">${sign.svg}</svg></span><div class="power-caption"><strong>${phase==='preview'?sign.label+'の対象':visual.outcome}</strong><small>${visual.targetName}</small></div></div>`;
      position();
    }
    window.addEventListener('resize',position);
    document.addEventListener('scroll',position,true);
    return { show, capture, clear };
  }
  root.SeikanPowerEffects={createPowerEffects};
})(typeof globalThis!=='undefined'?globalThis:this);
