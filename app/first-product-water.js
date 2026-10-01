// Existing SEMI transparent water/glass renderer, reused from the Sept 30 beta. MIT notice in licenses/.
const PALETTES={clear:{top:[164,164,161],bot:[87,89,89],line:[238,237,230],white:[220,219,211],glow:[255,252,243]}};
const Water=(()=>{
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),lerp=(a,b,t)=>a+(b-a)*t;
 const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
 let cv=$('water-surface'),gl=null,G=null,ctx=null,W=0,H=0,S=1,T=0,light=0;
 let V={ac:null,an:null},frequency=null,talking=false,voiceAt=0,inputAmount=0,volumeEnvelope=0,glowX=.5,glowY=.45,glowA=0,glowT=0;
 let flashes=[],edgeV=0,edgeT=0,journeyKey=null,progressValue=0,complete=false,sweep=0,sweepOn=false;
 let raf=0,last=0,acc=0,stage='first',guided=false,listenRatio=0,lightTarget=0,completion=-1,completionLight=0,completionAge=0;
 const motion=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;


 const palKey='clear';
 const palCur=structuredClone(PALETTES[palKey]);
 function stepPalette(dt){const t=PALETTES[palKey],k=motion()?1-Math.exp(-dt/.35):1;for(const key of ['top','bot','line','white','glow'])for(let i=0;i<3;i++)palCur[key][i]+= (t[key][i]-palCur[key][i])*k;}
const SPEED_PX = 125;
const BANDS = [
  { lo: 80,   hi: 170,  tilt: 0.06, hz: 1.1, n: 1, spread: 0,  gain: 2.3 },
  { lo: 170,  hi: 350,  tilt: 0,    hz: 1.7, n: 1, spread: 0,  gain: 2 },
  { lo: 350,  hi: 750,  tilt: 0.03, hz: 2.6, n: 1, spread: 6,  gain: 1.5 },
  { lo: 750,  hi: 1600, tilt: 0.12, hz: 3.9, n: 2, spread: 20, gain: 1.3 },
  { lo: 1600, hi: 3400, tilt: 0.22, hz: 5.9, n: 3, spread: 27, gain: 0.9 },
  { lo: 3400, hi: 7200, tilt: 0.30, hz: 9,   n: 4, spread: 35, gain: 1 }
];
BANDS.forEach(b => { b.e = 0; b.lam = 20; b.src = Array.from({ length: b.n }, () => ({ dx: 0, dy: 0, ph: Math.random() * 6.2832, t: 0 })); });
let bandX = 0.5, bandY = 0.45, bandRef = 0.45, gate = 0;
function bandTick(dt, f, talking){
  gate += ((talking ? 1 : 0) - gate) * (1 - Math.exp(-dt / (talking ? 0.03 : 0.18)));
  let lv = null;
  if (f && V.ac && V.an){
    const binHz = V.ac.sampleRate / V.an.fftSize; let peak = 0; lv = [];
    for (const b of BANDS){
      const i0 = Math.max(1, Math.round(b.lo / binHz)), i1 = Math.min(f.length, Math.max(i0 + 1, Math.round(b.hi / binHz)));
      let s = 0; for (let i = i0; i < i1; i++) s += f[i];
      const v = s / (i1 - i0) / 255 + b.tilt; lv.push(v); if (v > peak) peak = v;
    }
    if (talking) bandRef = Math.max(peak, bandRef);                  // 최근 가장 큰 소리를 기준으로
  }
  bandRef = Math.max(0.4, bandRef - dt * 0.05);
  BANDS.forEach((b, k) => {
    const target = lv ? gate * Math.pow(clamp((lv[k] - bandRef + 0.34) / 0.34, 0, 1), 1.2) : 0;
    b.e += (target - b.e) * (1 - Math.exp(-dt / (target > b.e ? 0.04 : 0.16)));
    for (const s of b.src){
      s.t -= dt;
      if (s.t <= 0 && b.e < 0.3){ s.dx = (Math.random() * 2 - 1) * b.spread / innerWidth; s.dy = (Math.random() * 2 - 1) * b.spread * 0.6 / innerHeight; s.t = 0.3 + Math.random() * 0.5; }
    }
  });
}
function bandForce(){                                                // 한 걸음마다: 대역마다 제 박자로 물결 고리를 내보낸다
  for (const b of BANDS){
    // A fixed dBFS envelope prevents quiet and loud takes from both being normalized to full ripples.
    // Wider crests and higher amplitude are an artistic mapping of loudness, not a physical acoustic wavelength.
    const size = 0.60 + volumeEnvelope * 1.65;
    const w = 2 * Math.PI * b.hz / (SPS * size), a = b.gain * b.e * (0.08 + volumeEnvelope * 1.35);
    for (const s of b.src){
      s.ph += w;
      if (s.ph < 2 * Math.PI) continue;
      s.ph -= 2 * Math.PI;
      if (a > 0.002) emitRing(bandX + s.dx, bandY + s.dy, b.lam * size, a);
    }
  }
}

/* ---------------- 물 표면: 높이장 파동 ---------------- */
let GW = 229, GH = 500, CELL = 1.7, SPS = 100, DAMP = 0.99, VISC = 0.02, A, B, D, D2, simCv = null, simCtx = null, img = null;
function initSim(){
  const oW = GW, oH = GH, oA = A, oB = B, oD = D;
  GW = Math.round(clamp(innerWidth / (gl ? 2 : 3), gl ? 160 : 100, gl ? 480 : 160));                // 대체 렌더러는 더 작은 격자로 모바일 부담을 줄인다
  GH = Math.round(clamp(GW * innerHeight / Math.max(1, innerWidth), 150, gl ? 720 : 360));
  A = new Float32Array(GW * GH); B = new Float32Array(GW * GH);
  D = new Float32Array(GW * GH).fill(1); D2 = new Float32Array(GW * GH);
  if (oA && oA.length === oW * oH){                                   // 화면 크기가 바뀌어도 물결과 어둠을 그대로 옮겨 담는다
    const move = (src, dst) => {
      for (let y = 0; y < GH; y++){
        const fy = y * (oH - 1) / Math.max(1, GH - 1), y0 = Math.floor(fy), y1 = Math.min(oH - 1, y0 + 1), ty = fy - y0;
        for (let x = 0; x < GW; x++){
          const fx = x * (oW - 1) / Math.max(1, GW - 1), x0 = Math.floor(fx), x1 = Math.min(oW - 1, x0 + 1), tx = fx - x0;
          dst[y * GW + x] = (src[y0 * oW + x0] * (1 - tx) + src[y0 * oW + x1] * tx) * (1 - ty) + (src[y1 * oW + x0] * (1 - tx) + src[y1 * oW + x1] * tx) * ty;
        }
      }
    };
    move(oA, A); move(oB, B); move(oD, D);
  }
  CELL = innerWidth / GW;
  SPS = SPEED_PX / CELL / Math.SQRT1_2;                               // 격자 한 걸음에 물결은 0.7칸 간다
  DAMP = Math.exp(Math.log(0.75) / SPS);                              // 긴 물결은 멀리 간다(1초에 75%로)
  VISC = 0.02 * 1.667 / CELL;                                         // 짧은 물결일수록 빨리 잦아든다(물의 끈기)
  for (const b of BANDS) b.lam = Math.max(6, SPEED_PX / b.hz / CELL); // 그 대역의 파장(칸)
  if (gl) glSize(); else make2DSim();
}
function make2DSim(){ simCv = document.createElement("canvas"); simCv.width = GW; simCv.height = GH; simCtx = simCv.getContext("2d"); img = simCtx.createImageData(GW, GH); }
function step(){
  const g = GW, d = DAMP, a = A, b = B;
  for (let y = 1; y < GH - 1; y++){
    let i = y * g + 1;
    for (let x = 1; x < g - 1; x++, i++) b[i] = ((a[i - 1] + a[i + 1] + a[i - g] + a[i + g]) * 0.5 - b[i]) * d;
  }
  const last = (GH - 1) * g;                                          // 가장자리는 벽 대신 열린 물처럼(기울기 0)
  for (let x = 0; x < g; x++){ b[x] = b[x + g]; b[last + x] = b[last - g + x]; }
  for (let y = 0; y < GH; y++){ const i = y * g; b[i] = b[i + 1]; b[i + g - 1] = b[i + g - 2]; }
  const M = SPONGE.length;                                            // 가장자리 띠에서 물결을 삼켜 되튀지 않게 한다
  for (let y = 0; y < GH; y++){
    const row = y * g, fy = y < M ? SPONGE[y] : y >= GH - M ? SPONGE[GH - 1 - y] : 1;
    if (fy < 1){ for (let x = 0; x < g; x++){ const fx = x < M ? SPONGE[x] : x >= g - M ? SPONGE[g - 1 - x] : 1; b[row + x] *= fx < fy ? fx : fy; } }
    else { for (let x = 0; x < M; x++){ b[row + x] *= SPONGE[x]; b[row + g - 1 - x] *= SPONGE[x]; } }
  }
  A = b; B = a;
}
const SPONGE = Float32Array.from({ length: 18 }, (_, e) => 1 - 0.1 * Math.pow((18 - e) / 18, 2));
function soften(eps){
  const a = A, b = B, g = GW;
  for (let y = 1; y < GH - 1; y++){
    let i = y * g + 1;
    for (let x = 1; x < g - 1; x++, i++){
      a[i] += eps * (a[i - 1] + a[i + 1] + a[i - g] + a[i + g] - 4 * a[i]);
      b[i] += eps * (b[i - 1] + b[i + 1] + b[i - g] + b[i + g] - 4 * b[i]);
    }
  }
}
function emitRing(x, y, lam, amp){                                   // 바깥으로 퍼져 나가는 물결 고리 하나(파장 lam칸)
  const cx = x * GW, cy = y * GH, R0 = 0.5 * lam, sr = 0.28 * lam, k = 2 * Math.PI / lam, is2 = 1 / (sr * sr), R = R0 + 2 * sr, R2 = R * R;
  const rin = 0.1 * lam, rw = 0.25 * lam;                            // 한가운데는 비워 둔다(물결이 가운데로 모여 뾰족해지지 않게)
  const x0 = Math.max(1, Math.floor(cx - R)), x1 = Math.min(GW - 2, Math.ceil(cx + R));
  const y0 = Math.max(1, Math.floor(cy - R)), y1 = Math.min(GH - 2, Math.ceil(cy + R));
  for (let yy = y0; yy <= y1; yy++){
    const dy = yy - cy;
    for (let xx = x0; xx <= x1; xx++){
      const dx = xx - cx, d2 = dx * dx + dy * dy;
      if (d2 >= R2) continue;
      const i = yy * GW + xx, r = Math.sqrt(d2), u = r - R0, v = u + Math.SQRT1_2;   // 한 걸음 전에는 조금 안쪽에 있었다 → 바깥으로 간다
      const ta = smooth(0, 1, (r - rin) / rw), tb = smooth(0, 1, (r + Math.SQRT1_2 - rin) / rw);
      A[i] += amp * ta * Math.cos(k * u) * Math.exp(-u * u * is2);
      B[i] += amp * tb * Math.cos(k * v) * Math.exp(-v * v * is2);
    }
  }
}
function ring(x, y, lamPx, amp){ emitRing(x, y, Math.max(6, lamPx / CELL), amp); }   // lamPx: 파장(화면 px)
function clearAround(x, y, r, k){
  const cx = x * GW, cy = y * GH, R = r * GW;
  for (let yy = 0; yy < GH; yy++) for (let xx = 0; xx < GW; xx++){
    const d = Math.hypot(xx - cx, yy - cy);
    if (d < R){ const i = yy * GW + xx; D[i] *= 1 - k * (1 - d / R); }
  }
}
const THR = 0.12;                                                    // 이보다 잔잔한 물결은 어둠을 건드리지 않는다
let dFrame = 0;
function updateDark(dt, cap, sweep, gain){
  const g = GW, n = g * GH;
  if (sweep > 0){
    const cx = GW * 0.5, cy = GH * 0.42, R = sweep * Math.max(GW, GH), k = Math.pow(0.02, dt);
    for (let yy = 0; yy < GH; yy++) for (let xx = 0; xx < GW; xx++){
      if (Math.hypot(xx - cx, yy - cy) < R) D[yy * GW + xx] *= k;
    }
  }
  if (gain > 0){                                                      // 목소리 물결이 지나간 자리는 맑아진다
    const c = CELL / 1.667, thr = THR * c, k = gain * dt / c;
    for (let y = 1; y < GH - 1; y++){
      let i = y * g + 1;
      for (let x = 1; x < g - 1; x++, i++){
        const m = Math.abs(A[i + 1] - A[i - 1]) + Math.abs(A[i + g] - A[i - g]) - thr;
        if (m > 0){ const v = D[i] - m * k; D[i] = v < 0 ? 0 : v; }
      }
    }
  }
  if (cap < 1) for (let i = 0; i < n; i++) if (D[i] > cap) D[i] = cap;
  if (++dFrame % 3 === 0){
    for (let y = 1; y < GH - 1; y++){ let i = y * g + 1; for (let x = 1; x < g - 1; x++, i++) D2[i] = (D[i] * 4 + D[i - 1] + D[i + 1] + D[i - g] + D[i + g]) * 0.125; }
    for (let y = 1; y < GH - 1; y++){ let i = y * g + 1; for (let x = 1; x < g - 1; x++, i++) D[i] = D2[i]; }
  }
}

/* ---------------- 그래픽 칩으로 그리기 ----------------
   높이를 부드럽게(3차) 이어서 한 화소마다 물결의 기울기를 구한다.
   → 잔잔할 때는 물빛 색만. 물결이 지나갈 때만 은은한 명암과 윤기, 먹이 풀리듯 번지는 어둠,
     테두리 스펙트럼 띠까지 한 번에 그린다. 버튼은 DOM에서만 그린다. */
const EN = 48, edgeE = new Float32Array(EN), edgeB = new Uint8Array(EN);
const VS = "#version 300 es\nin vec2 aP;\nvoid main(){ gl_Position = vec4(aP, 0.0, 1.0); }";
const FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uH, uD, uE;
uniform vec2 uRes, uSim;
uniform float uPx, uTime, uLight, uCs, uCompletion;
uniform vec3 uTop, uBot, uWhite, uGlowC;
uniform vec4 uGlow, uEdge;
uniform vec4 uFl[3];
out vec4 outC;

float hash(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.9375; }

vec4 bsw(float t){ float t2 = t * t, t3 = t2 * t; return vec4(1.0 - 3.0 * t + 3.0 * t2 - t3, 4.0 - 6.0 * t2 + 3.0 * t3, 1.0 + 3.0 * t + 3.0 * t2 - 3.0 * t3, t3) / 6.0; }
float hC(vec2 uv){
  vec2 st = uv * uSim - 0.5, i = floor(st), f = st - i;
  vec4 wx = bsw(f.x), wy = bsw(f.y);
  vec2 g0 = vec2(wx.x + wx.y, wy.x + wy.y), g1 = vec2(wx.z + wx.w, wy.z + wy.w);
  vec2 p0 = (i - 0.5 + vec2(wx.y, wy.y) / g0) / uSim, p1 = (i + 1.5 + vec2(wx.w, wy.w) / g1) / uSim;
  return g0.y * (g0.x * texture(uH, p0).r + g1.x * texture(uH, vec2(p1.x, p0.y)).r)
       + g1.y * (g0.x * texture(uH, vec2(p0.x, p1.y)).r + g1.x * texture(uH, p1).r);
}

vec3 water(vec2 p, out float dk){
  vec2 uv = p / uRes, tx = 1.0 / uSim;
  float hl = hC(uv - vec2(tx.x, 0.0)), hr = hC(uv + vec2(tx.x, 0.0)), hu = hC(uv - vec2(0.0, tx.y)), hd = hC(uv + vec2(0.0, tx.y));
  vec2 g = vec2(hr - hl, hd - hu) * 0.5 * uCs;
  vec3 col = mix(uTop, uBot, smoothstep(-0.15, 1.1, uv.y));          // 잔잔할 때는 물빛 색뿐
  // 물결이 지나갈 때만: 빛을 받는 쪽은 밝고 반대쪽은 그늘진다(색은 그대로, 밝기만)
  float tilt = clamp(dot(g, vec2(-0.55, -0.83)) * 2.2, -0.6, 0.6);
  col *= 1.0 + tilt * 0.9;
  vec3 n = normalize(vec3(-g * 6.0, 1.0)), Lh = normalize(vec3(-0.26, -0.36, 0.9));
  float nh = max(dot(n, Lh), 0.0);
  float sheen = max(pow(nh, 60.0) - pow(Lh.z, 60.0), 0.0) * 0.35 + max(pow(nh, 12.0) - pow(Lh.z, 12.0), 0.0) * 0.06;
  col += vec3(sheen);
  // Neutral daylight drifts gently; ripples come only from voice and touch.
  vec2 through = uv + g * 0.075 + vec2(sin(uv.y*5.0+uTime*0.22),cos(uv.x*6.0-uTime*0.17))*0.022;
  float daylight = 0.985+0.015*sin(through.x*5.0-through.y*4.0+uTime*0.24);
  float opening = smoothstep(0.15, 1.0, uLight);
  vec3 litTop = mix(uWhite, vec3(0.975,0.973,0.960), opening);
  vec3 litBottom = mix(uBot, vec3(0.915,0.919,0.912), opening);
  vec3 transmitted = mix(litTop,litBottom,smoothstep(-0.2,1.3,through.y))*daylight;
  col = mix(col,transmitted*(1.0+tilt*0.12),0.30+uLight*0.70)+vec3(sheen)*0.2;

  float d = texture(uD, uv).r;
  float e = d * (1.0 - d) * 4.0;
  float nz = fbm(p / (uPx * 80.0) + vec2(uTime * 0.035, -uTime * 0.025));
  d = clamp(d + (nz - 0.5) * 0.7 * e, 0.0, 1.0);
  vec3 ink = mix(vec3(0.014,0.015,0.018),vec3(0.075,0.076,0.078),e*0.5)+(nz-0.5)*0.008;
  col = mix(col, ink, d * 0.97);
  // Voice/touch highlights remain visible over the dark water without completing the light.
  col += vec3(sheen * 0.7 + abs(tilt) * 0.09) * d;
  dk = d;
  return col;
}

vec3 lights(vec2 p){
  vec3 c = vec3(0.0);
  if (uGlow.w > 0.01){ float d = length(p - uGlow.xy) / uGlow.z; c += uGlowC * uGlow.w * 0.36 * pow(max(1.0 - d, 0.0), 1.5); }
  for (int i = 0; i < 3; i++){
    vec4 f = uFl[i];
    if (f.w > 0.001){ float d = length(p - f.xy) / f.z; c += vec3(0.92, 0.98, 1.0) * f.w * max(1.0 - d, 0.0); }
  }
  if(uCompletion >= 0.0 && uCompletion < 1.0){
    float radius = uCompletion * length(uRes);
    float distance = length(p - uRes * vec2(0.5, 0.44));
    float wave = exp(-pow((distance-radius)/(uRes.y*0.16),2.0));
    c += vec3(0.18) * wave * pow(sin(3.14159265*uCompletion),2.0);
  }
  return c;
}

vec3 hsl2rgb(float h, float s, float l){
  vec3 k = mod(vec3(0.0, 8.0, 4.0) + h * 12.0, 12.0);
  float a = s * min(l, 1.0 - l);
  return l - a * clamp(min(k - 3.0, 9.0 - k), -1.0, 1.0);
}
float hueAt(float p){
  float h = p < 0.35 ? mix(42.0, -20.0, p / 0.35) : p < 0.62 ? mix(-20.0, -90.0, (p - 0.35) / 0.27) : mix(-90.0, -172.0, (p - 0.62) / 0.38);
  return fract(h / 360.0 + 1.0);
}
vec3 edgeBand(vec2 p){
  float a = uEdge.z;
  if (a < 0.01) return vec3(0.0);
  float m = uEdge.x, r = uEdge.y;
  vec2 c = uRes * 0.5, hs = c - m, d = p - c, k = abs(d) - (hs - r);
  float sd = length(max(k, 0.0)) + min(max(k.x, k.y), 0.0) - r;
  float dist = abs(sd);
  if (dist > 44.0 * uPx) return vec3(0.0);
  float X = c.x - abs(d.x), Y = p.y, L0 = m, T0 = m, B0 = uRes.y - m;
  float l1 = max(c.x - (L0 + r), 0.0), l2 = max((B0 - r) - (T0 + r), 0.0), P = 2.0 * l1 + l2 + 3.14159265 * r;
  float s;
  if (X < L0 + r && Y > B0 - r){ float th = atan(Y - (B0 - r), X - (L0 + r)); s = l1 + r * (clamp(th, 1.5707963, 3.14159265) - 1.5707963); }
  else if (X < L0 + r && Y < T0 + r){ float th = atan(min(Y - (T0 + r), -0.0001), X - (L0 + r)); s = l1 + 1.5707963 * r + l2 + r * (clamp(th, -3.14159265, -1.5707963) + 3.14159265); }
  else {
    float dL = X - L0, dB = B0 - Y, dT = Y - T0;
    if (dL <= dB && dL <= dT) s = l1 + 1.5707963 * r + clamp(B0 - r - Y, 0.0, l2);
    else if (dB < dT) s = clamp(c.x - X, 0.0, l1);
    else s = l1 + 3.14159265 * r + l2 + clamp(X - (L0 + r), 0.0, l1);
  }
  float pp = clamp(s / P, 0.0, 1.0);
  float e = texture(uE, vec2(pp * (47.0 / 48.0) + 0.5 / 48.0, 0.5)).r;
  float sh = 0.85 + 0.15 * sin(uTime * 2.2 + pp * 17.0 + step(0.0, d.x) * 1.7);
  float amp = a * (0.16 + 0.84 * e) * sh;
  float core = (0.9 + 1.4 * e) * uPx, halo = (8.0 + 12.0 * e) * uPx;
  float gl = 0.55 * exp(-(dist * dist) / (core * core)) + 0.42 * exp(-(dist * dist) / (halo * halo));
  return hsl2rgb(hueAt(pp), 0.9, 0.62) * amp * gl;
}

void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float dk = 0.0;
  vec3 col = water(p, dk) + lights(p) + edgeBand(p) * (1.0 - 0.5 * uLight);
  col += (hash(p + fract(uTime * 7.31) * 91.7) - 0.5) / 255.0;
  outC = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
function initGL(){
  let g = null;
  try { g = cv.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }); } catch (e){ g = null; }
  if (!g) return false;
  cv.dataset.gl = "1"; cv.dataset.renderer="webgl2";
  const sh = (type, src) => { const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); if (!g.getShaderParameter(s, g.COMPILE_STATUS)){ console.warn(g.getShaderInfoLog(s)); return null; } return s; };
  const vs = sh(g.VERTEX_SHADER, VS), fs = sh(g.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return false;
  const pr = g.createProgram(); g.attachShader(pr, vs); g.attachShader(pr, fs); g.bindAttribLocation(pr, 0, "aP"); g.linkProgram(pr);
  if (!g.getProgramParameter(pr, g.LINK_STATUS)){ console.warn(g.getProgramInfoLog(pr)); return false; }
  g.useProgram(pr);
  const buf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, buf); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
  g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
  const u = {}, nu = g.getProgramParameter(pr, g.ACTIVE_UNIFORMS);
  for (let i = 0; i < nu; i++){ const info = g.getActiveUniform(pr, i); u[info.name.replace(/\[0\]$/, "")] = g.getUniformLocation(pr, info.name); }
  const tex = unit => {
    const t = g.createTexture(); g.activeTexture(g.TEXTURE0 + unit); g.bindTexture(g.TEXTURE_2D, t);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    return t;
  };
  G = { u, tH: tex(0), tD: tex(1), tE: tex(2), fl: new Float32Array(12) };
  g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
  g.activeTexture(g.TEXTURE2); g.texImage2D(g.TEXTURE_2D, 0, g.R8, EN, 1, 0, g.RED, g.UNSIGNED_BYTE, null);
  g.uniform1i(u.uH, 0); g.uniform1i(u.uD, 1); g.uniform1i(u.uE, 2);
  gl = g;
  cv.addEventListener("webglcontextlost", e => { e.preventDefault(); use2D(); resize(); });
  return true;
}
function glSize(){
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.tH); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, GW, GH, 0, gl.RED, gl.FLOAT, null);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.tD); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, GW, GH, 0, gl.RED, gl.FLOAT, null);
  if(gl.getError()!==gl.NO_ERROR){use2D();initSim();}
}
function use2D(){
  if (cv.dataset.gl){ const c2 = document.createElement("canvas"); c2.id = "water-surface"; c2.setAttribute("aria-hidden", "true"); cv.replaceWith(c2); cv = c2; }
  gl = null; G = null;
  cv.width=W;cv.height=H;ctx = cv.getContext("2d", { alpha: false });cv.dataset.renderer="canvas2d";document.body.dataset.waterRenderer="canvas2d";buildEdge();
}
function renderGL(){
  const g = gl, u = G.u;
  g.viewport(0, 0, W, H);
  g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, G.tH); g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, GW, GH, g.RED, g.FLOAT, A);
  g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, G.tD); g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, GW, GH, g.RED, g.FLOAT, D);
  g.activeTexture(g.TEXTURE2); g.bindTexture(g.TEXTURE_2D, G.tE); g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, EN, 1, g.RED, g.UNSIGNED_BYTE, edgeB);
  g.uniform2f(u.uRes, W, H); g.uniform2f(u.uSim, GW, GH); g.uniform1f(u.uPx, S); g.uniform1f(u.uTime, T % 3600); g.uniform1f(u.uLight, light); g.uniform1f(u.uCompletion, completion); g.uniform1f(u.uCs, 1.667 / CELL);
  const c3 = (loc, v) => g.uniform3f(loc, v[0] / 255, v[1] / 255, v[2] / 255);
  c3(u.uTop, palCur.top); c3(u.uBot, palCur.bot); c3(u.uWhite, palCur.white); c3(u.uGlowC, palCur.glow);
  g.uniform4f(u.uGlow, glowX * W, glowY * H, 95 * S, glowA);
  G.fl.fill(0);
  flashes.slice(-3).forEach((f, i) => G.fl.set([f.x * W, f.y * H, (0.1 + f.t * 0.55) * Math.max(W, H), (1 - f.t / 1.6) * 0.55], i * 4));
  g.uniform4fv(u.uFl, G.fl);
  g.uniform4f(u.uEdge, 3 * S, 46 * S, edgeV, 0);
  g.drawArrays(g.TRIANGLES, 0, 3);
}

/* ---------------- 2D 캔버스로 그리기(그래픽 칩을 못 쓸 때) ---------------- */
function shade(light){
  const d=img.data,PT=palCur.top,PB=palCur.bot,PW=palCur.white,cs=0.5*1.667/CELL,opening=smooth(.15,1,light);
  for(let y=0;y<GH;y++){
    const up=y>0?-GW:0,dn=y<GH-1?GW:0,fy=y/GH,depth=smooth(-.15,1.1,fy);
    for(let x=0;x<GW;x++){
      const i=y*GW+x,lf=x>0?-1:0,rt=x<GW-1?1:0,fx=x/GW;
      const gx=(A[i+rt]-A[i+lf])*cs;
      const gy=(A[i+dn]-A[i+up])*cs;
      const tilt=clamp((-gx*.55-gy*.83)*2.2,-.6,.6);
      const tx=fx+gx*.075+Math.sin(fy*5+T*.22)*.022,ty=fy+gy*.075+Math.cos(fx*6-T*.17)*.022;
      const daylight=.985+.015*Math.sin(tx*5-ty*4+T*.24);
      const top=[248.6,248.1,244.8],bottom=[233.3,234.3,232.6],k=D[i]*.97;
      for(let c=0;c<3;c++){
        const deep=lerp(PT[c],PB[c],depth)*(1+tilt*.9);
        const through=lerp(lerp(PW[c],top[c],opening),lerp(PB[c],bottom[c],opening),smooth(-.2,1.3,ty))*daylight;
        d[i*4+c]=lerp(lerp(deep,through*(1+tilt*.12),.30+light*.70),[3.57,3.83,4.59][c],k)+Math.abs(tilt)*23*D[i];
      }
      d[i*4+3]=255;
    }
  }
  simCtx.putImageData(img,0,0);
}

let edgePts = [];
function buildEdge(){
  const m = 3 * S, w = W - 2 * m, h = H - 2 * m, r = Math.min(46 * S, w / 2, h / 2);
  const pts = [], stepLen = 3 * S;
  const seg = (x0, y0, x1, y1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / stepLen)); for (let i = 0; i < n; i++) pts.push([lerp(x0, x1, i / n), lerp(y0, y1, i / n)]); };
  const arc = (cx, cy, a0, a1) => { const n = Math.max(2, Math.round(Math.abs(a1 - a0) * r / stepLen)); for (let i = 0; i < n; i++){ const a = lerp(a0, a1, i / n); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  const L0 = m, T0 = m, R0 = m + w, B0 = m + h;
  seg(W / 2, B0, L0 + r, B0); arc(L0 + r, B0 - r, Math.PI / 2, Math.PI);
  seg(L0, B0 - r, L0, T0 + r); arc(L0 + r, T0 + r, Math.PI, Math.PI * 1.5);
  seg(L0 + r, T0, R0 - r, T0); arc(R0 - r, T0 + r, -Math.PI / 2, 0);
  seg(R0, T0 + r, R0, B0 - r); arc(R0 - r, B0 - r, 0, Math.PI / 2);
  seg(R0 - r, B0, W / 2, B0);
  edgePts = pts;
}
function hsl(h, s, l){
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const HUES = [[0, 42], [0.35, 340], [0.62, 270], [1, 188]];
function hueAt(p){
  for (let k = 1; k < HUES.length; k++){
    if (p <= HUES[k][0]){
      let a = HUES[k - 1][1], b = HUES[k][1];
      if (Math.abs(b - a) > 180){ if (a < b) a += 360; else b += 360; }
      return ((lerp(a, b, (p - HUES[k - 1][0]) / (HUES[k][0] - HUES[k - 1][0])) % 360) + 360) % 360;
    }
  }
  return 188;
}
const edgeAt = p => { const x = clamp(p, 0, 1) * (EN - 1), i = Math.min(EN - 2, Math.floor(x)); return lerp(edgeE[i], edgeE[i + 1], x - i); };
function drawEdge(T){
  if (edgeV < 0.01 || !edgePts.length) return;
  const N = 96, M = edgePts.length;
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "butt"; ctx.lineJoin = "round";
  for (let pass = 0; pass < 2; pass++){
    if ("filter" in ctx) ctx.filter = pass === 0 ? `blur(${(7 * S).toFixed(1)}px)` : "none";
    for (let k = 0; k < N; k++){
      const s = (k + 0.5) / N, p = (s <= 0.5 ? s : 1 - s) * 2, e = edgeAt(p), shimmer = 0.85 + 0.15 * Math.sin(T * 2.2 + k * 0.35);
      const a = edgeV * (0.16 + 0.84 * e) * shimmer * (pass === 0 ? 0.7 : 0.55);
      if (a < 0.01) continue;
      const [r, g, b] = hsl(hueAt(p) / 360, 0.9, 0.62);
      ctx.strokeStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.lineWidth = (pass === 0 ? 10 + 18 * e : 1.5 + 2.5 * e) * S;
      const i0 = Math.floor(k * M / N), i1 = Math.min(M - 1, Math.floor((k + 1) * M / N) + 2);
      ctx.beginPath(); ctx.moveTo(edgePts[i0][0], edgePts[i0][1]);
      for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(edgePts[i][0], edgePts[i][1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}
function render2D(){
  shade(light);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(simCv, 0, 0, W, H);
  for (const fl of flashes){
    const R = (0.1 + fl.t * 0.55) * Math.max(W, H), a = (1 - fl.t / 1.6) * 0.55;
    const g = ctx.createRadialGradient(fl.x * W, fl.y * H, 0, fl.x * W, fl.y * H, R);
    g.addColorStop(0, `rgba(235,250,255,${a.toFixed(3)})`); g.addColorStop(1, "rgba(235,250,255,0)");
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  if (glowA > 0.02){
    const R = 95 * S, x = glowX * W, y = glowY * H, P = palCur.glow.map(Math.round);
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `rgba(${P},${(0.36 * glowA).toFixed(3)})`); g.addColorStop(1, `rgba(${P},0)`);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2); ctx.restore();
  }
  drawEdge(T);
}

function edgeTick(f){
  const binHz = V.ac && V.an ? V.ac.sampleRate / V.an.fftSize : 23;
  for (let k = 0; k < EN; k++){
    let e = 0;
    if (f){ const bin = clamp(Math.round(90 * Math.pow(5500 / 90, k / (EN - 1)) / binHz), 1, f.length - 2); e = clamp(((f[bin - 1] + f[bin] + f[bin + 1]) / 765 - 0.3) / 0.55, 0, 1); }
    edgeE[k] = e > edgeE[k] ? lerp(edgeE[k], e, 0.5) : edgeE[k] * 0.92;
    edgeB[k] = Math.round(edgeE[k] * 255);
  }
}


 function resize(){S=Math.min(devicePixelRatio||1,2,Math.sqrt(1200000/(innerWidth*innerHeight)));W=Math.round(innerWidth*S);H=Math.round(innerHeight*S);cv.width=W;cv.height=H;initSim();if(ctx)buildEdge();wake();}
 function setStage(next){stage=next;document.body.dataset.waterStage=stage;cv.dataset.stage=stage;}
 function begin(s){if(s.kind!=='read')return;journeyKey=s.attempt;complete=false;inputAmount=0;volumeEnvelope=0;progressValue=Math.min(.88,VoicePractice.clarity(s.waterSeconds));listenRatio=0;A?.fill(0);B?.fill(0);edgeE.fill(0);edgeB.fill(0);BANDS.forEach(b=>b.e=0);setStage('first');cv.dataset.phase='ink';wake();}
 function sound(s){if(s.kind!=='read'||s.attempt!==journeyKey)return;progressValue=Math.max(progressValue,Math.min(.88,VoicePractice.clarity(((s.waterSeconds||0)+(s.voiceSeconds||0))*1.5)));cv.dataset.phase=complete?'clear':progressValue?'opening':'ink';document.body.dataset.readingPhase=cv.dataset.phase;wake();}
 function finish(){if(complete)return;complete=true;completionAge=0;progressValue=1;completionLight=light;cv.dataset.phase='clear';document.body.dataset.readingPhase='clear';if(motion()){ring(.5,.44,65,.7);}setStage('clear');wake();}
 function reading(ratio){const p=clamp(Number(ratio)||0,0,1);progressValue=Math.max(progressValue,p);wake();}
 function playback(r,ratio){if(state.view!=='result')return;listenRatio=Math.max(listenRatio,ratio);cv.dataset.listenProgress=listenRatio.toFixed(3);wake();}
 function refresh(){
  const session=state.capture?.session;
  if(session){if(session.attempt!==journeyKey)begin(session);else setStage('first');}
  else if(state.view==='done'&&state.current?.completedAt){finish();}
  else if(state.view==='result'&&state.current){
   complete=false;completionAge=0;
   progressValue=Math.max(state.current.readingProgress||0,Math.min(.88,VoicePractice.clarity((state.current.waterSeconds||state.current.voicedSeconds||0)*1.5)));
   setStage('listen');
  }else{progressValue=0;complete=false;completionAge=0;journeyKey=null;listenRatio=0;cv.dataset.phase='ink';document.body.dataset.readingPhase='ink';setStage(state.view==='welcome'?'welcome':'rest');}
  wake();
 }

 function voice(r,rms){V.ac=r.ac;V.an=r.an;voiceAt=performance.now();const level=VoicePractice.inputLevel(rms);inputAmount=level.amount;talking=inputAmount>0;cv.dataset.inputDbfs=level.db===null?'silent':level.db.toFixed(1);if(!frequency||frequency.length!==r.an.frequencyBinCount)frequency=new Uint8Array(r.an.frequencyBinCount);r.an.getByteFrequencyData(frequency);const el=document.querySelector('.capture button')||document.querySelector('.reading-card')||document.querySelector('.primary');if(el){const box=el.getBoundingClientRect();bandX=clamp((box.left+box.width/2)/innerWidth,.15,.85);bandY=clamp((box.top+box.height/2)/innerHeight,.2,.8);glowX=bandX;glowY=bandY;}cv.dataset.waveOrigin=`${bandX.toFixed(2)},${bandY.toFixed(2)}`;wake();}
 function frame(now){raf=0;if(document.hidden)return;if(motion()&&matchMedia('(pointer: coarse)').matches&&last&&now-last<32){raf=requestAnimationFrame(frame);return;}const dt=Math.min(.05,last?(now-last)/1000:.016);last=now;T+=dt;
 const active=!!(state.capture||glassPlayback||['tuning','mouth'].includes(state.view))&&now-voiceAt<400,f=active?frequency:null,speaking=active&&talking;
 const targetVolume=speaking?inputAmount:0;volumeEnvelope+=(targetVolume-volumeEnvelope)*(1-Math.exp(-dt/(targetVolume>volumeEnvelope?.07:.24)));cv.dataset.waveStrength=volumeEnvelope.toFixed(3);cv.dataset.waveWidth=(.60+volumeEnvelope*1.65).toFixed(3);
 if(complete)completionAge+=dt;completion=complete?completionAge/4.2:-1;
 lightTarget=complete?1:Math.min(1,progressValue)*.42;if(complete){light=motion()?lerp(completionLight,1,smooth(0,1,completion)):1;}else light+=(lightTarget-light)*(motion()?1-Math.exp(-dt/1.4):1);if(Math.abs(lightTarget-light)<.001)light=lightTarget;const cap=1-light;
 const uiMix=smooth(.48,.85,light);document.body.style.setProperty('--water-ui',(uiMix*100).toFixed(2)+'%');document.body.style.setProperty('--water-logo-opacity',uiMix.toFixed(3));document.body.dataset.waterTone=light>.85?'luminous':light>.45?'clear':'dark';cv.dataset.completion=completion.toFixed(3);cv.dataset.darkness=cap.toFixed(3);cv.dataset.light=light.toFixed(3);cv.dataset.clarity=progressValue.toFixed(3);
 if(motion()){bandTick(dt,f,speaking);edgeTick(f);acc+=dt*SPS;let n=0;while(acc>=1&&n<8){bandForce();step();acc--;n++;}if(acc>2)acc=0;if(n)soften(Math.min(.2,VISC*n));updateDark(dt,cap,completion>=0&&completion<1?completion*1.4:0,progressValue>0&&speaking?2.2:0);for(let i=0;i<D.length;i++)D[i]=Math.max(cap*.9,D[i]);}
 else{D.fill(cap);edgeV=0;glowA=0;}
 if(light===0&&progressValue===0)D.fill(1);

 edgeT=active?(speaking?.1+.9*volumeEnvelope:.04):0;edgeV+=(edgeT-edgeV)*(1-Math.exp(-dt/.25));glowT=Math.max(speaking?.1+.9*volumeEnvelope:0,glowT*Math.exp(-dt*1.2));glowA+=(glowT-glowA)*(1-Math.exp(-dt/.25));stepPalette(dt);
 flashes.forEach(f=>f.t+=dt);flashes=flashes.filter(f=>f.t<1.6);if(!motion())flashes=[];
 if(gl)renderGL();else render2D();if(motion())raf=requestAnimationFrame(frame);
 }
 function wake(){if(!raf&&!document.hidden){last=0;raf=requestAnimationFrame(frame);}}
 if(!initGL())use2D();document.body.dataset.waterRenderer=cv.dataset.renderer;resize();refresh();document.addEventListener('pointerdown',e=>{if(!motion()||e.target.closest('input,textarea,select,dialog,audio'))return;ring(e.clientX/innerWidth,e.clientY/innerHeight,27,1.2);wake();},{passive:true});
 window.addEventListener('resize',resize,{passive:true});window.visualViewport?.addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else wake();});matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{A.fill(0);B.fill(0);wake();});
 return {begin,sound,reading,finish,playback,voice,refresh,wake,previewPulse(){if(motion())ring(.5,.5,65,1.2);wake();},quiet(){V.ac=null;V.an=null;frequency=null;talking=false;inputAmount=0;wake();}};
})();
