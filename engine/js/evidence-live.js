// Small incremental classification feed. The packed graph and reviewed groups
// remain immutable; only explicitly provisional overlays are resolved here.
import {resolveEvidenceSelection} from './evidence-states.js';

export const LIVE_AI_COLOR='#83cfe0';
const FEED=new URL('../../decks/data/ppcs-classification-live.json',import.meta.url).href;
const listeners=new Set();
let latest=null,connected=false,timer=0,controller=null,generation=0;

function emit(){for(const listener of listeners)listener({snapshot:latest,connected});}
async function poll(epoch=generation){
  if(!listeners.size||epoch!==generation)return;
  if(document.hidden){timer=setTimeout(()=>poll(epoch),10000);return;}
  const request=new AbortController();controller=request;
  const timeout=setTimeout(()=>request.abort(),5000);
  try{
    const response=await fetch(FEED,{cache:'no-store',signal:request.signal});
    if(!response.ok)throw Error(`Classification feed: ${response.status}`);
    const incoming=await response.json();
    if(epoch!==generation)return;
    if(incoming.version!=='ppcs-classification-live-v1'||!incoming.byId||!incoming.candidateCohorts||!incoming.contentHash)throw Error('Invalid classification feed');
    if(latest&&Number(incoming.revision)<Number(latest.revision))throw Error('Older classification feed');
    const changed=!connected||incoming.contentHash!==latest?.contentHash;
    latest=incoming;connected=true;if(changed)emit();
  }catch{
    if(epoch!==generation)return;
    const changed=connected;connected=false;if(changed||!latest)emit();
  }finally{
    clearTimeout(timeout);if(controller===request)controller=null;
    if(listeners.size&&epoch===generation)timer=setTimeout(()=>poll(epoch),10000);
  }
}
export function subscribeClassificationFeed(listener){
  listeners.add(listener);listener({snapshot:latest,connected});
  if(listeners.size===1)poll();
  return()=>{listeners.delete(listener);if(!listeners.size){generation++;clearTimeout(timer);controller?.abort();}};
}

export async function graphFingerprint(data){
  const text=data.nodes.map(n=>`${n.id}\t${Number(n.x).toFixed(6)}\t${Number(n.y).toFixed(6)}`).join('\n')+`\nedges:${data.edges.length}`;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
}

export function prepareLiveClassifications(snapshot,data){
  const known=new Set(data.nodes.map(n=>n.id));
  const protectedIds=new Set([...(snapshot.protectedIds||[]),...(snapshot.protectedManualIds||[])]);
  for(const n of data.nodes)if(n.reviewed||n.auditStatus==='reviewed'||Object.values(n.groupReviewStatus||{}).includes('source-reviewed'))protectedIds.add(n.id);
  const records=new Map(Object.entries(snapshot.byId||{}).filter(([id])=>known.has(id)));
  for(const [id,row] of records)if(row.protected)protectedIds.add(id);
  const base=data.interactiveCohorts||data.cohorts||{},cohorts={};
  const parents={sports:'humans',children:'humans',military:'humans',adultClinical:'humans',adultCivilianPpcs:'humans',
    civilianPpcsMetabolism:'adultCivilianPpcs',civilianPpcsOxygen:'civilianPpcsMetabolism',
    civilianPpcsTracer:'adultCivilianPpcs',civilianPpcsPerfusion:'adultCivilianPpcs',
    civilianPpcsCvr:'adultCivilianPpcs',civilianPpcsVascular:'adultCivilianPpcs',civilianPpcsOxygenation:'adultCivilianPpcs'};
  const annotated=new Set();
  for(const [id,row] of records)if(row.prediction&&!protectedIds.has(id)&&!['failed','context_followup'].includes(row.status))annotated.add(id);
  for(const [key,spec] of Object.entries(base)){
    const proposed=(snapshot.candidateCohorts[key]||[]).filter(id=>{
      const row=records.get(id);
      return known.has(id)&&!protectedIds.has(id)&&row?.highlightAllowed===true&&row.prediction&&!['failed','context_followup'].includes(row.status);
    });
    cohorts[key]={...spec,members:[...new Set([...(spec.members||[]),...proposed])],
      ...(spec.parentGroup||parents[key]?{parentGroup:spec.parentGroup||parents[key]}:{})};
  }
  return{snapshot,records,annotated,protectedIds,data:{...data,interactiveCohorts:cohorts}};
}

export function resolveLiveClassificationOverlay(state,data,live,options={}){
  if(!live||state.studiesOnly)return new Set();
  if(state.overview){const hidden=options.hidden||new Set(state.hiddenNodes||[]);return new Set([...live.annotated].filter(id=>!hidden.has(id)));}
  if(!state.cohorts?.length)return new Set();
  const base=resolveEvidenceSelection(state,data,options).primary;
  const combined=resolveEvidenceSelection(state,live.data,options).primary;
  return new Set([...combined].filter(id=>!base.has(id)));
}
