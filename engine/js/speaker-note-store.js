// Private presenter drafts. No audio files or authored narration are modified here.
import {migrateRouteEdits} from './route-migrations.js';
export class SpeakerNoteStore {
  constructor(storage,key,manifest,hash,kind='speech'){
    this.storage=storage;this.key=key;this.manifest=manifest;this.hash=hash;this.kind=kind;this.edits={};this.storageOK=true;this.rebased=false;
    try{const raw=storage.getItem(key);if(raw){const data=JSON.parse(raw);
      const moved=migrateRouteEdits(this.validate(data),data.baseManifestSha256,manifest.routeMigrations);
      if(moved.changed)storage.setItem(key+':before-click-sequence-change',raw);
      this.edits=moved.edits;this.rebased=data.baseManifestSha256!==hash;
      if(moved.changed)this.save();
    }}
    catch{this.storageOK=false;}
  }
  validate(data){
    if(data.schema!=='spiral-speaker-drafts/v1')throw Error('This is not a speaker draft.');
    return this.validateStates(data.edits);
  }
  validateStates(states){
    if(!states||typeof states!=='object'||Array.isArray(states))throw Error('Missing note fields.');
    const out={};
    for(const [route,entry] of Object.entries(states)){
      if(!/^[a-z0-9][a-z0-9-]*\/\d+$/.test(route)||typeof entry?.say!=='string'||entry.say.length>50000)throw Error('Invalid note field.');
      out[route]={say:entry.say,silent:entry.silent===true,notes:typeof entry.notes==='string'?entry.notes:'',reviewed:entry.reviewed===true};
    }
    return out;
  }
  save(){
    try{this.storage.setItem(this.key,JSON.stringify({schema:'spiral-speaker-drafts/v1',baseManifestSha256:this.hash,updatedAt:new Date().toISOString(),edits:this.edits}));this.storageOK=true;}
    catch{this.storageOK=false;}return this.storageOK;
  }
  set(route,say){this.edits[route]={...this.edits[route],say,silent:!say.trim(),reviewed:true};return this.save();}
  restore(route,entry){if(entry)this.edits[route]=structuredClone(entry);else delete this.edits[route];return this.save();}
  review(){
    const states={};
    for(const [route,entry] of Object.entries(this.manifest.states||{})){
      const edit=this.edits[route];states[route]={say:edit?.say??entry.say??'',silent:edit?.silent??!!entry.silent,
        durationSeconds:entry.durationSeconds??3.5,notes:edit?.notes??'',reviewed:edit?.reviewed??false};
    }
    if(this.kind==='cues')return {schema:'spiral-speaker-cues-review/v1',baseCuesSha256:this.hash,revision:this.manifest.revision,
      exportedAt:new Date().toISOString(),voiceRenderingApproved:false,states};
    return {schema:'spiral-narration-review/v1',baseManifestSha256:this.hash,revision:this.manifest.revision,
      exportedAt:new Date().toISOString(),voiceRenderingApproved:false,states,
      speakerOnlyStates:Object.fromEntries(Object.entries(this.edits).filter(([route])=>!this.manifest.states?.[route]))};
  }
  import(data,knownRoute){
    const cueMode=this.kind==='cues';
    if(data.schema!==(cueMode?'spiral-speaker-cues-review/v1':'spiral-narration-review/v1'))throw Error(cueMode?'Choose a cue-notes JSON export, or switch to Full script to import narration edits.':'Choose a narration-review JSON export, or switch to Cue bullets to import cue edits.');
    if((cueMode?data.baseCuesSha256:data.baseManifestSha256)!==this.hash)throw Error('This file belongs to another notes version. Keep it for a three-way merge; your current notes have not been changed.');
    const entries=this.validateStates({...data.states,...data.speakerOnlyStates});
    for(const route of Object.keys(entries))if(!knownRoute(route))throw Error(`Unknown click: ${route}. No notes were imported.`);
    // A full speech export contains unchanged lines too. Import only intentional overrides.
    const next={...this.edits};
    for(const [route,entry] of Object.entries(entries)){
      const base=this.manifest.states?.[route];
      if(!base||entry.reviewed||entry.say!==base.say||entry.silent!==!!base.silent)next[route]=entry;
    }
    this.edits=next;this.save();return Object.keys(entries).length;
  }
}
