/* Local Korean ASR for browsers, including Android. Optional model download; never uploads audio. */
const DeviceSpeech=(()=>{
 const KEY='sq-device-speech-v1';
 const ua=typeof navigator==='undefined'?'':navigator.userAgent,inKakao=/KAKAOTALK/i.test(ua),apple=/iPhone|iPad|iPod/i.test(ua);
 const externalBrowser=apple?'Safari':'Chrome';
 let worker=null,initializing=null,sequence=0,enabled=false,status='idle',loadedMB=0,backend='',queue=Promise.resolve();
 const jobs=new Map(),listeners=new Map();
 let liveToken=null;
 try{enabled=localStorage.getItem(KEY)==='yes';}catch{}
 function label(){return status==='ready'?'실시간 인식 준비됨':status==='loading'?`인식 준비 중${loadedMB?' · '+loadedMB+'MB':''}`:status==='error'?'인식 준비를 다시 눌러 주세요':'문장 인식 준비';}
 function update(){document.querySelectorAll('[data-device-speech-panel]').forEach(el=>{el.outerHTML=markup();});document.querySelectorAll('[data-speech-preflight]').forEach(el=>{el.outerHTML=hint(el.dataset.speechForce==='true');});}
 function fail(){status='error';worker?.terminate();worker=null;for(const j of jobs.values())j.reject(Error('recognition-failed'));jobs.clear();update();}
 function request(type,body={},signal){
  return new Promise((resolve,reject)=>{
   if(signal?.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
   const id=++sequence;
   // Do not kill an inference on cancellation: its late result is discarded; recording continues.
   const cancel=()=>finish(null,new DOMException('Cancelled','AbortError'));
   const timer=setTimeout(()=>{finish(null,Error('timeout'));fail();},type==='prepare'?240000:120000);
   const finish=(value,error)=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);jobs.delete(id);error?reject(error):resolve(value);};
   jobs.set(id,{resolve:v=>finish(v),reject:e=>finish(null,e)});signal?.addEventListener('abort',cancel,{once:true});
   try{worker.postMessage({id,type,...body},body.audio?[body.audio.buffer]:[]);}catch(e){finish(null,e);}
  });
 }
 function prepare(){
  if(status==='ready')return Promise.resolve(true);
  if(initializing)return initializing;
  status='loading';loadedMB=0;update();
  initializing=(async()=>{
   try{
    const current=worker=new Worker(new URL('device-speech-worker.js?v=20261002-mobile-stream',document.baseURI));
    worker.onmessage=({data:m})=>{
     if(worker!==current)return;
     if(m.type==='partial'){listeners.get(m.token)?.(m);return;}
     if(m.type==='status'){status=m.status;loadedMB=m.loadedMB||loadedMB;backend=m.backend||backend;update();return;}
     const j=jobs.get(m.id);if(j)m.type==='error'?j.reject(Error(m.error)):j.resolve(m.result||true);
    };
    worker.onerror=()=>{if(worker===current)fail();};
    await request('prepare');status='ready';update();return true;
   }catch{fail();return false;}finally{initializing=null;}
  })();return initializing;
 }
 async function enable(){enabled=true;try{localStorage.setItem(KEY,'yes');}catch{}return prepare();}
 // Resample only the recognition copy. The original 24-bit WAV and analysis input are unchanged.
 async function resample(pcm,sr){
  if(!(pcm instanceof Float32Array)||!Number.isFinite(sr)||sr<8000||sr>192000||!pcm.length||pcm.length/sr>92)throw Error('audio-size');
  if(sr===16000)return pcm.slice();
  const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  const ac=new Offline(1,Math.ceil(pcm.length*16000/sr),16000),buffer=ac.createBuffer(1,pcm.length,sr);
  buffer.copyToChannel(pcm,0);const source=ac.createBufferSource();source.buffer=buffer;source.connect(ac.destination);source.start();
  return (await ac.startRendering()).getChannelData(0).slice();
 }
 function recognize(pcm,sr,{final=false,signal}={}){
  if(!enabled)return Promise.reject(Error('not-enabled'));
  if(liveToken!==null)return Promise.reject(Error('stream-busy'));
  const task=queue.catch(()=>{}).then(async()=>{
   if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
   if(!await prepare())throw Error('not-ready');
   const audio=await resample(pcm,sr);
   // Silence must not become hallucinated subtitles. This gate is ASR-only, not the saved audio.
   const rms=Math.sqrt(audio.reduce((n,x)=>n+x*x,0)/audio.length);
   if(rms<.001)return {status:'uncertain',transcript:'',words:[],syllablesPerSecond:null};
   return request('recognize',{audio,final,token:++sequence},signal);
  });queue=task;return task;
 }

 // A single request in flight bounds worker messages. Capture/WAV always keeps the untouched PCM.
 // ponytail: stop live ASR at 30s backlog; preserve audio and partial text on very slow devices.
 function capture(r,{onResult=()=>{},onStatus=()=>{},active=()=>true}={}){
  const token=++sequence,sr=r.ac.sampleRate,finals=new Map();let pending=null,index=0,offset=0,sent=0,stopped=false,finishing=false,started=false,pumping=null,timer=null;
  const snapshot=()=>{const entries=[...finals].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);if(pending&&!finals.has(pending.segment))entries.push(pending);const transcript=entries.map(x=>x.text).join(' ').trim();return transcript?{status:'ready',transcript,words:entries.flatMap(x=>x.words||[]),syllablesPerSecond:null,pace:null,provider:'sherpa-device',partial:true}:null;};
  const cancel=()=>{if(stopped)return;stopped=true;clearInterval(timer);listeners.delete(token);if(started)request('cancel',{token}).catch(()=>{});if(liveToken===token)liveToken=null;};
  listeners.set(token,m=>{if(stopped)return;if(m.final){finals.set(m.segment,m);pending=null;}else pending=m;onResult(m);});
  const ready=(async()=>{if(!enabled||!await prepare()||stopped)return false;if(liveToken!==null)throw Error('stream-busy');liveToken=token;await request('start',{token,sampleRate:sr});started=true;if(stopped){request('cancel',{token}).catch(()=>{});return false;}return true;})();
  ready.catch(()=>{onStatus('녹음 중 · 문장 인식은 잠시 쉬어요');cancel();});
  async function pump(all=false){
   if(pumping)return pumping;
   pumping=(async()=>{
    if(!started||stopped)return;
    do{
     if(!active()&&!finishing){cancel();return;}
     let available=0;for(let i=index;i<r.chunks.length;i++)available+=r.chunks[i].length;available-=offset;
     if(available>sr*30){onStatus('녹음 중 · 인식이 늦어져 잠시 쉬어요');cancel();return;}
     if(available<=0||(!all&&available<sr*.1))return;
     const audio=new Float32Array(Math.min(available,Math.round(sr*.25)));let pos=0;
     while(pos<audio.length){const c=r.chunks[index],n=Math.min(c.length-offset,audio.length-pos);audio.set(c.subarray(offset,offset+n),pos);pos+=n;offset+=n;if(offset===c.length){index++;offset=0;}}
     await request('audio',{token,audio});sent+=audio.length;
    }while(all&&!stopped);
   })();try{await pumping;}finally{pumping=null;}
  }
  timer=setInterval(()=>{if(!finishing)pump().catch(()=>{onStatus('녹음 중 · 문장 인식은 잠시 쉬어요');cancel();});},80);
  async function finish(){
   if(stopped||!started){const result=snapshot();cancel();return result;}
   finishing=true;clearInterval(timer);let timeout;
   try{return await Promise.race([(async()=>{if(pumping)await pumping;await pump(true);if(stopped)return snapshot();const result=await request('finish',{token});started=false;return result;})(),new Promise(resolve=>{timeout=setTimeout(()=>resolve(snapshot()),8000);})]);}
   catch{return snapshot();}finally{clearTimeout(timeout);cancel();}
  }
  return {finish,cancel,get sentSeconds(){return sent/sr;}};
 }
 function markup(){return `<section class="panel" data-device-speech-panel><h2>실시간 문장 인식</h2><p role="status">${label()}</p>${status==='ready'?'<p class="note">음성은 기기 안에서 처리해요. 인식 속도는 기기에 따라 달라요.</p>':`<p class="note">처음 한 번 약 153MB · Wi-Fi 권장<br>준비 중에도 녹음과 저장은 가능해요.</p><button class="secondary" data-device-speech ${status==='loading'?'disabled':''}>${status==='loading'?'준비 중…':'문장 인식 준비'}</button>`}<details><summary>인식 안내</summary><p class="note">한국어 Zipformer 모델을 사용해요. 파일은 이 사이트에서 내려받고 음성은 기기 안에서만 인식해요. 브라우저 캐시가 유지되면 다시 내려받지 않아요. 아이폰은 Safari, 안드로이드는 Chrome에서 먼저 테스트해 주세요. 느린 기기에서는 글자 표시가 늦어질 수 있어요.</p></details></section>`;}
 function hint(force=false){if(!force&&!window.BetaAccess?.remote)return '';return `<div class="speech-preflight" data-speech-preflight data-speech-force="${force}"><span role="status">${label()}</span>${status==='ready'?'':`<button class="quiet" data-device-speech ${status==='loading'?'disabled':''}>${status==='loading'?'준비 중…':'인식 켜기'}</button><p class="note">처음 약 153MB · 준비 후 글자 표시 · 녹음은 바로 가능</p>`}</div>`;}
 function browserHelp(){return inKakao?`<aside class="browser-help"><strong>${externalBrowser}에서 열어 주세요</strong><p>카카오톡 안에서는 마이크·문장 인식이 제한될 수 있어요.</p><button class="quiet" data-copy-app-link>링크 복사</button><details><summary>여는 방법</summary><p>카카오톡 메뉴의 ‘다른 브라우저로 열기’를 선택하거나, 링크를 복사해 ${externalBrowser} 주소창에 붙여 넣으세요. 마이크 요청은 허용해 주세요.</p><p>기록은 브라우저마다 따로 보관돼요.</p></details><div data-link-fallback></div></aside>`:'';}
 async function copyLink(){const url=new URL(location.href);url.hash='';try{await navigator.clipboard.writeText(url.href);toast(`${externalBrowser} 주소창에 붙여 넣어 주세요.`);}catch{const box=document.querySelector('[data-link-fallback]');if(box){const input=document.createElement('input');input.readOnly=true;input.value=url.href;input.setAttribute('aria-label','복사할 앱 주소');box.replaceChildren(input);input.focus();input.select();}toast('주소를 길게 눌러 복사해 주세요.');}}
 document.addEventListener('click',e=>{if(e.target.closest('[data-device-speech]'))enable();if(e.target.closest('[data-copy-app-link]'))copyLink();});
 // Keep a loading or ready worker alive when the page enters the back/forward cache.
 // Terminating a pending load races its promise and used to leave the next page stuck in idle.
 window.addEventListener('pagehide',e=>{if(e.persisted)return;worker?.terminate();worker=null;status='idle';for(const j of jobs.values())j.reject(Error('page-hidden'));jobs.clear();});
 window.addEventListener('pageshow',e=>{if(e.persisted){update();if(enabled&&status==='idle')prepare();}});
 return {get enabled(){return enabled;},get ready(){return status==='ready';},get status(){return status;},get backend(){return backend;},get busy(){return jobs.size>0;},inKakao,label,prepare,enable,recognize,resample,capture,markup,hint,browserHelp,restore(){if(enabled)prepare();}};
})();

window.DeviceSpeech=DeviceSpeech;
