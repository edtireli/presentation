import {requestPresenterAccess} from './presenter-access.js';
import {offlineStatus, checkForUpdates, prepareOffline, activatePreparedVersion} from './offline.js';
const base=new URL('./',import.meta.url),ticketKey='spiral.presenter.ready:'+base.pathname;
let pending=null;
function el(tag,text,styles={}){const n=document.createElement(tag);if(text)n.textContent=text;Object.assign(n.style,styles);return n;}
function readinessView(){
 const dialog=el('dialog','',{background:'#000',color:'#f0eadb',border:'1px solid #514e40',padding:'clamp(24px,5vw,42px)',width:'min(540px,calc(100vw - 32px))',boxSizing:'border-box',fontFamily:'Georgia,serif'});
 dialog.id='presenter-ready-dialog';dialog.setAttribute('aria-labelledby','presenter-ready-title');
 const title=el('h2','Preparing your presentation',{fontSize:'30px',fontWeight:'400',margin:'0 0 24px'});title.id='presenter-ready-title';
 const status=el('p','Checking the saved copy and latest version…',{font:'16px/1.6 system-ui,sans-serif'});status.id='presenter-ready-status';status.setAttribute('role','status');
 const progress=el('progress','',{width:'100%',accentColor:'#efdc60'});progress.max=1;progress.hidden=true;
 const detail=el('p','',{font:'13px/1.6 system-ui,sans-serif',color:'#bdb7a9'});
 const actions=el('div','',{display:'flex',gap:'12px',flexWrap:'wrap',marginTop:'24px'});
 dialog.append(title,status,progress,detail,actions);document.body.append(dialog);dialog.addEventListener('cancel',e=>e.preventDefault());dialog.showModal();
 const choose=options=>new Promise(resolve=>{actions.replaceChildren(...options.map(([value,text],i)=>{const button=el('button',text,{padding:'10px 17px',background:i===0?'#efdc60':'#000',color:i===0?'#18170b':'#f0eadb',border:'1px solid #777466',font:'16px Georgia,serif',cursor:'pointer'});button.onclick=()=>{actions.replaceChildren();resolve(value);};return button;}));actions.firstChild?.focus();});
 return{status,progress,detail,choose,close:()=>{dialog.close();dialog.remove();}};
}
/** One startup check; never polls or changes a deck while it is being presented. */
export function ensurePresenterReady({handoff=false}={}){
 if(pending)return pending;
 pending=(async()=>{
  if(!await requestPresenterAccess())return false;
  if(!handoff){try{const ticket=JSON.parse(sessionStorage.getItem(ticketKey));sessionStorage.removeItem(ticketKey);const loaded=document.querySelector('script[data-revision]')?.dataset.revision;if(ticket&&Date.now()-ticket.at<60000&&(!loaded||loaded===ticket.revision))return true;}catch{}}
  const cancel=()=>{if(location.pathname.startsWith(base.pathname+'app/'))location.replace(base.href);return false;};
  const ui=readinessView();
  try{
   for(;;){
    let state=await offlineStatus();
    ui.status.textContent='Checking for presentation updates…';
    const check=await checkForUpdates();
    let result,offlineUse=false;
    if(check.online){
     ui.status.textContent=state.ready?(check.current?'Verifying the saved presentation…':'Downloading the latest presentation…'):'Downloading the presentation for this laptop…';
     ui.detail.textContent='All slides, models, figures, videos and narration are saved. Keep this tab open until verification finishes.';
     try{
      result=await prepareOffline({onProgress:p=>{
       ui.progress.hidden=!p.total;ui.progress.max=p.total||1;ui.progress.value=p.completed||0;
       ui.status.textContent=p.phase==='verifying'?'Verifying every saved file…':p.phase==='ready'?'Presentation ready':`Saving presentation · ${p.completed||0} / ${p.total||'…'} files`;
       ui.detail.textContent=`${((p.bytesCompleted||0)/1048576).toFixed(1)} MB saved${p.bytesTotal?' of '+(p.bytesTotal/1048576).toFixed(1)+' MB':''}. You can present without Wi-Fi once this finishes.`;
      }});
     }catch(error){
      ui.progress.hidden=true;state=await offlineStatus();ui.status.textContent='The update did not finish.';ui.detail.textContent=error.message+(state.ready?' Your previously verified copy is still intact.':' No complete offline copy is available yet.');
      const action=await ui.choose([['retry','Retry'],...(state.ready?[['saved','Use saved version']]:[]),['cancel','Back']]);
      if(action==='cancel')return cancel();if(action==='retry')continue;result=state;offlineUse=true;
     }
    }else{
     if(!state.ready||!state.verified){ui.status.textContent='Connect once to download the presentation.';ui.detail.textContent='This browser does not yet have all the files needed to present offline.';if(await ui.choose([['retry','Try again'],['cancel','Back']])==='retry')continue;return cancel();}
     result=state;offlineUse=true;
     if(navigator.onLine!==false){ui.status.textContent='The latest version could not be checked.';ui.detail.textContent=`Saved copy: ${new Date(state.verifiedAt).toLocaleString()}. You can use it explicitly, or reconnect and check again.`;const action=await ui.choose([['retry','Check again'],['saved','Use saved version'],['cancel','Back']]);if(action==='retry')continue;if(action==='cancel')return cancel();}
    }
    if(!result?.ready||!result?.verified)throw Error('The saved presentation did not finish verification.');
    const activated=await activatePreparedVersion();
    const record={at:Date.now(),revision:activated.revision||result.revision,offline:offlineUse,verifiedAt:result.verifiedAt};
    sessionStorage.setItem('spiral.presenter.last-ready:'+base.pathname,JSON.stringify(record));
    const loaded=document.querySelector('script[data-revision]')?.dataset.revision;
    if(handoff||loaded&&loaded!==record.revision)sessionStorage.setItem(ticketKey,JSON.stringify(record));
    if(loaded&&loaded!==record.revision){location.replace(location.href);return false;}
    return true;
   }
  }finally{ui.close();}
 })();return pending.finally(()=>{pending=null;});
}
