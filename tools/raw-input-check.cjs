const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../app'),keys=['echoCancellation','noiseSuppression','autoGainControl'];
let settings={},requested=[],stopped=0,rejectRequest=null,reapply=null;
const track={getSettings:()=>settings,stop:()=>stopped++,applyConstraints:async c=>{if(reapply)await reapply(c);}};
const stream={getAudioTracks:()=>[track],getTracks:()=>[track]};
const ctx=vm.createContext({navigator:{mediaDevices:{getSupportedConstraints:()=>Object.fromEntries(keys.map(k=>[k,true])),getUserMedia:async c=>{requested.push(c);if(rejectRequest)throw rejectRequest;return stream;}}},Blob,ArrayBuffer,Float32Array,DataView,Uint8Array,Map,console});
vm.runInContext(fs.readFileSync(path.join(root,'device-voice.js'),'utf8')+'\nglobalThis.api=DeviceVoice;',ctx);
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
vm.runInContext(source.slice(source.indexOf('function wave('),source.indexOf('async function analyzeRecord(')),ctx);
(async()=>{
 settings=Object.fromEntries(keys.map(k=>[k,false]));await ctx.api.openMicrophone();
 assert.equal(requested[0].video,false);for(const k of keys)assert.equal(requested[0].audio[k].exact,false);
 for(const k of keys)assert.equal(ctx.api.inputProcessing(track)[k],false);
 settings={echoCancellation:false};assert.equal(ctx.api.inputProcessing(track).noiseSuppression,null,'unknown does not become off');
 ctx.navigator.mediaDevices.getSupportedConstraints=()=>({echoCancellation:true});await ctx.api.openMicrophone();assert.equal(requested.at(-1).audio.autoGainControl,false);
 settings={echoCancellation:'all',noiseSuppression:true,autoGainControl:true};stopped=0;
 await assert.rejects(ctx.api.openMicrophone(),{name:'AudioProcessingError'});assert.equal(stopped,1,'processed stream closed');
 reapply=async c=>{for(const k of keys)assert.equal(c[k].exact,false);settings=Object.fromEntries(keys.map(k=>[k,false]));};await ctx.api.openMicrophone();
 rejectRequest=Object.assign(Error('not possible'),{name:'OverconstrainedError',constraint:'autoGainControl'});const before=requested.length;
 await assert.rejects(ctx.api.openMicrophone(),{name:'OverconstrainedError'});assert.equal(requested.length,before+1,'no fallback that silently enables processing');assert(ctx.api.inputError(rejectRequest));
 // The real worklet source and PCM encoder must preserve silence, tiny signals, loud steps, and treble.
 const pcm=Float32Array.from({length:16000},(_,i)=>i<1000?0:Math.sin(2*Math.PI*(i<9000?180:6000)*i/48000)*(i<4000?.00001:i<9000?.06:.8));
 let workletBlob,Processor,node;
 ctx.URL={createObjectURL:b=>(workletBlob=b,'blob:qa'),revokeObjectURL(){}};
 ctx.AudioWorkletNode=class{constructor(){node=this;this.port={};}connect(){}disconnect(){}};
 const r={ac:{audioWorklet:{addModule:async()=>{const w=vm.createContext({AudioWorkletProcessor:class{constructor(){this.port={postMessage:message=>node.port.onmessage({data:message})};}},Float32Array,registerProcessor:(_,P)=>Processor=P});vm.runInContext(await workletBlob.text(),w);}}},chunks:[],nodes:[]};
 await ctx.api.capture(r,{connect(){}},{},()=>true);const proc=new Processor();for(let i=0;i<pcm.length;i+=128)proc.process([[pcm.slice(i,i+128)]]);proc.port.onmessage({data:'flush'});
 const captured=Float32Array.from(r.chunks.flatMap(b=>Array.from(b)));assert.deepEqual(captured,pcm,'worklet copies every sample without gain, gate or EQ');
 const wav=new DataView(await ctx.wave(captured,48000).arrayBuffer());assert.equal(wav.getUint32(40,true),pcm.length*3);
 let maxError=0;for(let i=0;i<pcm.length;i++){let v=wav.getUint8(44+i*3)|wav.getUint8(45+i*3)<<8|wav.getUint8(46+i*3)<<16;if(v&0x800000)v-=0x1000000;maxError=Math.max(maxError,Math.abs(v/(v<0?8388608:8388607)-pcm[i]));}
 assert(maxError<1/8388607,'only 24-bit quantization error');
 const legacy={ac:{createScriptProcessor:()=>({connect(){}})},chunks:[],nodes:[]};await ctx.api.capture(legacy,{connect(){}},{},()=>true);legacy.nodes[0].onaudioprocess({inputBuffer:{getChannelData:()=>pcm}});assert.deepEqual(legacy.chunks[0],pcm,'fallback also retains quiet and silence');
 assert(source.includes('inputProcessing:r.inputProcessing'),'applied settings saved with take');
 console.log('PASS: strict off, unknown reported, processing rejected, no relaxed retry; worklet and fallback preserve all 16000 samples; WAV max error '+maxError.toExponential(2));
})().catch(e=>{console.error(e);process.exitCode=1;});
