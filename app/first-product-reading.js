/* Text agreement is not a phoneme/pronunciation score. Remote recognition requires opt-in. */
const ReadingFeedback=(()=>{
 const letters=s=>Array.from(String(s||'').normalize('NFC').toLowerCase()).filter(c=>/[\p{L}\p{N}]/u.test(c));
 function paragraphs(text){
  // Keep decimal points and closing quotes with their sentence.
  return (String(text||'').match(/(?:\d\.\d|[^.!?。！？\n]|\.(?=\d))+[.!?。！？]*[”’"')\]]*|[.!?。！？]+/gu)||[]).map(s=>s.trim()).filter(Boolean);
 }
 function markup(text,review=null){let at=0;const missed=new Set(review?.missing||[]);
  return paragraphs(text).map(p=>`<p class="reading-sentence"><span class="sr-only">${esc(p)}</span><span aria-hidden="true">${p.split(/(\s+)/).map(word=>{
   if(/^\s+$/.test(word))return ' ';
   return `<span class="reading-word">${Array.from(word.normalize('NFC')).map(c=>{if(!letters(c).length)return esc(c);const i=at++;return `<span class="reading-char${missed.has(i)?' needs-review':''}" data-pos="${i}">${esc(c)}</span>`;}).join('')}</span>`;
  }).join('')}</span></p>`).join('');
 }
 function align(expected,heard,partial=false){
  const a=letters(expected),b=letters(heard),n=a.length,m=b.length;
  if(!n||!m||n>3000||m>3000)return {score:null,matches:[],missing:[],map:[],agreement:0};
  // ponytail: bounded O(n*m) alignment for the 90-second script; long books need a streaming aligner.
  const d=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=0;i<=n;i++)d[i][0]=partial?0:i;
  for(let j=0;j<=m;j++)d[0][j]=j;
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  let i=n,j=m;if(partial){i=0;for(let k=1;k<=n;k++)if(d[k][m]<d[i][m])i=k;}
  const distance=d[i][m],matches=[],missing=[],map=[];
  while(i||j){if(partial&&!j)break;
   if(i&&j&&d[i][j]===d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){
    if(a[i-1]===b[j-1]){matches.push(i-1);map.push({expected:i-1,heard:j-1});}else missing.push(i-1);i--;j--;
   }else if(i&&d[i][j]===d[i-1][j]+1){missing.push(i-1);i--;}else j--;
  }
  return {score:Math.round(Math.max(0,1-distance/n)*100),matches:matches.reverse(),missing:missing.reverse(),map:map.reverse(),agreement:matches.length/m};
 }
 function assessment(r){return r?.transcript?.status==='ready'?align(r.text,r.transcript.transcript):null;}
 function reviewWords(text,missing){const set=new Set(missing);let at=0;return [...new Set(String(text).split(/\s+/).filter(w=>{let hit=false;for(const c of letters(w))if(set.has(at++))hit=true;return hit;}))];}
 function report(r){const a=assessment(r);if(a?.score===null||!a)return '';
  const words=reviewWords(r.text,a.missing);
  return `<div class="agreement"><div class="voice-row"><span>문장 일치도</span><b>${a.score}<small>%</small></b></div><p>${words.length?'다시 확인 · '+words.slice(0,6).map(esc).join(' · ')+(words.length>6?' 외 '+(words.length-6)+'곳':''):a.score===100?'읽을 문장과 잘 맞게 인식됐어요.':'문장에 없는 말이 함께 인식됐어요.'}</p><details><summary>문장 보며 듣기</summary><button class="quiet" data-reading-play="${r.id}">▷ 재생</button><div class="prose playback-script" data-reading-id="${r.id}">${markup(r.text,a)}</div><p class="note">밑줄은 다르게 인식되거나 빠진 글자예요.<br>인식 오류·읽지 않은 부분도 포함하며, 발음 점수는 아니에요.</p></details></div>`;
 }
 const timingCache=new WeakMap();
 function timing(r){const cached=timingCache.get(r);if(cached?.transcript===r.transcript)return cached.words;
  const a=assessment(r);let at=0;const words=(r.transcript?.words||[]).map(w=>{const start=at;at+=letters(w.text).length;return {...w,positions:(a?.map||[]).filter(p=>p.heard>=start&&p.heard<at).map(p=>p.expected)};});
  timingCache.set(r,{transcript:r.transcript,words});return words;
 }
 function playback(audio){const id=audio.dataset?.audioId;if(!id)return;const roots=document.querySelectorAll(`[data-reading-id="${id}"]`),r=state.records.find(r=>r.id===id);if(!roots.length||!r)return;const button=document.querySelector(`[data-reading-play="${id}"]`);if(button)button.textContent=audio.paused?'▷ 재생':'Ⅱ 일시정지';
  const w=!audio.paused&&timing(r).find(w=>audio.currentTime>=w.start&&audio.currentTime<=w.end),positions=new Set(w?.positions||[]);
  roots.forEach(root=>root.querySelectorAll('[data-pos]').forEach(el=>el.classList.toggle('word-wave',positions.has(Number(el.dataset.pos)))));
 }
 function setStatus(message){const el=document.getElementById('reading-status');if(el)el.textContent=message;}
 function pcmWindow(r,start,end){const out=new Float32Array(end-start);let offset=0;for(const chunk of r.chunks){const lo=Math.max(start-offset,0),hi=Math.min(end-offset,chunk.length);if(hi>lo)out.set(chunk.subarray(lo,hi),offset+lo-start);offset+=chunk.length;if(offset>=end)break;}return out;}
 let connection=null;
 async function prepare(){
  if(window.BetaAccess?.remote)return null;
  try{const response=await fetch('/api/status',{signal:AbortSignal.timeout(1800)});const info=await response.json();connection=response.ok&&info.local===true?info.streaming:null;}catch{connection=null;}
  return connection;
 }
 function paint(r,pending=[],fresh=[]){
  const s=r.reading,preview=new Set(pending),pulse=new Set(fresh);
  document.querySelectorAll('.reading-card [data-pos]').forEach(el=>{const i=Number(el.dataset.pos);el.classList.toggle('heard',s.seen.has(i));el.classList.toggle('is-hearing',preview.has(i)&&!s.seen.has(i));el.classList.toggle('word-wave',pulse.has(i));});
  const total=letters(r.story.text).length;r.readingProgress=s.seen.size/Math.max(1,total);
  Water.reading(r.readingProgress);setStatus('읽기 '+Math.floor(new Set([...s.seen,...pending]).size/Math.max(1,total)*100)+'%');
 }
 function streamResult(r,result){
  const s=r.reading;if(s.stopped||state.capture!==r||!Number.isInteger(result.segment)||result.segment<0||result.segment>200||typeof result.text!=='string'||result.text.length>4000)return;
  if(result.final)s.finals.set(result.segment,result.text);
  const finalText=[...s.finals].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join(' '),finalMatch=align(r.story.text,finalText,true);
  const next=new Set(finalMatch.agreement>=.65?finalMatch.matches:[]),fresh=[...next].filter(i=>!s.seen.has(i));s.seen=next;
  const preview=result.final?null:align(r.story.text,finalText+' '+result.text,true);
  const pending=preview&&preview.agreement>=.65&&preview.matches.length>=2?preview.matches:[];
  paint(r,pending,fresh);
  const el=document.getElementById('reading-status');if(el){el.dataset.recognitionMode=s.provider||'google-stream';el.dataset.interim=String(!result.final);el.dataset.pending=String(pending.length);el.dataset.confirmed=String(s.seen.size);if(result.text&&!el.dataset.firstResultMs)el.dataset.firstResultMs=String(Math.round(performance.now()-s.started));}
 }
 function closeStream(s){clearInterval(s.pump);clearTimeout(s.openTimeout);if(s.socket){s.socket.onopen=s.socket.onmessage=s.socket.onclose=s.socket.onerror=null;s.socket.close();s.socket=null;}}
 function local(r){const s=r.reading;if(s.stopped||state.capture!==r||s.local)return;s.local=true;connection=null;s.device=!!window.DeviceSpeech?.enabled;closeStream(s);paint(r);if(s.device){s.provider='sherpa-device';s.deviceStream=DeviceSpeech.capture(r,{onResult:message=>streamResult(r,message),onStatus:setStatus,active:()=>state.capture===r&&!s.stopped});return;}s.cursor=s.seen.size?Math.max(...s.seen)+1:0;setStatus(s.device?DeviceSpeech.label():'이 PC에서 인식 중');s.timer=setTimeout(()=>listen(r),200);}
 async function begin(r){
  if(r.story.id==='sq-vowel-a-v1')return;
  const s=r.reading={cursor:0,seen:new Set(),finals:new Map(),stopped:false,lastSent:0,legacy:!!window.BetaAccess?.remote,started:performance.now()};setStatus('말을 듣고 있어요');
  if(s.legacy){if(window.DeviceSpeech?.enabled)local(r);else setStatus('녹음 중 · 글자 표시는 인식 준비 후 켜져요');return;}
  const info=connection||await prepare();if(s.stopped||state.capture!==r)return;
  if(window.DeviceSpeech?.enabled&&info?.provider!=='sherpa-local'){local(r);return;}
  if(!info||!['configured','ready'].includes(info.status)||!Number.isInteger(info.port)||typeof info.ticket!=='string'||!['localhost','127.0.0.1'].includes(location.hostname)){local(r);return;}
  try{
   s.provider=info.provider==='sherpa-local'?'sherpa-local':'google-stream';
   const socket=s.socket=new WebSocket(`ws://${location.hostname}:${info.port}/api/stream?ticket=${encodeURIComponent(info.ticket)}`);
   s.openTimeout=setTimeout(()=>local(r),3000);
   socket.onopen=()=>{if(s.stopped)return;socket.send(JSON.stringify({type:'start',sampleRate:r.ac.sampleRate}));};
   socket.onmessage=e=>{
    if(s.stopped||state.capture!==r)return;let message;try{message=JSON.parse(e.data);}catch{local(r);return;}
    if(message.type==='complete'&&s.finishing){s.finish?.(message.result);return;}
    if(message.type==='error'){if(s.finishing)s.finish?.(null);else local(r);return;}
    if(message.type==='result'){streamResult(r,message);return;}
    if(message.type!=='ready'||s.pump)return;
    clearTimeout(s.openTimeout);s.sent=0;
    s.pump=setInterval(()=>{
     if(s.stopped||state.capture!==r)return;
     if(socket.readyState!==1||socket.bufferedAmount>480000){local(r);return;}
     sendAudio(r);
    },100);
   };
   socket.onerror=socket.onclose=()=>{if(s.finishing)s.finish?.(null);else local(r);};
  }catch{local(r);}
 }
 function sendAudio(r,flush=false){const s=r.reading,end=r.chunks.reduce((n,x)=>n+x.length,0),size=Math.round(r.ac.sampleRate*.1);
  while(end-s.sent>=(flush?1:size)){const next=Math.min(end,s.sent+size),pcm=pcmWindow(r,s.sent,next),buffer=new ArrayBuffer(pcm.length*2),view=new DataView(buffer);for(let i=0;i<pcm.length;i++){const v=Math.max(-1,Math.min(1,pcm[i]));view.setInt16(i*2,Math.round(v*(v<0?32768:32767)),true);}s.socket.send(buffer);s.sent=next;}
 }
 async function finish(r){const s=r?.reading;
  if(s?.deviceStream){const result=await s.deviceStream.finish();if(result?.status==='ready')r.liveTranscript=result;stop(r);return;}
  if(!s||s.local||s.provider!=='sherpa-local'||s.socket?.readyState!==1||!s.pump){stop(r);return;}
  s.finishing=true;clearInterval(s.pump);clearTimeout(s.openTimeout);
  // Flush the worklet first, then the ASR tail. A timeout never blocks saving the WAV.
  await new Promise(resolve=>{const timeout=setTimeout(()=>s.finish(null),2500);
   s.finish=result=>{clearTimeout(timeout);s.finish=null;if(result?.status==='ready'&&typeof result.transcript==='string'&&result.transcript.length<=4000&&Array.isArray(result.words))r.liveTranscript=result;stop(r);resolve();};
   try{sendAudio(r,true);s.socket.send(JSON.stringify({type:'stop'}));}catch{s.finish(null);}
  });
 }
 async function listen(r){const s=r.reading;if(s.stopped||state.capture!==r)return;
  if(s.device&&!DeviceSpeech.ready){if(DeviceSpeech.status==='idle')DeviceSpeech.prepare();setStatus('녹음 중 · '+DeviceSpeech.label());s.timer=setTimeout(()=>listen(r),1000);return;}
  const end=r.chunks.reduce((n,c)=>n+c.length,0),sr=r.ac.sampleRate,start=Math.max(0,end-Math.round(sr*(s.legacy&&!s.device?12:8)));
  if(end-start<sr*(s.device?2.4:s.legacy?3:1.8)||end-s.lastSent<sr*.9||document.hidden){s.timer=setTimeout(()=>listen(r),200);return;}
  const controller=s.controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),s.device?120000:s.legacy?25000:12000),requested=performance.now();s.lastSent=end;
  try{let t;if(s.device){t=await DeviceSpeech.recognize(pcmWindow(r,start,end),sr,{signal:controller.signal});}else{const response=await fetch('/api/listen',{method:'POST',headers:{'Content-Type':'audio/wav'},body:wave(pcmWindow(r,start,end),sr,16),signal:controller.signal});if(!response.ok)throw Error('offline');t=await response.json();}if(s.stopped||state.capture!==r)return;
   if(t.status==='ready'){
    const chars=letters(r.story.text),offset=Math.max(0,s.cursor-Math.ceil((end-start)/sr*12)),match=align(chars.slice(offset).join(''),t.transcript,true);
    if(match.matches.length>=3&&match.agreement>=.65){const confirmed=match.matches.map(i=>i+offset),fresh=confirmed.filter(i=>!s.seen.has(i));confirmed.forEach(i=>s.seen.add(i));s.cursor=Math.max(s.cursor,...confirmed.map(i=>i+1));
     paint(r,[],fresh);
    }else setStatus('녹음은 계속되고 있어요');
   }else setStatus(t.status==='busy'?'인식 대기 · 녹음 중':t.status==='loading'?'인식 준비 중 · 녹음 중':'녹음 중 · 잠시 후 다시 인식해요');
   const status=document.getElementById('reading-status');if(status){status.dataset.recognitionMs=Math.round(performance.now()-requested);status.dataset.recognitionMode=s.device?'whisper-device':'live-local';if(t.status==='ready'&&!status.dataset.firstResultMs)status.dataset.firstResultMs=String(Math.round(performance.now()-s.started));}
  }catch{if(!s.stopped)setStatus('녹음 중 · 글자 인식은 잠시 쉬어요');}
  finally{clearTimeout(timeout);if(s.device&&performance.now()-requested>12000&&!s.stopped){setStatus('녹음 중 · 문장은 녹음 후 확인해요');return;}if(!s.stopped)s.timer=setTimeout(()=>listen(r),s.device?600:Math.max(180,1200-(performance.now()-requested)));}
 }
 function stop(r){if(!r?.reading)return;r.reading.deviceStream?.cancel();r.reading.stopped=true;clearTimeout(r.reading.timer);r.reading.controller?.abort();closeStream(r.reading);}
 window.addEventListener('pagehide',()=>stop(state.capture));
 for(const name of ['play','timeupdate','seeked','pause','ended'])document.addEventListener(name,e=>{if(e.target.tagName==='AUDIO')playback(e.target);},true);
 return {letters,paragraphs,markup,align,assessment,report,begin,stop,finish,prepare,streamResult};
})();
