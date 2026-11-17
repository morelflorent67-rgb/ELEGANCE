// COPIE des programmes graphiques VS et FS de src/lib/eclipse.ts du site (un test du site vérifie qu'ils sont
// identiques). Ne les modifier qu'en modifiant l'original, puis recopier.
export const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

export const FS = `
precision highp float;
uniform vec2  uRes;
uniform float uScale;
uniform vec2  uOffset;
uniform float uTime;
uniform float uMotion;
uniform float uGlow;
uniform float uBreathPeriod, uBreathMin, uCoreMin;

const vec2  C0  = vec2(571.53, 862.64);
const float TH0 = -0.75136;
const vec2  R0  = vec2(907.69, 485.15);

float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
}
float band(float x, float a0, float a1, float b0, float b1){
  return smoothstep(a0,a1,x) * (1.0 - smoothstep(b0,b1,x));
}
void profile(float d, float dd, float wf, out float core, out float halo){
  float ad = abs(d);
  core = exp(-ad/1.3) + 0.25*exp(-ad/3.5);
  halo = dd > 0.0
    ? 1.05*exp(-dd/(15.0*wf)) + 0.60*exp(-dd/(50.0*wf)) + 0.10*exp(-dd/(160.0*wf))
    : 0.85*exp(-ad/(5.0*wf))  + 0.24*exp(-ad/(22.0*wf)) + 0.06*exp(-ad/(110.0*wf));
}
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p  = (fc - uOffset) / uScale;
  float t = uTime, m = uMotion;

  float th = TH0 + m*0.055*sin(t*0.16);
  vec2  r  = R0 * (1.0 + m*0.018*sin(t*0.27 + 1.3));
  vec2  c  = C0 + m*vec2(16.0*sin(t*0.13), 14.0*cos(t*0.11));
  vec2 dp = p - c;
  float cs = cos(th), sn = sin(th);
  vec2 q = vec2(dp.x*cs + dp.y*sn, -dp.x*sn + dp.y*cs);
  float k0 = length(q/r), k1 = length(q/(r*r));
  float d  = k0*(k0-1.0)/k1;
  float ang = degrees(atan(q.y/r.y, q.x/r.x));

  float s1 = m*11.0*sin(t*0.21), s2 = m*9.0*sin(t*0.18 + 2.0);
  float wTop = band(ang, -119.0+s1, -92.0+s1, -34.0+s2, -6.0+s2);
  float wBot = band(ang,   66.0-s2,  90.0-s2, 112.0+s1, 143.0+s1);

  float along = 0.72 + 0.28*sin(radians(ang)*6.0 - t*0.9*m);
  along = mix(1.0, along, m);
  float pTop = mix(0.0, -130.0, fract(t*0.075));
  float pBot = mix(148.0, 60.0, fract(t*0.065 + 0.45));
  float spTop = 1.0 + m*0.9*exp(-pow((ang-pTop)/11.0, 2.0));
  float spBot = 1.0 + m*0.9*exp(-pow((ang-pBot)/10.0, 2.0));
  float ph = fract(t / uBreathPeriod);
  float br = 0.5 - 0.5*cos(6.2831853*ph);
  br = br*br*(3.0 - 2.0*br);
  br = mix(1.0, br, step(0.001, m));
  float haloAmp = mix(uBreathMin, 1.0, br);
  float coreAmp = mix(uCoreMin, 1.0, smoothstep(0.0, 0.8, br));
  float wb = mix(1.0, 0.65 + 0.45*br, step(0.001, m));

  float cT, hT, cB, hB;
  profile(d,  d, (0.45 + 0.55*wTop)*wb, cT, hT);
  profile(d, -d, (0.45 + 0.55*wBot)*wb, cB, hB);

  float streak = vnoise(vec2(ang*3.5 + t*0.6*m, d*0.015 - t*0.12*m));
  streak = mix(0.93 + 0.14*streak, 0.78 + 0.44*streak, m);

  float wT = wTop*spTop, wB = wBot*spBot;
  float core = (cT*wT*wT + cB*wB*wB) * along * coreAmp;
  float halo = (hT*wT + 1.35*hB*wB) * along * haloAmp * streak * uGlow;

  vec3 bg = vec3(0.0, 13.0, 30.0)/255.0;
  vec2 uv = fc/uRes;
  bg *= 1.0 - 0.25*pow(length((uv - vec2(0.55,0.5))*vec2(1.0,0.9)), 2.0);
  bg += vec3(0.0, 0.006, 0.016) * smoothstep(250.0, 0.0, -d) * 0.6;

  vec3 light = halo * vec3(0.0, 0.50, 1.25) * 1.15
             + core * vec3(0.05, 1.25, 1.6);
  vec3 col = bg + (1.0 - bg) * (1.0 - exp(-light));

  float g = hash(fc + fract(t*7.13)*vec2(97.0,57.0)) - 0.5;
  col += g * (1.6/255.0) + g * 0.012 * m;

  gl_FragColor = vec4(col, 1.0);
}`;
