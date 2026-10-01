/* Optional pitch and camera practice, entered from Settings. Images never leave the worker. */
const VoiceTraining=(()=>{
 let session=null,draft=null;
 const views=['tuning','mouth'],clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const text=(id,value)=>{const el=$(id);if(el&&el.textContent!==String(value))el.textContent=value;};
 function open(record){
  const base=record||state.records.find(r=>r.metrics?.status==='ready');
  if(!base){navigate('about');toast('목소리측정에서 기준을 먼저 담아 주세요.');return;}
  draft={baseId:base.id,target:profile?.voiceGoal?.pitchHz||Math.round(base.metrics?.pitchMedian||180),matchedSeconds:0,message:'',mouth:null,lastFormants:null};
  state.current=base;state.onboarding=false;state.training=null;state.baseline=null;navigate('tuning');
 }
 function stop(){
  const r=session;session=null;VoicePractice.stopTone();document.body.dataset.pitchFeedback='idle';
  if(!r)return;
  clearInterval(r.timer);clearTimeout(r.timeout);clearTimeout(r.workerTimeout);r.controller?.abort();r.worker?.terminate();r.pitchMeter?.close();
  r.stream?.getTracks().forEach(t=>t.stop());r.camera?.getTracks().forEach(t=>t.stop());
  r.nodes.forEach(n=>{try{n.disconnect();}catch{}});r.ac?.close().catch(()=>{});if(r.video){r.video.pause();r.video.srcObject=null;}
  Water.quiet();
 }
 function fail(r,message){if(session!==r)return;stop();draft.message=message;render();}
 function markup(){
  if(!views.includes(state.view)||!draft)return '';
  const active=!!session?.stream,pending=!!session&&!active;
  if(state.view==='tuning')return `<section class="trainer-scene">${backButton('about')}<p class="eyebrow">1 / 2 · 연습</p><h1>음정 맞추기</h1><p class="trainer-caption">편하게 “아—”</p><div class="tuner-readout"><strong id="tuner-hz">—</strong><span>Hz</span></div><div class="tuner-scale" role="img" aria-label="목표 높이를 가운데로 표시하는 음정 바늘"><div class="tuner-center"></div><i id="tuner-needle" hidden></i><span>낮게</span><b>목표</b><span>높게</span></div><p id="trainer-status" class="trainer-status" role="status">${esc(draft.message||'원하는 높이에 맞춰요')}</p><div class="trainer-goal"><label for="trainer-target">목표 <input id="trainer-target" type="number" min="65" max="450" step="1" value="${draft.target}" ${session?'disabled':''}> Hz</label><button class="quiet" data-training="tone">목표 음 듣기</button></div><div class="trainer-progress" aria-label="목표에 맞춰 2초 유지"><i id="trainer-progress" style="width:${Math.min(100,draft.matchedSeconds/2*100)}%"></i></div><p class="note" id="trainer-db">${VoicePractice.dbText(null)}</p><button class="primary" data-training="${active?'stop':'listen'}" ${pending?'disabled':''}>${active?'잠시 멈추기':pending?'마이크 준비 중…':'음정 맞추기 시작'}</button><button class="secondary" data-training="next">다음 · 입모양 →</button><div class="quiet-row"><button class="quiet" data-training="read">오늘 읽기</button></div></section>`;
  return `<section class="trainer-scene mouth-scene"><button class="quiet back" data-training="back">← 음정 연습</button><p class="eyebrow">2 / 2 · 선택 연습</p><h1>입모양과 울림</h1><p class="trainer-caption">같은 높이로 “아—”</p><div class="mouth-camera" id="mouth-camera"><video id="mouth-video" playsinline muted autoplay aria-label="내 입모양 미리보기"></video><canvas id="mouth-overlay" aria-hidden="true"></canvas><div id="mouth-placeholder"><span>카메라로 입 벌림을 확인해요</span></div></div><p id="trainer-status" class="trainer-status" role="status">${esc(draft.message||'편한 입모양부터 담아요')}</p><div id="mouth-controls" ${active?'':'hidden'}><p class="note" id="trainer-db">— dBFS</p><button id="mouth-baseline" class="secondary" data-training="baseline" disabled>편한 소리 기준 담기</button><div id="mouth-target-wrap" hidden><label class="mouth-target" for="mouth-target">입 벌림 <input id="mouth-target" type="range" min="8" max="85" value="30"><span>편한 만큼</span></label><button class="quiet" data-training="reset">기준 다시 담기</button></div><div class="resonance-panel"><div class="resonance-title"><span>울림 변화</span><span id="resonance-status">같은 소리로 비교해요</span></div><div class="resonance-plot" role="img" aria-label="처음과 지금의 울림 위치. 점의 이동은 개선 점수가 아닙니다."><i id="resonance-first" hidden></i><i id="resonance-now" hidden></i><span>처음</span><b>지금</b></div><p class="note" id="formant-values">F1 — · F2 — Hz</p></div></div>${!active?`<button class="primary" data-training="camera" ${pending?'disabled':''}>${pending?'준비 중…':'카메라로 연습'}</button>`:'<button class="quiet" data-training="stop">잠시 멈추기</button>'}<button class="secondary" data-training="read">오늘 읽기 →</button><p class="note">영상은 저장하지 않아요. 울림 변화는 좋고 나쁨의 점수가 아니에요.</p></section>`;
 }
 function target(){const input=$('trainer-target');if(input&&!input.reportValidity())return false;const hz=Number(input?.value||draft.target);if(!Number.isFinite(hz)||hz<65||hz>450)return false;draft.target=hz;return true;}
 async function start(kind){
  if(kind==='pitch'&&!target())return;
  stop();const r={kind,nodes:[],history:[],pitch:null,hold:0,lastSample:0,lastFace:0,faceAt:0};session=r;draft.message='';render();
  try{
   r.ac=new(window.AudioContext||window.webkitAudioContext)({sampleRate:48000});await r.ac.resume();if(session!==r)return;
   const stream=await DeviceVoice.openMicrophone();if(session!==r||document.hidden){stream.getTracks().forEach(t=>t.stop());if(session===r)stop();return;}r.stream=stream;
   if(kind==='mouth'){
    const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:15,max:24}}});
    if(session!==r||document.hidden){camera.getTracks().forEach(t=>t.stop());if(session===r)stop();return;}r.camera=camera;
   }
   await r.ac.resume();if(session!==r)return;
   const source=r.ac.createMediaStreamSource(stream),sink=r.ac.createGain();sink.gain.value=0;r.an=r.ac.createAnalyser();r.an.fftSize=4096;r.meter=new Float32Array(4096);source.connect(r.an);r.an.connect(sink);sink.connect(r.ac.destination);r.nodes=[source,r.an,sink];
   [...stream.getTracks(),...(r.camera?.getTracks()||[])].forEach(t=>t.addEventListener('ended',()=>fail(r,'입력이 멈췄어요. 다시 시작할 수 있어요.')));
   draft.message='편하게 “아—”';render();
   r.pitchMeter=DeviceVoice.pitchMeter(value=>{if(session!==r)return;r.history=value?r.history.concat(value).slice(-5):[];const sorted=[...r.history].sort((a,b)=>a-b);r.pitch=sorted.length>=3?sorted[Math.floor(sorted.length/2)]:null;if(kind==='pitch')updatePitch(r);});
   if(kind==='mouth'){
    draft.mouth=null;draft.lastFormants=null;r.sample=r.ac.createAnalyser();r.sample.fftSize=32768;source.connect(r.sample);r.nodes.push(r.sample);r.samples=new Float32Array(r.sample.fftSize);
    r.video=$('mouth-video');r.video.srcObject=r.camera;await r.video.play();if(session!==r)return;$('mouth-placeholder').hidden=true;$('mouth-camera').style.aspectRatio=`${r.video.videoWidth} / ${r.video.videoHeight}`;
    r.worker=new Worker('mouth-worker.js');r.worker.onmessage=e=>receiveMouth(r,e.data);r.worker.onerror=()=>fail(r,'입모양을 불러오지 못했어요. 글 읽기로 이어갈 수 있어요.');r.worker.postMessage({type:'init'});r.workerTimeout=setTimeout(()=>fail(r,'입모양 인식을 준비하지 못했어요. 다시 시도해 주세요.'),20000);
   }
   r.lastTick=performance.now();r.timer=setInterval(()=>tick(r),100);r.timeout=setTimeout(()=>fail(r,'잠시 쉬었다 이어가세요.'),120000);
  }catch(e){fail(r,DeviceVoice.inputError(e)||(kind==='mouth'?'카메라·마이크 권한을 확인해 주세요. 건너뛰어도 괜찮아요.':'마이크 권한을 확인해 주세요.'));}
 }
 function pitchState(hz,targetHz){const cents=VoicePractice.pitchMatch(hz,targetHz);return {cents,state:cents===null?'idle':Math.abs(cents)<=50?'match':cents>0?'high':'low'};}
 function updatePitch(r){
  const p=pitchState(r.pitch,draft.target),now=performance.now(),dt=Math.min(.2,(now-(r.lastPitch||now))/1000);r.lastPitch=now;
  const needle=$('tuner-needle');if(needle){needle.hidden=p.state==='idle';needle.style.left=`${50+clamp(p.cents/300,-1,1)*48}%`;}
  document.body.dataset.pitchFeedback=p.state==='idle'?'idle':p.state==='match'?'match':'adjust';text('tuner-hz',r.pitch?Math.round(r.pitch):'—');
  r.hold=p.state==='match'?r.hold+dt:0;draft.matchedSeconds=Math.max(draft.matchedSeconds,Math.min(2,r.hold));if($('trainer-progress'))$('trainer-progress').style.width=`${Math.min(100,r.hold/2*100)}%`;
  text('trainer-status',p.state==='idle'?'편하게 “아—”':p.state==='match'?(r.hold>=2?'맞았어요 · 편하게 유지해요':'맞아요'):p.state==='high'?'조금 낮춰보세요':'조금 높여보세요');
 }
 function tick(r){
  if(session!==r)return;r.an.getFloatTimeDomainData(r.meter);const rms=Math.sqrt(r.meter.reduce((s,x)=>s+x*x,0)/r.meter.length);Water.voice(r,rms);text('trainer-db',VoicePractice.dbText(VoicePractice.inputLevel(rms).db));r.pitchMeter.sample(r.meter,r.ac.sampleRate);
  if(r.kind!=='mouth')return;const now=performance.now();if(r.ready&&!r.framePending&&now-r.lastFace>=180)sendFrame(r,now);
  if(now-r.faceAt>800)r.face=null;if(!r.face||!r.pitch)r.resonance=null;
  if(r.pitch&&r.face&&!r.controller&&now-r.lastSample>=800)sampleResonance(r,now);updateMouth(r);
 }
 async function sendFrame(r,time){r.framePending=true;r.lastFace=time;let bitmap;try{bitmap=await createImageBitmap(r.video);if(session!==r){bitmap.close();return;}r.worker.postMessage({type:'frame',bitmap,time},[bitmap]);r.workerTimeout=setTimeout(()=>fail(r,'입모양 인식이 멈췄어요. 다시 시도해 주세요.'),5000);}catch{bitmap?.close();fail(r,'카메라 화면을 읽지 못했어요. 글 읽기로 이어가세요.');}}
 function geometry(points,width,height){
  if(!points||![1,13,14,33,263,61,291].every(i=>Number.isFinite(points[i]?.x)&&Number.isFinite(points[i]?.y)))return null;
  const p=i=>({x:points[i].x*width,y:points[i].y*height}),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),left=p(61),right=p(291),top=p(13),bottom=p(14),eyeL=p(33),eyeR=p(263),nose=p(1),w=dist(left,right),eyes=dist(eyeL,eyeR);
  if(w<width*.05||eyes<width*.15||Math.abs(eyeL.y-eyeR.y)/eyes>.22||Math.abs(dist(nose,eyeL)-dist(nose,eyeR))/eyes>.3)return null;
  return {ratio:dist(top,bottom)/w,width:w,x:(top.x+bottom.x)/2,y:(top.y+bottom.y)/2,angle:Math.atan2(right.y-left.y,right.x-left.x)};
 }
 function receiveMouth(r,data){
  if(session!==r)return;clearTimeout(r.workerTimeout);if(data.type==='error'){fail(r,'입모양 인식을 준비하지 못했어요. 글 읽기로 이어가세요.');return;}if(data.type==='ready'){r.ready=true;return;}if(data.type!=='face')return;
  r.framePending=false;r.faceAt=performance.now();r.face=geometry(data.points,r.video.videoWidth,r.video.videoHeight);if(!r.face)r.resonance=null;
  const canvas=$('mouth-overlay');if(canvas){canvas.width=r.video.videoWidth;canvas.height=r.video.videoHeight;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(r.face){const f=r.face,target=draft.mouth?.target,match=target&&Math.abs(f.ratio-target)<=Math.max(.035,target*.12);ctx.strokeStyle=match?'#61efbb':'#ffffffb0';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.ellipse(f.x,f.y,f.width*.5,f.width*(target||Math.max(.1,f.ratio))*.5,f.angle,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#65d1eb';ctx.beginPath();[78,191,81,82,13,312,311,415,308,324,318,402,317,14,87,178,88,95,78].filter(i=>data.points[i]).forEach((i,n)=>{const p=data.points[i];n?ctx.lineTo(p.x*canvas.width,p.y*canvas.height):ctx.moveTo(p.x*canvas.width,p.y*canvas.height);});ctx.closePath();ctx.stroke();}}
  updateMouth(r);
 }
 async function sampleResonance(r,time){
  r.lastSample=time;r.sample.getFloatTimeDomainData(r.samples);const pcm=r.samples.slice(-Math.round(r.ac.sampleRate*.65)),controller=new AbortController();r.controller=controller;const timeout=setTimeout(()=>controller.abort(),5000);
  try{const response=await fetch('/api/resonance',{method:'POST',headers:{'Content-Type':'audio/wav'},body:wave(pcm,r.ac.sampleRate,16),signal:controller.signal});if(!response.ok)throw Error('resonance');const result=await response.json();if(session!==r)return;r.serverError=false;r.resonance=result.status==='ready'&&Array.isArray(result.formants)&&result.formants.length===3&&result.formants.every(Number.isFinite)&&r.face&&r.pitch?result:null;if(r.resonance&&draft.mouth&&Math.abs(VoicePractice.pitchMatch(result.pitch,draft.mouth.pitch))<=50)draft.lastFormants=[...result.formants];updateMouth(r);
  }catch{if(session===r){r.resonance=null;r.serverError=true;updateMouth(r);}}finally{clearTimeout(timeout);if(r.controller===controller)r.controller=null;}
 }
 function position(fs){return {x:clamp((fs[1]-500)/2500*100,4,96),y:clamp(100-(fs[0]-150)/1250*100,4,96)};}
 function updateMouth(r){
  if(session!==r)return;const button=$('mouth-baseline'),baseline=draft.mouth;
  if(button){button.hidden=!!baseline;button.disabled=!r.face||!r.resonance||!r.pitch;}
  const samePitch=!baseline||r.resonance&&Math.abs(VoicePractice.pitchMatch(r.resonance.pitch,baseline.pitch))<=50;
  if(!r.face)text('trainer-status',r.ready?'얼굴을 정면으로 보여주세요':'입모양을 준비하고 있어요');
  else if(!baseline)text('trainer-status',r.resonance?'편하다면 기준을 담아주세요':'같은 “아—”를 잠깐 이어주세요');
  else if(!samePitch)text('trainer-status',`기준 ${Math.round(baseline.pitch)} Hz와 같은 높이로 내보세요`);
  else{const difference=r.face.ratio-baseline.target;text('trainer-status',Math.abs(difference)<=Math.max(.035,baseline.target*.12)?'정한 입모양에 맞아요':difference<0?'편한 만큼 조금 더 열어보세요':'조금 덜 열어보세요');}
  const dot=$('resonance-now');if(dot){dot.hidden=!r.resonance||!samePitch;if(!dot.hidden){const p=position(r.resonance.formants);dot.style.left=p.x+'%';dot.style.top=p.y+'%';}}
  text('resonance-status',r.serverError?'울림 연결을 확인해 주세요':!r.resonance?'“아—”를 이어주세요':!samePitch?'같은 음정에서 비교해요':baseline?'빈 점 · 처음 / 빛나는 점 · 지금':'기준을 담으면 비교해요');
  text('formant-values',r.resonance?`F1 ${Math.round(r.resonance.formants[0])} · F2 ${Math.round(r.resonance.formants[1])} Hz`:'F1 — · F2 — Hz');
 }
 function baseline(){const r=session;if(!r?.face||!r.resonance||!r.pitch)return;draft.mouth={formants:[...r.resonance.formants],pitch:r.resonance.pitch,target:clamp(r.face.ratio,.08,.85)};draft.lastFormants=null;$('mouth-target').value=Math.round(draft.mouth.target*100);$('mouth-target-wrap').hidden=false;const p=position(draft.mouth.formants),dot=$('resonance-first');dot.hidden=false;dot.style.left=p.x+'%';dot.style.top=p.y+'%';updateMouth(r);}
 function summary(){return draft?{baseId:draft.baseId,targetHz:draft.target,matchedSeconds:Math.round(draft.matchedSeconds*10)/10,...(draft.mouth?{vowel:'아',firstFormants:draft.mouth.formants,lastFormants:draft.lastFormants}:{}),at:Date.now()}:null;}
 function read(){state.training=null;state.baseline=null;navigate('home');}
 async function actions(b){
  const action=b.dataset.training;if(!action)return false;
  if(action==='connection'){await checkConnection();return true;}
  if(action==='open'){open(state.view==='result'?state.current:null);return true;}
  if(!draft)return true;
  if(action==='listen')await start('pitch');
  else if(action==='camera')await start('mouth');
  else if(action==='tone'){if(target()){stop();draft.message='듣고 편하게 따라 해보세요';render();await VoicePractice.playTone(draft.target);}}
  else if(action==='stop'){stop();draft.message='이어서 연습할 수 있어요';render();}
  else if(action==='next'||action==='back'){if(action==='next'&&!target())return true;draft.message='';navigate(action==='next'?'mouth':'tuning');}
  else if(action==='read')read();
  else if(action==='baseline')baseline();
  else if(action==='reset'){draft.mouth=null;draft.lastFormants=null;$('mouth-target-wrap').hidden=true;$('resonance-first').hidden=true;if(session)updateMouth(session);}
  return true;
 }
 document.addEventListener('input',e=>{if(e.target.id==='mouth-target'&&draft?.mouth){draft.mouth.target=Number(e.target.value)/100;if(session)updateMouth(session);}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&session){stop();draft.message='입력을 멈췄어요. 돌아오면 이어서 시작하세요.';render();}});
 window.addEventListener('pagehide',stop);
 let connection=null;
 function statusMarkup(){if(window.BetaAccess?.remote)return '';return `<section class="panel" id="pc-connection"><h2>PC 테스트 연결</h2>${[['녹음 · 기기 저장',state.db?'사용 가능':'저장 확인 필요'],['실시간 문장 인식',connection?.streaming?.provider==='sherpa-local'&&connection.streaming.status==='ready'?'실시간 인식 연결됨':connection?.streaming?.provider==='google'&&connection.streaming.status==='ready'?'Google 연결됨':'이 PC에서 인식'],['녹음 후 문장 확인',connection?.transcription==='ready'?'연결됨':'연결 확인 필요'],['발음 울림 · F1·F2',connection?.analysis==='ready'?'연결됨':'연결 확인 필요'],['카메라 입모양','연습에서 허용'],['Google · Apple 로그인','최종 연결 예정']].map(([label,value])=>`<div class="connection-row"><span>${label}</span><b class="${['연결됨','사용 가능','실시간 인식 연결됨','Google 연결됨'].includes(value)?'':'pending'}">${value}</b></div>`).join('')}<button class="quiet" data-training="connection">연결 다시 확인</button><p class="note">실시간 한국어 인식·분석은 이 PC에서 처리해요. 외부로 음성을 보내지 않아요. 휴대폰 웹에서는 별도의 기기 인식을 사용해요.</p></section>`;}
 async function checkConnection(){if(window.BetaAccess?.remote)return;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);try{const response=await fetch('/api/status',{signal:controller.signal});const value=await response.json();connection=response.ok&&value.app==='semiqolon-voice'&&value.local===true?value:null;}catch{connection=null;}finally{clearTimeout(timer);const panel=$('pc-connection');if(panel)panel.outerHTML=statusMarkup();}}
 return {open,stop,markup,actions,pitchState,geometry,summary,statusMarkup,checkConnection};
})();
