// Static Pages frontend -> consented, code-protected test analysis service.
(()=>{
 const config=window.BETA_CONFIG;if(!config?.apiBase)return;
 const nativeFetch=window.fetch.bind(window),key='beta-code:'+config.app;
 const read=()=>{try{return sessionStorage.getItem(key)||'';}catch{return '';}};
 let code=read(),opening=null;
 const statusURL=config.apiBase+'/'+config.app+'/api/status';
 function connect(){if(opening)return opening;opening=new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.style.cssText='max-width:390px;width:calc(100% - 40px);padding:28px;border:1px solid #ffffff55;border-radius:26px;background:#172322;color:#eef5f2;font:14px/1.8 Paperlogy,system-ui;box-shadow:0 20px 80px #0008';
  dialog.innerHTML='<form><h2 style="margin:0 0 12px;font-size:20px">모바일 테스트</h2><p>녹음은 이 브라우저에 저장돼요. 분석할 때는 음성을 암호화된 연결(Cloudflare)을 통해 운영자의 Mac으로 보내요. 분석 서버에는 파일을 보관하지 않아요.</p><p>카메라 영상은 기기 안에서만 처리해요.</p><label>테스트 코드<input name="code" required autocomplete="off" style="display:block;width:100%;box-sizing:border-box;background:#ffffff10;color:white;border:1px solid #fff5;border-radius:12px;padding:12px;font:inherit;margin:8px 0"></label><p role="status" style="font-size:12px"></p><button type="submit" style="font:inherit;padding:12px 18px;border:1px solid #fff8;border-radius:16px;background:#ffffff18;color:white;width:100%">동의하고 연결</button><button type="button" data-skip style="font:inherit;padding:12px;background:none;border:0;color:#c9d9d4;width:100%">녹음만 이용</button></form>';
  document.body.append(dialog);dialog.showModal();const done=value=>{dialog.close();dialog.remove();opening=null;resolve(value);};
  dialog.addEventListener('cancel',()=>done(false));dialog.querySelector('[data-skip]').onclick=()=>done(false);
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=dialog.querySelector('[type=submit]'),status=dialog.querySelector('[role=status]'),value=dialog.querySelector('input').value.trim();button.disabled=true;status.textContent='연결 확인 중';try{const response=await nativeFetch(statusURL+'?verify=1',{headers:{Authorization:'Bearer '+value},signal:AbortSignal.timeout(12000),credentials:'omit'});if(!response.ok)throw Error(response.status===401?'코드를 확인해주세요.':'분석 서버를 연결하지 못했어요.');code=value;try{sessionStorage.setItem(key,code);}catch{}done(true);}catch(error){status.textContent=error.message==='코드를 확인해주세요.'?error.message:'분석 서버가 쉬고 있어요. 녹음은 사용할 수 있어요.';button.disabled=false;}};
 });return opening;}
 window.BetaAccess={connect,remote:true};
 window.fetch=async(input,init={})=>{
  if(typeof input!=='string'||!input.startsWith('/api/'))return nativeFetch(input,init);
  if(input==='/api/auth')return new Response(JSON.stringify({user:null,providers:{google:false,apple:false}}),{headers:{'Content-Type':'application/json'}});
  if(input.startsWith('/api/auth/'))return new Response('{}',{status:503});
  const headers=new Headers(init.headers);if(code)headers.set('Authorization','Bearer '+code);
  if(init.method==='POST'&&!code)return new Response(JSON.stringify({error:'테스트 연결이 필요해요.'}),{status:503});
  const result=await nativeFetch(config.apiBase+'/'+config.app+input,{...init,headers,mode:'cors',credentials:'omit'});
  if(result.status===401){code='';try{sessionStorage.removeItem(key);}catch{}}return result;
 };
 window.addEventListener('DOMContentLoaded',()=>{const b=document.createElement('button');b.textContent='테스트 연결';b.id='beta-connect';b.style.cssText='position:fixed;right:18px;top:12px;z-index:90;border:1px solid #aaa5;border-radius:15px;background:#222a;backdrop-filter:blur(12px);color:#fff;font:11px Paperlogy,system-ui;padding:8px 12px';b.onclick=()=>connect();document.body.append(b);if(!code)connect();});
})();
