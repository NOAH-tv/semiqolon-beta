/* Device-only practice measurements. No transcript, formant or anatomy is invented.
   YIN is reused from the app; FFT bands use the same fixed tilt/density principle.
   Browser and Praat results have separate comparison keys. */
const BANDS=[[100,500],[500,2000],[2000,5000]];
function quantile(values,p){const a=[...values].sort((a,b)=>a-b),at=(a.length-1)*p,i=Math.floor(at);return a.length?a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(at-i):null;}
function percent(values){const sum=values.reduce((a,b)=>a+b,0),raw=values.map(x=>x/sum*100),out=raw.map(Math.floor);raw.map((v,i)=>[v-out[i],i]).sort((a,b)=>b[0]-a[0]).slice(0,100-out.reduce((a,b)=>a+b,0)).forEach(x=>out[x[1]]++);return out;}
function fftPower(input){const n=input.length,re=Float64Array.from(input),im=new Float64Array(n);for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len;for(let i=0;i<n;i+=len)for(let j=0;j<len/2;j++){const c=Math.cos(a*j),s=Math.sin(a*j),k=i+j,q=k+len/2,tr=c*re[q]-s*im[q],ti=s*re[q]+c*im[q];re[q]=re[k]-tr;im[q]=im[k]-ti;re[k]+=tr;im[k]+=ti;}}return re.slice(0,n/2+1).map((v,i)=>v*v+im[i]*im[i]);}
function decodeWav(buffer){const d=new DataView(buffer),tag=i=>String.fromCharCode(...new Uint8Array(buffer,i,4));if(d.byteLength<44||tag(0)!=='RIFF'||tag(8)!=='WAVE')throw Error('wav');let sr,offset,length,channels,bits,format;for(let i=12;i+8<=d.byteLength;){const len=d.getUint32(i+4,true),id=tag(i);if(i+8+len>d.byteLength)throw Error('wav');if(id==='fmt '&&len>=16){format=d.getUint16(i+8,true);channels=d.getUint16(i+10,true);sr=d.getUint32(i+12,true);bits=d.getUint16(i+22,true);}if(id==='data'){offset=i+8;length=len;}i+=8+len+(len%2);}if(format!==1||channels!==1||bits!==16||!offset||length%2||sr<16000||sr>48000||length/sr/2>1201)throw Error('wav');const pcm=new Float32Array(length/2);for(let i=0;i<pcm.length;i++)pcm[i]=d.getInt16(offset+2*i,true)/32768;return {pcm,sr};}
function analyze(pcm,sr){
 const duration=pcm.length/sr,result={version:3,engine:'SEMI device YIN / FFT',comparisonKey:'device-v1',method:'device',duration,status:'short',pitchMean:null,pitchMedian:null,pitchRange:null,formants:null,hnr:null,regularity:null,balance:null,voicedSeconds:0,speechDuration:null,level:null};
 if(duration<.5)return result;
 const hop=Math.max(Math.round(sr*.02),Math.ceil(pcm.length/1000)),frame=Math.round(sr*.08),size=1024,db=[],pitch=[],regular=[],bandRows=[],voicedDb=[],positions=[];let clipped=0;
 for(const x of pcm)if(Math.abs(x)>=.995)clipped++;
 for(let at=0;at+frame<=pcm.length;at+=hop){const x=pcm.subarray(at,at+frame),rms=Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length);db.push(20*Math.log10(rms+1e-10));if(rms<.004)continue;const hz=detectLivePitch(x,sr);if(!hz||hz<65||hz>500)continue;
  const lag=Math.round(sr/hz);let dot=0,a=0,b=0;for(let i=0;i<x.length-lag;i++){dot+=x[i]*x[i+lag];a+=x[i]*x[i];b+=x[i+lag]*x[i+lag];}const rho=dot/Math.sqrt(a*b||1);if(rho<.6)continue;
  pitch.push(hz);regular.push(Math.max(0,Math.min(1,rho)));voicedDb.push(db.at(-1));positions.push(at/sr);
  if(rms>=10**(-48/20)&&!x.some(v=>Math.abs(v)>=.995)){const win=new Float64Array(size),count=Math.min(Math.round(sr*.04),size),mean=x.slice(0,count).reduce((s,v)=>s+v,0)/count;for(let i=0;i<count;i++)win[i]=(x[i]-mean)*(.5-.5*Math.cos(2*Math.PI*i/(count-1)));const power=fftPower(win),r=BANDS.map(([lo,hi])=>{let n=0,s=0;for(let j=0;j<power.length;j++){const f=j*sr/size;if(f>=lo&&f<hi){n++;s+=power[j]*(Math.max(f,50)/1000)**2;}}return Math.sqrt(s/Math.max(1,n));}),sum=r.reduce((s,v)=>s+v,0);if(sum>1e-12)bandRows.push(r.map(v=>v/sum));}
 }
 const peak=quantile(db,.95);result.level={state:peak< -30?'soft':'usable',levelDbFS:peak,dynamicRangeDb:null,span:null};
 if(!db.length||peak< -52){result.status='quiet';return result;}if(clipped/pcm.length>.005){result.status='clipped';result.level.state='clipped';return result;}
 result.voicedSeconds=pitch.length*hop/sr;result.speechDuration=positions.length?positions.at(-1)-positions[0]+frame/sr:null;
 if(pitch.length<30||result.voicedSeconds<1.5)return result;
 if(pitch.length/db.length<.2){result.status='uncertain';return result;}
 result.status='ready';result.pitchMean=pitch.reduce((s,v)=>s+v,0)/pitch.length;result.pitchMedian=quantile(pitch,.5);result.pitchRange={low:quantile(pitch,.1),high:quantile(pitch,.9)};result.regularity=quantile(regular,.5);
 if(bandRows.length>=30)result.balance={percent:percent([0,1,2].map(i=>bandRows.reduce((s,r)=>s+r[i],0)/bandRows.length)),bandsHz:BANDS,basis:'tilt-corrected-band-rms-v1',engine:'device-fft-v1',frames:bandRows.length,phoneCalibrated:false};
 const level=quantile(voicedDb,.75),span=quantile(voicedDb,.9)-quantile(voicedDb,.1);result.level={state:level< -30?'soft':level> -10?'loud':'usable',levelDbFS:level,dynamicRangeDb:span,span:span<6?'narrow':'varied'};return result;
}

function detectLivePitch(input,sampleRate){const step=Math.max(1,Math.floor(sampleRate/8000)),rate=sampleRate/step,n=Math.floor(input.length/step),x=new Float32Array(n);let mean=0,power=0;for(let i=0;i<n;i++){let sum=0;for(let j=0;j<step;j++)sum+=input[i*step+j];x[i]=sum/step;mean+=x[i];}mean/=n;for(let i=0;i<n;i++){x[i]-=mean;power+=x[i]*x[i];}if(Math.sqrt(power/n)<.006)return null;const lo=Math.floor(rate/800),hi=Math.ceil(rate/65),w=Math.min(384,n-hi-2);if(w<160)return null;const d=new Float32Array(hi+2);for(let t=1;t<=hi+1;t++){let sum=0;for(let j=0;j<w;j++){const a=x[j]-x[j+t];sum+=a*a;}d[t]=sum;}let run=0;d[0]=1;for(let t=1;t<=hi+1;t++){run+=d[t];d[t]=run?d[t]*t/run:1;}let best=-1;for(let t=lo;t<=hi;t++){if(d[t]<.15){while(t<hi&&d[t+1]<d[t])t++;best=t;break;}}if(best<0)return null;const a=d[best-1],b=d[best],z=d[best+1],den=a-2*b+z,hz=rate/(best+(den?.5*(a-z)/den:0));return hz>=65&&hz<=800?hz:null;}

if(typeof module!=='undefined')module.exports={analyze,decodeWav,fftPower};
else self.onmessage=e=>{try{const {pcm,sr}=decodeWav(e.data);self.postMessage({metrics:analyze(pcm,sr)});}catch{self.postMessage({error:'이 음성을 분석하지 못했어요.'});}};
