// Pinned, multilingual Whisper. Audio never leaves this worker/device.
import {pipeline, env} from './assets/transformers.min.js';
env.allowLocalModels=false;
env.backends.onnx.wasm.wasmPaths=new URL('./assets/',import.meta.url).href;
// GitHub Pages has no cross-origin isolation. One WASM thread also avoids competing with capture.
env.backends.onnx.wasm.numThreads=1;
const MODEL='onnx-community/whisper-base_timestamped',REVISION='608c49e61301901684bc36cac8f74b95ff6b5a8e';
let recognizer=null,backend='wasm';
const downloads=new Map();let lastMB=-1;
function progress(p){
 if(p.status==='progress'&&p.total>0)downloads.set(p.file,{loaded:p.loaded,total:p.total});
 const entries=[...downloads.values()],loaded=entries.reduce((n,f)=>n+f.loaded,0);
 const mb=Math.round(loaded/1e6);if(mb!==lastMB){lastMB=mb;postMessage({type:'status',status:'loading',loadedMB:mb});}
}
async function prepare(){
 if(recognizer)return;
 const options={revision:REVISION,dtype:'q8',progress_callback:progress};
 // Use the measured common WASM path; do not select an unverified Galaxy GPU by user agent.
 if(!recognizer)recognizer=await pipeline('automatic-speech-recognition',MODEL,{...options,device:'wasm'});
 postMessage({type:'status',status:'ready',backend,model:MODEL});
}
// Parent queues one job at a time; recognition cannot block the UI or AudioWorklet.
async function handle(m){
 try{
  if(m.type==='prepare'){await prepare();postMessage({id:m.id,type:'ready',backend});return;}
  if(m.type!=='recognize'||!recognizer)throw Error('not-ready');
  const audio=m.audio;
  if(!(audio instanceof Float32Array)||audio.length<1600||audio.length>16000*92)throw Error('audio-size');
  const output=await recognizer(audio,{language:'korean',task:'transcribe',return_timestamps:m.final?'word':false,
   chunk_length_s:20,stride_length_s:3,max_new_tokens:m.final?224:96,do_sample:false});
  const duration=audio.length/16000,text=String(output.text||'').trim();
  const words=(output.chunks||[]).filter(w=>Number.isFinite(w.timestamp?.[0])).map(w=>({text:w.text.trim(),start:Math.max(0,w.timestamp[0]),end:Math.min(duration,w.timestamp[1]??duration)}));
  const span=words.length?words.at(-1).end-words[0].start:0,syllables=(text.match(/[가-힣]/g)||[]).length;
  const candidate=span>1.5&&syllables>=6?syllables/span:null,rate=candidate>=1&&candidate<=12?candidate:null;
  postMessage({id:m.id,type:'result',result:{status:syllables>=2?'ready':'uncertain',transcript:text,words,
   syllablesPerSecond:rate,seconds:span,pace:rate===null?null:rate>5?'fast':rate<3?'slow':'steady',engine:'whisper-base-device',backend}});
 }catch(error){postMessage({id:m.id,type:'error',error:m.type==='prepare'?'prepare-failed':'recognition-failed',...(m.debug?{detail:String(error)}:{})});}
}
let work=Promise.resolve();
onmessage=({data:m})=>{work=work.catch(()=>{}).then(()=>handle(m));};
