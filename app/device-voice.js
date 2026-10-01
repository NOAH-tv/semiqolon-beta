const DeviceVoice=(()=>{
 const processingKeys=['echoCancellation','noiseSuppression','autoGainControl'];
 function inputProcessing(track){const actual=track.getSettings?.()||{};return {request:'processing-off-v1',...Object.fromEntries(processingKeys.map(k=>[k,actual[k]===false?false:actual[k]===true||typeof actual[k]==='string'?true:null]))};}
 async function openMicrophone(){
  const devices=navigator.mediaDevices,supported=devices.getSupportedConstraints?.()||{};
  const audio={channelCount:{ideal:1},sampleRate:{ideal:48000},...Object.fromEntries(processingKeys.map(k=>[k,supported[k]?{exact:false}:false]))};
  // A plain false is only a preference. Never fall back to processed audio if exact:false fails.
  const stream=await devices.getUserMedia({audio,video:false});
  try{const track=stream.getAudioTracks()[0];if(!track)throw Error('No audio track');
   if(processingKeys.some(k=>inputProcessing(track)[k]===true)){
    try{await track.applyConstraints(Object.fromEntries(processingKeys.map(k=>[k,{exact:false}])));}catch{}
    if(processingKeys.some(k=>inputProcessing(track)[k]===true)){const e=Error('Microphone processing is still enabled');e.name='AudioProcessingError';throw e;}
   }
   return stream;
  }catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
 }
 function inputError(e){return e.name==='AudioProcessingError'||e.name==='OverconstrainedError'&&processingKeys.includes(e.constraint)?'이 마이크의 자동 보정을 끄지 못해 녹음을 시작하지 않았어요. 다른 마이크나 브라우저에서 다시 시도해 주세요.':null;}
 async function analyze(blob,signal){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');const buffer=await blob.arrayBuffer();return new Promise((resolve,reject)=>{const worker=new Worker('device-analysis-worker.js');const done=(error,value)=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);},abort=()=>done(new DOMException('Cancelled','AbortError')),timer=setTimeout(()=>done(Error('기기 분석 시간 초과')),45000);worker.onmessage=e=>e.data.error?done(Error(e.data.error)):done(null,e.data.metrics);worker.onerror=()=>done(Error('기기 분석을 시작하지 못했어요.'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();worker.postMessage(buffer,[buffer]);});}
 async function pack(record){const bytes=record.audio instanceof Blob?await record.audio.arrayBuffer():null;const saved={...record};delete saved.unsaved;if(bytes){saved.audioBytes=bytes;saved.audioType=record.audio.type||'audio/wav';delete saved.audio;}return saved;}
 function unpack(record){if(record.audioBytes instanceof ArrayBuffer){record.audio=new Blob([record.audioBytes],{type:record.audioType||'audio/wav'});delete record.audioBytes;delete record.audioType;}return record;}
 async function capture(r,source,sink,active){let url,node;try{if(!r.ac.audioWorklet)throw Error('fallback');url=URL.createObjectURL(new Blob([`class Capture extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(4096);this.n=0;this.port.onmessage=e=>{if(e.data==='flush'){if(this.n)this.port.postMessage(this.b.slice(0,this.n));this.n=0;this.port.postMessage('flushed');}};}process(inputs){for(const x of inputs[0]?.[0]||[]){this.b[this.n++]=x;if(this.n===4096){this.port.postMessage(this.b);this.b=new Float32Array(4096);this.n=0;}}return true;}}registerProcessor('semi-capture',Capture);`],{type:'text/javascript'}));await r.ac.audioWorklet.addModule(url);node=new AudioWorkletNode(r.ac,'semi-capture');node.port.onmessage=e=>{if(e.data==='flushed')r.flushed?.();else if(active())r.chunks.push(e.data);};r.worklet=node;}catch{node?.disconnect();node=r.ac.createScriptProcessor(4096,1,1);node.onaudioprocess=e=>{if(active())r.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));};r.worklet=null;}finally{if(url)URL.revokeObjectURL(url);}source.connect(node);node.connect(sink);r.nodes.push(node);}
 function pitchMeter(receive){const worker=new Worker('device-analysis-worker.js');let pending=false;worker.onmessage=e=>{pending=false;receive(e.data.pitch??null);};worker.onerror=()=>{pending=false;receive(null);};return {sample(pcm,sr){if(pending)return;pending=true;worker.postMessage({kind:'pitch',pcm,sr});},close(){worker.terminate();}};}
 return {analyze,pack,unpack,capture,pitchMeter,openMicrophone,inputProcessing,inputError};
})();
