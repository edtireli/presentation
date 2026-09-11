/* Normalised teaching curves, not patient measurements. One shared input generates
 * both terms, so the decomposition and the subsequent linear fit agree exactly. */
export function makePatlakSchematic(count=321){
  const time=Array.from({length:count},(_,i)=>i/(count-1));
  const pulse=(t,start,width)=>{const u=(t-start)/width;return u>0?u*u*Math.exp(2*(1-u)):0;};
  const raw=time.map(t=>pulse(t,.105,.016)+.12*pulse(t,.17,.035)+1.10*pulse(t,.54,.018)+.10*pulse(t,.61,.040));
  const peak=Math.max(...raw),ca=raw.map(y=>y/peak),dt=1/(count-1);
  let cap=ca.slice();
  for(let p=0;p<2;p++){let v=0;cap=cap.map(y=>{v+=(1-Math.exp(-dt/.015))*(y-v);return v;});}
  // Rescale only the transit kernel's finite-window numerical loss, preserving area.
  const area=ys=>ys.reduce((sum,y,i)=>sum+(i?(y+ys[i-1])*.5*dt:0),0);
  const ratio=area(ca)/area(cap);cap=cap.map(y=>y*ratio);
  let total=0;const integral=cap.map((y,i)=>{if(i)total+=(y+cap[i-1])*.5*dt;return total;});
  const epsilon1=.53,epsilon2=.16/total;
  const rows=ys=>ys.map((y,i)=>[time[i],y]);
  const instant=cap.map(y=>epsilon1*y),accumulation=integral.map(y=>epsilon2*y);
  const tissue=instant.map((y,i)=>y+accumulation[i]);
  // Exclude nearly zero denominators and limit the displayed x range, keeping the true
  // zero of the y-axis. The coloured late points are selected by acquisition time.
  const rawPoints=time.flatMap((t,i)=>cap[i]>.014&&t>.13&&t<.86?[{x:integral[i]/cap[i],y:tissue[i]/cap[i],t}]:[]);
  const xMax=1.0,pts=rawPoints.filter(p=>p.x<=xMax),fit=pts.filter(p=>p.t>=.64);
  const yMax=epsilon1+epsilon2*xMax;
  return {time,ca:rows(ca),cap:rows(cap),instant:rows(instant),accumulation:rows(accumulation),tissue:rows(tissue),
    epsilon1,epsilon2,integral,patlak:{pts:pts.map(p=>({...p,x:p.x/xMax,y:p.y/yMax})),
      slope:epsilon2*xMax/yMax,intercept:epsilon1/yMax,
      fitMin:Math.min(...fit.map(p=>p.x))/xMax,fitMax:Math.max(...fit.map(p=>p.x))/xMax}};
}
