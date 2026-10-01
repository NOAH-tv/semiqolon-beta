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
 function playback(audio){const id=audio.dataset?.audioId;if(!id)return;const root=document.querySelector(`[data-reading-id="${id}"]`),r=state.records.find(r=>r.id===id);if(!root||!r)return;const button=document.querySelector(`[data-reading-play="${id}"]`);if(button)button.textContent=audio.paused?'▷ 재생':'Ⅱ 일시정지';
  const w=!audio.paused&&timing(r).find(w=>audio.currentTime>=w.start&&audio.currentTime<=w.end),positions=new Set(w?.positions||[]);
  root.querySelectorAll('[data-pos]').forEach(el=>el.classList.toggle('word-wave',positions.has(Number(el.dataset.pos))));
 }
 function setStatus(message){const el=document.getElementById('reading-status');if(el)el.textContent=message;}
 function pcmWindow(r,start,end){const out=new Float32Array(end-start);let offset=0;for(const chunk of r.chunks){const lo=Math.max(start-offset,0),hi=Math.min(end-offset,chunk.length);if(hi>lo)out.set(chunk.subarray(lo,hi),offset+lo-start);offset+=chunk.length;if(offset>=end)break;}return out;}
 function begin(r){if(r.story.id==='sq-vowel-a-v1')return;r.reading={cursor:0,seen:new Set(),stopped:false};setStatus('녹음 중');const start=()=>{if(!r.reading.stopped){setStatus('말을 듣고 있어요');r.reading.timer=setTimeout(()=>listen(r),5500);}};if(window.BetaAccess?.remote)window.BetaAccess.ensure().then(available=>{if(available)start();}).catch(()=>{});else start();}
 async function listen(r){const s=r.reading;if(s.stopped||state.capture!==r)return;
  const end=r.chunks.reduce((n,c)=>n+c.length,0),sr=r.ac.sampleRate,start=Math.max(0,end-Math.round(sr*12));
  if(end-start<sr*3||document.hidden){s.timer=setTimeout(()=>listen(r),3000);return;}
  const controller=s.controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{const response=await fetch('/api/pace',{method:'POST',headers:{'Content-Type':'audio/wav'},body:wave(pcmWindow(r,start,end),sr,16),signal:controller.signal});if(!response.ok)throw Error('offline');const t=await response.json();if(s.stopped||state.capture!==r)return;
   if(t.status==='ready'){
    const chars=letters(r.story.text),offset=Math.max(0,s.cursor-65),match=align(chars.slice(offset).join(''),t.transcript,true);
    if(match.matches.length>=4&&match.agreement>=.6){const confirmed=match.matches.map(i=>i+offset),fresh=confirmed.filter(i=>!s.seen.has(i));confirmed.forEach(i=>s.seen.add(i));s.cursor=Math.max(s.cursor,...confirmed.map(i=>i+1));
     document.querySelectorAll('.reading-card [data-pos]').forEach(el=>{const i=Number(el.dataset.pos);el.classList.toggle('heard',s.seen.has(i));el.classList.toggle('word-wave',fresh.includes(i));});r.readingProgress=s.seen.size/Math.max(1,chars.length);Water.reading(r.readingProgress);setStatus('읽기 '+Math.floor(r.readingProgress*100)+'%');
    }else setStatus('녹음은 계속되고 있어요');
   }else setStatus(t.status==='busy'?'인식 대기 · 녹음 중':'녹음 중 · 잠시 후 다시 인식해요');
  }catch{if(!s.stopped)setStatus('녹음 중 · 글자 인식은 잠시 쉬어요');}
  finally{clearTimeout(timeout);if(!s.stopped)s.timer=setTimeout(()=>listen(r),3500);}
 }
 function stop(r){if(!r?.reading)return;r.reading.stopped=true;clearTimeout(r.reading.timer);r.reading.controller?.abort();}
 for(const name of ['play','timeupdate','seeked','pause','ended'])document.addEventListener(name,e=>{if(e.target.tagName==='AUDIO')playback(e.target);},true);
 return {letters,paragraphs,markup,align,assessment,report,begin,stop};
})();
