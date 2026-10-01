const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require.resolve('../app/device-speech.js'),'utf8');
let instance,calls=0;const events={};class Worker{
 constructor(){instance=this;this.sent=[];}
 postMessage(m){this.sent.push(m);if(m.type==='prepare')queueMicrotask(()=>this.onmessage({data:{id:m.id,type:'ready'}}));else calls++;}
 result(m,result){this.onmessage({data:{id:m.id,type:'result',result}});}
 terminate(){this.terminated=true;}
}
const c=vm.createContext({console,Worker,URL,Float32Array,DOMException,AbortController,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem(){}},window:{addEventListener:(name,fn)=>events[name]=fn},navigator:{userAgent:"Mozilla/5.0 (iPhone) KAKAOTALK"},document:{baseURI:'https://example.com/app/',querySelectorAll:()=>[],addEventListener(){}}});
vm.runInContext(source+'\nthis.D=DeviceSpeech;',c);
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 assert.equal(c.window.DeviceSpeech,c.D,'shared engine visible to recorder');assert.equal(c.D.enabled,false);assert.equal(c.D.status,'idle');assert.equal(await c.D.enable(),true);
 const pcm=new Float32Array(16000).fill(.1),copy=await c.D.resample(pcm,16000);assert.notEqual(copy.buffer,pcm.buffer);
 assert.equal(c.D.ready,true);assert.equal(instance.sent[0].type,'prepare');
 const quiet=await c.D.recognize(new Float32Array(16000),16000);assert.equal(quiet.status,'uncertain');assert.equal(calls,0,'silence not decoded');
 const abort=new AbortController(),p=c.D.recognize(pcm,16000,{signal:abort.signal});await tick();abort.abort();await assert.rejects(p,{name:'AbortError'});
 instance.result(instance.sent.at(-1),{status:'ready',transcript:'늦은 응답'});
 const q=c.D.recognize(pcm,16000,{final:true});await tick();assert.equal(instance.sent.at(-1).final,true);instance.result(instance.sent.at(-1),{status:'ready',transcript:'안녕하세요',words:[]});assert.equal((await q).transcript,'안녕하세요');
 const current=instance;events.pagehide({persisted:true});assert.equal(current.terminated,undefined);events.pageshow({persisted:true});assert.equal(c.D.ready,true,'back/forward cache retains ready engine');assert.match(c.D.browserHelp(),/Safari/);assert.match(c.D.browserHelp(),/브라우저마다/);c.window.BetaAccess={remote:true};assert.match(c.D.hint(),/기기에서 인식 준비됨/);
 assert.equal(pcm.length,16000,'original capture preserved');assert.ok(pcm[0]>.09);
 await assert.rejects(c.D.resample(pcm,0),/audio-size/);
 const worker=fs.readFileSync(require.resolve('../app/device-speech-worker.js'),'utf8');assert.match(worker,/work=work.catch/);assert.match(worker,/language:'korean'/);assert.match(worker,/device:'wasm'/);assert.ok(!worker.includes('fetch('),'no audio upload');
 console.log('PASS: opt-in, silent input, cancellation/late results, final result, raw PCM retained, serialized worker, Korean and WASM fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
