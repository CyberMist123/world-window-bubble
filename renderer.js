/**
 * 世界之窗 · 心绪泡泡 — 单世界 WebGL2 渲染管线与 1:1 交互动效状态机
 *
 * 严格对标 reference/glmain.min.js 与 22 个官方着色器：
 * - 单一 #gl-world 画布 + [1,1,1,0] 离屏透明白底清屏（彻底消除双画布黑灰脏边）
 * - z = -100 背景丝绸褶皱全息带 -> z = -50 散景虚化球 -> z = -5 衬线大标题 ->
 *   z = -2 连线 -> z = -1 流动水珠与发光粒子 -> z = 0 31抽头高斯胶质主泡/子泡/孙泡/转场球 ->
 *   z = 2 反相前景装饰球 -> z = 500 胶片噪点 + 8% Overlay 叠层
 * - 完整实现开场序列、L1 展开、L2 孙级展开/兄弟退避/母球避让/独立收回、转场球聚合、
 *   <dialog closedby="any"> 详情卡片预览与 glHistory 浏览状态自动恢复。
 */
(function () {
  'use strict';

  const DATA = window.WORLD_DATA;
  const SP = window.SPRITES;
  const PHY = DATA.physics;
  const rnd = SP.srand(20261114);
  const rr = function (a, b) { return a + (b - a) * rnd(); };
  const DEG = Math.PI / 180;

  // ==================== 缓动函数与轻量级精准 Tween 引擎（严格对齐 GSAP Power1=^2, Power2=^3, Power3=^4 & elastic） ====================
  const EASE = {
    linear: function (t) { return t; },
    p1io: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    p2o: function (t) { return 1 - Math.pow(1 - t, 3); },
    p2io: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    p3o: function (t) { return 1 - Math.pow(1 - t, 4); },
    p3io: function (t) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; },
    elasticOut: function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      const p = 0.5;
      const s = p / 4;
      return Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / p) + 1;
    }
  };

  let clockSec = 0;
  const activeTweens = [];

  function killTweensOf(target, prop) {
    for (let i = activeTweens.length - 1; i >= 0; i--) {
      if (activeTweens[i].target === target && (prop == null || activeTweens[i].prop === prop)) {
        activeTweens.splice(i, 1);
      }
    }
  }

  function hasTween(target, prop) {
    for (let i = 0; i < activeTweens.length; i++) {
      if (activeTweens[i].target === target && (prop == null || activeTweens[i].prop === prop)) {
        return true;
      }
    }
    return false;
  }

  function to(target, prop, toVal, dur, easeFn, delay, onComplete) {
    killTweensOf(target, prop);
    activeTweens.push({
      target: target,
      prop: prop,
      from: null,
      to: toVal,
      dur: Math.max(0, dur || 0),
      ease: easeFn || EASE.p2o,
      startAt: clockSec + (delay || 0),
      onComplete: onComplete || null
    });
  }

  function stepTweens() {
    for (let i = activeTweens.length - 1; i >= 0; i--) {
      const tw = activeTweens[i];
      if (clockSec < tw.startAt) continue;
      if (tw.from === null) tw.from = tw.target[tw.prop];
      const u = tw.dur > 0 ? Math.min(1, (clockSec - tw.startAt) / tw.dur) : 1;
      tw.target[tw.prop] = tw.from + (tw.to - tw.from) * tw.ease(u);
      if (u >= 1) {
        activeTweens.splice(i, 1);
        if (tw.onComplete) tw.onComplete();
      }
    }
  }

  // ==================== 全局帧率修正系数（1:1 复刻 glConfig） ====================
  const conf = {
    d: 1,
    d2: 1,
    s099a: 0.99, s099b: 0.01,
    s098a: 0.98, s098b: 0.02,
    s095a: 0.95, s095b: 0.05,
    s090a: 0.90, s090b: 0.10,
    s085a: 0.85, s085b: 0.15,
    s080a: 0.80, s080b: 0.20,
    s075a: 0.75, s075b: 0.25,
    s070a: 0.70, s070b: 0.30,
    s060a: 0.60, s060b: 0.40
  };

  function expLerp(rate) {
    return Math.min(1, Math.max(0, 1 - Math.pow(1 - rate, conf.d)));
  }

  function updateConf(dtMs) {
    const dtClamped = Math.min(50, Math.max(1, dtMs));
    let nd = dtClamped / 16.6667;
    if (nd >= 4) nd = 4;
    conf.d = 0.90 * conf.d + 0.10 * nd;
    conf.d2 = 1 / Math.max(0.05, conf.d);
    conf.s099b = expLerp(0.01); conf.s099a = 1 - conf.s099b;
    conf.s098b = expLerp(0.02); conf.s098a = 1 - conf.s098b;
    conf.s095b = expLerp(0.05); conf.s095a = 1 - conf.s095b;
    conf.s090b = expLerp(0.10); conf.s090a = 1 - conf.s090b;
    conf.s085b = expLerp(0.15); conf.s085a = 1 - conf.s085b;
    conf.s080b = expLerp(0.20); conf.s080a = 1 - conf.s080b;
    conf.s075b = expLerp(0.25); conf.s075a = 1 - conf.s075b;
    conf.s070b = expLerp(0.30); conf.s070a = 1 - conf.s070b;
    conf.s060b = expLerp(0.40); conf.s060a = 1 - conf.s060b;
  }

  function lerpPairFor(rate) {
    if (Math.abs(rate - 0.40) < 0.01) return [conf.s060a, conf.s060b];
    if (Math.abs(rate - 0.30) < 0.01) return [conf.s070a, conf.s070b];
    if (Math.abs(rate - 0.25) < 0.01) return [conf.s075a, conf.s075b];
    if (Math.abs(rate - 0.20) < 0.01) return [conf.s080a, conf.s080b];
    if (Math.abs(rate - 0.15) < 0.01) return [conf.s085a, conf.s085b];
    const b = expLerp(rate);
    return [1 - b, b];
  }

  // ==================== 环境与视口状态 ====================
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersReduced = reducedMotionQuery.matches;
  let motionPaused = false;
  let currentLang = DATA.defaultLang || 'zh';
  let isTransition = false;

  let W = window.innerWidth;
  let H = window.innerHeight;
  let centerX = 0.5 * W;
  let centerY = -0.5 * H;
  let isWide = W > PHY.borderSP;

  function calcBallScale(w) {
    if (w <= PHY.borderSP) return 1;
    if (w <= 1500) return w / 1500;
    if (w > 1920) return w / 1920;
    return 1;
  }

  let BS = calcBallScale(W);

  // ==================== WebGL2 单画布引擎 ====================
  const worldEl = document.getElementById('gl-world');
  const canvas = document.createElement('canvas');
  worldEl.insertBefore(canvas, worldEl.firstChild);

  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance'
  });

  if (!gl) {
    document.getElementById('gl-loading').style.display = 'none';
    return;
  }

  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const unitBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, unitBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);

  const instBuf = gl.createBuffer();
  const lineBuf = gl.createBuffer();

  function compileProgram(name, vsSrc, fsSrc) {
    function sh(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(name + ' shader error: ' + gl.getShaderInfoLog(s));
      }
      return s;
    }
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
    ['a', 'iPosSize', 'iUvRect', 'iRotAlpha', 'aCol'].forEach(function (attr, idx) {
      gl.bindAttribLocation(p, idx, attr);
    });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(name + ' link error: ' + gl.getProgramInfoLog(p));
    }
    const U = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(p, i);
      U[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
    }
    return { p: p, U: U };
  }

  function createTex(source, wrapMode) {
    const wrap = wrapMode || gl.CLAMP_TO_EDGE;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }

  function updateTex(tex, source) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  function createRT(w, h) {
    const rw = Math.max(2, Math.round(w));
    const rh = Math.max(2, Math.round(h));
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rw, rh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t: t, fb: fb, w: rw, h: rh };
  }

  function disposeRT(rt) {
    if (!rt) return;
    gl.deleteFramebuffer(rt.fb);
    gl.deleteTexture(rt.t);
  }

  function setTarget(rt, clearRGBA) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fb : null);
    const vw = rt ? rt.w : canvas.width;
    const vh = rt ? rt.h : canvas.height;
    gl.viewport(0, 0, vw, vh);
    if (clearRGBA) {
      gl.clearColor(clearRGBA[0], clearRGBA[1], clearRGBA[2], clearRGBA[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  function enableNormalBlend() {
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  function bindTex(unit, tex) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  function drawFullQuad(prog) {
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    for (let i = 1; i <= 4; i++) gl.disableVertexAttribArray(i);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function drawPlaneQuad(prog) {
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, unitBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    for (let i = 1; i <= 4; i++) gl.disableVertexAttribArray(i);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ==================== GLSL 着色器（精确复刻官方 22 个 shader 数学公式） ====================
  const VS_FULL = `#version 300 es
  in vec2 a;
  out vec2 vUv;
  void main() {
    vUv = a * 0.5 + 0.5;
    gl_Position = vec4(a, 0.0, 1.0);
  }`;

  // 支持 THREE 风格世界坐标 (wx 向右, wy 向上，顶左为 (0,0)，底右为 (W,-H)) 的旋转平面顶点着色器
  const VS_PLANE = `#version 300 es
  in vec2 a;
  uniform vec2 uPos;
  uniform vec2 uSize;
  uniform vec2 uRes;
  uniform float uRot;
  out vec2 vUv;
  void main() {
    vUv = a + 0.5;
    float c = cos(uRot), s = sin(uRot);
    vec2 local = a * uSize;
    vec2 wp = vec2(c * local.x - s * local.y, s * local.x + c * local.y) + uPos;
    gl_Position = vec4(wp.x / uRes.x * 2.0 - 1.0, 1.0 + wp.y / uRes.y * 2.0, 0.0, 1.0);
  }`;

  // 批量实例化精灵着色器：每实例 10 个 float -> iPosSize(wx, wy, w, h), iUvRect(u0, v0, uw, vh), iRotAlpha(rz, alpha)
  const VS_INST = `#version 300 es
  in vec2 a;
  in vec4 iPosSize;
  in vec4 iUvRect;
  in vec2 iRotAlpha;
  uniform vec2 uRes;
  out vec2 vUv;
  out float vAlpha;
  void main() {
    float c = cos(iRotAlpha.x), s = sin(iRotAlpha.x);
    vec2 local = a * iPosSize.zw;
    vec2 wp = vec2(c * local.x - s * local.y, s * local.x + c * local.y) + iPosSize.xy;
    vUv = iUvRect.xy + (a + 0.5) * iUvRect.zw;
    vAlpha = iRotAlpha.y;
    gl_Position = vec4(wp.x / uRes.x * 2.0 - 1.0, 1.0 + wp.y / uRes.y * 2.0, 0.0, 1.0);
  }`;

  const FS_INST = `#version 300 es
  precision highp float;
  uniform sampler2D uTex;
  uniform sampler2D uNoise;
  uniform float uNoiseBoost;
  in vec2 vUv;
  in float vAlpha;
  out vec4 fragColor;
  void main() {
    vec4 col = texture(uTex, vUv);
    float nb = uNoiseBoost > 0.0 ? texture(uNoise, vUv * 0.5).r * uNoiseBoost : 0.0;
    fragColor = vec4(col.rgb + nb, col.a * vAlpha);
  }`;

  // 实例化抗锯齿丝滑细连线着色器（无 MSAA 下输出 1px 级顺滑矢量连线）
  const VS_LINES = `#version 300 es
  in vec2 a;
  in vec4 iPosSize;
  in vec4 iUvRect;
  uniform vec2 uRes;
  uniform float uHalfWidth;
  out vec4 vCol;
  out float vSide;
  void main() {
    vec2 p0 = iPosSize.xy;
    vec2 p1 = iPosSize.zw;
    vec2 diff = p1 - p0;
    float len = length(diff);
    vec2 dir = len > 0.001 ? (diff / len) : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float t = a.x + 0.5;
    float side = a.y * 2.0;
    vec2 wp = mix(p0, p1, t) + nrm * (side * uHalfWidth);
    vCol = iUvRect;
    vSide = side;
    gl_Position = vec4(wp.x / uRes.x * 2.0 - 1.0, 1.0 + wp.y / uRes.y * 2.0, 0.0, 1.0);
  }`;

  const FS_LINES = `#version 300 es
  precision highp float;
  in vec4 vCol;
  in float vSide;
  out vec4 fragColor;
  void main() {
    float cov = 1.0 - smoothstep(0.18, 1.0, abs(vSide));
    fragColor = vec4(vCol.rgb, vCol.a * cov);
  }`;

  // noise_frg.js (3D Simplex Noise)
  const FS_NOISE = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform float cr;
  uniform float cg;
  uniform float cb;
  out vec4 fragColor;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    float val1 = snoise(vec3(cr * vUv.x, cg * vUv.y, cb)) + 0.5;
    fragColor = vec4(val1, val1, val1, 1.0);
  }`;

  // bg_frg.js (1:1 丝绸斜纹噪声 + 周期全息带)
  const FS_BG = `#version 300 es
  precision highp float;
  uniform sampler2D tex;
  uniform sampler2D noise;
  uniform float time;
  uniform float strength;
  uniform float shiftX;
  uniform float shiftY;
  uniform float noiseScale;
  uniform float colShiftX;
  uniform float colShiftY;
  uniform float colStrength;
  uniform float colScaleY;
  uniform float colScaleX;
  in vec2 vUv;
  out vec4 fragColor;

  vec2 mirror(vec2 v) {
    vec2 m = mod(v, 2.0);
    return mix(m, 2.0 - m, step(1.0, m));
  }

  void main() {
    vec2 noiseUv = mirror(vec2(vUv.x * noiseScale + shiftX, vUv.y * 0.22 + shiftY));
    vec2 p = -1.0 + 2.0 * vUv;
    vec2 newUv = noiseUv + strength * vec2(cos(-time + length(p * 4.0)), sin(-time + length(p * 4.0)));
    vec3 noiseCol = texture(noise, newUv).rgb;

    vec2 colDist = colStrength * vec2(sin(-time + length(p * 8.0)), cos(-time + length(p * 8.0)));
    vec2 colUv = vec2(vUv.x + colShiftX, vUv.y - colShiftY) + colDist;
    vec3 col = texture(tex, vec2(colUv.x * colScaleX, colUv.y * colScaleY)).rgb + noiseCol.r * 0.065;
    fragColor = vec4(col, 1.0);
  }`;

  // middle_frg.js & blurStage_frg.js (31 抽头 Alpha 加权高斯模糊，空白处保白 [1,1,1,0])
  const FS_BLUR = `#version 300 es
  precision highp float;
  uniform sampler2D tex;
  uniform vec2 uStep;
  uniform float uWeights[16];
  in vec2 vUv;
  out vec4 fragColor;
  void main() {
    vec3 sumRgb = vec3(0.0);
    float sumA = 0.0;
    float sumW = 0.0;
    for (int i = -15; i <= 15; i++) {
      int wi = 15 - (i < 0 ? -i : i);
      float w = uWeights[wi];
      vec4 c = texture(tex, vUv + uStep * float(i));
      float vol = w * c.a;
      sumRgb += c.rgb * vol;
      sumA += c.a * w;
      sumW += vol;
    }
    vec3 outRgb = sumW > 1e-6 ? (sumRgb / sumW) : vec3(1.0);
    fragColor = vec4(outRgb, sumA);
  }`;

  // display_frg.js (1:1 胶质融球阈值 col1.a * 80.0 - 10.0 + 内部背光水彩流光 noise*0.13 + 水波提亮 effect*0.11)
  const FS_DISPLAY = `#version 300 es
  precision highp float;
  uniform sampler2D tex;
  uniform sampler2D noise;
  uniform sampler2D mEffect;
  uniform float time;
  uniform float strength;
  uniform vec2 asp;
  in vec2 vUv;
  out vec4 fragColor;
  void main() {
    vec4 effectCol = texture(mEffect, vUv);
    vec4 noiseCol = texture(noise, vec2(vUv.x * asp.x, vUv.y * asp.y));
    vec2 effectUv = vUv + sin(effectCol.r) * 0.025;
    vec2 p = -1.0 + 2.0 * effectUv;
    float ss = sin(-time + length(p * 14.0));
    vec2 newUv = effectUv + strength * vec2(ss, ss);

    vec4 col1 = texture(tex, newUv);
    float alpha = clamp(col1.a * 80.0 - 10.0, 0.0, 1.0);
    if (alpha <= 0.001) {
      fragColor = vec4(1.0, 1.0, 1.0, 0.0);
      return;
    }

    float noiseLight = noiseCol.r * 0.13;
    float effectLight = effectCol.r * 0.11;
    vec3 rgb = min(col1.rgb + noiseLight + effectLight, 1.0);
    fragColor = vec4(rgb, alpha);
  }`;

  // frontDisplay_frg.js (1:1 反相前景水晶小气泡合成：配合 RT.front [1,1,1,0] 清屏天然生成清透肥皂泡折射细边)
  const FS_FRONT_DISPLAY = `#version 300 es
  precision highp float;
  uniform sampler2D tex;
  uniform sampler2D noise;
  uniform sampler2D mEffect;
  uniform float time;
  uniform float strength;
  in vec2 vUv;
  out vec4 fragColor;
  void main() {
    vec4 effectCol = texture(mEffect, vUv);
    vec4 noiseCol = texture(noise, vec2(vUv.x, vUv.y * 0.6));
    vec2 effectUv = vUv + sin(effectCol.r) * 0.02;
    vec2 p = -1.0 + 2.0 * effectUv;
    float ss = sin(-time + length(p * 14.0));
    vec2 newUv = effectUv + strength * vec2(ss, ss);

    vec4 col1 = texture(tex, newUv);
    if (col1.a <= 0.001) {
      fragColor = vec4(1.0, 1.0, 1.0, 0.0);
      return;
    }

    float noiseLight = noiseCol.r * 0.18;
    float effectLight = effectCol.r * 0.11;
    vec3 fCol = max(col1.rgb - (noiseLight + effectLight), 0.0);
    fragColor = vec4(1.0 - fCol, col1.a);
  }`;

  // sand_frg.js (3% 顶部颗粒层)
  const FS_SAND = `#version 300 es
  precision highp float;
  uniform sampler2D map;
  uniform float alpha;
  uniform vec2 patt;
  uniform vec2 shift;
  in vec2 vUv;
  out vec4 fragColor;
  void main() {
    vec4 baseCol = texture(map, vUv * patt + shift);
    fragColor = vec4(baseCol.rgb, baseCol.a * alpha);
  }`;

  const PROG = {
    noise: compileProgram('noise', VS_FULL, FS_NOISE),
    bg: compileProgram('bg', VS_PLANE, FS_BG),
    inst: compileProgram('inst', VS_INST, FS_INST),
    lines: compileProgram('lines', VS_LINES, FS_LINES),
    blur: compileProgram('blur', VS_FULL, FS_BLUR),
    display: compileProgram('display', VS_FULL, FS_DISPLAY),
    frontDisplay: compileProgram('frontDisplay', VS_FULL, FS_FRONT_DISPLAY),
    sand: compileProgram('sand', VS_FULL, FS_SAND)
  };

  const BLUR_WEIGHTS = new Float32Array([
    0.009431840591298283, 0.0111796064097462,   0.013119389655246888, 0.01524255614516104,
    0.01753311296138896,  0.019967206688466566, 0.022512962676080703, 0.025130726536367953,
    0.027773748118105818, 0.030389320952937365, 0.032920358383740696, 0.03530735369638273,
    0.03749063851662258,  0.03941282465720701,  0.041021292544576475, 0.04227057689119243
  ]);

  // ==================== 程序化贴图初始化 ====================
  const ballAtlasObj = SP.buildBallAtlas(540);
  const frontAtlases = SP.buildFrontBallAtlases(512);
  const TEX = {
    balls: createTex(ballAtlasObj.canvas),
    frontSharp: createTex(frontAtlases.sharp),
    frontSoft: createTex(frontAtlases.soft),
    frontCombined: createTex(frontAtlases.combined),
    bokeh: createTex(SP.buildBokehAtlas(192)),
    joint: createTex(SP.buildJointAtlas(false, 192)),
    jointBlur: createTex(SP.buildJointAtlas(true, 192)),
    brush: createTex(SP.buildBrushRing(256)),
    bgColor: createTex(SP.buildBgColor(1024), gl.MIRRORED_REPEAT),
    sand: createTex(SP.buildSand(512), gl.REPEAT),
    bgWord: createTex(SP.buildBgWordAtlas(DATA.sections))
  };

  // 字体加载完毕后重绘一次 z=-5 衬线背景大标题贴图，确保使用 Libre Caslon Display 真实字形
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      updateTex(TEX.bgWord, SP.buildBgWordAtlas(DATA.sections));
    });
  }

  function ballUvRect(famIdx, isFront) {
    const idx = famIdx * 2 + (isFront ? 1 : 0);
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    return [col * 0.25, row * 0.5, 0.25, 0.5];
  }

  function cell2x2Uv(c) {
    return [(c % 2) * 0.5, Math.floor(c / 2) * 0.5, 0.5, 0.5];
  }

  function frontCombinedUv(c, isSoft) {
    return [(c % 2) * 0.5, (isSoft ? 0.5 : 0.0) + Math.floor(c / 2) * 0.25, 0.5, 0.25];
  }

  function bgWordUv(secIdx) {
    const t = secIdx % 6;
    return [(t % 2) * 0.5, Math.floor(t / 2) * (1 / 3), 0.5, 1 / 3];
  }

  function drawInstances(tex, list, viewW, viewH, noiseTex, noiseBoost) {
    if (!list.length) return;
    gl.useProgram(PROG.inst.p);
    gl.uniform2f(PROG.inst.U.uRes, viewW, viewH);
    bindTex(0, tex);
    gl.uniform1i(PROG.inst.U.uTex, 0);
    bindTex(1, noiseTex || tex);
    gl.uniform1i(PROG.inst.U.uNoise, 1);
    gl.uniform1f(PROG.inst.U.uNoiseBoost, noiseBoost || 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, unitBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);

    const flat = new Float32Array(list.length * 10);
    for (let i = 0; i < list.length; i++) {
      flat.set(list[i], i * 10);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, flat, gl.DYNAMIC_DRAW);

    // stride = 40 bytes (10 floats)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 40, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 16);
    gl.vertexAttribDivisor(2, 1);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 40, 32);
    gl.vertexAttribDivisor(3, 1);

    gl.disableVertexAttribArray(4);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, list.length);

    gl.vertexAttribDivisor(1, 0);
    gl.vertexAttribDivisor(2, 0);
    gl.vertexAttribDivisor(3, 0);
  }

  function drawLines(segments, viewW, viewH) {
    if (!segments.length) return;
    gl.useProgram(PROG.lines.p);
    gl.uniform2f(PROG.lines.U.uRes, viewW, viewH);
    gl.uniform1f(PROG.lines.U.uHalfWidth, 0.95);

    gl.bindBuffer(gl.ARRAY_BUFFER, unitBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);

    const flat = new Float32Array(segments.length * 8);
    for (let i = 0; i < segments.length; i++) {
      flat.set(segments[i], i * 8);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, flat, gl.DYNAMIC_DRAW);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);

    gl.disableVertexAttribArray(3);
    gl.disableVertexAttribArray(4);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segments.length);

    gl.vertexAttribDivisor(1, 0);
    gl.vertexAttribDivisor(2, 0);
  }

  // ==================== 离屏 Framebuffers ====================
  const RT = {
    noise: createRT(512, 512),
    dummy: null,
    middle: null,
    blur: null,
    front: null,
    effect: null
  };

  function rebuildRenderTargets() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(W * dpr));
    canvas.height = Math.max(2, Math.round(H * dpr));

    const blurScale = (W <= PHY.borderSP && dpr >= 1.2) ? 0.9 : 0.6;
    disposeRT(RT.dummy);
    disposeRT(RT.middle);
    disposeRT(RT.blur);
    disposeRT(RT.front);
    disposeRT(RT.effect);

    RT.dummy = createRT(W, H);
    RT.middle = createRT(W * blurScale, H * blurScale);
    RT.blur = createRT(W * blurScale, H * blurScale);
    RT.front = createRT(W, H);
    RT.effect = createRT(W * 0.5, H * 0.5);
  }

  // ==================== 场景状态与节点构建 ====================
  const fixStage = document.getElementById('fix-stage');
  const scrollFixEl = document.getElementById('scrollFix');
  const contentsEl = document.getElementById('contents');
  const footerEl = document.getElementById('footer');

  // 1. Hero 标题（890x533 等比矢量排版，5 部分依次淡入 + 鼠标视差 -0.05 * effectX，绝不越界撞球）
  const heroDom = (function buildHero() {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const h1 = document.createElement('h1');
    h1.className = 'gl-main-title';
    h1.setAttribute(
      'aria-label',
      DATA.brand.mark + ' — ' + DATA.brand.heroLines.join(' ') + ' — ' + DATA.brand.heroSub.join(' ')
    );

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'gl-main-title-svg');
    svg.setAttribute('viewBox', '0 0 890 533');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('text-rendering', 'geometricPrecision');

    function makeGroup() {
      const g = document.createElementNS(SVG_NS, 'g');
      g.style.opacity = '0';
      svg.appendChild(g);
      return g;
    }

    function addSvgText(parent, text, x, y, attrs) {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(x));
      t.setAttribute('y', String(y));
      Object.keys(attrs).forEach(function (k) {
        t.setAttribute(k, String(attrs[k]));
      });
      t.textContent = text;
      parent.appendChild(t);
      return t;
    }

    // Group 0: 顶部红色定制几何标识
    const gLogo = makeGroup();
    addSvgText(gLogo, DATA.brand.mark, 2, 42, {
      'font-family': '"Libre Franklin", "Helvetica Neue", Arial, sans-serif',
      'font-weight': '600',
      'font-size': '33',
      'letter-spacing': '7.5',
      'fill': '#e50012'
    });

    const serifAttrs = {
      'font-family': '"Libre Caslon Display", Georgia, serif',
      'font-weight': '400',
      'font-size': '130',
      'letter-spacing': '-1.5',
      'fill': '#0e0e0e'
    };

    // Group 1-3: 三行错落高对比度衬线大标题（对标原版 890x533 黄金缩进比例）
    const gC1 = makeGroup();
    addSvgText(gC1, DATA.brand.heroLines[0], 0, 166, serifAttrs);

    const gC2 = makeGroup();
    addSvgText(gC2, DATA.brand.heroLines[1], 204, 276, serifAttrs);

    const gC3 = makeGroup();
    addSvgText(gC3, DATA.brand.heroLines[2], 88, 386, serifAttrs);

    // Group 4: 右下三行阶梯式无衬线副标
    const gSab = makeGroup();
    const sabAttrs = {
      'font-family': '"Libre Franklin", "Helvetica Neue", Arial, sans-serif',
      'font-weight': '400',
      'font-size': '25.5',
      'letter-spacing': '0.9',
      'fill': '#141414'
    };
    DATA.brand.heroSub.forEach(function (line, idx) {
      addSvgText(gSab, line, 333 + idx * 36, 442 + idx * 34, sabAttrs);
    });

    h1.appendChild(svg);
    contentsEl.appendChild(h1);
    return {
      root: h1,
      parts: [gLogo, gC1, gC2, gC3, gSab],
      fades: [{ v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }],
      titleX: 0
    };
  })();

  // 2. 背景丝绸层、散景层、颗粒层、显示器波纹参数
  const bgState = {
    time: 0,
    shiftX: 0,
    shiftY: 0,
    colVY: -0.08,
    colShiftX: 0,
    noiseCount: 0,
    noiseAccum: 2
  };

  const bokehList = [];
  for (let i = 0; i < 26; i++) {
    let sc, alpha;
    if (i === 3) {
      sc = 1.5; alpha = 0.3;
    } else if (i % 5 === 0) {
      sc = rr(0.3, 1.7); alpha = rr(0.2, 0.8);
    } else {
      sc = rr(0.4, 1.0); alpha = rr(0.1, 0.7);
    }
    bokehList.push({
      active: i % 3 === 0,
      x: rr(-0.1, 1.25) * W,
      y: -rnd() * 1.5 * H,
      speedY: rr(0.18, 0.85),
      baseScale: sc,
      scale: sc,
      alpha: alpha,
      rz: rnd() * Math.PI * 2,
      cell: (rnd() * 4) | 0
    });
  }
  let bgBallGroupX = 0;

  // 3. 鼠标波纹与点击波浪（glMouseEffect / glMfObj）
  let effectX = 0;
  let effectY = 0;
  let mfPrevX = -1000;
  let mfPrevY = -1000;
  let mfTimer = 0;
  let sandAccum = 0;
  const trailRings = [];
  const clickRings = [];
  for (let i = 0; i < 8; i++) {
    clickRings.push({ vis: false, x: 0, y: 0, sc: 1, op: 0, rz: 0, startedAt: -1 });
  }
  let clickRingIdx = 0;

  function spawnClickWave(clientX, clientY) {
    if (motionPaused || prefersReduced) return;
    const dx = clientX - W * 0.5;
    const dy = clientY - H * 0.5;
    let cr = null;
    for (let i = 0; i < clickRings.length; i++) {
      const idx = (clickRingIdx + i) % clickRings.length;
      if (!clickRings[idx].vis) {
        cr = clickRings[idx];
        clickRingIdx = (idx + 1) % clickRings.length;
        break;
      }
    }
    if (!cr) {
      // 若 8 槽全部在播，回收最早启动的一枚，保证连续快速点击每一下都有完整水波溅射
      let oldest = clickRings[0];
      for (let i = 1; i < clickRings.length; i++) {
        if (clickRings[i].startedAt < oldest.startedAt) oldest = clickRings[i];
      }
      cr = oldest;
    }
    killTweensOf(cr, 'sc');
    killTweensOf(cr, 'op');
    cr.vis = true;
    cr.startedAt = clockSec;
    cr.x = 0.5 * dx;
    cr.y = -0.5 * dy;
    cr.sc = 1;
    cr.op = 0;
    cr.rz = rnd() * Math.PI * 2;
    to(cr, 'sc', 8, 2.0, EASE.p3o, 0);
    to(cr, 'op', 1, 0.3, EASE.linear, 0, function () {
      to(cr, 'op', 0, 1.7, EASE.p3io, 0, function () {
        cr.vis = false;
      });
    });
  }

  window.addEventListener('pointermove', function (e) {
    if (isTransition || W <= PHY.borderSP) return;
    effectX = e.clientX - W * 0.5;
    effectY = e.clientY - H * 0.5;
  });

  window.addEventListener('pointerdown', function (e) {
    spawnClickWave(e.clientX, e.clientY);
  });

  window.addEventListener('click', function (e) {
    if (e.detail === 0 && e.target && e.target.getBoundingClientRect) {
      const r = e.target.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        spawnClickWave(r.left + r.width * 0.5, r.top + r.height * 0.5);
      }
    }
  });

  // 4. 转场主球（glTransitionBall：开场收缩揭幕 + 点击详情聚合绽放）
  const transitionBall = {
    vis: true,
    wx: centerX,
    wy: centerY,
    scale: 1,
    groupRz: 30 * DEG,
    rz1: rnd() * Math.PI,
    rz2: rnd() * Math.PI,
    rz3: rnd() * Math.PI,
    spinning: false
  };

  // 5. 8 颗主泡泡（glMainBall + glMainBallSab + glTopBgWord + glMainBallDom）
  const secMap = {};
  DATA.sections.forEach(function (s) { secMap[s.id] = s; });

  const mainBalls = PHY.mainBalls.map(function (cfg) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gl-topMainBtn';
    if (cfg.id === 0) btn.classList.add('gl-topMainBtn-sl');
    if (cfg.id === 7) btn.classList.add('gl-topMainBtn-ss');
    btn.style.opacity = '0';
    fixStage.appendChild(btn);

    const b = {
      cfg: cfg,
      id: cfg.id,
      secData: secMap[cfg.id] || null,
      ballScale: 1,
      selectScale: 1,
      groupScale: 0.1,
      trgScale: cfg.scale,
      trgX: W * cfg.pc.x,
      trgY: cfg.pc.y,
      bottomY: cfg.pc.y,
      wx: centerX,
      wy: centerY,
      openY: 0,
      sabShiftX: 0,
      effectX: 0,
      sinYCount: rnd() * Math.PI * 2,
      sinY: 0,
      rzBg: rnd() * Math.PI * 2,
      rzFront: rnd() * Math.PI * 2,
      radius: 250 * cfg.scale,
      isOpen0: false,
      isStartView: true,
      vis: false,
      sab: {
        vis: false,
        r: cfg.sabR,
        scale: 0.45,
        sinR: 36,
        k: rnd() * Math.PI * 2,
        rz: rnd() * Math.PI * 2,
        sinCount: rnd() * Math.PI * 2,
        selectR: 0
      },
      bgWord: (cfg.id >= 1 && cfg.id <= 6) ? {
        idx: cfg.id - 1,
        vis: false,
        alpha: 0,
        scale: 1,
        shiftX: 170
      } : null,
      dom: {
        btn: btn,
        opacity: 0,
        b1Scale: 1,
        iconRot: 0,
        trgX: W * cfg.pc.x
      },
      under: null
    };

    return b;
  });

  // 6. 构建 L1 子泡泡 + L2 孙泡泡 + 缩略图缩放轮播 + 回流水珠 + 连线发光粒子
  function createDropletPair() {
    return [0, 1].map(function (slotIdx) {
      return {
        slotIdx: slotIdx,
        isShow: false,
        isFirst: true,
        isActive: true,
        rScale: 0,
        scale: 0.01,
        rz: rnd() * Math.PI * 2,
        offscreen: true
      };
    });
  }

  function startDropletYoyo(dr, getInitScale, rDur, sDur) {
    if (!dr.isActive || !dr.isShow) return;
    const delay = dr.isFirst
      ? ((dr.isFirst = false), (dr.slotIdx === 1 ? 1.45 : 0) + 0.01 * Math.floor(70 * rnd() + 15))
      : 0.01 * Math.floor(280 * rnd() + 90);
    dr.offscreen = false;
    dr.rScale = 0;
    dr.scale = getInitScale();
    to(dr, 'rScale', 1, rDur, EASE.p3o, delay);
    to(dr, 'scale', 0.01, sDur, EASE.p2o, delay, function () {
      killTweensOf(dr, 'rScale');
      dr.rScale = 0;
      if (dr.isActive && dr.isShow) {
        startDropletYoyo(dr, getInitScale, rDur, sDur);
      }
    });
  }

  function stopDroplet(dr, dur) {
    killTweensOf(dr, 'rScale');
    killTweensOf(dr, 'scale');
    to(dr, 'scale', 0.01, dur != null ? dur : 0.3, EASE.p2o, 0, function () {
      dr.rScale = 0;
      dr.offscreen = true;
    });
  }

  mainBalls.forEach(function (parentBall) {
    const sec = parentBall.secData;
    if (!sec) return;

    const l1Nodes = sec.children.map(function (cData, gIdx) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gl-top-sabBtn';

      const thum = document.createElement('div');
      thum.className = 'gl-top-sabThum';
      btn.appendChild(thum);

      const mk = document.createElement('div');
      mk.className = 'gl-top-sabM gl-top-sabM-thum';
      if (!sec.directLeaf) mk.classList.add('gl-top-sabMOpen');
      const ring = document.createElement('div');
      ring.className = 'gl-top-sabThumRing';
      mk.appendChild(ring);
      btn.appendChild(mk);

      const txt = document.createElement('div');
      txt.className = 'gl-top-sabT gl-top-sabT-thum glja-m';
      btn.appendChild(txt);

      let secondClose = null;
      const imgEls = [];

      if (cData.items && cData.items.length) {
        cData.items.forEach(function (it, idx) {
          const im = document.createElement('img');
          im.className = 'gl-top-sabM-img';
          im.alt = '';
          im.src = SP.buildThumbDataURL(it, 160);
          if (idx !== 0) im.style.display = 'none';
          thum.appendChild(im);
          imgEls.push(im);
        });
        secondClose = document.createElement('div');
        secondClose.className = 'gl-top-secondClose';
        const scRing = document.createElement('div');
        scRing.className = 'gl-top-secondCloseRing';
        secondClose.appendChild(scRing);
        btn.appendChild(secondClose);
      } else {
        const im = document.createElement('img');
        im.className = 'gl-top-sabM-img';
        im.alt = '';
        im.src = SP.buildThumbDataURL(cData, 160);
        thum.appendChild(im);
        imgEls.push(im);
      }

      fixStage.appendChild(btn);

      // L2 孙节点（仅 01–04 具备）
      let l2Group = null;
      if (cData.items && cData.items.length) {
        const l2Nodes = cData.items.map(function (itemData, mIdx) {
          const b2 = document.createElement('button');
          b2.type = 'button';
          b2.className = 'gl-top-sabBtn';

          const th2 = document.createElement('div');
          th2.className = 'gl-top-sabThum';
          const im2 = document.createElement('img');
          im2.className = 'gl-top-sabM-img';
          im2.alt = '';
          im2.src = SP.buildThumbDataURL(itemData, 160);
          th2.appendChild(im2);
          b2.appendChild(th2);

          const mk2 = document.createElement('div');
          mk2.className = 'gl-top-sabM gl-top-sabM-thum';
          const r2 = document.createElement('div');
          r2.className = 'gl-top-sabThumRing';
          mk2.appendChild(r2);
          b2.appendChild(mk2);

          const tx2 = document.createElement('div');
          tx2.className = 'gl-top-sabT gl-top-sabT-thum glja-m';
          b2.appendChild(tx2);

          fixStage.appendChild(b2);

          const gNode = {
            myNum: mIdx,
            data: itemData,
            trgK: 0,
            trgRGoal: 400,
            trgScaleGoal: 1,
            trgR: 0,
            trgS: 0.01,
            wx: -4000,
            wy: -400,
            curScale: 0.01,
            tPosX: 0,
            tPosY: 0,
            rz1: rnd() * Math.PI * 2,
            rz2: rnd() * Math.PI * 2,
            dom: {
              btn: b2,
              txt: tx2,
              opacity: 0,
              domX: 0,
              domY: 0
            },
            drops: createDropletPair()
          };

          b2.addEventListener('click', function () {
            openLeafDetail({
              type: 'l2',
              sec: sec,
              l1: cData,
              item: itemData
            });
          });

          return gNode;
        });

        // L2 连线发光粒子（每条线 6 颗，glSecondSabParticle）
        const l2Particles = [];
        for (let p = 0; p < l2Nodes.length * 6; p++) {
          l2Particles.push({
            branchIdx: Math.floor(p / 6),
            rndSize: p % 4 === 0 ? rr(0.3, 0.8) : rr(0.2, 0.5),
            speed: 0.68 * rr(0.14, 0.82),
            sinSeed: rnd(),
            r: 0,
            running: false,
            timer: 0
          });
        }

        l2Group = {
          isOpen: false,
          lineVis: false,
          particleAlpha: 0,
          dropTimer: 0,
          nodes: l2Nodes,
          particles: l2Particles
        };
      }

      const moveSpeeds = [0.01, -0.008, -0.008, 0.012];
      const lerpRates = [0.30, 0.40, 0.25, 0.30];

      const node = {
        groupNum: gIdx,
        data: cData,
        kGoal: 0,
        rGoal: 480,
        baseScale: 1,
        ballScale: 1,
        trgK: 0,
        trgR: parentBall.radius,
        trgScale: 0.1,
        selectScale: 1,
        moveCount: rnd() * Math.PI * 2,
        moveSpeed: moveSpeeds[gIdx % 4],
        lerpRate: lerpRates[gIdx % 4],
        wx: -10000,
        wy: -400,
        tPosX: 0,
        tPosY: 0,
        rz: rnd() * Math.PI * 2,
        dom: {
          btn: btn,
          thum: thum,
          mk: mk,
          txt: txt,
          secondClose: secondClose,
          imgs: imgEls,
          imgIdx: 0,
          imgTimer: 0,
          thumScale: 1,
          thumOp: 1,
          mkOp: 1,
          closeOp: 0,
          opacity: 0,
          domY: 0
        },
        drops: createDropletPair(),
        l2: l2Group
      };

      btn.addEventListener('click', function () {
        onL1BallClick(parentBall, gIdx);
      });

      return node;
    });

    // L1 连线发光粒子（每条线 8 颗，glSabSelectParticle）
    const l1Particles = [];
    for (let p = 0; p < l1Nodes.length * 8; p++) {
      l1Particles.push({
        branchIdx: Math.floor(p / 8),
        rndSize: p % 4 === 0 ? rr(0.3, 0.7) : rr(0.2, 0.45),
        speed: 0.68 * rr(0.14, 0.82),
        sinSeed: rnd(),
        r: 0,
        running: false,
        timer: 0
      });
    }

    parentBall.under = {
      isOpen: false,
      status: 0,
      closeCount: 0,
      lineVis: false,
      particleAlpha: 0,
      dropTimer: 0,
      sabOpenList: l1Nodes.map(function () { return 0; }),
      l1Nodes: l1Nodes,
      l1Particles: l1Particles
    };
  });

  // 7. 主连线流动小球（glJoint：7 段 × 3 颗 = 21 颗）
  const jointItems = [];
  PHY.links.forEach(function (pair, linkIdx) {
    for (let id = 0; id < 3; id++) {
      jointItems.push({
        linkIdx: linkIdx,
        startId: pair[0],
        endId: pair[1],
        id: id,
        r: 200 * id,
        speed: 0.28 + 0.72 * rnd(),
        baseScale: id === 0 ? 0.65 : (id === 1 ? 1.1 : 0.8),
        rz: rnd() * Math.PI * 2,
        hidden: linkIdx === 6 && id === 2,
        wx: -5000,
        wy: -5000
      });
    }
  });

  // 8. 11 组前景装饰球（glFrontBallMng）
  const frontItems = PHY.frontBalls.map(function (p) {
    return {
      parm: p,
      wx: p.x * W,
      wy: null,
      scale: p.scale,
      screenScale: 1,
      rot1: rnd() * Math.PI * 2,
      rot2: rnd() * Math.PI * 2,
      rotSpeed1: 0.008 * rnd() + 0.002,
      rotSpeed2: 0.008 * rnd() + 0.002,
      sinCount: rnd() * Math.PI * 2,
      transX: 0,
      transY: 0
    };
  });
  let frontGroupX = 0;

  // 全局渐变透明度控制
  const sceneState = {
    topLineOpacity: 0,
    jointAlpha: 0,
    frontAlpha: 0,
    dispStrength: 0.01,
    dispTime: 0,
    frontTime: 0,
    sandShiftX: 0
  };

  // ==================== L1 / L2 响应式坐标同步（1:1 复刻 setPosParm & onResize） ====================
  function updateL1L2PosParams(parentBall) {
    const under = parentBall.under;
    if (!under) return;
    const id = parentBall.id;
    const spMode = W <= PHY.borderSP;
    const subBS = spMode ? parentBall.ballScale * 0.75 : parentBall.ballScale;

    under.l1Nodes.forEach(function (node, g) {
      node.ballScale = subBS;
      if (spMode) {
        const arr = (id === 1 || id === 3 || id === 5)
          ? PHY.l1SP.left
          : (id === 4 ? PHY.l1SP.id4 : PHY.l1SP.right);
        const cfg = arr[g] || arr[arr.length - 1];
        node.kGoal = cfg[0] * DEG;
        node.rGoal = cfg[1];
        node.baseScale = cfg[2];
      } else {
        const cfg = PHY.l1PC[id][g];
        node.kGoal = cfg[0] * DEG;
        node.rGoal = cfg[1];
        node.baseScale = cfg[2];
      }

      if (node.l2) {
        const isLeft = id === 1 || id === 3;
        const l2Arr = spMode
          ? (isLeft ? PHY.l2SP.left : PHY.l2SP.right)
          : (isLeft ? PHY.l2PC.left : PHY.l2PC.right);
        node.l2.nodes.forEach(function (gn, m) {
          gn.trgK = l2Arr[m][0] * DEG;
          gn.trgRGoal = l2Arr[m][1];
          gn.trgScaleGoal = l2Arr[m][2];
        });
      }
    });
  }

  const pageHeightState = {
    h: 0,
    appliedInt: -1,
    clampingGuardUntil: 0
  };

  function setPageHeight(immediate) {
    const b6 = mainBalls[6];
    const spMode = W <= PHY.borderSP;
    const pitch6 = spMode ? b6.cfg.pitch * 1.15 : b6.cfg.pitch;
    let extra = 0;
    if (b6.isOpen0) {
      extra = spMode ? (pitch6 * b6.ballScale - 180) : (pitch6 * b6.ballScale);
    }
    const h = spMode
      ? Math.abs(b6.bottomY + extra) + 330 * (W / 375)
      : Math.abs(b6.bottomY + extra) + 600 * (W / 1920);
    if (immediate || prefersReduced || motionPaused || pageHeightState.appliedInt < 0) {
      killTweensOf(pageHeightState, 'h');
      pageHeightState.h = h;
      pageHeightState.appliedInt = Math.ceil(h);
      pageHeightState.clampingGuardUntil = performance.now() + 80;
      contentsEl.style.height = pageHeightState.appliedInt + 'px';
    } else {
      to(pageHeightState, 'h', h, 0.8, EASE.p3o, 0);
    }
  }

  function updateBallTargetsAndScale(b) {
    const spMode = W <= PHY.borderSP;
    if (!spMode) {
      b.trgX = W * b.cfg.pc.x;
      b.ballScale = calcBallScale(W);
      b.trgScale = b.cfg.scale * b.ballScale * b.selectScale;
      if (!b.isStartView && !isTransition && !hasTween(b, 'groupScale')) b.groupScale = b.trgScale;
      if (b.id === 7) {
        const b4 = mainBalls[4];
        b.trgY = b4.trgY + (b.cfg.pc.y + b.openY) * b.ballScale;
      } else {
        b.trgY = (b.cfg.pc.y + b.openY) * b.ballScale;
      }
    } else {
      b.trgX = W * b.cfg.sp.x;
      b.ballScale = 1;
      b.trgScale = b.cfg.sp.scale * b.ballScale * b.selectScale;
      if (!b.isStartView && !isTransition && !hasTween(b, 'groupScale')) b.groupScale = b.trgScale;
      if (b.id === 7) {
        const b4 = mainBalls[4];
        b.trgY = b4.trgY + (b.cfg.sp.y + b.openY) * b.ballScale;
      } else {
        b.trgY = (b.cfg.sp.y + b.openY) * b.ballScale;
      }
    }
    b.bottomY = b.trgY;
    b.radius = 250 * b.trgScale;

    if (b.bgWord) {
      if (!spMode) {
        b.bgWord.scale = b.ballScale;
        b.bgWord.shiftX = 170 * b.ballScale;
      } else {
        b.bgWord.scale = 0.5;
        b.bgWord.shiftX = (b.bgWord.idx % 2 === 0)
          ? (b.bgWord.idx === 4 ? -200 : -120)
          : 110;
      }
    }

    updateL1L2PosParams(b);
  }

  function onResize() {
    W = window.innerWidth;
    H = window.innerHeight;
    centerX = 0.5 * W;
    centerY = -0.5 * H;
    BS = calcBallScale(W);
    document.documentElement.style.setProperty('--u', (2 * BS).toFixed(4) + 'px');

    const nowWide = W > PHY.borderSP;
    if (nowWide !== isWide) {
      isWide = nowWide;
      closeAllMainBalls();
    }

    rebuildRenderTargets();

    bokehList.forEach(function (bk) {
      const mul = W <= PHY.borderSP ? 2 : 1;
      bk.scale = bk.baseScale * (W / 1900) * mul;
    });

    mainBalls.forEach(updateBallTargetsAndScale);

    frontItems.forEach(function (fi) {
      const p = fi.parm;
      if (W > PHY.borderSP) {
        fi.screenScale = calcBallScale(W);
        fi.wx = p.x * W;
        fi.scale = p.scale * fi.screenScale;
      } else {
        fi.screenScale = 390 / Math.max(320, W);
        fi.wx = p.sp.x * W;
        fi.scale = p.sp.scale;
      }
    });

    setPageHeight(true);
  }

  // ==================== L1 缩略图 1.3 -> 1.0 缩放淡入轮播（glSabSelectBallImgs） ====================
  function scheduleThumbCycle(l1Node) {
    if (!l1Node.dom.imgs || l1Node.dom.imgs.length <= 1) return;
    killTweensOf(l1Node.dom, 'imgTimer');
    l1Node.dom.imgTimer = 0;
    to(l1Node.dom, 'imgTimer', 1, 2.5, EASE.linear, 0, function () {
      if (!l1Node.dom.btn || l1Node.dom.btn.style.display === 'none' || l1Node.dom.thumOp < 0.5) return;
      if (!motionPaused && !prefersReduced) {
        const list = l1Node.dom.imgs;
        l1Node.dom.imgIdx = (l1Node.dom.imgIdx + 1) % list.length;
        const nextImg = list[l1Node.dom.imgIdx];
        l1Node.dom.thum.appendChild(nextImg);
        nextImg.style.display = 'block';
        const animState = { op: 0, sc: 1.3 };
        nextImg.style.opacity = '0';
        nextImg.style.transform = 'scale(1.3)';
        to(animState, 'op', 1, 0.8, EASE.p2io, 0.1 * l1Node.groupNum);
        to(animState, 'sc', 1, 0.8, EASE.p2io, 0.1 * l1Node.groupNum, function () {
          list.forEach(function (el, idx) {
            if (idx !== l1Node.dom.imgIdx) el.style.display = 'none';
          });
        });
        nextImg._animState = animState;
      }
      scheduleThumbCycle(l1Node);
    });
  }

  // ==================== L1 / L2 完整展开与收回状态机 ====================
  function openL1Node(parentBall, node) {
    killTweensOf(node, 'trgK');
    node.trgK = node.kGoal;
    node.trgR = parentBall.radius - 50;
    node.trgScale = 0.1;
    node.wx = parentBall.wx;
    node.wy = parentBall.wy;
    to(node, 'trgR', node.rGoal, 1.2, EASE.p3o, 0.15 * node.groupNum);
    to(node, 'trgScale', 1, 1.2, EASE.p3o, 0.10 * node.groupNum);
    to(node, 'selectScale', 1, 0.5, EASE.p2o, 0);

    const d = node.dom;
    d.domY = -parentBall.wy;
    d.thumScale = 1;
    d.thumOp = 1;
    d.mkOp = 1;
    d.closeOp = 0;
    if (d.secondClose) d.secondClose.style.display = 'none';
    d.btn.style.display = 'block';
    to(d, 'opacity', 1, 0.2, EASE.linear, 0.10 * node.groupNum + 0.3, function () {
      scheduleThumbCycle(node);
    });
  }

  function closeL1Node(parentBall, node, onDone) {
    killTweensOf(node.dom, 'imgTimer');
    to(node, 'trgR', parentBall.radius - 50, 0.6, EASE.p3o, 0.05 * node.groupNum);
    to(node, 'trgScale', 0.01, 0.7, EASE.p3o, 0.05 * node.groupNum, onDone);
    to(node, 'selectScale', 1, 0.5, EASE.p2o, 0);

    const d = node.dom;
    to(d, 'opacity', 0, 0.1, EASE.linear, 0, function () {
      d.thumScale = 1;
      d.thumOp = 1;
      d.mkOp = 1;
      d.closeOp = 0;
      if (d.secondClose) d.secondClose.style.display = 'none';
      d.btn.style.display = 'none';
    });
  }

  function openL2Group(parentBall, l1Node) {
    const l2 = l1Node.l2;
    if (!l2) return;
    l2.isOpen = true;
    l2.lineVis = true;

    l2.nodes.forEach(function (gn, m) {
      gn.trgR = 0;
      gn.trgS = 0.01;
      gn.wx = l1Node.wx;
      gn.wy = l1Node.wy;
      gn.curScale = 0.01;
      gn.tPosX = l1Node.tPosX;
      gn.tPosY = l1Node.tPosY;
      to(gn, 'trgR', gn.trgRGoal, 0.7, EASE.p3o, 0.2 * m);
      to(gn, 'trgS', gn.trgScaleGoal, 0.7, EASE.p3o, 0.2 * m);

      gn.dom.domX = gn.tPosX;
      gn.dom.domY = -gn.tPosY;
      gn.dom.btn.style.display = 'block';
      to(gn.dom, 'opacity', 1, 0.2, EASE.linear, 0.1 * m + 0.5);
    });

    // L2 粒子
    l2.particleAlpha = 0;
    to(l2, 'particleAlpha', 1, 0.6, EASE.linear, 0.7);
    l2.particles.forEach(function (p) {
      p.running = false;
      p.timer = 0;
      to(p, 'timer', 1, 0.6, EASE.linear, 0, function () {
        p.r = 300 * rnd();
        p.running = true;
      });
    });

    // L2 回流水珠（1.0s 后启动）
    killTweensOf(l2, 'dropTimer');
    l2.dropTimer = 0;
    to(l2, 'dropTimer', 1, 1.0, EASE.linear, 0, function () {
      if (!l2.isOpen) return;
      l2.nodes.forEach(function (gn) {
        gn.drops.forEach(function (dr) {
          dr.isActive = true;
          dr.isShow = true;
          dr.isFirst = true;
          startDropletYoyo(dr, function () {
            return W > PHY.borderSP ? parentBall.ballScale : 0.6 * parentBall.ballScale;
          }, 16.0, 2.7);
        });
      });
    });
  }

  function closeL2Group(l1Node) {
    const l2 = l1Node.l2;
    if (!l2 || !l2.isOpen) return;
    l2.isOpen = false;
    let doneCount = 0;

    l2.nodes.forEach(function (gn) {
      to(gn, 'trgR', 30, 0.5, EASE.p3o, 0);
      to(gn, 'trgS', 0.01, 0.5, EASE.p3o, 0, function () {
        doneCount++;
        if (doneCount >= l2.nodes.length && !l2.isOpen) {
          l2.lineVis = false;
          l2.nodes.forEach(function (n) {
            n.trgR = 0;
            n.wx = -4000;
          });
        }
      });
      to(gn.dom, 'opacity', 0, 0.1, EASE.linear, 0, function () {
        gn.dom.btn.style.display = 'none';
      });
      gn.drops.forEach(function (dr) {
        dr.isShow = false;
        stopDroplet(dr, 0.3);
      });
    });

    killTweensOf(l2, 'dropTimer');
    to(l2, 'particleAlpha', 0, 0.2, EASE.linear, 0);
    l2.particles.forEach(function (p) {
      killTweensOf(p, 'timer');
      p.running = false;
    });
  }

  // 点击 L1 子泡泡（05/06 打开详情卡片；01-04 展开/收起 L2 孙泡泡）
  function onL1BallClick(parentBall, groupIdx) {
    if (isTransition) return;
    const sec = parentBall.secData;
    const under = parentBall.under;
    if (!sec || !under) return;

    const clickedNode = under.l1Nodes[groupIdx];
    if (sec.directLeaf) {
      openLeafDetail({
        type: 'l1-leaf',
        sec: sec,
        item: clickedNode.data
      });
      return;
    }

    const wasOpen = under.sabOpenList[groupIdx] === 1;

    if (!wasOpen) {
      // 若之前有别的兄弟打开了 L2，先干净收起旧兄弟
      under.sabOpenList.forEach(function (val, idx) {
        if (val === 1 && idx !== groupIdx) {
          under.sabOpenList[idx] = 0;
          closeL2Group(under.l1Nodes[idx]);
        }
      });
      under.sabOpenList[groupIdx] = 1;
      historyState.openSab(parentBall.id, groupIdx);

      // 母球水平避让（glMainBall.sabBallMove: 1,3 左移 -100；2,4 右移 +140）
      const shiftGoal = W > PHY.borderSP
        ? ((parentBall.id === 1 || parentBall.id === 3) ? -100 : 140)
        : 0;
      to(parentBall, 'sabShiftX', shiftGoal, 1.5, EASE.p2o, 0);

      under.l1Nodes.forEach(function (node, i) {
        if (i === groupIdx) {
          // 激活 L1：缩略图收起换减号圆钮，移向扇形锚点并缩至 0.85
          const d = node.dom;
          killTweensOf(d, 'imgTimer');
          to(d, 'thumScale', 0.5, 0.2, EASE.p2o, 0);
          to(d, 'thumOp', 0, 0.2, EASE.linear, 0);
          to(d, 'mkOp', 0, 0.2, EASE.linear, 0);
          if (d.secondClose) {
            d.secondClose.style.display = 'block';
            to(d, 'closeOp', 1, 0.2, EASE.linear, 0.2);
          }

          const targetR = W > PHY.borderSP ? 480 : 290;
          const targetK = W > PHY.borderSP
            ? ((parentBall.id === 1 || parentBall.id === 3) ? -22 * DEG : -150 * DEG)
            : ((parentBall.id === 1 || parentBall.id === 3) ? -40 * DEG : -140 * DEG);
          to(node, 'trgR', targetR, 1.2, EASE.p2o, 0);
          to(node, 'trgK', targetK, 1.2, EASE.p2o, 0);
          to(node, 'selectScale', 0.85, 0.5, EASE.p2o, 0);

          // 激活 L1 水珠继续流动
          node.drops.forEach(function (dr) { dr.isActive = true; });
          openL2Group(parentBall, node);
        } else {
          // 兄弟 L1：退回母球内隐藏，暂停其水珠
          killTweensOf(node.dom, 'imgTimer');
          to(node, 'trgR', parentBall.radius - 100, 0.5, EASE.p3o, 0.05 * i);
          to(node, 'trgScale', 0, 0.5, EASE.p3o, 0.05 * i);
          to(node, 'selectScale', 1, 0.5, EASE.p2o, 0);
          to(node.dom, 'opacity', 0, 0.1, EASE.linear, 0, function () {
            node.dom.btn.style.display = 'none';
          });
          node.drops.forEach(function (dr) {
            dr.isActive = false;
            stopDroplet(dr, 0.3);
          });
        }
      });
    } else {
      // 再次点击激活 L1（减号圆钮）：收回 L2，母球归位，所有兄弟 L1 重新展开
      under.sabOpenList[groupIdx] = 0;
      historyState.closeSab(parentBall.id, groupIdx);
      to(parentBall, 'sabShiftX', 0, 1.5, EASE.p2o, 0);
      closeL2Group(clickedNode);

      under.l1Nodes.forEach(function (node, i) {
        if (i === groupIdx) {
          const d = node.dom;
          to(d, 'thumScale', 1, 0.2, EASE.p2o, 0);
          to(d, 'thumOp', 1, 0.2, EASE.linear, 0);
          to(d, 'mkOp', 1, 0.2, EASE.linear, 0);
          to(d, 'closeOp', 0, 0.2, EASE.linear, 0, function () {
            if (d.secondClose) d.secondClose.style.display = 'none';
          });
          to(node, 'trgR', node.rGoal, 0.7, EASE.p2o, 0);
          to(node, 'trgK', node.kGoal, 0.7, EASE.p2o, 0);
          to(node, 'selectScale', 1, 0.5, EASE.p2o, 0);
          scheduleThumbCycle(node);
        } else {
          openL1Node(parentBall, node);
          node.drops.forEach(function (dr) {
            dr.isActive = true;
            dr.isShow = true;
            startDropletYoyo(dr, function () {
              return W > PHY.borderSP ? node.ballScale : 0.6 * node.ballScale;
            }, 15.2, 3.0);
          });
        }
      });
    }
  }

  // 点击主泡（glTop.topBallClick & glMainBall.topBallClick）
  function toggleMainBall(ballId) {
    if (isTransition) return;
    const b = mainBalls[ballId];
    if (!b || ballId < 1 || ballId > 6) return;

    b.isOpen0 = !b.isOpen0;
    if (b.isOpen0) historyState.openMain(ballId);
    else historyState.closeMain(ballId);

    // 重新计算所有主泡纵向推开距离 openY（glTopMainBall.topBallClick）
    const spMode = W <= PHY.borderSP;
    let accumPitch = 0;
    for (let id = 1; id < mainBalls.length; id++) {
      const mb = mainBalls[id];
      let targetOpenY = accumPitch;
      if (id === 7) {
        const pitch7 = spMode ? mb.cfg.pitch * 1.15 : mb.cfg.pitch;
        targetOpenY = mainBalls[4].isOpen0 ? pitch7 : 0;
      }

      if (id === ballId) {
        mb.selectScale = mb.isOpen0 ? 0.85 : 1.0;
        const baseSc = spMode ? mb.cfg.sp.scale : mb.cfg.scale;
        const goalScale = baseSc * mb.ballScale * mb.selectScale;
        mb.trgScale = goalScale;
        mb.radius = 250 * goalScale;
        to(mb, 'groupScale', goalScale, 2.0, EASE.elasticOut, 0);
        to(mb.sab, 'selectR', mb.isOpen0 ? 0 : 1, 1.0, EASE.linear, 0);

        const mIcon = mb.dom.btn.querySelector('.gl-top-b2m');
        if (mIcon) {
          mIcon.classList.toggle('gl-top-b2m-close', mb.isOpen0);
          to(mb.dom, 'iconRot', mb.isOpen0 ? 180 : 0, 0.4, EASE.p2o, 0);
        }

        const under = mb.under;
        if (under) {
          if (mb.isOpen0) {
            under.isOpen = true;
            under.status = 1;
            under.closeCount = 0;
            under.lineVis = true;
            under.l1Nodes.forEach(function (n) { openL1Node(mb, n); });

            under.particleAlpha = 0;
            to(under, 'particleAlpha', 1, 0.6, EASE.linear, 0.7);
            under.l1Particles.forEach(function (p) {
              p.running = false;
              p.timer = 0;
              to(p, 'timer', 1, 0.6, EASE.linear, 0, function () {
                p.r = 300 * rnd();
                p.running = true;
              });
            });

            killTweensOf(under, 'dropTimer');
            under.dropTimer = 0;
            to(under, 'dropTimer', 1, 0.5, EASE.linear, 0, function () {
              if (!under.isOpen) return;
              under.l1Nodes.forEach(function (n) {
                n.drops.forEach(function (dr) {
                  dr.isActive = true;
                  dr.isShow = true;
                  dr.isFirst = true;
                  startDropletYoyo(dr, function () {
                    return W > PHY.borderSP ? n.ballScale : 0.6 * n.ballScale;
                  }, 15.2, 3.0);
                });
              });
            });
          } else {
            under.isOpen = false;
            under.closeCount = 0;
            to(mb, 'sabShiftX', 0, 1.5, EASE.p2o, 0);
            under.sabOpenList.fill(0);

            under.l1Nodes.forEach(function (n) {
              if (n.l2) closeL2Group(n);
              closeL1Node(mb, n, function () {
                under.closeCount++;
                if (under.closeCount >= under.l1Nodes.length && !under.isOpen) {
                  under.status = 0;
                  under.lineVis = false;
                }
              });
              n.drops.forEach(function (dr) {
                dr.isActive = true;
                dr.isShow = false;
                stopDroplet(dr, 0.3);
              });
            });

            killTweensOf(under, 'dropTimer');
            to(under, 'particleAlpha', 0, 0.2, EASE.linear, 0);
            under.l1Particles.forEach(function (p) {
              killTweensOf(p, 'timer');
              p.running = false;
            });
          }
        }
      }

      // 更新 bottomY 供页面总高度计算
      if (id === 7) {
        const b4 = mainBalls[4];
        const base4Y = spMode ? b4.bottomY : b4.trgY;
        const pos7Y = spMode ? mb.cfg.sp.y : mb.cfg.pc.y;
        mb.bottomY = (base4Y + pos7Y + targetOpenY) * mb.ballScale;
      } else {
        const posY = spMode ? mb.cfg.sp.y : mb.cfg.pc.y;
        mb.bottomY = (posY + targetOpenY) * mb.ballScale;
      }

      to(mb, 'openY', targetOpenY, 0.8, EASE.p3o, 0);

      if (mb.isOpen0 && id <= 6) {
        const pitch = spMode ? mb.cfg.pitch * 1.15 : mb.cfg.pitch;
        accumPitch += pitch;
      }
    }

    setPageHeight(false);
  }

  function closeAllMainBalls() {
    for (let id = 1; id <= 6; id++) {
      if (mainBalls[id].isOpen0) toggleMainBall(id);
    }
  }

  // ==================== 浏览历史状态记忆与恢复（复刻 glHistory） ====================
  const historyState = {
    savedScrollY: 0,
    topList: [[0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0], [0]],
    snapshot: null,
    openMain: function (id) {
      if (this.topList[id]) this.topList[id][0] = 1;
    },
    closeMain: function (id) {
      if (!this.topList[id]) return;
      this.topList[id][0] = 0;
      for (let i = 1; i < this.topList[id].length; i++) this.topList[id][i] = 0;
    },
    openSab: function (id, subIdx) {
      if (!this.topList[id]) return;
      this.topList[id][0] = 1;
      if (id >= 1 && id <= 4) {
        for (let s = 1; s < this.topList[id].length; s++) {
          this.topList[id][s] = (s === subIdx + 1) ? 1 : 0;
        }
      }
    },
    closeSab: function (id, subIdx) {
      if (id >= 1 && id <= 4 && this.topList[id]) {
        this.topList[id][subIdx + 1] = 0;
      }
    },
    captureBeforeTransition: function () {
      this.savedScrollY = scrollCtrl.target;
      this.snapshot = this.topList.map(function (arr) { return arr.slice(); });
    },
    restoreAfterDetail: function () {
      if (!this.snapshot) return;
      const snap = this.snapshot;
      const targetScroll = this.savedScrollY;
      this.snapshot = null;

      for (let id = 1; id <= 6; id++) {
        if (snap[id] && snap[id][0] === 1 && !mainBalls[id].isOpen0) {
          toggleMainBall(id);
          if (id >= 1 && id <= 4) {
            let subOpen = -1;
            for (let s = 1; s < snap[id].length; s++) {
              if (snap[id][s] > 0) { subOpen = s - 1; break; }
            }
            if (subOpen >= 0) {
              (function (capturedId, capturedSub) {
                const timerObj = { v: 0 };
                to(timerObj, 'v', 1, 0.85, EASE.linear, 0, function () {
                  if (mainBalls[capturedId].isOpen0) {
                    onL1BallClick(mainBalls[capturedId], capturedSub);
                  }
                });
              })(id, subOpen);
            }
          }
        }
      }
      setPageHeight(true);
      smoothScrollTo(targetScroll, true);
    }
  };

  // ==================== 详情卡片预览与转场动画（glTransitionBall + <dialog closedby="any">） ====================
  const detailDialog = document.getElementById('detail-dialog');
  const detailArtImg = document.getElementById('detail-art-img');
  const detailTag = document.getElementById('detail-tag');
  const detailTitle = document.getElementById('detail-title');
  const detailSubtitle = document.getElementById('detail-subtitle');
  const detailBody = document.getElementById('detail-body');
  const detailMeta = document.getElementById('detail-meta');
  const detailBackBtn = document.getElementById('detail-back-btn');

  // Safari 等尚未支持 HTMLDialogElement.prototype.closedBy 浏览器的背景轻点关闭回退
  if (detailDialog && !('closedBy' in HTMLDialogElement.prototype)) {
    detailDialog.addEventListener('click', function (event) {
      if (event.target !== detailDialog) return;
      const rect = detailDialog.getBoundingClientRect();
      const isInDialog = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (!isInDialog) detailDialog.close();
    });
  }

  function stripBr(htmlStr) {
    return String(htmlStr || '').replace(/<br\s*\/?>/gi, ' · ');
  }

  function populateDetailDialog(payload) {
    const ui = DATA.ui[currentLang];
    detailBackBtn.textContent = ui.backToBubbles;

    if (payload.type === 'ball0') {
      const c = ui.ball0Card;
      detailArtImg.src = SP.buildThumbDataURL({ palette: ['#ee5571', '#fdecef', '#fbd3c6'], motif: 'window' }, 192);
      detailTag.textContent = c.tag;
      detailTitle.textContent = c.title;
      detailSubtitle.textContent = c.subtitle;
      detailBody.textContent = c.body;
      detailMeta.innerHTML = c.meta.map(function (m) { return '<span class="detail-pill">' + m + '</span>'; }).join('');
    } else if (payload.type === 'ball7') {
      const c = ui.ball7Card;
      detailArtImg.src = SP.buildThumbDataURL({ palette: ['#fd8f2a', '#fff6e3', '#86d86a'], motif: 'orbit' }, 192);
      detailTag.textContent = c.tag;
      detailTitle.textContent = c.title;
      detailSubtitle.textContent = c.subtitle;
      detailBody.textContent = c.body;
      detailMeta.innerHTML = c.meta.map(function (m) { return '<span class="detail-pill">' + m + '</span>'; }).join('');
    } else if (payload.type === 'l1-leaf') {
      const sec = payload.sec;
      const it = payload.item;
      detailArtImg.src = SP.buildThumbDataURL(it, 192);
      detailTag.textContent = sec.bgSup + ' · ' + stripBr(sec.label[currentLang]);
      detailTitle.textContent = stripBr(it.label[currentLang]);
      detailSubtitle.textContent = sec.bgTitle.join(' ');
      detailBody.textContent = it.desc[currentLang];
      detailMeta.innerHTML = [
        '0' + sec.id + ' · ' + stripBr(sec.label[currentLang]),
        currentLang === 'zh' ? '点击卡片外部或按 Esc 即可返回原位置' : 'Click outside or press Esc to return'
      ].map(function (m) { return '<span class="detail-pill">' + m + '</span>'; }).join('');
    } else {
      const sec = payload.sec;
      const l1 = payload.l1;
      const it = payload.item;
      detailArtImg.src = SP.buildThumbDataURL(it, 192);
      detailTag.textContent = sec.bgSup + ' · ' + stripBr(l1.label[currentLang]);
      detailTitle.textContent = stripBr(it.label[currentLang]);
      detailSubtitle.textContent = '0' + sec.id + ' ' + stripBr(sec.label[currentLang]);
      detailBody.textContent = it.desc[currentLang];
      detailMeta.innerHTML = [
        sec.bgTitle.join(' '),
        stripBr(l1.label[currentLang]),
        currentLang === 'zh' ? '三级记忆切片预览' : 'Level-2 Memory Fragment'
      ].map(function (m) { return '<span class="detail-pill">' + m + '</span>'; }).join('');
    }
  }

  let currentDetailPayload = null;

  function openLeafDetail(payload) {
    if (isTransition) return;
    currentDetailPayload = payload;
    populateDetailDialog(payload);

    if (prefersReduced || motionPaused) {
      historyState.captureBeforeTransition();
      detailDialog.showModal();
      return;
    }

    // 1:1 复刻官网 glMain.transitionMove 聚合转场动画
    isTransition = true;
    historyState.captureBeforeTransition();

    to(sceneState, 'topLineOpacity', 0, 0.3, EASE.linear, 0);
    to(sceneState, 'jointAlpha', 0, 0.2, EASE.linear, 0);
    to(sceneState, 'frontAlpha', 0, 1.0, EASE.p3io, 0);

    // 前景装饰球向外 2 倍距离飞散
    frontItems.forEach(function (fi) {
      const dx = fi.wx - centerX;
      const dy = (fi.wy || centerY) - centerY;
      const ang = Math.atan2(dy, dx);
      const dist = Math.hypot(dx, dy);
      fi.transX = fi.wx;
      fi.transY = fi.wy || centerY;
      to(fi, 'transX', centerX + Math.cos(ang) * dist * 2, 1.0, EASE.p3io, 0);
      to(fi, 'transY', centerY + Math.sin(ang) * dist * 2, 1.0, EASE.p3io, 0);
    });

    // 主泡与已展开子孙泡向屏幕中心聚合缩小
    mainBalls.forEach(function (b) {
      to(b.dom, 'opacity', 0, 0.2, EASE.linear, 0);
      if (b.bgWord) to(b.bgWord, 'alpha', 0, 0.2, EASE.linear, 0);
      to(b, 'wx', centerX, 0.8, EASE.p2io, 0);
      to(b, 'wy', centerY, 0.8, EASE.p2io, 0);
      to(b, 'groupScale', 0.1, 0.8, EASE.p2io, 0);

      if (b.under && b.under.isOpen) {
        b.under.lineVis = false;
        b.under.particleAlpha = 0;
        b.under.l1Nodes.forEach(function (n) {
          to(n.dom, 'opacity', 0, 0.15, EASE.linear, 0, function () {
            n.dom.btn.style.display = 'none';
          });
          to(n, 'wx', centerX, 0.7, EASE.p2io, 0);
          to(n, 'wy', centerY, 0.7, EASE.p2io, 0);
          to(n, 'trgScale', 0.01, 0.7, EASE.p2io, 0);
          n.drops.forEach(function (dr) { dr.isShow = false; stopDroplet(dr, 0.2); });
          if (n.l2 && n.l2.isOpen) {
            n.l2.lineVis = false;
            n.l2.particleAlpha = 0;
            n.l2.nodes.forEach(function (gn) {
              to(gn.dom, 'opacity', 0, 0.15, EASE.linear, 0, function () {
                gn.dom.btn.style.display = 'none';
              });
              to(gn, 'wx', centerX, 0.7, EASE.p2io, 0);
              to(gn, 'wy', centerY, 0.7, EASE.p2io, 0);
              to(gn, 'curScale', 0.01, 0.7, EASE.p2io, 0);
              gn.drops.forEach(function (dr) { dr.isShow = false; stopDroplet(dr, 0.2); });
            });
          }
        });
      }
    });

    // 转场球在屏幕中心绽放
    const baseSc = W > PHY.borderSP ? W / 1900 : 0.5;
    transitionBall.vis = true;
    transitionBall.spinning = true;
    transitionBall.wx = centerX;
    transitionBall.wy = centerY;
    transitionBall.scale = 0.01;
    transitionBall.groupRz = 0;
    to(transitionBall, 'scale', baseSc * 0.65, 0.75, EASE.p3o, 0.22);

    const openModalTimer = { v: 0 };
    to(openModalTimer, 'v', 1, 0.68, EASE.linear, 0, function () {
      if (!detailDialog.open) detailDialog.showModal();
    });
  }

  // 关闭详情卡片后执行返回星图散开与历史状态恢复（close 事件同时覆盖 Esc、背景轻点与返回按钮）
  detailDialog.addEventListener('close', function () {
    currentDetailPayload = null;
    if (!isTransition) {
      historyState.restoreAfterDetail();
      return;
    }

    // 先静默重置展开标记，以便 viewStart 飞回原位后再由 historyState 自动重开对应分支
    mainBalls.forEach(function (b) {
      b.isOpen0 = false;
      b.selectScale = 1;
      b.openY = 0;
      b.sabShiftX = 0;
      const mIcon = b.dom.btn.querySelector('.gl-top-b2m');
      if (mIcon) mIcon.classList.remove('gl-top-b2m-close');
      b.dom.iconRot = 0;
      if (b.under) {
        b.under.isOpen = false;
        b.under.status = 0;
        b.under.sabOpenList.fill(0);
        b.under.l1Nodes.forEach(function (n) {
          if (n.l2) n.l2.isOpen = false;
        });
      }
    });

    to(transitionBall, 'scale', 0.01, 0.45, EASE.p1io, 0.05, function () {
      transitionBall.vis = false;
      transitionBall.spinning = false;
    });

    isTransition = false;
    startTopView(true);
  });

  // ==================== 主按钮 DOM 内容渲染与多语言热切换 ====================
  function renderDomCopy() {
    const ui = DATA.ui[currentLang];
    document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';

    // Header 控件文案
    const langTrigger = document.getElementById('lang-trigger');
    if (langTrigger) langTrigger.textContent = ui.langLabel;

    document.querySelectorAll('[data-lang-opt]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lang-opt') === currentLang);
    });

    const motionBtn = document.getElementById('motion-toggle');
    if (motionBtn) {
      motionBtn.textContent = motionPaused ? ui.playMotion : ui.pauseMotion;
    }

    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) {
      const isOpen = document.body.classList.contains('menu-open');
      menuBtn.setAttribute('aria-label', isOpen ? ui.menuCloseLabel : ui.menuOpenLabel);
    }

    // 主泡泡与 L1/L2 子泡泡文案
    mainBalls.forEach(function (b) {
      if (b.id === 0) {
        b.dom.btn.innerHTML =
          '<div class="gl-top-b1">' +
            '<div class="gl-top-b1Ring"></div>' +
            '<div class="gl-top-b1T-en">' +
              '<span class="gl-top-b1T-sup">' + ui.ball0Sup[0] + '</span>' +
              '<span class="gl-top-b1T-main">' + ui.ball0Sup[1] + '</span>' +
            '</div>' +
            '<div class="gl-top-b1T-sub glja-m">' + ui.ball0Sub + '</div>' +
            '<div class="gl-top-b1M"></div>' +
          '</div>';
      } else if (b.id >= 1 && b.id <= 6) {
        const sec = b.secData;
        const closeCls = b.isOpen0 ? ' gl-top-b2m-close' : '';
        b.dom.btn.innerHTML =
          '<div class="gl-top-b2">' +
            '<div class="gl-top-b2n glen-sun">0' + b.id + '</div>' +
            '<div class="gl-top-b2t glja-m">' + sec.label[currentLang] + '</div>' +
            '<div class="gl-top-b2m gl-top-b2mOpen' + closeCls + '" style="transform:rotate(' + b.dom.iconRot + 'deg)">' +
              '<div class="gl-top-b2mRing"></div>' +
            '</div>' +
          '</div>';

        if (b.under) {
          b.under.l1Nodes.forEach(function (node) {
            node.dom.txt.innerHTML = node.data.label[currentLang];
            if (node.l2) {
              node.l2.nodes.forEach(function (gn) {
                gn.dom.txt.innerHTML = gn.data.label[currentLang];
              });
            }
          });
        }
      } else if (b.id === 7) {
        b.dom.btn.innerHTML =
          '<div class="gl-top-b3">' +
            '<div class="gl-top-b2m"><div class="gl-top-b2mRing"></div></div>' +
          '</div>' +
          '<div class="gl-top-b3t glen-sun">' +
            ui.ball7Lines.join('<br>') +
            '<span class="gl-top-b3tj glja-m">' + ui.ball7Sub + '</span>' +
          '</div>';
      }
    });

    // 全屏导航菜单与红色页脚
    const menuNavList = document.getElementById('menu-nav-list');
    const footerNav = document.getElementById('footer-nav');
    if (menuNavList) {
      menuNavList.innerHTML = ui.navItems.map(function (it, idx) {
        return '<li><button type="button" class="menu-nav-btn' + (idx === 0 ? ' is-current' : '') + '" data-nav-action="' + it.action + '">' + it.label + '</button></li>';
      }).join('');
    }
    if (footerNav) {
      footerNav.innerHTML = ui.navItems.map(function (it, idx) {
        return '<button type="button" class="' + (idx === 0 ? 'is-current' : '') + '" data-nav-action="' + it.action + '">' + it.label + '</button>';
      }).join('');
    }

    const extHtml = ui.externalLinks.map(function (l) {
      return '<a href="#top" data-info-link="1"><span>' + l.prefix + '</span>' + l.label + '</a>';
    }).join('');
    const polHtml = ui.policyLinks.map(function (p) {
      return '<a href="#top" data-info-link="1">' + p + '</a>';
    }).join('');

    const menuExt = document.getElementById('menu-ext-list');
    const menuPol = document.getElementById('menu-policy-list');
    const footExt = document.getElementById('footer-ext-list');
    const footPol = document.getElementById('footer-policy-list');
    if (menuExt) menuExt.innerHTML = extHtml;
    if (menuPol) menuPol.innerHTML = polHtml;
    if (footExt) {
      footExt.innerHTML = ui.externalLinks.map(function (l) {
        return '<a href="#top" data-info-link="1"><b>' + l.prefix + '</b>' + l.label + '</a>';
      }).join('');
    }
    if (footPol) footPol.innerHTML = polHtml;

    if (currentDetailPayload && detailDialog.open) {
      populateDetailDialog(currentDetailPayload);
    }
  }

  // 绑定主泡泡按钮点击
  mainBalls.forEach(function (b) {
    b.dom.btn.addEventListener('click', function () {
      if (b.id === 0) {
        openLeafDetail({ type: 'ball0' });
      } else if (b.id >= 1 && b.id <= 6) {
        toggleMainBall(b.id);
      } else if (b.id === 7) {
        openLeafDetail({ type: 'ball7' });
      }
    });
  });

  // 绑定全屏导航抽屉、语言切换、暂停动效与返回顶部
  const globalMenu = document.getElementById('global-menu');
  const menuBtn = document.getElementById('menu-btn');
  const langWrap = document.getElementById('lang-wrap');
  const langTrigger = document.getElementById('lang-trigger');
  const motionBtn = document.getElementById('motion-toggle');
  const pageTopBtn = document.getElementById('pagetop-btn');

  function setMenuOpen(open) {
    document.body.classList.toggle('menu-open', open);
    globalMenu.classList.toggle('open', open);
    globalMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    const ui = DATA.ui[currentLang];
    menuBtn.setAttribute('aria-label', open ? ui.menuCloseLabel : ui.menuOpenLabel);
  }

  menuBtn.addEventListener('click', function () {
    setMenuOpen(!document.body.classList.contains('menu-open'));
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('menu-open') && !detailDialog.open) {
      setMenuOpen(false);
    }
  });

  langTrigger.addEventListener('click', function (e) {
    e.stopPropagation();
    langWrap.classList.toggle('open');
  });

  document.addEventListener('click', function () {
    langWrap.classList.remove('open');
  });

  document.querySelectorAll('[data-lang-opt]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const next = btn.getAttribute('data-lang-opt');
      if (next && DATA.ui[next]) {
        currentLang = next;
        renderDomCopy();
      }
      langWrap.classList.remove('open');
    });
  });

  motionBtn.addEventListener('click', function () {
    motionPaused = !motionPaused;
    renderDomCopy();
  });

  reducedMotionQuery.addEventListener('change', function (ev) {
    prefersReduced = ev.matches;
  });

  // ==================== 内置丝滑惯性滚动控制器（对标官网 Lenis PC 平滑阻尼，彻底消除滚轮顿挫） ====================
  const scrollCtrl = {
    current: window.scrollY || 0,
    target: window.scrollY || 0,
    lastWrittenInt: Math.round(window.scrollY || 0),
    lastWrittenY: window.scrollY || 0,
    active: false
  };

  function getMaxScroll() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function smoothScrollTo(y, immediate) {
    const clamped = Math.max(0, Math.min(getMaxScroll(), y));
    scrollCtrl.target = clamped;
    if (immediate || prefersReduced || motionPaused) {
      scrollCtrl.current = clamped;
      scrollCtrl.active = false;
      const nextInt = Math.round(clamped);
      scrollCtrl.lastWrittenInt = nextInt;
      window.scrollTo(0, nextInt);
      scrollCtrl.lastWrittenY = window.scrollY;
      if (scrollFixEl) scrollFixEl.style.transform = '';
    } else {
      scrollCtrl.active = true;
    }
  }

  window.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.metaKey || prefersReduced || motionPaused) return;
    if ((detailDialog && detailDialog.open) || document.body.classList.contains('menu-open')) return;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 36;
    else if (e.deltaMode === 2) dy *= H * 0.85;
    else dy *= 0.92;
    if (dy === 0) return;
    e.preventDefault();
    scrollCtrl.target = Math.max(0, Math.min(getMaxScroll(), scrollCtrl.target + dy));
    scrollCtrl.active = true;
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (prefersReduced || motionPaused || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((detailDialog && detailDialog.open) || document.body.classList.contains('menu-open')) return;
    const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag === 'a') {
      if (e.key === ' ' || e.key === 'Enter') return;
    }
    let delta = 0;
    if (e.key === 'ArrowDown') delta = 96;
    else if (e.key === 'ArrowUp') delta = -96;
    else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) delta = H * 0.82;
    else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) delta = -H * 0.82;
    else if (e.key === 'Home') { e.preventDefault(); smoothScrollTo(0, false); return; }
    else if (e.key === 'End') { e.preventDefault(); smoothScrollTo(getMaxScroll(), false); return; }
    if (delta !== 0) {
      e.preventDefault();
      smoothScrollTo(scrollCtrl.target + delta, false);
    }
  });

  window.addEventListener('scroll', function () {
    const sy = window.scrollY;
    if (performance.now() < pageHeightState.clampingGuardUntil && sy <= scrollCtrl.lastWrittenY + 2) {
      scrollCtrl.lastWrittenY = sy;
      scrollCtrl.lastWrittenInt = Math.round(sy);
      return;
    }
    if (!scrollCtrl.active || Math.abs(sy - scrollCtrl.lastWrittenY) > 2) {
      scrollCtrl.current = sy;
      scrollCtrl.target = sy;
      scrollCtrl.lastWrittenInt = Math.round(sy);
      scrollCtrl.lastWrittenY = sy;
      scrollCtrl.active = false;
      if (scrollFixEl) scrollFixEl.style.transform = '';
    }
  }, { passive: true });

  function handleNavAction(action) {
    setMenuOpen(false);
    if (action === 'top') {
      smoothScrollTo(0, false);
    } else if (action === 'ball0') {
      smoothScrollTo(0, true);
      openLeafDetail({ type: 'ball0' });
    } else if (action && action.indexOf('sec') === 0) {
      const id = parseInt(action.slice(3), 10);
      const b = mainBalls[id];
      if (b) {
        const targetTop = Math.max(0, -b.trgY - H * 0.36);
        smoothScrollTo(targetTop, false);
        if (!b.isOpen0) toggleMainBall(id);
      }
    }
  }

  document.addEventListener('click', function (e) {
    const navBtn = e.target.closest('[data-nav-action]');
    if (navBtn) {
      e.preventDefault();
      handleNavAction(navBtn.getAttribute('data-nav-action'));
      return;
    }
    const infoLink = e.target.closest('[data-info-link]');
    if (infoLink) {
      e.preventDefault();
      setMenuOpen(false);
      openLeafDetail({ type: 'ball0' });
    }
  });

  pageTopBtn.addEventListener('click', function () {
    smoothScrollTo(0, false);
  });

  // ==================== 开场揭幕与星图散开序列（1:1 复刻 glLoading + glTransitionBall + viewStart） ====================
  function startTopView(restoreHistoryAfter) {
    updateBallTargetsAndScale(mainBalls[4]);
    mainBalls.forEach(updateBallTargetsAndScale);
    setPageHeight(true);

    // Hero 5 段文字依次浮现（delays 0.5, 0.65, 0.8, 0.95, 1.1）
    const delays = [0.5, 0.65, 0.8, 0.95, 1.1];
    heroDom.fades.forEach(function (fd, idx) {
      if (prefersReduced) {
        fd.v = 1;
        heroDom.parts[idx].style.opacity = '1';
      } else {
        fd.v = 0;
        heroDom.parts[idx].style.opacity = '0';
        to(fd, 'v', 1, 0.7, EASE.p3io, delays[idx]);
      }
    });

    // 前景装饰球淡入
    if (prefersReduced) {
      sceneState.frontAlpha = 1;
    } else {
      sceneState.frontAlpha = 0;
      to(sceneState, 'frontAlpha', 1, 1.5, EASE.p3o, 0.3);
    }

    let arrivedCount = 0;
    const scrollNow = scrollCtrl.current;

    mainBalls.forEach(function (b) {
      b.vis = true;
      b.dom.trgX = b.trgX;

      if (prefersReduced) {
        b.isStartView = false;
        b.wx = b.trgX;
        b.wy = b.trgY + scrollNow;
        b.groupScale = b.trgScale;
        b.sab.vis = true;
        b.sab.selectR = 1;
        b.dom.opacity = 1;
        if (b.bgWord) { b.bgWord.vis = true; b.bgWord.alpha = 0.25; }
        sceneState.topLineOpacity = 0.16;
        sceneState.jointAlpha = 1;
        sceneState.dispStrength = 0.004;
      } else {
        b.isStartView = true;
        b.wx = centerX;
        b.wy = centerY;
        b.groupScale = 0.1;
        b.sab.selectR = 0;
        b.dom.opacity = 0;
        const dl = (b.id % 3) * 0.1;

        to(b, 'groupScale', b.trgScale, 1.15, EASE.p3io, dl);
        to(b, 'wx', b.trgX, 1.15, EASE.p3io, dl);
        to(b, 'wy', b.trgY + scrollNow, 1.15, EASE.p3io, dl, function () {
          b.isStartView = false;
          to(b.dom, 'opacity', 1, 0.55, EASE.p2o, 0);
          if (b.id === 0) {
            b.dom.b1Scale = 1.1;
            to(b.dom, 'b1Scale', 1.0, 0.65, EASE.p2o, 0);
          }
          arrivedCount++;
          if (arrivedCount >= mainBalls.length) {
            // viewStartNext：卫星球鼓包、背景衬线大标题、主连线、流动水珠依次登场
            mainBalls.forEach(function (mb) {
              mb.sab.vis = true;
              to(mb.sab, 'selectR', 1, 1.0, EASE.linear, 0);
              if (mb.bgWord) {
                mb.bgWord.vis = true;
                to(mb.bgWord, 'alpha', 0.25, 0.8, EASE.p3o, 0);
              }
            });
            to(sceneState, 'topLineOpacity', 0.16, 1.0, EASE.p3o, 0);
            to(sceneState, 'jointAlpha', 1, 0.3, EASE.linear, 0);
            setPageHeight(true);

            if (restoreHistoryAfter) {
              historyState.restoreAfterDetail();
            }
          }
        });
      }
    });

    if (prefersReduced && restoreHistoryAfter) {
      historyState.restoreAfterDetail();
    }
  }

  function runInitialOpening() {
    const loadingWrap = document.getElementById('gl-loading');
    const loadingBg = loadingWrap.querySelector('.gl-loading-bg');
    const loadingLogo = loadingWrap.querySelector('.gl-loading-logo');
    const loadingRing = loadingWrap.querySelector('.gl-loading-ring');

    if (prefersReduced) {
      loadingWrap.style.display = 'none';
      transitionBall.vis = false;
      startTopView(false);
      return;
    }

    const loadAnim = { bgOp: 1, logoOp: 1, logoSc: 1, ringOp: 1, openTimer: 0 };

    to(loadAnim, 'ringOp', 0, 0.6, EASE.linear, 0, function () {
      loadingRing.style.display = 'none';
    });
    to(loadAnim, 'logoOp', 0, 1.1, EASE.p3io, 0.1);
    to(loadAnim, 'logoSc', 0.1, 1.1, EASE.p3io, 0.1, function () {
      loadingWrap.style.display = 'none';
    });
    to(loadAnim, 'bgOp', 0, 1.0, EASE.p3o, 0.2, function () {
      loadingBg.style.display = 'none';
    });

    // 转场球从全屏 6 倍尺寸收缩揭幕
    const initSc = 6 * (Math.max(window.screen.width, window.screen.height) / 1920);
    transitionBall.vis = true;
    transitionBall.wx = centerX;
    transitionBall.wy = centerY;
    transitionBall.scale = initSc;
    transitionBall.groupRz = 30 * DEG;

    to(transitionBall, 'scale', 0.12, 1.4, EASE.p3io, 0, function () {
      to(transitionBall, 'scale', 0.01, 0.3, EASE.linear, 0, function () {
        transitionBall.vis = false;
      });
    });
    to(transitionBall, 'groupRz', 0, 1.5, EASE.p3io, 0);
    to(sceneState, 'dispStrength', 0.004, 1.5, EASE.p3io, 0);

    to(loadAnim, 'openTimer', 1, 0.45, EASE.linear, 0, function () {
      startTopView(false);
    });

    loadingWrap._loadAnim = loadAnim;
  }

  // ==================== 主渲染循环（enterFrame） ====================
  let lastNow = performance.now();
  let prevScrollY = window.scrollY;
  let scrollDis = 0;
  let frameCount = 0;

  function hexRgbNormalized(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function renderFrame(now) {
    const dtMs = Math.max(1, now - lastNow);
    lastNow = now;
    updateConf(dtMs);
    frameCount++;

    clockSec += dtMs / 1000;
    stepTweens();

    const nextPageH = Math.ceil(pageHeightState.h);
    if (pageHeightState.h > 0 && nextPageH !== pageHeightState.appliedInt) {
      pageHeightState.appliedInt = nextPageH;
      pageHeightState.clampingGuardUntil = now + 80;
      contentsEl.style.height = nextPageH + 'px';
    }

    // 更新 Loading 覆盖层动画样式
    const loadingWrap = document.getElementById('gl-loading');
    if (loadingWrap && loadingWrap._loadAnim && loadingWrap.style.display !== 'none') {
      const la = loadingWrap._loadAnim;
      loadingWrap.querySelector('.gl-loading-bg').style.opacity = la.bgOp.toFixed(3);
      const lg = loadingWrap.querySelector('.gl-loading-logo');
      lg.style.opacity = la.logoOp.toFixed(3);
      lg.style.transform = 'translate(-50%, -50%) scale(' + la.logoSc.toFixed(3) + ')';
      loadingWrap.querySelector('.gl-loading-ring').style.opacity = la.ringOp.toFixed(3);
    }

    // 推进平滑滚动阻尼与亚像素 DOM 残差补偿（让 WebGL 气泡与 Hero/页脚共享同一连续浮点坐标）
    const maxScroll = getMaxScroll();
    if (scrollCtrl.target > maxScroll) scrollCtrl.target = maxScroll;
    if (scrollCtrl.current > maxScroll) {
      scrollCtrl.current = maxScroll;
      scrollCtrl.lastWrittenInt = Math.round(maxScroll);
      scrollCtrl.lastWrittenY = window.scrollY;
    }
    if (scrollCtrl.active && !prefersReduced && !motionPaused) {
      const diff = scrollCtrl.target - scrollCtrl.current;
      if (Math.abs(diff) < 0.06) {
        scrollCtrl.current = scrollCtrl.target;
        scrollCtrl.active = false;
      } else {
        scrollCtrl.current += diff * expLerp(0.11);
      }
      const nextInt = Math.round(scrollCtrl.current);
      if (nextInt !== scrollCtrl.lastWrittenInt) {
        scrollCtrl.lastWrittenInt = nextInt;
        window.scrollTo(0, nextInt);
        scrollCtrl.lastWrittenY = window.scrollY;
      }
      if (scrollFixEl) {
        const subPx = window.scrollY - scrollCtrl.current;
        scrollFixEl.style.transform = Math.abs(subPx) > 0.005 ? ('translate3d(0,' + subPx.toFixed(3) + 'px,0)') : '';
      }
    } else if (scrollFixEl && scrollFixEl.style.transform) {
      scrollFixEl.style.transform = '';
    }

    const scrollY = scrollCtrl.current;
    const dScroll = scrollY - prevScrollY;
    prevScrollY = scrollY;
    scrollDis = scrollDis * conf.s098a + dScroll * conf.s098b;

    const animStep = (motionPaused || prefersReduced) ? 0 : conf.d;

    // 1. Hero 视差与渐显同步
    const heroTargetX = -0.05 * effectX;
    heroDom.titleX = heroDom.titleX * conf.s099a + heroTargetX * conf.s099b;
    heroDom.root.style.transform = 'translate3d(' + heroDom.titleX.toFixed(2) + 'px, 0, 0)';
    heroDom.fades.forEach(function (fd, idx) {
      heroDom.parts[idx].style.opacity = fd.v.toFixed(3);
    });

    // 2. 更新 8 颗主泡泡与 L1/L2 子孙泡泡物理位置
    const spMode = W <= PHY.borderSP;
    mainBalls.forEach(function (b) {
      // 动态更新 openFrame 目标 Y
      if (b.id === 7) {
        const b4 = mainBalls[4];
        const pos7Y = spMode ? b.cfg.sp.y : b.cfg.pc.y;
        b.trgY = b4.trgY + (pos7Y + b.openY) * b.ballScale;
      } else {
        const posY = spMode ? b.cfg.sp.y : b.cfg.pc.y;
        b.trgY = (posY + b.openY) * b.ballScale;
      }
      b.trgX = spMode ? W * b.cfg.sp.x : W * b.cfg.pc.x;

      if (b.isStartView || isTransition) {
        b.rzBg -= 0.01 * animStep;
        b.rzFront += 0.01 * animStep;
        b.sinY = 34 * Math.sin(b.sinYCount);
      } else {
        b.sinYCount += 0.012 * animStep;
        b.sinY = 34 * Math.sin(b.sinYCount);
        b.rzBg -= 0.01 * animStep;
        b.rzFront += 0.01 * animStep;
        b.effectX = b.effectX * conf.s099a + (0.1 * effectX) * conf.s099b;
        b.wx = b.trgX - b.effectX + b.sabShiftX;

        const targetWy = b.trgY + scrollY;
        const pair = lerpPairFor(b.cfg.lerp);
        b.wy = b.wy * pair[0] + targetWy * pair[1];
      }

      // 内部卫星球（制造胶质边缘呼吸鼓包）
      const st = b.sab;
      st.k += 0.004 * animStep;
      st.rz -= 0.001 * animStep;
      st.sinCount += 0.015 * animStep;

      // 主按钮 DOM 跟随（x 0.05 阻尼跟随，y 跟随泡泡组中心而非上下浮动）
      b.dom.trgX = b.dom.trgX * conf.s095a + b.wx * conf.s095b;
      b.dom.btn.style.transform = 'translate3d(' + b.dom.trgX.toFixed(2) + 'px, ' + (-b.wy).toFixed(2) + 'px, 0)';
      b.dom.btn.style.opacity = b.dom.opacity.toFixed(3);
      b.dom.btn.style.pointerEvents = (b.dom.opacity > 0.25 && !isTransition) ? 'auto' : 'none';
      if (b.id === 0) {
        const b1El = b.dom.btn.querySelector('.gl-top-b1');
        if (b1El && b.dom.b1Scale !== 1) {
          b1El.style.transform = 'scale(' + b.dom.b1Scale.toFixed(3) + ')';
        }
      } else if (b.id >= 1 && b.id <= 6) {
        const mEl = b.dom.btn.querySelector('.gl-top-b2m');
        if (mEl) mEl.style.transform = 'rotate(' + b.dom.iconRot.toFixed(1) + 'deg)';
      }

      // L1 & L2 子孙泡泡更新
      const under = b.under;
      if (under && (under.status === 1 || isTransition)) {
        under.l1Nodes.forEach(function (node) {
          if (!isTransition) {
            let tx, ty;
            if (!spMode) {
              node.moveCount += node.moveSpeed * animStep;
              const mv = 0.07 * Math.sin(node.moveCount) + 1;
              tx = Math.cos(node.trgK) * node.trgR * mv * node.ballScale + b.wx;
              ty = Math.sin(node.trgK) * node.trgR * mv * node.ballScale + b.wy;
              node.tPosX = tx;
              node.tPosY = Math.sin(node.trgK) * node.trgR * node.ballScale + b.wy;
            } else {
              tx = Math.cos(node.trgK) * node.trgR * node.ballScale + b.wx;
              ty = Math.sin(node.trgK) * node.trgR * node.ballScale + b.wy;
              node.tPosX = tx;
              node.tPosY = ty;
            }
            node.wx = tx;
            const lp = lerpPairFor(node.lerpRate);
            node.wy = node.wy * lp[0] + ty * lp[1];
            node.rz += 0.01 * animStep;
          }

          // L1 DOM 同步
          const nd = node.dom;
          if (!spMode) {
            nd.domY = nd.domY * conf.s070a + (-node.tPosY) * conf.s070b;
            nd.btn.style.transform = 'translate3d(' + node.tPosX.toFixed(2) + 'px, ' + nd.domY.toFixed(2) + 'px, 0)';
          } else {
            nd.btn.style.transform = 'translate3d(' + node.wx.toFixed(2) + 'px, ' + (-node.wy).toFixed(2) + 'px, 0)';
          }
          nd.btn.style.opacity = nd.opacity.toFixed(3);
          nd.btn.style.pointerEvents = (nd.opacity > 0.5 && !isTransition) ? 'auto' : 'none';
          nd.thum.style.opacity = nd.thumOp.toFixed(3);
          nd.thum.style.transform = 'scale(' + nd.thumScale.toFixed(3) + ')';
          nd.mk.style.opacity = nd.mkOp.toFixed(3);
          if (nd.secondClose && nd.secondClose.style.display !== 'none') {
            nd.secondClose.style.opacity = nd.closeOp.toFixed(3);
          }
          nd.imgs.forEach(function (im) {
            if (im._animState) {
              im.style.opacity = im._animState.op.toFixed(3);
              im.style.transform = 'scale(' + im._animState.sc.toFixed(3) + ')';
            }
          });

          // L2 孙节点更新（glSecondSabBallMng.enterFrame）
          const l2 = node.l2;
          if (l2 && (l2.lineVis || isTransition)) {
            l2.nodes.forEach(function (gn) {
              if (!isTransition) {
                gn.rz1 += 0.01 * animStep;
                gn.rz2 -= 0.01 * animStep;
                const gx = Math.cos(gn.trgK) * (gn.trgR * b.ballScale) + node.wx;
                const gy = Math.sin(gn.trgK) * (gn.trgR * b.ballScale) + node.wy;
                gn.wx = gn.wx * conf.s070a + gx * conf.s070b;
                gn.wy = gn.wy * conf.s070a + gy * conf.s070b;

                if (!spMode) {
                  gn.tPosX = gx;
                  const targetTPosY = Math.sin(gn.trgK) * (gn.trgR * b.ballScale) + node.tPosY;
                  gn.tPosY = gn.tPosY * conf.s070a + targetTPosY * conf.s070b;
                } else {
                  gn.tPosX = gn.wx;
                  gn.tPosY = gn.wy;
                }

                const goalSc = gn.trgS * b.ballScale;
                gn.curScale = gn.curScale * conf.s080a + goalSc * conf.s080b;
              }

              const gd = gn.dom;
              if (!spMode) {
                gd.domX = gn.tPosX;
                gd.domY = gd.domY * conf.s070a + (-gn.tPosY) * conf.s070b;
              } else {
                gd.domX = gn.tPosX;
                gd.domY = -gn.tPosY;
              }
              gd.btn.style.transform = 'translate3d(' + gd.domX.toFixed(2) + 'px, ' + gd.domY.toFixed(2) + 'px, 0)';
              gd.btn.style.opacity = gd.opacity.toFixed(3);
              gd.btn.style.pointerEvents = (gd.opacity > 0.5 && !isTransition) ? 'auto' : 'none';
            });

            // L2 连线发光粒子推进
            if (l2.particleAlpha > 0.005) {
              const dists = l2.nodes.map(function (gn) {
                return Math.hypot(gn.wx - node.wx, gn.wy - node.wy);
              });
              l2.particles.forEach(function (p) {
                if (!p.running) return;
                p.r += p.speed * animStep;
                if (p.r >= dists[p.branchIdx]) p.r = 0;
              });
            }
          }
        });

        // L1 连线发光粒子推进
        if (under.particleAlpha > 0.005) {
          const dists = under.l1Nodes.map(function (n) {
            return Math.hypot(n.wx - b.wx, n.wy - b.wy);
          });
          under.l1Particles.forEach(function (p) {
            if (!p.running) return;
            p.r += p.speed * animStep;
            if (p.r >= dists[p.branchIdx]) p.r = 0;
          });
        }
      }
    });

    // 3. 主连线流动小球更新（glJoint）
    if (sceneState.jointAlpha > 0.005) {
      jointItems.forEach(function (jt) {
        if (jt.hidden) return;
        const sBall = mainBalls[jt.startId];
        const eBall = mainBalls[jt.endId];
        const dx = eBall.wx - sBall.wx;
        const dy = eBall.wy - sBall.wy;
        const ang = Math.atan2(dy, dx);
        const maxD = Math.hypot(dx, dy) - eBall.radius + 90;
        const startR = sBall.radius - 80;
        jt.r += jt.speed * animStep;
        if (jt.r >= maxD) {
          jt.speed = 0.28 + 0.72 * rnd();
          jt.r = startR;
        }
        jt.wx = sBall.wx + Math.cos(ang) * jt.r;
        jt.wy = sBall.wy + Math.sin(ang) * jt.r;
        jt.rz -= 0.008 * animStep;
      });
    }

    // 4. 前景装饰球更新（glFrontBallMng）
    frontGroupX = frontGroupX * conf.s099a + (-0.2 * effectX) * conf.s099b;
    frontItems.forEach(function (fi) {
      fi.rot1 += fi.rotSpeed1 * animStep;
      fi.rot2 -= fi.rotSpeed2 * animStep;
      if (isTransition) return;

      const p = fi.parm;
      fi.sinCount += p.sinS * animStep;
      const sinOff = Math.sin(fi.sinCount) * p.sinH;
      const anchorTrgY = mainBalls[p.trgN].trgY;
      const localY = spMode ? p.sp.y : p.y;
      const baseY = (localY * fi.screenScale + anchorTrgY) * p.scrollScale;
      const targetWy = baseY + sinOff + scrollY * p.scrollScale;
      if (fi.wy === null) fi.wy = targetWy;
      else fi.wy = fi.wy * conf.s085a + targetWy * conf.s085b;
    });

    // 5. 背景散景虚化球更新（glBgBall：全部 26 颗显示，其中 active 的 9 颗轻盈缓升，滚动耦合限幅防抽动）
    bgBallGroupX = bgBallGroupX * conf.s099a + (-0.12 * effectX) * conf.s099b;
    const bkScroll = Math.max(-14, Math.min(14, scrollDis));
    bokehList.forEach(function (bk) {
      if (!bk.active) return;
      bk.rz += 0.008 * animStep;
      bk.y += (bk.speedY + 0.24 * bkScroll) * animStep;
      if (bk.y > 100) {
        bk.x = rr(-0.1, 1.25) * W;
        bk.y -= 1.5 * H;
      } else if (bk.y < -1.5 * H - 100) {
        bk.y = 50;
      }
    });

    // 6. 转场球自转
    if (transitionBall.vis) {
      transitionBall.rz1 += 0.01 * animStep;
      transitionBall.rz2 -= 0.01 * animStep;
      transitionBall.rz3 += 0.02 * animStep;
    }

    // ==================== WebGL2 离屏与主场景合成 ====================

    // Pass A: 512x512 Simplex 噪声场（对齐 60fps 隔帧更新速率，跨刷新率恒定）
    bgState.noiseAccum += animStep;
    if (bgState.noiseAccum >= 2 || frameCount === 1) {
      bgState.noiseAccum = bgState.noiseAccum >= 2 ? (bgState.noiseAccum % 2) : 0;
      bgState.noiseCount += 0.008;
      setTarget(RT.noise, null);
      gl.disable(gl.BLEND);
      gl.useProgram(PROG.noise.p);
      gl.uniform1f(PROG.noise.U.cr, 4.0);
      gl.uniform1f(PROG.noise.U.cg, 4.0);
      gl.uniform1f(PROG.noise.U.cb, bgState.noiseCount);
      drawFullQuad(PROG.noise);
    }

    // Pass B: 0.5x 鼠标拖尾与点击水波纹贴图（1:1 复刻 glMouseEffect / glMfObj）
    if (animStep > 0) {
      const dxMf = Math.abs(effectX - mfPrevX);
      const dyMf = Math.abs(effectY - mfPrevY);
      mfPrevX = effectX;
      mfPrevY = effectY;
      mfTimer += animStep;
      if ((dxMf >= 3 || dyMf >= 3) && mfTimer >= 4) {
        mfTimer = 0;
        if (trailRings.length >= 30) trailRings.shift();
        trailRings.push({
          x: 0.5 * effectX,
          y: -0.5 * effectY,
          sc: 0.2,
          op: 0.9,
          rz: rnd() * Math.PI * 2
        });
      }
    }
    for (let i = trailRings.length - 1; i >= 0; i--) {
      const tr = trailRings[i];
      tr.rz += 0.02 * animStep;
      if (animStep > 0) {
        tr.op *= conf.s098a;
        tr.sc = tr.sc * conf.s098a + 8 * conf.s098b;
      }
      if (tr.op <= 0.002) trailRings.splice(i, 1);
    }
    clickRings.forEach(function (cr) {
      if (cr.vis) cr.rz += 0.02 * animStep;
    });

    setTarget(RT.effect, [0, 0, 0, 1]);
    enableNormalBlend();
    const effectSprites = [];
    const ew = RT.effect.w;
    const eh = RT.effect.h;
    trailRings.forEach(function (tr) {
      effectSprites.push([ew * 0.5 + tr.x, -eh * 0.5 + tr.y, 64 * tr.sc, 64 * tr.sc, 0, 0, 1, 1, tr.rz, tr.op]);
    });
    clickRings.forEach(function (cr) {
      if (cr.vis) {
        effectSprites.push([ew * 0.5 + cr.x, -eh * 0.5 + cr.y, 64 * cr.sc, 64 * cr.sc, 0, 0, 1, 1, cr.rz, cr.op]);
      }
    });
    drawInstances(TEX.brush, effectSprites, ew, eh, null, 0);

    // Pass C: glDummyScene 离屏渲染（关键修复：使用 [1,1,1,0] 透明纯白底清屏！）
    // 严格遵守官网 z 轴顺序：卫星球(-2) -> 回流水珠(-1) -> 主泡泡(0) -> 子孙底层(1) -> 子孙顶层(2) -> 转场球(11)
    const zSat = [];
    const zDrops = [];
    const zMain = [];
    const zSubBg = [];
    const zSubFront = [];
    const zTrans = [];

    mainBalls.forEach(function (b) {
      if (!b.vis) return;
      const fam = b.cfg.fam;
      const sz = 500 * b.groupScale;
      const meshWy = b.wy + b.sinY * b.groupScale;

      if (meshWy + sz < -H - 400 || meshWy - sz > 400) {
        // 即使主泡滑出视口，它的子泡泡可能仍在视口内，因此仅跳过主泡自身绘制
      } else {
        if (b.sab.vis && b.sab.selectR > 0.005) {
          const st = b.sab;
          const localR = st.r * st.selectR - Math.sin(st.sinCount) * st.sinR;
          const lx = Math.cos(st.k) * localR;
          const ly = Math.sin(st.k) * localR;
          const c = Math.cos(b.rzBg);
          const s = Math.sin(b.rzBg);
          const worldOffX = (c * lx - s * ly) * b.groupScale;
          const worldOffY = (s * lx + c * ly) * b.groupScale;
          const uvBg = ballUvRect(fam, false);
          zSat.push([
            b.wx + worldOffX, meshWy + worldOffY,
            sz * st.scale, sz * st.scale,
            uvBg[0], uvBg[1], uvBg[2], uvBg[3],
            b.rzBg + st.rz, 1.0
          ]);
        }

        const uv0 = ballUvRect(fam, false);
        const uv1 = ballUvRect(fam, true);
        zMain.push([b.wx, meshWy, sz, sz, uv0[0], uv0[1], uv0[2], uv0[3], b.rzBg, 1.0]);
        zMain.push([b.wx, meshWy, sz, sz, uv1[0], uv1[1], uv1[2], uv1[3], b.rzFront, b.cfg.fa]);
      }

      const under = b.under;
      if (under && (under.status === 1 || isTransition)) {
        const uv0 = ballUvRect(fam, false);
        const uv1 = ballUvRect(fam, true);
        const subFrontAlpha = 1.0;

        under.l1Nodes.forEach(function (node) {
          const sc = node.baseScale * node.trgScale * node.ballScale * node.selectScale;
          if (sc > 0.012) {
            const cSz = 230 * sc;
            zSubBg.push([node.wx, node.wy, cSz, cSz, uv0[0], uv0[1], uv0[2], uv0[3], node.rz, 1.0]);
            zSubFront.push([node.wx, node.wy, cSz, cSz, uv1[0], uv1[1], uv1[2], uv1[3], -node.rz, subFrontAlpha]);
          }

          // L1 回流水珠（1:1 复刻 glBufferBall 140x140 全不透明融球胶质水滴颈）
          const dropDir = node.trgK + Math.PI;
          node.drops.forEach(function (dr) {
            if (dr.offscreen || dr.scale <= 0.012) return;
            dr.rz += 0.012 * animStep;
            const dist = 560 * node.ballScale * dr.rScale;
            const dx = node.wx + Math.cos(dropDir) * dist;
            const dy = node.wy + Math.sin(dropDir) * dist;
            const dSz = 140 * dr.scale;
            zDrops.push([dx, dy, dSz, dSz, uv0[0], uv0[1], uv0[2], uv0[3], dr.rz, 1.0]);
          });

          // L2 孙泡泡与 L2 回流水珠
          if (node.l2 && (node.l2.lineVis || isTransition)) {
            node.l2.nodes.forEach(function (gn) {
              if (gn.curScale > 0.012 && gn.wx > -3500) {
                const gSz = 230 * gn.curScale;
                zSubBg.push([gn.wx, gn.wy, gSz, gSz, uv0[0], uv0[1], uv0[2], uv0[3], gn.rz1, 1.0]);
                zSubFront.push([gn.wx, gn.wy, gSz, gSz, uv1[0], uv1[1], uv1[2], uv1[3], gn.rz2, subFrontAlpha]);
              }
              const l2DropDir = gn.trgK + Math.PI;
              gn.drops.forEach(function (dr) {
                if (dr.offscreen || dr.scale <= 0.012) return;
                dr.rz += 0.012 * animStep;
                const dist = 560 * b.ballScale * dr.rScale;
                const dx = gn.wx + Math.cos(l2DropDir) * dist;
                const dy = gn.wy + Math.sin(l2DropDir) * dist;
                const dSz = 140 * dr.scale;
                zDrops.push([dx, dy, dSz, dSz, uv0[0], uv0[1], uv0[2], uv0[3], dr.rz, 1.0]);
              });
            });
          }
        });
      }
    });

    if (transitionBall.vis && transitionBall.scale > 0.008) {
      const tSz = 400 * transitionBall.scale;
      const satSz = 200 * transitionBall.scale;
      const satOff = 114 * transitionBall.scale;
      const c = Math.cos(transitionBall.groupRz);
      const s = Math.sin(transitionBall.groupRz);
      const uv0 = ballUvRect(0, false);
      const uv1 = ballUvRect(0, true);
      // 卫星先画 (z=-1 in group)，主双层后画
      zTrans.push([
        transitionBall.wx + c * satOff,
        transitionBall.wy + s * satOff,
        satSz, satSz,
        uv0[0], uv0[1], uv0[2], uv0[3],
        transitionBall.groupRz + transitionBall.rz3, 1.0
      ]);
      zTrans.push([
        transitionBall.wx, transitionBall.wy,
        tSz, tSz,
        uv0[0], uv0[1], uv0[2], uv0[3],
        transitionBall.groupRz + transitionBall.rz1, 1.0
      ]);
      zTrans.push([
        transitionBall.wx, transitionBall.wy,
        tSz, tSz,
        uv1[0], uv1[1], uv1[2], uv1[3],
        transitionBall.groupRz + transitionBall.rz2, 1.0
      ]);
    }

    setTarget(RT.dummy, [1, 1, 1, 0]);
    enableNormalBlend();
    drawInstances(
      TEX.balls,
      zSat.concat(zDrops, zMain, zSubBg, zSubFront, zTrans),
      W, H, null, 0
    );

    // Pass D: MiddleRender (横向 31 抽头 Alpha 加权高斯) -> BlurStageRender (纵向 31 抽头 Alpha 加权高斯)
    gl.disable(gl.BLEND);
    setTarget(RT.middle, null);
    gl.useProgram(PROG.blur.p);
    bindTex(0, RT.dummy.t);
    gl.uniform1i(PROG.blur.U.tex, 0);
    gl.uniform2f(PROG.blur.U.uStep, 1 / RT.middle.w, 0);
    gl.uniform1fv(PROG.blur.U.uWeights, BLUR_WEIGHTS);
    drawFullQuad(PROG.blur);

    setTarget(RT.blur, null);
    bindTex(0, RT.middle.t);
    gl.uniform2f(PROG.blur.U.uStep, 0, 1 / RT.blur.h);
    drawFullQuad(PROG.blur);

    // Pass E: glFrontBall 离屏反相装饰球渲染（[0,0,0,0] 预乘透明清屏，1:1 对齐 Three.js setClearColor(0xffffff, 0)）
    setTarget(RT.front, [0, 0, 0, 0]);
    enableNormalBlend();
    if (sceneState.frontAlpha > 0.004) {
      const fList = [];
      frontItems.forEach(function (fi) {
        const fx = isTransition ? fi.transX : (fi.wx + frontGroupX);
        const fy = isTransition ? fi.transY : fi.wy;
        if (fy === null) return;
        const fSz = 400 * fi.scale;
        if (fy + fSz < -H - 300 || fy - fSz > 300) return;
        const uvSharp = frontCombinedUv(fi.parm.color, false);
        const uvSoft = frontCombinedUv(fi.parm.color, true);
        fList.push([fx, fy, fSz, fSz, uvSharp[0], uvSharp[1], uvSharp[2], uvSharp[3], fi.rot1, sceneState.frontAlpha]);
        fList.push([fx, fy, fSz, fSz, uvSoft[0], uvSoft[1], uvSoft[2], uvSoft[3], fi.rot2, 0.70 * sceneState.frontAlpha]);
      });
      drawInstances(TEX.frontCombined, fList, W, H, null, 0);
    }

    // ==================== Pass F: 主屏幕按精确 Z 轴顺序一次合成 ====================
    setTarget(null, null);
    gl.disable(gl.BLEND);

    // z = -100: glBg（旋转 -20° 的全息丝绸背景平面）
    bgState.time += 0.01 * animStep;
    bgState.shiftX += 0.001 * animStep;
    bgState.shiftY += 0.00015 * scrollDis * conf.d;
    bgState.colVY += 0.0026 * animStep + 0.0004 * scrollDis;
    if (bgState.colVY > 0.56) {
      bgState.colShiftX = 0.5 * rnd() - 0.25;
      bgState.colVY = -0.56;
    } else if (bgState.colVY < -0.56) {
      bgState.colVY = 0.56;
    }

    gl.useProgram(PROG.bg.p);
    gl.uniform2f(PROG.bg.U.uPos, 0.5 * W, -0.5 * H);
    gl.uniform2f(PROG.bg.U.uSize, 1.67 * W, 1.8 * H);
    gl.uniform2f(PROG.bg.U.uRes, W, H);
    gl.uniform1f(PROG.bg.U.uRot, -20 * DEG);
    bindTex(0, TEX.bgColor);
    gl.uniform1i(PROG.bg.U.tex, 0);
    bindTex(1, RT.noise.t);
    gl.uniform1i(PROG.bg.U.noise, 1);
    gl.uniform1f(PROG.bg.U.time, bgState.time);
    gl.uniform1f(PROG.bg.U.strength, 0.05);
    gl.uniform1f(PROG.bg.U.shiftX, bgState.shiftX);
    gl.uniform1f(PROG.bg.U.shiftY, bgState.shiftY);
    gl.uniform1f(PROG.bg.U.noiseScale, (W / 1600) * 1.3);
    gl.uniform1f(PROG.bg.U.colShiftX, bgState.colShiftX);
    gl.uniform1f(PROG.bg.U.colShiftY, bgState.colVY);
    gl.uniform1f(PROG.bg.U.colStrength, W > PHY.borderSP ? 0.105 : 0.07);
    gl.uniform1f(PROG.bg.U.colScaleX, W > PHY.borderSP ? 1.0 : 0.6);
    gl.uniform1f(PROG.bg.U.colScaleY, W > PHY.borderSP ? 1.55 : 3.0);
    drawPlaneQuad(PROG.bg);

    enableNormalBlend();

    // z = -50: glBgBall（全部 26 颗背景虚化散景球 + 0.1 噪声提亮）
    const bokehSprites = [];
    bokehList.forEach(function (bk) {
      const sz = 200 * bk.scale;
      if (bk.y + sz < -H - 200 || bk.y - sz > 200) return;
      const uv = cell2x2Uv(bk.cell);
      bokehSprites.push([bk.x + bgBallGroupX, bk.y, sz, sz, uv[0], uv[1], uv[2], uv[3], bk.rz, bk.alpha]);
    });
    drawInstances(TEX.bokeh, bokehSprites, W, H, RT.noise.t, 0.1);

    // z = -5: glTopBgWord（6 组英文衬线大标题，真实夹在散景球与主泡泡之间！）
    const wordSprites = [];
    mainBalls.forEach(function (b) {
      if (!b.bgWord || !b.bgWord.vis || b.bgWord.alpha <= 0.004) return;
      const ww = 590 * b.bgWord.scale;
      const wh = 204 * b.bgWord.scale;
      const wx = b.wx - b.bgWord.shiftX;
      const wy = b.wy;
      if (wy + wh < -H - 250 || wy - wh > 250) return;
      const uv = bgWordUv(b.bgWord.idx);
      wordSprites.push([wx, wy, ww, wh, uv[0], uv[1], uv[2], uv[3], 0, b.bgWord.alpha]);
    });
    drawInstances(TEX.bgWord, wordSprites, W, H, null, 0);

    // z = -2: glTopLine + glSabSelectLine + glSecondSabBallLine（实例化抗锯齿丝滑细线）
    const lineSegs = [];
    if (sceneState.topLineOpacity > 0.002) {
      PHY.links.forEach(function (pair) {
        const a = mainBalls[pair[0]];
        const c = mainBalls[pair[1]];
        lineSegs.push([a.wx, a.wy, c.wx, c.wy, 0, 0, 0, sceneState.topLineOpacity]);
      });
    }
    mainBalls.forEach(function (b) {
      const under = b.under;
      if (!under || !under.lineVis) return;
      const rgb = hexRgbNormalized(PHY.lineColors[b.id]);
      under.l1Nodes.forEach(function (node) {
        if (node.trgScale > 0.02) {
          lineSegs.push([b.wx, b.wy, node.wx, node.wy, rgb[0], rgb[1], rgb[2], 0.42]);
        }
        if (node.l2 && node.l2.lineVis) {
          node.l2.nodes.forEach(function (gn) {
            if (gn.curScale > 0.02) {
              lineSegs.push([node.wx, node.wy, gn.wx, gn.wy, rgb[0], rgb[1], rgb[2], 0.42]);
            }
          });
        }
      });
    });
    drawLines(lineSegs, W, H);

    // z = -1: glJoint（主连线带白光晕水珠） + L1/L2 连线发光粒子
    if (sceneState.jointAlpha > 0.004) {
      const jMul = W < PHY.borderMid ? 0.6 : 1.0;
      const jSprites = [];
      jointItems.forEach(function (jt) {
        if (jt.hidden) return;
        const sz = 28 * jt.baseScale * jMul;
        const uv = cell2x2Uv(PHY.jointCells[jt.linkIdx]);
        jSprites.push([jt.wx, jt.wy, sz, sz, uv[0], uv[1], uv[2], uv[3], jt.rz, sceneState.jointAlpha]);
      });
      drawInstances(TEX.joint, jSprites, W, H, null, 0);
    }

    const pBaseSize = W < PHY.borderMid ? 24 : 40;
    const pSprites = [];
    mainBalls.forEach(function (b) {
      const under = b.under;
      if (!under) return;
      const uv = cell2x2Uv(PHY.particleCells[b.id]);

      if (under.particleAlpha > 0.005) {
        const angles = under.l1Nodes.map(function (n) {
          return Math.atan2(n.wy - b.wy, n.wx - b.wx);
        });
        under.l1Particles.forEach(function (p) {
          if (!p.running) return;
          const node = under.l1Nodes[p.branchIdx];
          if (node.trgScale < 0.05) return;
          const ang = angles[p.branchIdx];
          const px = b.wx + Math.cos(ang) * p.r;
          const py = b.wy + Math.sin(ang) * p.r;
          const vAlpha = (Math.sin(p.sinSeed + p.r * 0.03) + 1) * 0.5;
          const sz = pBaseSize * p.rndSize;
          pSprites.push([px, py, sz, sz, uv[0], uv[1], uv[2], uv[3], 0, under.particleAlpha * vAlpha]);
        });
      }

      under.l1Nodes.forEach(function (node) {
        const l2 = node.l2;
        if (!l2 || l2.particleAlpha <= 0.005) return;
        const angles2 = l2.nodes.map(function (gn) {
          return Math.atan2(gn.wy - node.wy, gn.wx - node.wx);
        });
        l2.particles.forEach(function (p) {
          if (!p.running) return;
          const ang = angles2[p.branchIdx];
          const px = node.wx + Math.cos(ang) * p.r;
          const py = node.wy + Math.sin(ang) * p.r;
          const vAlpha = (Math.sin(p.sinSeed + p.r * 0.03) + 1) * 0.5;
          const sz = pBaseSize * p.rndSize;
          pSprites.push([px, py, sz, sz, uv[0], uv[1], uv[2], uv[3], 0, l2.particleAlpha * vAlpha]);
        });
      });
    });
    drawInstances(TEX.jointBlur, pSprites, W, H, null, 0);

    // z = 0: glDisplaySet（主泡泡胶质融球层 + 原生 Alpha 加权高斯背光通透折射）
    sceneState.dispTime += 0.02 * animStep;
    gl.useProgram(PROG.display.p);
    bindTex(0, RT.blur.t);
    gl.uniform1i(PROG.display.U.tex, 0);
    bindTex(1, RT.noise.t);
    gl.uniform1i(PROG.display.U.noise, 1);
    bindTex(2, RT.effect.t);
    gl.uniform1i(PROG.display.U.mEffect, 2);
    gl.uniform1f(PROG.display.U.time, sceneState.dispTime);
    gl.uniform1f(PROG.display.U.strength, sceneState.dispStrength);
    const aspX = 0.7;
    const aspY = aspX * (H / W);
    gl.uniform2f(PROG.display.U.asp, aspX, aspY);
    drawFullQuad(PROG.display);

    // z = 2: glFrontBall._dMesh（反相水晶前景小气泡层）
    sceneState.frontTime += 0.02 * animStep;
    gl.useProgram(PROG.frontDisplay.p);
    bindTex(0, RT.front.t);
    gl.uniform1i(PROG.frontDisplay.U.tex, 0);
    bindTex(1, RT.noise.t);
    gl.uniform1i(PROG.frontDisplay.U.noise, 1);
    bindTex(2, RT.effect.t);
    gl.uniform1i(PROG.frontDisplay.U.mEffect, 2);
    gl.uniform1f(PROG.frontDisplay.U.time, sceneState.frontTime);
    gl.uniform1f(PROG.frontDisplay.U.strength, 0.003);
    drawFullQuad(PROG.frontDisplay);

    // z = 500: glSand（顶部 3% 胶片颗粒层，跨刷新率恒定 30Hz 微抖动）
    sandAccum += animStep;
    if (sandAccum >= 2) {
      sandAccum %= 2;
      sceneState.sandShiftX = Math.random() * 0.1;
    }
    gl.useProgram(PROG.sand.p);
    bindTex(0, TEX.sand);
    gl.uniform1i(PROG.sand.U.map, 0);
    gl.uniform1f(PROG.sand.U.alpha, 0.03);
    gl.uniform2f(PROG.sand.U.patt, (W / 512) * 2, (H / 512) * 2);
    gl.uniform2f(PROG.sand.U.shift, sceneState.sandShiftX, 0);
    drawFullQuad(PROG.sand);

    requestAnimationFrame(renderFrame);
  }

  // ==================== 启动入口 ====================
  let resizeTimer = null;
  window.addEventListener('resize', function () {
    onResize();
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 400);
  });

  renderDomCopy();
  onResize();

  // 暴露调试与二次开发接口，方便后续在世界之窗项目里直接控制
  window.WorldWindowBubbles = {
    mainBalls: mainBalls,
    frontItems: frontItems,
    jointItems: jointItems,
    bokehList: bokehList,
    scrollCtrl: scrollCtrl,
    smoothScrollTo: smoothScrollTo,
    toggleMainBall: toggleMainBall,
    onL1BallClick: onL1BallClick,
    openLeafDetail: openLeafDetail,
    setLang: function (lang) {
      if (DATA.ui[lang]) {
        currentLang = lang;
        renderDomCopy();
      }
    }
  };

  // 短暂展示红幕加载页后触发转场球收缩揭幕（与官网光纤首屏节奏一致）
  setTimeout(runInitialOpening, prefersReduced ? 0 : 80);
  requestAnimationFrame(function (t) {
    lastNow = t;
    renderFrame(t);
  });
})();
