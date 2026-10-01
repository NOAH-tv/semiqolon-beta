'use strict';
// Photos stay in memory. Only text drafts and scripts are saved; existing audio storage is unchanged.
const ScriptLibrary=(()=>{
 const STORE='sq-scripts-v1',DRAFT='sq-script-draft-v1',MAX=20000;
 let documents=[],draft={title:'',text:''},storageOK=true,photo='',notice='',error='',job=null,loader;
 try{const rows=JSON.parse(localStorage.getItem(STORE)||'[]');if(!Array.isArray(rows))throw Error();documents=rows.filter(x=>x&&typeof x.id==='string'&&typeof x.text==='string'&&typeof x.title==='string'&&typeof x.version==='string');const d=JSON.parse(localStorage.getItem(DRAFT)||'null');if(d&&typeof d.text==='string'&&typeof d.title==='string')draft=d;}catch{storageOK=false;}
 const icons={camera:'<path d="M8 5 9.5 3h5L16 5h3a2 2 0 0 1 2 2v12H3V7a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12" r="4"/>',photo:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>'};
 const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
 function sections(text){
  // ponytail: 360-character sections fit the current 90-second recorder; no new recording engine.
  const out=[];let part='';
  for(const paragraph of ReadingFeedback.paragraphs(text)){
   for(const word of paragraph.match(/\S+\s*/gu)||[]){
    const pieces=Array.from(word);while(pieces.length){
     const take=pieces.splice(0,360).join('');
     if(Array.from(part+take).length>360&&part.trim()){out.push(part.trim());part='';}
     part+=take;
    }
   }
   if(part.trim())part+='\n\n';
  }
  if(part.trim())out.push(part.trim());return out;
 }
 const cleanOCR=text=>text.replace(/\r/g,'').split(/\n\s*\n/).map(p=>p.replace(/[ \t]*\n[ \t]*/g,' ').replace(/[ \t]+/g,' ').trim()).filter(Boolean).join('\n\n');
 function remember(){try{localStorage.setItem(DRAFT,JSON.stringify(draft));}catch{notice='임시 저장을 못 했어요. 창을 닫기 전에 글을 복사해 주세요.';const el=$('script-notice');if(el)el.textContent=notice;}}
 function previewURL(blob){if(photo)URL.revokeObjectURL(photo);photo=blob?URL.createObjectURL(blob):'';}
 function markup(){return `<section class="script-library"><div class="section-head"><h1>내 원고</h1><button class="quiet" data-script="new">새 글 ＋</button></div><p class="script-intro">쓰거나 붙여넣고, 사진으로 가져오세요.</p><section class="script-composer" aria-label="연습할 글 입력"><label class="sr-only" for="script-title">원고 제목</label><input id="script-title" type="text" maxlength="80" placeholder="제목 (선택)" value="${esc(draft.title)}" ${job?'disabled':''}><div class="script-photo" ${photo?'':'hidden'}><img src="${photo}" alt="첨부한 사진"><button class="quiet" data-script="remove-photo" ${job?'disabled':''}>사진 닫기 ×</button></div><label class="sr-only" for="script-text">연습할 글</label><textarea id="script-text" rows="9" placeholder="읽고 싶은 글을 입력하거나\n여기에 붙여넣으세요." spellcheck="false" ${job?'readonly':''}>${esc(draft.text)}</textarea><div class="script-tools"><div><button class="quiet" data-script="camera" aria-label="사진 촬영" title="사진 촬영" ${job?'disabled':''}>${icon('camera')}<span>촬영</span></button><button class="quiet" data-script="photo" aria-label="사진 첨부" title="사진 첨부" ${job?'disabled':''}>${icon('photo')}<span>사진</span></button></div><button class="script-read" data-script="read" ${job||!draft.text.trim()?'disabled':''}>읽기 ${icon('arrow')}</button></div><input id="script-camera" type="file" accept="image/*" capture="environment" hidden><input id="script-photo" type="file" accept="image/*" hidden></section><div class="script-status" role="status" aria-live="polite"><span id="script-notice">${esc(job?'사진에서 글자를 읽고 있어요…':notice)}</span>${job?'<button class="quiet" data-script="cancel">취소</button>':''}</div>${error?`<p class="error-note" role="alert">${esc(error)}</p>`:''}<p class="meta script-help">사진은 기기 안에서 처리해요. 가져온 글을 확인한 뒤 읽어 주세요.</p><p class="meta" id="script-count">${countText()}</p>${documents.length?`<div class="section-head script-saved"><h2>저장한 원고</h2><span class="meta">${documents.length}개</span></div>${documents.map(d=>`<button class="entry" data-script-open="${esc(d.id)}"><strong>${esc(d.title)}</strong><span class="entry-row"><span class="meta">${sections(d.text).length}구간 · 녹음 ${state.records.filter(r=>r.scriptId===d.id).length}개</span><span aria-hidden="true">↗</span></span></button>`).join('')}`:''}<p class="app-footer">원고와 녹음은 이 브라우저에 보관돼요.</p></section>`;}
 function countText(){const n=draft.text.trim().length;if(n>MAX)return '20,000자까지 읽을 수 있어요. 글을 나눠 주세요.';return n?`${n.toLocaleString('ko-KR')}자${n>360?' · '+sections(draft.text).length+'구간으로 나눠 읽기':''}`:'';}
 function select(doc,index=0){const parts=sections(doc.text);if(!parts[index])return;state.customStory={id:`script:${doc.id}:${doc.version}:${index}`,scriptId:doc.id,scriptVersion:doc.version,scriptPart:index,scriptParts:parts.length,topic:'내 원고',title:doc.title+(parts.length>1?` · ${index+1}/${parts.length}`:''),text:parts[index],source:'내가 가져온 글',kind:'연습 원고',version:doc.version};state.choice='custom';state.baseline=null;state.back='scripts';navigate('read');}
 function save(){const text=draft.text.trim();if(!text){error='읽을 글을 입력해 주세요.';render();return;}if(text.length>MAX){error='20,000자까지 읽을 수 있어요. 글을 나눠 주세요.';render();return;}
  const old=documents.find(d=>d.id===draft.id),doc={id:old?.id||crypto.randomUUID(),title:draft.title.trim()||text.replace(/\s+/g,' ').slice(0,28),text,version:old?.text===text?old.version:crypto.randomUUID(),ts:Date.now()};
  if(!storageOK){error='원고 저장 공간을 읽지 못했어요. 입력한 글을 복사해 둔 뒤 브라우저를 다시 열어 주세요.';render();return;}
  const next=[doc,...documents.filter(d=>d.id!==doc.id)];
  try{localStorage.setItem(STORE,JSON.stringify(next));}catch{error='원고를 저장할 공간이 부족해요. 글을 복사해 둔 뒤 저장 공간을 확인해 주세요.';render();return;}
  documents=next;draft={id:doc.id,title:doc.title,text:doc.text};remember();previewURL(null);notice='';error='';select(doc);
 }
 function sectionControls(q){if(!q?.scriptId||state.capture)return '';const doc=documents.find(d=>d.id===q.scriptId&&d.version===q.scriptVersion);if(!doc)return '';return `<div class="script-sections">${q.scriptParts>1?`<div class="section-tabs" aria-label="원고 구간">${sections(doc.text).map((text,i)=>`<button class="quiet" data-script-section="${i}" data-script-id="${esc(doc.id)}" aria-pressed="${q.scriptPart===i}">${i+1}${state.records.some(r=>r.scriptId===doc.id&&r.scriptVersion===doc.version&&r.scriptPart===i)?' ✓':''}</button>`).join('')}</div>`:''}<button class="quiet" data-script-edit="${esc(doc.id)}">글 수정</button></div>`;}
 function recordActions(r){if(!r?.scriptId)return '';const doc=documents.find(d=>d.id===r.scriptId&&d.version===r.scriptVersion);return `<details class="panel"><summary>읽은 원고 보기</summary><div class="prose playback-script">${ReadingFeedback.markup(r.text)}</div></details>${doc&&r.scriptPart+1<sections(doc.text).length?`<button class="secondary" data-script-section="${r.scriptPart+1}" data-script-id="${esc(doc.id)}">다음 구간 읽기 →</button>`:''}<button class="quiet" data-action="scripts">내 원고</button>`;}
 function loadEngine(){if(window.Tesseract)return Promise.resolve();if(!loader)loader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='assets/ocr/tesseract.min.js';script.onload=resolve;script.onerror=()=>{loader=null;script.remove();reject(Error('load'));};document.head.append(script);});return loader;}
 async function imageForOCR(file){
  if(file.size>20*1024*1024)throw Error('사진은 20MB 이하로 가져와 주세요.');
  if(!/^image\/(jpeg|png|webp|heic|heif|avif|bmp)$/i.test(file.type)&&!(file.type===''&&/\.(jpe?g|png|webp|heic|heif|avif|bmp)$/i.test(file.name)))throw Error('JPG·PNG 등 사진 파일을 선택해 주세요.');
  const u=URL.createObjectURL(file),img=new Image();
  try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('사진을 열지 못했어요. JPG 또는 PNG로 다시 가져와 주세요.'));img.src=u;});const scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight),Math.sqrt(4000000/(img.naturalWidth*img.naturalHeight)));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('사진을 읽지 못했어요.')),'image/png'));}finally{URL.revokeObjectURL(u);}
 }
 function stop(){if(!job)return;job.cancelled=true;job.worker?.terminate();job=null;notice='취소했어요. 입력한 글은 그대로 있어요.';}
 async function extract(file){if(!file||job)return;const current=job={cancelled:false,worker:null};error='';notice='';render();
  try{const blob=await imageForOCR(file);if(current.cancelled)return;previewURL(blob);render();await loadEngine();if(current.cancelled)return;
   current.worker=await Tesseract.createWorker(['kor','eng'],1,{workerPath:new URL('assets/ocr/worker.min.js',location.href).href,corePath:new URL('assets/ocr',location.href).href,langPath:new URL('assets/ocr',location.href).href,workerBlobURL:false,logger:m=>{if(current.cancelled)return;const status=$('script-notice');if(status)status.textContent=m.status==='recognizing text'?`글자 읽는 중 ${Math.round(m.progress*100)}%`:'글자 인식 준비 중… 처음에는 잠시 걸려요.';}});
   if(current.cancelled)return;
   const {data}=await current.worker.recognize(blob,{rotateAuto:true});if(current.cancelled)return;
   const text=cleanOCR(data.text||'');if(!text)throw Error('글자를 찾지 못했어요. 글자가 크고 선명하게 보이도록 다시 찍어 주세요.');
   draft.text=[draft.text.trim(),text].filter(Boolean).join('\n\n');remember();notice='글자를 가져왔어요. 잘못 읽은 부분을 고쳐 주세요.';
  }catch(e){if(!current.cancelled)error=/[가-힣]/.test(e.message||'')?e.message:'글자를 가져오지 못했어요. 인터넷 연결을 확인하거나 직접 입력해 주세요.';}
  finally{current.worker?.terminate();if(job===current){job=null;if(state.view==='scripts')render();}}
 }
 async function actions(b){
  if(b.dataset.action==='scripts'){navigate('scripts');return true;}
  const open=b.dataset.scriptOpen,edit=b.dataset.scriptEdit;
  if(open||edit){const doc=documents.find(d=>d.id===(open||edit));if(!doc)return true;if(open){select(doc);return true;}draft={id:doc.id,title:doc.title,text:doc.text};remember();error='';notice='';previewURL(null);navigate('scripts');return true;}
  if(b.dataset.scriptSection!==undefined){const doc=documents.find(d=>d.id===b.dataset.scriptId);if(doc)select(doc,Number(b.dataset.scriptSection));return true;}
  switch(b.dataset.script){
   case 'photo':$('script-photo').click();break;
   case 'camera':$('script-camera').click();break;
   case 'read':save();break;
   case 'cancel':stop();render();break;
   case 'remove-photo':previewURL(null);render();break;
   case 'new':if(draft.text.trim()&&!documents.some(d=>d.text===draft.text.trim()&&d.title===draft.title.trim())&&!confirm('작성 중인 글을 비우고 새로 쓸까요?'))return true;stop();draft={title:'',text:''};remember();previewURL(null);notice='';error='';render();break;
   default:return false;
  }return true;
 }
 document.addEventListener('input',e=>{if(e.target.id==='script-text'||e.target.id==='script-title'){draft[e.target.id==='script-text'?'text':'title']=e.target.value;remember();const read=document.querySelector('[data-script="read"]');if(read)read.disabled=!draft.text.trim()||!!job;const count=$('script-count');if(count)count.textContent=countText();}});
 document.addEventListener('change',e=>{if(['script-photo','script-camera'].includes(e.target.id)){const file=e.target.files?.[0];e.target.value='';extract(file);}});
 return {markup,actions,sectionControls,recordActions,sections,cleanOCR,leave(){stop();previewURL(null);},story(){return state.customStory;}};
})();
