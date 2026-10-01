// Basic analysis and recording never depend on the optional test server.
(()=>{
 let config=window.BETA_CONFIG;if(!config?.apiBase&&!config?.hosted)return;
 const nativeFetch=window.fetch.bind(window),key='beta-code:'+config.app;
 const read=()=>{try{return sessionStorage.getItem(key)||'';}catch{return '';}};
 function validServer(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;}catch{return false;}}
 let code=read(),opening=null,checked=0,available=false,configChecked=0;
 async function refreshConfig(force=false){if(!force&&Date.now()-configChecked<60000)return;configChecked=Date.now();try{const r=await nativeFetch('beta-config.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(4000)}),c=await r.json();if(c.app===config.app&&validServer(c.apiBase))config=c;}catch{}}
 async function verify(value){if(!validServer(config.apiBase))throw Error('unconfigured');const r=await nativeFetch(config.apiBase+'/'+config.app+'/api/status?verify=1',{headers:{Authorization:'Bearer '+value},signal:AbortSignal.timeout(120000),credentials:'omit'});if(!r.ok)throw Error(r.status===401?'code':'offline');return true;}
 async function ensure(){if(!code)return false;if(Date.now()-checked<30000)return available;checked=Date.now();await refreshConfig();try{available=await verify(code);}catch{available=false;}return available;}
 function connect(){if(opening)return opening;opening=new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.style.cssText='max-width:390px;width:calc(100% - 40px);padding:28px;border:1px solid #ffffff55;border-radius:26px;background:#172322;color:#eef5f2;font:14px/1.8 Paperlogy,system-ui;box-shadow:0 20px 80px #0008';
  if(!validServer(config.apiBase)){
   dialog.innerHTML='<h2 style="margin:0 0 12px;font-size:20px">정밀 분석 준비 중</h2><p>이 테스트에서는 녹음·재생·목소리 높이·저중고음 비율·입력 크기를 사용할 수 있어요.</p><p>F1·F2 정밀 분석은 서버 연결 후 제공해요. 문장 인식은 설정에서 기기 문장 인식을 준비해 주세요.</p><button type="button" style="font:inherit;padding:12px 18px;border:1px solid #fff8;border-radius:16px;background:#ffffff18;color:white;width:100%">확인</button>';
   document.body.append(dialog);dialog.showModal();const close=()=>{dialog.close();dialog.remove();opening=null;resolve(false);};dialog.querySelector('button').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});return;
  }
  dialog.innerHTML='<form><h2 style="margin:0 0 12px;font-size:20px">정밀 분석 연결</h2><p>높이·저중고음·안정감은 기기에서 분석해요.</p><p>문장 인식·말의 빠르기·울림 분석에 연결하면 음성을 암호화된 HTTPS 연결로 음성 분석 서버로 보내요. 서버에는 음성을 보관하지 않아요. 카메라 영상은 기기에서만 처리해요.</p><label>접속 코드<input name="code" required autocomplete="off" style="display:block;width:100%;box-sizing:border-box;background:#ffffff10;color:white;border:1px solid #fff5;border-radius:12px;padding:12px;font:inherit;margin:8px 0"></label><p role="status" style="font-size:12px"></p><button type="submit" style="font:inherit;padding:12px 18px;border:1px solid #fff8;border-radius:16px;background:#ffffff18;color:white;width:100%">동의하고 연결</button><button type="button" data-skip style="font:inherit;padding:12px;background:none;border:0;color:#c9d9d4;width:100%">기기 분석으로 계속</button></form>';
  document.body.append(dialog);dialog.showModal();const done=value=>{dialog.close();dialog.remove();opening=null;resolve(value);};
  dialog.addEventListener('cancel',e=>{e.preventDefault();done(false);});dialog.querySelector('[data-skip]').onclick=()=>done(false);
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=dialog.querySelector('[type=submit]'),status=dialog.querySelector('[role=status]'),value=dialog.querySelector('input').value.trim();button.disabled=true;status.textContent='연결 확인 중 · 첫 연결은 시간이 걸릴 수 있어요.';await refreshConfig(true);try{await verify(value);code=value;available=true;checked=Date.now();try{sessionStorage.setItem(key,code);}catch{}done(true);}catch(error){status.textContent=error.message==='code'?'코드를 확인해주세요.':error.message==='unconfigured'?'상시 분석 서버 연결을 준비 중이에요. 녹음과 기기 분석은 사용할 수 있어요.':'정밀 분석에 연결되지 않았어요. 기기 분석과 녹음은 계속 사용할 수 있어요.';button.disabled=false;}};
 });return opening;}
 window.BetaAccess={connect,ensure,remote:true,get configured(){return validServer(config.apiBase);}};
 window.fetch=async(input,init={})=>{
  if(typeof input!=='string'||!input.startsWith('/api/'))return nativeFetch(input,init);
  if(input==='/api/auth')return new Response(JSON.stringify({user:null,providers:{google:false,apple:false}}),{headers:{'Content-Type':'application/json'}});
  if(input.startsWith('/api/auth/'))return new Response('{}',{status:503});
  if(!code||!validServer(config.apiBase))return new Response(JSON.stringify({error:'정밀 분석 연결이 필요해요.'}),{status:503});
  await refreshConfig();const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+code);
  try{const result=await nativeFetch(config.apiBase+'/'+config.app+input,{...init,headers,mode:'cors',credentials:'omit'});if(result.status===401){code='';available=false;try{sessionStorage.removeItem(key);}catch{}}return result;}catch(error){checked=0;configChecked=0;throw error;}
 };
})();
