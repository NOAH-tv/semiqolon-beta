/* Korean Zipformer streaming ASR. Apache-2.0 runtime/model; see mobile-streaming-NOTICE.
   One WASM thread works without cross-origin isolation (GitHub Pages / Safari).
   Audio stays in this worker. Only immutable model files enter CacheStorage. */
let recognizer=null,active=null,loaded=0;const errors=[];
const CACHE='sq-korean-streaming-20240616-v1';
var Module={noInitialRun:true,locateFile:()=>new URL('assets/sherpa-asr.wasm',location.href).href,print:message=>{errors.push(message);if(errors.length>12)errors.shift();},printErr:message=>{errors.push(message);if(errors.length>12)errors.shift();}};
async function modelPart(part){
 const url=new URL('assets/'+part.url,location.href).href;
 let cache=null,response=null,cached=false;
 try{cache=await caches.open(CACHE);response=await cache.match(url);cached=!!response;}catch{}
 for(let attempt=0;attempt<2;attempt++){
  if(!response){response=await fetch(url);if(!response.ok)throw Error('download');}
  const bytes=new Uint8Array(await response.arrayBuffer());
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(bytes.length===part.bytes&&hash===part.sha256){
   try{if(!cached)await cache?.put(url,new Response(bytes));}catch{} // Private browsing/storage pressure must not prevent use.
   loaded+=bytes.length;postMessage({type:'status',status:'loading',loadedMB:Math.round(loaded/1e6)});return bytes;
  }
  await cache?.delete(url);response=null;cached=false;
 }
 throw Error('model-integrity');
}
async function prepare(){
 if(recognizer)return;
 await new Promise((resolve,reject)=>{Module.onRuntimeInitialized=resolve;Module.onAbort=()=>reject(Error('wasm'));try{importScripts('assets/sherpa-runtime.js');}catch(e){reject(e);}});
 importScripts('assets/sherpa-api.js');
 const response=await fetch('assets/sherpa-ko-model.json');if(!response.ok)throw Error('manifest');const manifest=await response.json();
 for(const file of manifest.files){
  const data=new Uint8Array(file.bytes);let offset=0;
  for(const part of file.parts){const bytes=await modelPart(part);data.set(bytes,offset);offset+=bytes.length;}
  Module.FS_createDataFile('/',file.name,data,true,false,true);
 }
 recognizer=createOnlineRecognizer(Module,{
  featConfig:{sampleRate:16000,featureDim:80},
  modelConfig:{transducer:{encoder:'./encoder.onnx',decoder:'./decoder.onnx',joiner:'./joiner.onnx'},tokens:'./tokens.txt',numThreads:1,provider:'cpu',debug:0,modelType:'zipformer',modelingUnit:'cjkchar'},
  decodingMethod:'greedy_search',maxActivePaths:4,enableEndpoint:1,rule1MinTrailingSilence:2.4,rule2MinTrailingSilence:.7,rule3MinUtteranceLength:20,
 });
 if(!recognizer.handle)throw Error('model '+errors.join(' | '));
 for(const file of manifest.files)Module.FS_unlink('/'+file.name);
 // Warm the execution plan before advertising ready, outside the UI/audio thread.
 const warm=recognizer.createStream();warm.acceptWaveform(16000,new Float32Array(16000));while(recognizer.isReady(warm))recognizer.decode(warm);warm.free();
 postMessage({type:'status',status:'ready',backend:'sherpa-wasm'});
}
function start(token,sampleRate){
 if(!recognizer||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error('sample-rate');
 if(active)throw Error('stream-busy');
 active={token,sampleRate,stream:recognizer.createStream(),segment:0,seconds:0,finals:[],words:[],last:'',latest:null};
}
function current(){
 const s=active,r=recognizer.getResult(s.stream),tokens=r.tokens||[];
 const text=(tokens.length?tokens.join('').replace(/▁/g,' '):r.text||'').trim();
 const stamps=r.timestamps||[],offset=Number(r.start_time)||0;
 const words=tokens.map((text,i)=>({text:text.replace(/▁/g,' ').trim(),start:Math.max(0,offset+(stamps[i]||0)),end:Math.min(s.seconds,offset+(stamps[i+1]??(stamps[i]||0)+.16))})).filter(w=>w.text&&w.end>=w.start);
 return {text,words};
}
function emit(final=false){
 const s=active,r=current();s.latest=r;
 if(final||r.text!==s.last){postMessage({type:'partial',token:s.token,segment:s.segment,text:r.text,words:r.words,latestWords:r.words,final});s.last=r.text;}
 if(final){if(r.text){s.finals.push(r.text);s.words.push(...r.words);}s.segment++;s.last='';s.latest=null;}
}
function decode(){while(recognizer.isReady(active.stream))recognizer.decode(active.stream);}
function feed(audio){
 const s=active;if(!(audio instanceof Float32Array)||audio.length>s.sampleRate||s.seconds+audio.length/s.sampleRate>1202)throw Error('audio-size');
 s.seconds+=audio.length/s.sampleRate;s.stream.acceptWaveform(s.sampleRate,audio);decode();
 if(recognizer.isEndpoint(s.stream)){emit(true);recognizer.reset(s.stream);}else emit();
}
function finish(){
 const s=active;s.stream.acceptWaveform(s.sampleRate,new Float32Array(Math.round(s.sampleRate*.5)));s.stream.inputFinished();decode();emit(true);
 const transcript=s.finals.join(' ').trim(),words=s.words,span=words.length?words.at(-1).end-words[0].start:0,syllables=(transcript.match(/[가-힣]/g)||[]).length,rate=span>1.5&&syllables>=6?syllables/span:null;
 const valid=rate>=1&&rate<=12?rate:null;
 const result={status:syllables>=2?'ready':'uncertain',transcript,words,syllablesPerSecond:valid,seconds:span,pace:valid===null?null:valid>5?'fast':valid<3?'slow':'steady',provider:'sherpa-device',model:'korean-zipformer-20240616'};
 s.stream.free();active=null;return result;
}
function cancel(){active?.stream.free();active=null;}
async function handle(m){
 try{
  let result=true;
  if(m.type==='prepare')await prepare();
  else if(m.type==='start')start(m.token,m.sampleRate);
  else if(m.type==='recognize'){
   start(m.token,16000);try{for(let i=0;i<m.audio.length;i+=8000)feed(m.audio.subarray(i,i+8000));result=finish();}finally{cancel();}
  }else{
   if(!active||m.token!==active.token)throw Error('stale-stream');
   if(m.type==='audio')feed(m.audio);else if(m.type==='finish')result=finish();else if(m.type==='cancel')cancel();else throw Error('message');
  }
  postMessage({id:m.id,type:'result',result});
 }catch(error){postMessage({id:m.id,type:'error',error:String(error.message||error)});}
}
let work=Promise.resolve();onmessage=({data:m})=>{work=work.catch(()=>{}).then(()=>handle(m));};
