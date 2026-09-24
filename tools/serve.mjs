import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {build} from './build.mjs';
import {mime} from './package-pages.mjs';

const name=process.argv[2]||'starter', port=Number(process.argv[3]||8793);
const root=await build(name);
http.createServer(async(req,res)=>{
  try {
    let relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(relative.endsWith('/'))relative+='index.html';
    const file=path.resolve(root,'.'+relative);
    if(!file.startsWith(root+path.sep)) {res.writeHead(403);return res.end();}
    const stat=await fsp.stat(file);if(!stat.isFile())throw Error('Not a file');
    const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
    const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    let start=0,end=stat.size-1;
    if(range){start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),end):end;
      if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();}
      headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;}
    headers['Content-Length']=end-start+1;res.writeHead(range?206:200,headers);
    if(req.method==='HEAD')return res.end();
    fs.createReadStream(file,{start,end}).pipe(res);
  }catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}/ (re-run after source changes)`));
