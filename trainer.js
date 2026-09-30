// Short, optional practice between the two saved sentence recordings.
// No practice audio, camera frames, or face landmarks are stored.
let trainer=null, trainingDraft=null, trainerToneContext=null;
const TRAINER_TOLERANCE=50; // cents, sustained vowel only; speech keeps its natural intonation.
function trainerText(id,text){const el=$(id);if(el&&el.textContent!==text)el.textContent=text;}
function trainerStart(){stopTrainer();trainingDraft={target:goalSettings().hz||null,matchedSeconds:0,mouth:null};view='tuning';}
function trainerMarkup(){
 const d=trainingDraft||{},active=!!trainer?.stream,pending=!!trainer&&!active;
 if(view==='tuning')return `<section class="scene trainer-scene"><p class="eyebrow">01 / 02 · 짧은 연습</p><h1>음정 맞추기</h1><p class="trainer-caption">편하게 “아—”</p><div class="tuner-readout" aria-label="현재 음정"><strong id="tuner-hz">—</strong><span>Hz</span></div><div class="tuner-scale" role="img" aria-label="목표 높이를 가운데로 표시하는 음정 바늘"><div class="tuner-center"></div><i id="tuner-needle" hidden></i><span>낮게</span><b>목표</b><span>높게</span></div><p id="trainer-status" class="trainer-status" role="status">${d.message||'원하는 높이를 정해요'}</p><div class="trainer-goal"><label for="trainer-target">목표 <input id="trainer-target" type="number" inputmode="numeric" min="65" max="450" step="1" value="${d.target||''}" placeholder="Hz"> Hz</label><button class="quiet-link" data-action="trainer-tone">기준음 듣기</button></div>${!d.target&&practiceBase?.metrics?.pitchMedian?`<button class="quiet-link trainer-suggestion" data-action="trainer-use-first">처음 높이 ${Math.round(practiceBase.metrics.pitchMedian)} Hz 사용</button>`:''}<div class="trainer-progress" aria-label="목표에 맞춰 2초 유지"><i id="trainer-progress" style="width:${Math.min(100,(d.matchedSeconds||0)/2*100)}%"></i></div><div class="trainer-actions"><button class="primary" data-action="${active?'trainer-stop':'trainer-listen'}" ${pending?'disabled':''}>${active?'잠시 멈추기':pending?'마이크 준비 중':'음정 맞추기 시작'}</button><button class="secondary" data-action="trainer-next">다음 ${icons.arrow}</button></div><p class="tiny">휴대폰은 30cm 앞 · 편한 높이로</p><button class="quiet-link" data-action="trainer-skip">바로 다시 읽기</button><button class="quiet-link trainer-back" data-action="cancel-practice">돌아가기</button></section>`;
 return `<section class="scene trainer-scene mouth-scene"><p class="eyebrow">02 / 02 · 선택 연습</p><h1>입모양과 울림</h1><p class="trainer-caption">같은 “아—”, 조금 다른 울림</p><div class="mouth-camera" id="mouth-camera"><video id="mouth-video" playsinline muted autoplay aria-label="내 입모양 미리보기"></video><canvas id="mouth-overlay" aria-hidden="true"></canvas><div id="mouth-placeholder"><svg viewBox="0 0 120 100" aria-hidden="true"><path d="M20 50Q60 15 100 50Q60 88 20 50Z"/><ellipse cx="60" cy="50" rx="23" ry="16"/></svg><span>카메라는 선택이에요</span></div></div><p id="trainer-status" class="trainer-status" role="status">${d.message||'편한 “아—”로 시작해요'}</p><div id="mouth-controls" ${active?'':'hidden'}><button id="mouth-baseline" class="secondary" data-action="trainer-baseline" disabled>편한 소리 기준 담기</button><div id="mouth-target-wrap" hidden><label class="mouth-target" for="mouth-target">입 벌림 <input id="mouth-target" type="range" min="8" max="85" step="1" value="30"><span>편한 만큼</span></label><button class="quiet-link" data-action="trainer-reset-mouth">기준 다시 담기</button></div><div class="resonance-panel"><div class="resonance-title"><span>울림 변화</span><span id="resonance-status">같은 소리로 비교해요</span></div><div class="resonance-plot" role="img" aria-label="같은 아 소리의 두 울림 위치. 점 사이 거리는 개선 점수가 아닙니다"><i id="resonance-first" hidden></i><i id="resonance-now" hidden></i><span>처음</span><b>지금</b></div></div></div><div class="trainer-actions">${!active?`<button class="primary" data-action="trainer-camera" ${pending?'disabled':''}>${pending?'준비 중…':'카메라로 연습'}</button>`:''}<button class="${active?'primary':'secondary'}" data-action="trainer-skip">같은 문장 다시 읽기 ${icons.arrow}</button></div><p class="tiny">영상은 기기 안에서만 처리하고 저장하지 않아요.</p><button class="quiet-link trainer-back" data-action="trainer-back">음정으로 돌아가기</button></section>`;
}
function saveTrainerSummary(){if(!practicePlan||!trainingDraft)return;const d=trainingDraft;practicePlan.goal=goalSettings();practicePlan.tips=coachAdvice(practiceBase,practicePlan.goal);practicePlan.training={targetHz:d.target,matchedSeconds:Math.round(d.matchedSeconds*10)/10};if(d.mouth)practicePlan.training.mouth={vowel:'아',first:d.mouth.formants,last:d.lastFormants||null};}
function stopTrainer(){
 const r=trainer;trainer=null;
 if(trainerToneContext){const ac=trainerToneContext;trainerToneContext=null;ac.close().catch(()=>{});}
 if(r){clearInterval(r.timer);clearTimeout(r.timeout);clearTimeout(r.workerTimeout);r.controller?.abort();r.worker?.terminate();r.stream?.getTracks().forEach(t=>t.stop());r.nodes?.forEach(n=>{try{n.disconnect();}catch{}});r.ac?.close().catch(()=>{});if(r.video){r.video.pause();r.video.srcObject=null;}}
 Water.quiet();resetPitchFeedback();
}
function failTrainer(r,message){if(trainer!==r)return;stopTrainer();trainingDraft.message=message;render();}
function readTrainerTarget(){const input=$('trainer-target');if(!input?.reportValidity())return null;const hz=Number(input.value);if(!Number.isFinite(hz)||hz<65||hz>450){input.focus();toast('목표 높이를 65–450 Hz 사이로 정해주세요.');return null;}trainingDraft.target=hz;localPut('sq-voice-goal',{...goalSettings(),hz});return hz;}
async function trainerTone(){
 const target=readTrainerTarget();if(!target)return;
 stopTrainer();trainingDraft.message='기준음을 듣고 따라 해보세요';render();
 const ac=new (window.AudioContext||window.webkitAudioContext)();trainerToneContext=ac;
 try{await ac.resume();if(trainerToneContext!==ac)return;const osc=ac.createOscillator(),gain=ac.createGain(),now=ac.currentTime;osc.frequency.value=target;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.07,now+.1);gain.gain.setValueAtTime(.07,now+.8);gain.gain.linearRampToValueAtTime(0,now+1);osc.connect(gain);gain.connect(ac.destination);osc.onended=()=>{if(trainerToneContext===ac)trainerToneContext=null;ac.close().catch(()=>{});};osc.start();osc.stop(now+1.05);}catch{if(trainerToneContext===ac)trainerToneContext=null;ac.close().catch(()=>{});toast('기준음을 다시 눌러주세요.');}
}
async function beginTrainer(kind){
 if(kind==='pitch'&&!readTrainerTarget())return;
 stopTrainer();const r={kind,nodes:[],history:[],hold:0,matched:false,lastSample:0,lastFace:0,face:null,resonance:null};trainer=r;trainingDraft.message=kind==='mouth'?'카메라와 마이크를 준비해요':'마이크를 준비해요';render();
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('unsupported');
  r.ac=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000});await r.ac.resume();if(trainer!==r)return;
  const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:kind==='mouth'?{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:15,max:24}}:false});
  if(trainer!==r||document.hidden){stream.getTracks().forEach(t=>t.stop());if(trainer===r)stopTrainer();return;}
  r.stream=stream;await r.ac.resume();if(trainer!==r)return;
  const source=r.ac.createMediaStreamSource(stream),sink=r.ac.createGain();sink.gain.value=0;r.an=r.ac.createAnalyser();r.an.fftSize=4096;r.meter=new Float32Array(4096);source.connect(r.an);r.an.connect(sink);sink.connect(r.ac.destination);r.nodes=[source,r.an,sink];
  stream.getTracks().forEach(t=>t.addEventListener('ended',()=>failTrainer(r,'입력이 멈췄어요. 다시 시작할 수 있어요.')));
  trainingDraft.message=kind==='mouth'?'입모양을 준비하고 있어요':'“아—” 하고 소리 내보세요';render();
  if(kind==='mouth'){
   trainingDraft.mouth=null;trainingDraft.lastFormants=null;
   r.sample=r.ac.createAnalyser();r.sample.fftSize=32768;source.connect(r.sample);r.nodes.push(r.sample);r.samples=new Float32Array(r.sample.fftSize);
   r.video=$('mouth-video');r.video.srcObject=stream;await r.video.play();if(trainer!==r)return;
   $('mouth-placeholder').hidden=true;$('mouth-camera').style.aspectRatio=`${r.video.videoWidth} / ${r.video.videoHeight}`;
   r.worker=new Worker('mouth-worker.js');r.worker.onmessage=e=>receiveMouth(r,e.data);r.worker.onerror=()=>failTrainer(r,'입모양을 불러오지 못했어요. 다시 읽기로 이어갈 수 있어요.');r.worker.postMessage({type:'init'});
   r.workerTimeout=setTimeout(()=>failTrainer(r,'카메라 연습을 시작하지 못했어요. 다시 시도하거나 건너뛰세요.'),20000);
  }
  r.timer=setInterval(()=>tickTrainer(r),100);r.timeout=setTimeout(()=>failTrainer(r,'잠시 쉬었다 이어가세요.'),120000);
 }catch{failTrainer(r,kind==='mouth'?'카메라·마이크를 사용할 수 없어요. 건너뛰어도 괜찮아요.':'마이크를 사용할 수 없어요. 권한을 확인해주세요.');}
}
function pitchPracticeState(value,target){if(!Number.isFinite(value)||value<=0||!Number.isFinite(target)||target<=0)return {state:'idle',cents:0};const cents=1200*Math.log2(value/target);return {state:Math.abs(cents)<=TRAINER_TOLERANCE?'match':cents>0?'high':'low',cents};}
function tickTrainer(r){
 if(trainer!==r)return;r.an.getFloatTimeDomainData(r.meter);const rms=Math.sqrt(r.meter.reduce((s,x)=>s+x*x,0)/r.meter.length),clipped=r.meter.some(x=>Math.abs(x)>=.995);Water.voice(r,rms);
 const pitch=clipped?null:detectLivePitch(r.meter,r.ac.sampleRate);r.history=pitch?r.history.concat(pitch).slice(-5):[];const sorted=[...r.history].sort((a,b)=>a-b);r.pitch=sorted.length>=3?sorted[Math.floor(sorted.length/2)]:null;
 if(r.kind==='pitch'){
  const result=pitchPracticeState(r.pitch,trainingDraft.target),needle=$('tuner-needle'),edge=$('pitch-edge');if(needle){needle.hidden=result.state==='idle';needle.style.left=`${50+Math.max(-1,Math.min(1,result.cents/300))*48}%`;}
  if(edge){edge.dataset.state=result.state==='idle'?'idle':result.state==='match'?'match':'outside';edge.style.setProperty('--pitch-power',Math.min(1,Math.max(.4,rms*12)));}
  trainerText('tuner-hz',r.pitch?Math.round(r.pitch):'—');r.hold=result.state==='match'?r.hold+.1:0;trainingDraft.matchedSeconds=Math.max(trainingDraft.matchedSeconds,Math.min(2,r.hold));if(r.hold>=2)r.matched=true;
  $('trainer-progress').style.width=`${Math.min(100,r.hold/2*100)}%`;
  trainerText('trainer-status',result.state==='idle'?'“아—” 하고 소리 내보세요':result.state==='match'?(r.matched?'맞았어요 · 편하게 유지해요':'맞아요'):result.state==='high'?'조금 낮춰보세요':'조금 높여보세요');
 }else{
  const now=performance.now();if(r.ready&&!r.framePending&&now-r.lastFace>=180)sendMouthFrame(r,now);
  if(now-r.faceAt>800){r.face=null;r.resonance=null;}
  if(!r.pitch){r.resonance=null;updateMouthUI(r);}
  if(r.pitch&&r.face&&!r.controller&&now-r.lastSample>=650)sampleResonance(r,now);
 }
}
async function sendMouthFrame(r,time){r.framePending=true;r.lastFace=time;let bitmap;try{bitmap=await createImageBitmap(r.video);if(trainer!==r){bitmap.close();return;}r.worker.postMessage({type:'frame',bitmap,time},[bitmap]);r.workerTimeout=setTimeout(()=>failTrainer(r,'입모양 인식이 멈췄어요. 다시 시도해주세요.'),5000);}catch{bitmap?.close();failTrainer(r,'이 브라우저에서는 카메라 연습이 어려워요. 다시 읽기로 이어가세요.');}}
function mouthGeometry(points,width,height){
 if(!points)return null;const p=i=>({x:points[i].x*width,y:points[i].y*height}),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const left=p(61),right=p(291),top=p(13),bottom=p(14),eyeL=p(33),eyeR=p(263),nose=p(1),w=dist(left,right),eyes=dist(eyeL,eyeR);
 if(w<width*.05||eyes<width*.15||Math.abs(eyeL.y-eyeR.y)/eyes>.22||Math.abs(dist(nose,eyeL)-dist(nose,eyeR))/eyes>.3)return null;
 return {ratio:dist(top,bottom)/w,width:w,x:(top.x+bottom.x)/2,y:(top.y+bottom.y)/2,angle:Math.atan2(right.y-left.y,right.x-left.x)};
}
function receiveMouth(r,data){
 if(trainer!==r)return;clearTimeout(r.workerTimeout);
 if(data.type==='error'){console.warn('Mouth model:',data.message);failTrainer(r,'입모양 인식을 준비하지 못했어요. 다시 읽기로 이어가세요.');return;}
 if(data.type==='ready'){r.ready=true;return;}
 if(data.type!=='face')return;r.framePending=false;r.faceAt=performance.now();r.face=mouthGeometry(data.points,r.video.videoWidth,r.video.videoHeight);if(!r.face)r.resonance=null;
 const canvas=$('mouth-overlay');if(canvas){canvas.width=r.video.videoWidth;canvas.height=r.video.videoHeight;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(r.face){const f=r.face,target=trainingDraft.mouth?.target,match=target&&Math.abs(f.ratio-target)<=Math.max(.035,target*.12);ctx.strokeStyle=match?'#61efbb':'#ffffffb0';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.ellipse(f.x,f.y,f.width*.5,f.width*(target||Math.max(.1,f.ratio))*.5,f.angle,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#65d1eb';ctx.lineWidth=2;ctx.beginPath();[78,191,81,82,13,312,311,415,308,324,318,402,317,14,87,178,88,95,78].filter(i=>data.points[i]).forEach((i,n)=>{const p=data.points[i];n?ctx.lineTo(p.x*canvas.width,p.y*canvas.height):ctx.moveTo(p.x*canvas.width,p.y*canvas.height);});ctx.closePath();ctx.stroke();}}
 updateMouthUI(r);
}
async function sampleResonance(r,time){
 r.lastSample=time;r.sample.getFloatTimeDomainData(r.samples);const x=r.samples.slice(-Math.round(r.ac.sampleRate*.65)),pcm=resample(x,r.ac.sampleRate,24000),controller=new AbortController();r.controller=controller;const timeout=setTimeout(()=>controller.abort(),5000);
 try{const response=await fetch('/api/resonance',{method:'POST',headers:{'Content-Type':'audio/wav'},body:wavBlob(pcm),signal:controller.signal});if(!response.ok)throw Error('resonance');const result=await response.json();if(trainer!==r)return;r.serverError=false;r.resonance=result.status==='ready'&&Array.isArray(result.formants)&&result.formants.length===3&&result.formants.every(Number.isFinite)&&r.face&&r.pitch?result:null;if(r.resonance&&trainingDraft.mouth){trainingDraft.lastFormants=result.formants;}updateMouthUI(r);
 }catch{if(trainer===r){r.resonance=null;r.serverError=true;updateMouthUI(r);}}finally{clearTimeout(timeout);if(r.controller===controller)r.controller=null;}
}
function formantPosition(fs){return {x:Math.max(4,Math.min(96,(fs[1]-500)/2500*100)),y:Math.max(4,Math.min(96,100-(fs[0]-150)/1250*100))};}
function updateMouthUI(r){
 if(trainer!==r)return;const d=trainingDraft,button=$('mouth-baseline');if(button){button.hidden=!!d.mouth;button.disabled=!r.face||!r.resonance||!r.pitch;}
 if(!r.face)trainerText('trainer-status',r.ready?'얼굴을 정면으로 보여주세요':'입모양을 준비하고 있어요');
 else if(!d.mouth)trainerText('trainer-status',r.resonance?'편하다면 기준을 담아주세요':'같은 “아—”를 잠깐 이어주세요');
 else {const difference=r.face.ratio-d.mouth.target,match=Math.abs(difference)<=Math.max(.035,d.mouth.target*.12);trainerText('trainer-status',match?'정한 입모양에 맞아요':difference<0?'편한 만큼 조금 더 열어보세요':'조금 덜 열어보세요');}
 const now=$('resonance-now');if(now){now.hidden=!r.resonance;if(r.resonance){const p=formantPosition(r.resonance.formants);now.style.left=p.x+'%';now.style.top=p.y+'%';}}
 trainerText('resonance-status',r.serverError?'울림 연결을 확인해주세요':!r.resonance?'같은 “아—”를 이어주세요':d.mouth?'빈 점은 처음 · 빛나는 점은 지금':'기준을 담으면 비교해요');
}
function captureMouthBaseline(){const r=trainer;if(r?.kind!=='mouth'||!r.face||!r.resonance||!r.pitch)return;const ratio=r.face.ratio;trainingDraft.mouth={formants:[...r.resonance.formants],target:Math.min(.85,Math.max(.08,ratio*1.15))};trainingDraft.lastFormants=null;
 const target=$('mouth-target');target.value=Math.round(trainingDraft.mouth.target*100);trainingDraft.mouth.target=Number(target.value)/100;$('mouth-target-wrap').hidden=false;const p=formantPosition(trainingDraft.mouth.formants),dot=$('resonance-first');dot.hidden=false;dot.style.left=p.x+'%';dot.style.top=p.y+'%';updateMouthUI(r);
}
async function handleTrainerAction(action){
 if(action==='trainer-listen')await beginTrainer('pitch');
 else if(action==='trainer-camera')await beginTrainer('mouth');
 else if(action==='trainer-tone')await trainerTone();
 else if(action==='trainer-use-first'){const n=Math.round(practiceBase?.metrics?.pitchMedian);if(n>=65&&n<=450){trainingDraft.target=n;render();}}
 else if(action==='trainer-stop'){stopTrainer();trainingDraft.message='이어서 연습하거나 다음으로';render();}
 else if(action==='trainer-next'||action==='trainer-back'){saveTrainerSummary();stopTrainer();trainingDraft.message='';view=action==='trainer-next'?'mouth':'tuning';render();window.scrollTo({top:0,behavior:'instant'});$('main').focus({preventScroll:true});}
 else if(action==='trainer-skip'){saveTrainerSummary();stopTrainer();view='practice';render();window.scrollTo({top:0,behavior:'instant'});$('main').focus({preventScroll:true});}
 else if(action==='trainer-baseline')captureMouthBaseline();
 else if(action==='trainer-reset-mouth'){trainingDraft.mouth=null;trainingDraft.lastFormants=null;$('mouth-target-wrap').hidden=true;$('resonance-first').hidden=true;if(trainer)updateMouthUI(trainer);}
}
