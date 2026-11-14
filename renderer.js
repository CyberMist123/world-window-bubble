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

  // ==================== 环境、视口与世界之窗个性化推流状态 ====================
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersReduced = reducedMotionQuery.matches;
  let motionPaused = false;
  let currentLang = DATA.defaultLang || 'zh';
  let isTransition = false;
  const isHttpServer = location.protocol === 'http:' || location.protocol === 'https:';

  function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function loadLocalJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveLocalJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }

  const appState = {
    preferences: (function () {
      const base = cloneJson(DATA.DEFAULT_PREFERENCES);
      const saved = loadLocalJson('ww_prefs_v2', null);
      if (saved && typeof saved === 'object') {
        if (saved.theme && DATA.THEMES[saved.theme]) base.theme = saved.theme;
        if (saved.fontPreset && DATA.FONT_PRESETS[saved.fontPreset]) base.fontPreset = saved.fontPreset;
        if (saved.seenMode) base.seenMode = saved.seenMode;
        if (typeof saved.freeformNote === 'string') base.freeformNote = saved.freeformNote;
        if (Array.isArray(saved.channels) && saved.channels.length === 6) {
          base.channels = saved.channels.map(function (ch, idx) {
            return Object.assign({}, base.channels[idx], ch);
          });
        }
      }
      return base;
    })(),
    seenMap: (function () {
      const saved = loadLocalJson('ww_seen_v2', null);
      return (saved && typeof saved === 'object' && !Array.isArray(saved)) ? saved : {};
    })(),
    favorites: (function () {
      const saved = loadLocalJson('ww_favorites_v1', []);
      return Array.isArray(saved) ? saved : [];
    })(),
    curatedPages: [],
    livePool: [],
    aiInbox: [],
    lwaCatalogUrl: DATA.OBSIDIAN_CATALOG_URL || '',
    lwaAskUrl: DATA.OBSIDIAN_ASK_URL || '',
    currentSeed: 20261114
  };

  function getActiveTheme() {
    return DATA.THEMES[appState.preferences.theme] || DATA.THEMES['celadon-mist'];
  }

  function getActiveFontPreset() {
    return DATA.FONT_PRESETS[appState.preferences.fontPreset]
      || DATA.FONT_PRESETS['caslon-zhuque']
      || DATA.FONT_PRESETS['classic-caslon'];
  }

  const loadedFontCssUrls = new Set();
  function ensureFontStylesheet(cssUrl) {
    if (!cssUrl || loadedFontCssUrls.has(cssUrl)) return;
    const existing = document.querySelectorAll('link[rel="stylesheet"]');
    for (let i = 0; i < existing.length; i++) {
      if (existing[i].href === cssUrl || existing[i].getAttribute('href') === cssUrl) {
        loadedFontCssUrls.add(cssUrl);
        return;
      }
    }
    loadedFontCssUrls.add(cssUrl);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link);
  }

  function resolveImgUrl(rawUrl) {
    if (!rawUrl) return '';
    if (rawUrl.indexOf('data:') === 0 || rawUrl.indexOf('/api/') === 0) return rawUrl;
    if (isHttpServer && rawUrl.indexOf('https://') === 0) {
      return '/api/img?u=' + encodeURIComponent(rawUrl);
    }
    return rawUrl;
  }

  function syncThemeCssVars(theme) {
    const root = document.documentElement;
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-soft', theme.accentSoft);
    root.style.setProperty('--bg', theme.bgHex);
    root.style.setProperty('--ink', theme.ink);
    root.style.setProperty('--sub-ink', theme.subInk);
    root.style.setProperty('--footer-bg', theme.footerBg);
    root.style.setProperty('--curtain-bg', theme.curtainBg);
    if (theme.lineColors) {
      Object.keys(theme.lineColors).forEach(function (k) {
        PHY.lineColors[k] = theme.lineColors[k];
      });
    }
  }

  function syncFontCssVars(font) {
    if (!font) return;
    ensureFontStylesheet(font.cssUrl);
    const root = document.documentElement;
    root.style.setProperty('--font-display', font.enDisplay);
    root.style.setProperty('--font-sans', font.enSans);
    root.style.setProperty('--font-zh-body', font.zhBody);
    root.style.setProperty('--font-zh-ui', font.zhUi);
    root.style.setProperty('--font-zh-weight', font.zhBodyWeight || '400');
  }

  // 首屏绘制前立即同步主题釉色、字体与本地去重列表，零闪烁
  (function initBootAppearance() {
    const initTheme = getActiveTheme();
    const initFont = getActiveFontPreset();
    syncThemeCssVars(initTheme);
    syncFontCssVars(initFont);
    SP.setTheme(initTheme);
    DATA.sections = DATA.buildWindowFeed([], appState.preferences, appState.seenMap, [], appState.currentSeed);
  })();

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
  document.body.classList.add('webgl-art-mode');

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

  // middle_frg.js & blurStage_frg.js (9 抽头硬件双线性插值 Alpha 加权高斯模糊：等效 31 抽头胶质宽度，纹理采样减少 71%！)
  const FS_BLUR = `#version 300 es
  precision highp float;
  uniform sampler2D tex;
  uniform vec2 uStep;
  in vec2 vUv;
  out vec4 fragColor;
  void main() {
    const float offs[5] = float[5](0.0, 1.407333, 3.294215, 5.181810, 7.069926);
    const float wgts[5] = float[5](0.204164, 0.180174, 0.123832, 0.066282, 0.027630);
    vec2 stepUv = uStep * 1.38;

    vec4 c0 = texture(tex, vUv);
    float vol0 = wgts[0] * c0.a;
    vec3 sumRgb = c0.rgb * vol0;
    float sumA = c0.a * wgts[0];
    float sumW = vol0;

    for (int i = 1; i < 5; i++) {
      float w = wgts[i];
      vec2 d = stepUv * offs[i];
      vec4 cp = texture(tex, vUv + d);
      float vp = w * cp.a;
      sumRgb += cp.rgb * vp;
      sumA += cp.a * w;
      sumW += vp;

      vec4 cn = texture(tex, vUv - d);
      float vn = w * cn.a;
      sumRgb += cn.rgb * vn;
      sumA += cn.a * w;
      sumW += vn;
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

  // 子泡泡放大全画幅液态水波折射渲染着色器（严格贴合融球有机边界 + 球面微透镜 + 釉彩肥皂泡高光边）
  const FS_ART_BUBBLE = `#version 300 es
  precision highp float;
  uniform sampler2D uArt;
  uniform sampler2D uBlur;
  uniform sampler2D uNoise;
  uniform sampler2D uEffect;
  uniform vec2 uCanvasPx;
  uniform vec2 uAsp;
  uniform float uTime;
  uniform float uStrength;
  uniform float uHover;
  uniform float uAlpha;
  in vec2 vUv;
  out vec4 fragColor;
  void main() {
    vec2 pLocal = (vUv - 0.5) * 2.0;
    float r2 = dot(pLocal, pLocal);
    if (r2 >= 1.0) discard;
    float rLocal = sqrt(r2);

    vec2 sUv = gl_FragCoord.xy / uCanvasPx;
    vec4 effectCol = texture(uEffect, sUv);
    vec4 noiseCol = texture(uNoise, vec2(sUv.x * uAsp.x, sUv.y * uAsp.y));
    vec2 effectUv = sUv + sin(effectCol.r) * 0.025;
    vec2 pScreen = -1.0 + 2.0 * effectUv;
    float ss = sin(-uTime + length(pScreen * 14.0));
    vec2 newUv = effectUv + uStrength * vec2(ss, ss);

    vec4 col1 = texture(uBlur, newUv);
    float bubbleMask = clamp(col1.a * 80.0 - 10.0, 0.0, 1.0);
    if (bubbleMask <= 0.004) discard;

    // 柔和内收 10% 留出清透水彩包浆边，同时防止水滴回流颈部染色
    float innerEnv = 1.0 - smoothstep(0.66, 0.96, rLocal);
    float mask = bubbleMask * innerEnv * uAlpha;
    if (mask <= 0.004) discard;

    // 悬停时水波平息并轻微拉近画幅，常态下随水纹与鼠标波浪轻盈起伏
    float calm = mix(1.0, 0.28, uHover);
    vec2 lens = pLocal * (1.0 - 0.065 * r2);
    vec2 ripple = vec2(
      sin(-uTime * 1.18 + pLocal.y * 5.4 + noiseCol.r * 4.2),
      cos(-uTime * 1.06 + pLocal.x * 5.4 + noiseCol.g * 4.2)
    ) * (0.0115 * calm);
    vec2 cursorWave = vec2(sin(effectCol.r * 3.1), cos(effectCol.r * 3.1)) * (effectCol.r * 0.036);
    float zoom = mix(0.92, 0.85, uHover);
    vec2 artUv = clamp(lens * 0.5 * zoom + 0.5 + ripple + cursorWave, 0.012, 0.988);

    vec3 artRgb = texture(uArt, artUv).rgb;

    // 3D 球面边缘水彩包浆融合 + 左上方月牙清透高光 + 水波焦散提亮
    float rimGlaze = smoothstep(0.42, 0.94, rLocal) * 0.34;
    vec3 glazed = mix(artRgb, min(col1.rgb + 0.06, 1.0), rimGlaze);
    float nz = sqrt(max(0.02, 1.0 - r2));
    vec3 nrm = normalize(vec3(pLocal.x, pLocal.y, nz));
    float spec = pow(clamp(dot(nrm, normalize(vec3(-0.42, 0.54, 0.73))), 0.0, 1.0), 16.0) * 0.22;
    float rimGlow = smoothstep(0.56, 0.90, rLocal) * (1.0 - smoothstep(0.90, 0.98, rLocal)) * 0.14;
    vec3 finalRgb = min(glazed + spec + rimGlow + effectCol.r * 0.11, 1.0);

    fragColor = vec4(finalRgb, mask * 0.95);
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
    artBubble: compileProgram('artBubble', VS_PLANE, FS_ART_BUBBLE),
    frontDisplay: compileProgram('frontDisplay', VS_FULL, FS_FRONT_DISPLAY),
    sand: compileProgram('sand', VS_FULL, FS_SAND)
  };

  // 子泡泡高清画幅 WebGL 贴图池（384×384 居中裁切，先以程序化底纹零延迟出图，异步热替换为博物馆实图）
  const artTexCache = new Map();
  let wakeRenderLoop = function () {};

  function drawCoverToSquareCanvas(imgOrCanvas, size) {
    const cnv = document.createElement('canvas');
    cnv.width = size;
    cnv.height = size;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#edf1f0';
    ctx.fillRect(0, 0, size, size);
    const sw = imgOrCanvas.naturalWidth || imgOrCanvas.width || size;
    const sh = imgOrCanvas.naturalHeight || imgOrCanvas.height || size;
    if (sw > 0 && sh > 0) {
      const scale = Math.max(size / sw, size / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      ctx.drawImage(imgOrCanvas, (size - dw) * 0.5, (size - dh) * 0.5, dw, dh);
    }
    return cnv;
  }

  function getArtBubbleTex(itemObj) {
    if (!itemObj) return null;
    const key = String(itemObj.id || itemObj.previewUrl || itemObj.thumbUrl || itemObj.title || 'default');
    if (artTexCache.has(key)) {
      return artTexCache.get(key).tex;
    }

    // 控制显存上限（最多保留 72 张气泡画幅贴图）
    if (artTexCache.size >= 72) {
      const oldestKey = artTexCache.keys().next().value;
      const oldest = artTexCache.get(oldestKey);
      if (oldest && oldest.tex) gl.deleteTexture(oldest.tex);
      artTexCache.delete(oldestKey);
    }

    const placeholderCnv = document.createElement('canvas');
    placeholderCnv.width = 256;
    placeholderCnv.height = 256;
    const pCtx = placeholderCnv.getContext('2d');
    const pal = (itemObj.palette && itemObj.palette.length >= 2) ? itemObj.palette : ['#8fb3ad', '#eef4f2', '#d7b596'];
    const grad = pCtx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, pal[1] || '#eef4f2');
    grad.addColorStop(0.55, pal[0] || '#8fb3ad');
    grad.addColorStop(1, pal[2] || '#d7b596');
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 256, 256);

    const entry = { tex: createTex(placeholderCnv), loaded: false };
    artTexCache.set(key, entry);

    // 先把精绘矢量/语录纹章画上去（对纯句子卡片即是最终高雅纹章）
    const fallbackDataUrl = SP.buildThumbDataURL(itemObj, 320);
    const fbImg = new Image();
    fbImg.decoding = 'async';
    fbImg.onload = function () {
      if (!entry.loaded && artTexCache.has(key)) {
        updateTex(entry.tex, drawCoverToSquareCanvas(fbImg, 320));
        wakeRenderLoop();
      }
    };
    fbImg.src = fallbackDataUrl;

    const rawCandidate = (itemObj.kind !== 'quote')
      ? (itemObj.previewUrl || itemObj.thumbUrl || itemObj.fullUrl || '')
      : '';
    if (rawCandidate) {
      const primaryUrl = resolveImgUrl(rawCandidate);
      const realImg = new Image();
      realImg.crossOrigin = 'anonymous';
      realImg.decoding = 'async';
      realImg.onload = function () {
        if (!artTexCache.has(key)) return;
        entry.loaded = true;
        updateTex(entry.tex, drawCoverToSquareCanvas(realImg, 384));
        wakeRenderLoop();
      };
      realImg.onerror = function () {
        if (primaryUrl !== rawCandidate) {
          const retry = new Image();
          retry.crossOrigin = 'anonymous';
          retry.decoding = 'async';
          retry.onload = function () {
            if (!artTexCache.has(key)) return;
            entry.loaded = true;
            updateTex(entry.tex, drawCoverToSquareCanvas(retry, 384));
            wakeRenderLoop();
          };
          retry.src = rawCandidate;
        }
      };
      realImg.src = primaryUrl;
    }

    return entry.tex;
  }

  // ==================== 程序化贴图初始化 ====================
  const ballAtlasObj = SP.buildBallAtlas(512);
  const frontAtlases = SP.buildFrontBallAtlases(448);
  const TEX = {
    balls: createTex(ballAtlasObj.canvas),
    frontSharp: createTex(frontAtlases.sharp),
    frontSoft: createTex(frontAtlases.soft),
    frontCombined: createTex(frontAtlases.combined),
    bokeh: createTex(SP.buildBokehAtlas(192)),
    joint: createTex(SP.buildJointAtlas(false, 192)),
    jointBlur: createTex(SP.buildJointAtlas(true, 192)),
    brush: createTex(SP.buildBrushRing(256)),
    bgColor: createTex(SP.buildBgColor(768), gl.MIRRORED_REPEAT),
    sand: createTex(SP.buildSand(512), gl.REPEAT),
    bgWord: createTex(SP.buildBgWordAtlas(DATA.sections, getActiveFontPreset()))
  };

  // 字体加载完毕后重绘一次 z=-5 衬线背景大标题贴图，确保使用当前预设真实字形
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      updateTex(TEX.bgWord, SP.buildBgWordAtlas(DATA.sections, getActiveFontPreset()));
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
    noise: createRT(256, 256),
    dummy: null,
    middle: null,
    blur: null,
    front: null,
    effect: null
  };

  function rebuildRenderTargets() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(2, Math.round(W * dpr));
    canvas.height = Math.max(2, Math.round(H * dpr));

    const blurScale = (W <= PHY.borderSP) ? 0.52 : 0.38;
    disposeRT(RT.dummy);
    disposeRT(RT.middle);
    disposeRT(RT.blur);
    disposeRT(RT.front);
    disposeRT(RT.effect);

    RT.dummy = createRT(W, H);
    RT.middle = createRT(W * blurScale, H * blurScale);
    RT.blur = createRT(W * blurScale, H * blurScale);
    RT.front = createRT(W, H);
    RT.effect = createRT(W * 0.4, H * 0.4);
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

    const bootTheme = getActiveTheme();
    const bootFont = getActiveFontPreset();

    // Group 0: 顶部矿物釉色定制几何标识
    const gLogo = makeGroup();
    const logoText = addSvgText(gLogo, DATA.brand.mark, 2, 42, {
      'font-family': bootFont.enSans,
      'font-weight': '600',
      'font-size': '31',
      'letter-spacing': '7.2',
      'fill': bootTheme.accent
    });

    const serifAttrs = {
      'font-family': bootFont.enDisplay,
      'font-weight': '400',
      'font-size': '124',
      'letter-spacing': '-1.5',
      'fill': bootTheme.ink
    };

    // Group 1-3: 三行错落高对比度衬线大标题（对标原版 890x533 黄金缩进比例）
    const gC1 = makeGroup();
    const c1Text = addSvgText(gC1, DATA.brand.heroLines[0], 0, 164, serifAttrs);

    const gC2 = makeGroup();
    const c2Text = addSvgText(gC2, DATA.brand.heroLines[1], 196, 274, serifAttrs);

    const gC3 = makeGroup();
    const c3Text = addSvgText(gC3, DATA.brand.heroLines[2], 86, 384, serifAttrs);

    // Group 4: 右下三行阶梯式无衬线副标
    const gSab = makeGroup();
    const sabAttrs = {
      'font-family': bootFont.enSans,
      'font-weight': '400',
      'font-size': '24',
      'letter-spacing': '1.2',
      'fill': bootTheme.subInk
    };
    const sabTexts = DATA.brand.heroSub.map(function (line, idx) {
      return addSvgText(gSab, line, 332 + idx * 34, 442 + idx * 34, sabAttrs);
    });

    h1.appendChild(svg);
    contentsEl.appendChild(h1);
    return {
      root: h1,
      parts: [gLogo, gC1, gC2, gC3, gSab],
      logoTexts: [logoText],
      serifTexts: [c1Text, c2Text, c3Text],
      sabTexts: sabTexts,
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

  function attachProgressiveThumb(imgEl, itemObj) {
    imgEl.decoding = 'async';
    imgEl.src = SP.buildThumbDataURL(itemObj, 180);
    // WebGL 液态画幅模式由 getArtBubbleTex 统一按需解码，避免隐藏 DOM 缩略图双倍抢占网络与解码带宽
    if (document.body.classList.contains('webgl-art-mode')) return;
    if (!itemObj || itemObj.kind === 'quote' || !itemObj.thumbUrl) return;

    const primarySrc = resolveImgUrl(itemObj.thumbUrl);
    const rawFallback = itemObj.thumbUrl;
    const loader = new Image();
    loader.decoding = 'async';
    loader.onload = function () {
      imgEl.src = primarySrc;
    };
    loader.onerror = function () {
      if (primarySrc !== rawFallback && rawFallback) {
        const retry = new Image();
        retry.decoding = 'async';
        retry.onload = function () {
          imgEl.src = rawFallback;
        };
        retry.src = rawFallback;
      }
    };
    loader.src = primarySrc;
  }

  function destroyUnderForBall(parentBall) {
    const under = parentBall.under;
    if (!under) return;
    killTweensOf(under, 'dropTimer');
    killTweensOf(under, 'particleAlpha');
    under.l1Particles.forEach(function (p) {
      killTweensOf(p, 'timer');
      p.running = false;
    });
    under.l1Nodes.forEach(function (node) {
      killTweensOf(node);
      killTweensOf(node.dom);
      node.drops.forEach(function (dr) {
        killTweensOf(dr);
      });
      if (node.l2) {
        killTweensOf(node.l2);
        node.l2.particles.forEach(function (p) { killTweensOf(p, 'timer'); });
        node.l2.nodes.forEach(function (gn) {
          killTweensOf(gn);
          killTweensOf(gn.dom);
          gn.drops.forEach(function (dr) { killTweensOf(dr); });
          if (gn.dom && gn.dom.btn && gn.dom.btn.parentNode) {
            gn.dom.btn.parentNode.removeChild(gn.dom.btn);
          }
        });
      }
      if (node.dom && node.dom.btn && node.dom.btn.parentNode) {
        node.dom.btn.parentNode.removeChild(node.dom.btn);
      }
    });
    parentBall.under = null;
  }

  function buildUnderForBall(parentBall) {
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

      if (cData.playlist && cData.playlist.length) {
        cData.playlist.forEach(function (it, idx) {
          const im = document.createElement('img');
          im.className = 'gl-top-sabM-img';
          im.alt = '';
          im._itemRef = it;
          attachProgressiveThumb(im, it);
          if (idx !== 0) im.style.display = 'none';
          thum.appendChild(im);
          imgEls.push(im);
        });
      } else if (cData.items && cData.items.length) {
        cData.items.forEach(function (it, idx) {
          const im = document.createElement('img');
          im.className = 'gl-top-sabM-img';
          im.alt = '';
          attachProgressiveThumb(im, it);
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
        attachProgressiveThumb(im, cData.item || cData);
        thum.appendChild(im);
        imgEls.push(im);
      }

      fixStage.appendChild(btn);

      // 兼容旧版 L2 孙节点（当 directLeaf 为 false 时启用）
      let l2Group = null;
      if (!sec.directLeaf && cData.items && cData.items.length) {
        const l2Nodes = cData.items.map(function (itemData, mIdx) {
          const b2 = document.createElement('button');
          b2.type = 'button';
          b2.className = 'gl-top-sabBtn';

          const th2 = document.createElement('div');
          th2.className = 'gl-top-sabThum';
          const im2 = document.createElement('img');
          im2.className = 'gl-top-sabM-img';
          im2.alt = '';
          attachProgressiveThumb(im2, itemData);
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
            openShowcaseFromSection(sec, itemData);
          });

          return gNode;
        });

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
        isHovered: false,
        hoverLerp: 0,
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

      btn.addEventListener('pointerenter', function () {
        node.isHovered = true;
        showBubblePeekForNode(parentBall, node);
      });
      btn.addEventListener('pointerleave', function () {
        node.isHovered = false;
        scheduleHideBubblePeek();
      });
      btn.addEventListener('focus', function () {
        node.isHovered = true;
        showBubblePeekForNode(parentBall, node);
      });
      btn.addEventListener('blur', function () {
        node.isHovered = false;
        scheduleHideBubblePeek();
      });
      btn.addEventListener('click', function () {
        hideBubblePeekNow();
        onL1BallClick(parentBall, gIdx);
      });

      return node;
    });

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
  }

  mainBalls.forEach(buildUnderForBall);

  function rebuildAllSections(newSections) {
    DATA.sections = newSections;
    Object.keys(secMap).forEach(function (k) { delete secMap[k]; });
    newSections.forEach(function (s) { secMap[s.id] = s; });

    mainBalls.forEach(function (b) {
      if (b.id >= 1 && b.id <= 6) {
        b.isOpen0 = false;
        b.selectScale = 1;
        b.openY = 0;
        b.sabShiftX = 0;
        b.dom.iconRot = 0;
        b.secData = secMap[b.id] || null;
        destroyUnderForBall(b);
        buildUnderForBall(b);
      } else if (b.id === 7) {
        b.openY = 0;
      }
      updateBallTargetsAndScale(b);
    });

    updateTex(TEX.bgWord, SP.buildBgWordAtlas(DATA.sections, getActiveFontPreset()));
    renderDomCopy();
    setPageHeight(true);
  }

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
        const pcList = PHY.l1PC[id] || PHY.l1PC[1];
        const fallbackExtra = id === 5 ? [-138, 490, 0.96] : [-152, 510, 0.96];
        const cfg = pcList[g] || fallbackExtra;
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
      // 给 06 底部展开的子泡泡留足 560px 舒展呼吸区，绝不卡在屏幕下沿或被迫收回
      extra = spMode ? (pitch6 * b6.ballScale - 240) : (-560 * b6.ballScale);
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

  // ==================== L1 缩略图 1.3 -> 1.0 缩放淡入轮播（悬停自动定格，点开所见即所得） ====================
  function scheduleThumbCycle(l1Node) {
    if (!l1Node.dom.imgs || l1Node.dom.imgs.length <= 1) return;
    killTweensOf(l1Node.dom, 'imgTimer');
    l1Node.dom.imgTimer = 0;
    to(l1Node.dom, 'imgTimer', 1, 3.2, EASE.linear, 0, function () {
      if (!l1Node.dom.btn || l1Node.dom.btn.style.display === 'none' || l1Node.dom.thumOp < 0.5) return;
      if (!motionPaused && !prefersReduced && !l1Node.isHovered) {
        const list = l1Node.dom.imgs;
        l1Node.dom.imgIdx = (l1Node.dom.imgIdx + 1) % list.length;
        const nextImg = list[l1Node.dom.imgIdx];
        l1Node.dom.thum.appendChild(nextImg);
        nextImg.style.display = 'block';
        const animState = { op: 0, sc: 1.3 };
        nextImg.style.opacity = '0';
        nextImg.style.transform = 'scale(1.3)';
        to(animState, 'op', 1, 0.85, EASE.p2io, 0.08 * l1Node.groupNum);
        to(animState, 'sc', 1, 0.85, EASE.p2io, 0.08 * l1Node.groupNum, function () {
          list.forEach(function (el, idx) {
            if (idx !== l1Node.dom.imgIdx) el.style.display = 'none';
          });
        });
        nextImg._animState = animState;

        if (l1Node.data.playlist && l1Node.data.playlist[l1Node.dom.imgIdx]) {
          const curItem = l1Node.data.playlist[l1Node.dom.imgIdx];
          if (curItem) {
            getArtBubbleTex(curItem);
            l1Node.dom.txt.innerHTML = DATA.formatBilingualBubbleLabel
              ? DATA.formatBilingualBubbleLabel(curItem)
              : (curItem.shortTitle || l1Node.data.label[currentLang]);
          }
        }
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
    const initItem = (node.data.playlist && node.data.playlist[node.dom.imgIdx]) || node.data.item || node.data;
    if (initItem) getArtBubbleTex(initItem);
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

  // 点击 L1 子泡泡（directLeaf 直接进入双模画卷/播客展厅，定位到当前所见切片）
  function onL1BallClick(parentBall, groupIdx) {
    if (isTransition) return;
    const sec = parentBall.secData;
    const under = parentBall.under;
    if (!sec || !under) return;

    const clickedNode = under.l1Nodes[groupIdx];
    if (sec.directLeaf) {
      const activeItem = (clickedNode.data.playlist && clickedNode.data.playlist[clickedNode.dom.imgIdx])
        || clickedNode.data.item
        || clickedNode.data;
      openShowcaseFromSection(sec, activeItem);
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
    hideBubblePeekNow();
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

    // 当点开底部 06 时立即撑开页面高度并柔和将子泡泡滑入舒适视线；同时按策略标记该组气泡已看
    if (ballId === 6 && b.isOpen0) {
      setPageHeight(true);
      const comfortTop = Math.max(scrollCtrl.target, Math.abs(b.bottomY) - H * 0.34);
      smoothScrollTo(comfortTop, false);
    } else {
      setPageHeight(false);
    }

    if (b.isOpen0 && appState.preferences.seenMode === 'inspect' && b.secData) {
      const inspectBall = b;
      setTimeout(function () {
        if (!inspectBall.isOpen0 || appState.preferences.seenMode !== 'inspect') return;
        const ids = [];
        (inspectBall.secData.children || []).forEach(function (ch) {
          if (ch.item && ch.item.id) ids.push(ch.item.id);
          else if (ch.id) ids.push(ch.id);
        });
        if (ids.length) markItemsSeen(ids);
      }, 1200);
    }
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

  // ==================== 6款字体试衣间、气泡速览卡、非Top-Layer抽屉与三态一体漫游展厅 ====================
  const THEME_ORDER = ['celadon-mist', 'rice-paper', 'mother-of-pearl', 'soft-classic'];
  const FONT_ORDER = [
    'caslon-zhuque',
    'bodoni-huiwen',
    'classic-caslon',
    'cormorant-wenkai',
    'instrument-oldsong',
    'playfair-bright'
  ];

  const siteHeaderEl = document.getElementById('site-header');
  const shuffleBtn = document.getElementById('shuffle-btn');
  const shuffleLabelEl = document.getElementById('shuffle-label');
  const eraGalleryBtn = document.getElementById('era-gallery-btn');
  const eraGalleryLabel = document.getElementById('era-gallery-label');
  const favGalleryBtn = document.getElementById('fav-gallery-btn');
  const favGalleryLabel = document.getElementById('fav-gallery-label');
  const favCountBadge = document.getElementById('fav-count-badge');
  const topWikiForm = document.getElementById('top-wiki-form');
  const topWikiInput = document.getElementById('top-wiki-input');
  const topWikiSuggest = document.getElementById('top-wiki-suggest');
  const themeCycleBtn = document.getElementById('theme-cycle-btn');
  const themeBtnLabel = document.getElementById('theme-btn-label');
  const fontPickerWrap = document.getElementById('font-picker-wrap');
  const fontCycleBtn = document.getElementById('font-cycle-btn');
  const fontBtnLabel = document.getElementById('font-btn-label');
  const fontPickerMenu = document.getElementById('font-picker-menu');
  const fontPickerList = document.getElementById('font-picker-list');
  const tunerOpenBtn = document.getElementById('tuner-open-btn');
  const tunerBtnLabel = document.getElementById('tuner-btn-label');
  const seenCountBadge = document.getElementById('seen-count-badge');

  const drawerFavSection = document.getElementById('drawer-fav-section');
  const drawerFavCount = document.getElementById('drawer-fav-count');
  const drawerOpenFavAll = document.getElementById('drawer-open-fav-all');
  const drawerFavGrid = document.getElementById('drawer-fav-grid');
  const drawerPagesSection = document.getElementById('drawer-pages-section');
  const drawerPagesList = document.getElementById('drawer-pages-list');

  // 子泡泡悬停速览与一键直达卡（遵循 WCAG 3.2.1 绝不抢夺键盘焦点）
  const bubblePeekCard = document.getElementById('bubble-peek-card');
  const peekBadgeEl = document.getElementById('peek-badge');
  const peekStepperEl = document.getElementById('peek-stepper');
  const peekPrevBtn = document.getElementById('peek-prev-btn');
  const peekNextBtn = document.getElementById('peek-next-btn');
  const peekStepText = document.getElementById('peek-step-text');
  const peekTitleEl = document.getElementById('peek-title');
  const peekEnEl = document.getElementById('peek-en');
  const peekDescEl = document.getElementById('peek-desc');
  const peekOpenSplitBtn = document.getElementById('peek-open-split');
  const peekOpenStageBtn = document.getElementById('peek-open-stage');
  const peekOpenGalleryBtn = document.getElementById('peek-open-gallery');
  const peekFavBtn = document.getElementById('peek-fav-btn');
  const peekSourceLink = document.getElementById('peek-source-link');

  const tunerDialog = document.getElementById('tuner-dialog');
  const tunerBackdrop = document.getElementById('tuner-backdrop');
  const tunerCloseBtn = document.getElementById('tuner-close-btn');
  const tunerFavCount = document.getElementById('tuner-fav-count');
  const tunerOpenFavGallery = document.getElementById('tuner-open-fav-gallery');
  const tunerFavStrip = document.getElementById('tuner-fav-strip');
  const tunerThemeGrid = document.getElementById('tuner-theme-grid');
  const tunerFontGrid = document.getElementById('tuner-font-grid');
  const tunerSeenStat = document.getElementById('tuner-seen-stat');
  const tunerSeenSeg = document.getElementById('tuner-seen-seg');
  const tunerResetSeenBtn = document.getElementById('tuner-reset-seen');
  const tunerNoteEl = document.getElementById('tuner-note');
  const tunerChannelsList = document.getElementById('tuner-channels-list');
  const tunerSyncMsg = document.getElementById('tuner-sync-msg');
  const tunerSaveOnlyBtn = document.getElementById('tuner-save-only');
  const tunerApplyShuffleBtn = document.getElementById('tuner-apply-shuffle');

  const lwaOpenLink = document.getElementById('lwa-open-link');
  const lwaBtnLabel = document.getElementById('lwa-btn-label');

  // 三态一体展厅 DOM（#showcase-dialog：gallery | split | stage）
  const showcaseDialog = document.getElementById('showcase-dialog');
  const scEyebrow = document.getElementById('sc-eyebrow');
  const scCounter = document.getElementById('sc-counter');
  const scPrevBtn = document.getElementById('sc-prev-btn');
  const scNextBtn = document.getElementById('sc-next-btn');
  const scTabGallery = document.getElementById('sc-tab-gallery');
  const scTabSplit = document.getElementById('sc-tab-split');
  const scTabStage = document.getElementById('sc-tab-stage');
  const scFavBtn = document.getElementById('sc-fav-btn');
  const scOpenFavBtn = document.getElementById('sc-open-fav-btn');
  const scFavCount = document.getElementById('sc-fav-count');
  const scSigMoreBtn = document.getElementById('sc-sig-more');
  const scSigLessBtn = document.getElementById('sc-sig-less');
  const scSourceLink = document.getElementById('sc-source-link');
  const scLwaTopLink = document.getElementById('sc-lwa-top-link');
  const scCloseBtn = document.getElementById('sc-close-btn');

  const scDomMuseumBtn = document.getElementById('sc-dom-museum');
  const scDomLandscapeBtn = document.getElementById('sc-dom-landscape');
  const scFacetPills = document.getElementById('sc-facet-pills');
  const scRandomJumpBtn = document.getElementById('sc-random-jump-btn');

  // 模式 1：时代/国家/秘境 滚动瀑布长卷
  const scGalleryView = document.getElementById('sc-gallery-view');
  const scGalEyebrow = document.getElementById('sc-gal-eyebrow');
  const scGalTitle = document.getElementById('sc-gal-title');
  const scGalSub = document.getElementById('sc-gal-sub');
  const scCuratorBanner = document.getElementById('sc-curator-banner');
  const scCuratorMeta = document.getElementById('sc-curator-meta');
  const scCuratorNote = document.getElementById('sc-curator-note');
  const scGalGrid = document.getElementById('sc-gal-grid');
  const scGalMoreBtn = document.getElementById('sc-gal-more-btn');

  // 模式 2：左 4K 原图 + 右完整维基百科全章与 LWA 收藏库并排深读
  const scSplitView = document.getElementById('sc-split-view');
  const scSplitCanvas = document.getElementById('sc-split-canvas');
  const scSplitImg = document.getElementById('sc-split-img');
  const scSplitQuoteCard = document.getElementById('sc-split-quote-card');
  const scSqKicker = document.getElementById('sc-sq-kicker');
  const scSqQuote = document.getElementById('sc-sq-quote');
  const scSqSub = document.getElementById('sc-sq-sub');
  const scSplitFitBtn = document.getElementById('sc-split-fit-btn');
  const scSplitResetZoomBtn = document.getElementById('sc-split-reset-zoom');
  const scSplitToFullBtn = document.getElementById('sc-split-to-full');
  const scSplitMapLink = document.getElementById('sc-split-map-link');
  const scSplitTitle = document.getElementById('sc-split-title');
  const scSplitEn = document.getElementById('sc-split-en');
  const scSplitSub = document.getElementById('sc-split-sub');
  const scSplitStrip = document.getElementById('sc-split-strip');
  const scSplitRight = document.getElementById('sc-split-right');

  const dosWikiForm = document.getElementById('dos-wiki-form');
  const dosWikiInput = document.getElementById('dos-wiki-input');
  const dosWikiSuggest = document.getElementById('dos-wiki-suggest');
  const dosLead = document.getElementById('dos-lead');
  const dosTrail = document.getElementById('dos-trail');
  const dosRandomWikiBtn = document.getElementById('dos-random-wiki-btn');
  const dosWikiArticle = document.getElementById('dos-wiki-article');
  const dosRelatedChips = document.getElementById('dos-related-chips');
  const dosLwaCard = document.getElementById('dos-lwa-card');
  const dosAskVaultLink = document.getElementById('dos-ask-vault-link');
  const dosLwaList = document.getElementById('dos-lwa-list');
  const dosWindowList = document.getElementById('dos-window-list');

  // 模式 3：100vw × 100dvh 纯享全屏 4K 沉浸画幅
  const scStageView = document.getElementById('sc-stage-view');
  const scStageBackdrop = document.getElementById('sc-stage-backdrop');
  const scStageCanvas = document.getElementById('sc-stage-canvas');
  const scStageImg = document.getElementById('sc-stage-img');
  const scStageFavBtn = document.getElementById('sc-stage-fav-btn');
  const scFitBtn = document.getElementById('sc-fit-btn');
  const scCaptionToggle = document.getElementById('sc-caption-toggle');
  const scOpenDossierBtn = document.getElementById('sc-open-dossier-btn');
  const scCaptionCard = document.getElementById('sc-caption-card');
  const scCapTag = document.getElementById('sc-cap-tag');
  const scMapLink = document.getElementById('sc-map-link');
  const scCapTitle = document.getElementById('sc-cap-title');
  const scCapSub = document.getElementById('sc-cap-sub');
  const scCapDetails = document.getElementById('sc-cap-details');
  const scCapStory = document.getElementById('sc-cap-story');
  const scCapMeta = document.getElementById('sc-cap-meta');
  const scStageStrip = document.getElementById('sc-stage-strip');

  let showcaseOpeningBusy = false;
  let lastModalTriggerEl = null;

  function isModalOpen(el) {
    return Boolean(el && !el.hidden);
  }

  function syncModalBodyClass() {
    const anyModal = isModalOpen(showcaseDialog) || isModalOpen(tunerDialog);
    document.body.classList.toggle('modal-open', anyModal);
    // 为保持与 Trancy 等非 Top-Layer 网页扩展浮层共存，展厅与调音台采用 role="dialog" 叠层，开启时对背景地标施加 inert
    [
      siteHeaderEl,
      document.getElementById('global-menu'),
      document.getElementById('fix-stage'),
      bubblePeekCard,
      document.getElementById('scrollFix'),
      document.getElementById('motion-toggle')
    ].forEach(function (bgEl) {
      if (bgEl) bgEl.inert = anyModal;
    });
  }

  function rememberModalTrigger() {
    const act = document.activeElement;
    if (act && act !== document.body && (!showcaseDialog || !showcaseDialog.contains(act)) && (!tunerDialog || !tunerDialog.contains(act))) {
      lastModalTriggerEl = act;
    }
  }

  function restoreModalTriggerFocus() {
    const el = lastModalTriggerEl;
    lastModalTriggerEl = null;
    if (el && typeof el.focus === 'function' && document.contains(el)) {
      try { el.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  function isAnyModalOpen() {
    return Boolean(
      isModalOpen(showcaseDialog) ||
      isModalOpen(tunerDialog) ||
      document.body.classList.contains('menu-open')
    );
  }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stripBr(htmlStr) {
    return String(htmlStr || '').replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '');
  }

  function getSeenCount() {
    return Object.keys(appState.seenMap || {}).length;
  }

  function updateTopPillLabels() {
    const th = getActiveTheme();
    const fn = getActiveFontPreset();
    const seenTotal = getSeenCount();
    const favTotal = Array.isArray(appState.favorites) ? appState.favorites.length : 0;
    if (themeBtnLabel) themeBtnLabel.textContent = currentLang === 'zh' ? th.name : th.enName;
    if (fontBtnLabel) fontBtnLabel.textContent = fn.shortLabel || fn.name;
    if (eraGalleryLabel) eraGalleryLabel.textContent = currentLang === 'zh' ? '漫游画卷' : 'Galleries';
    if (favGalleryLabel) favGalleryLabel.textContent = currentLang === 'zh' ? '画匣' : 'Saved';
    if (shuffleLabelEl) shuffleLabelEl.textContent = currentLang === 'zh' ? '换一窗' : 'Shuffle';
    if (tunerBtnLabel) tunerBtnLabel.textContent = currentLang === 'zh' ? '频道与偏好' : 'Feed & AI';
    if (lwaBtnLabel) lwaBtnLabel.textContent = currentLang === 'zh' ? '收藏库 ↗' : 'Library ↗';
    if (seenCountBadge) seenCountBadge.textContent = String(seenTotal);
    if (favCountBadge) favCountBadge.textContent = String(favTotal);
    if (scFavCount) scFavCount.textContent = String(favTotal);
    if (drawerFavCount) drawerFavCount.textContent = String(favTotal);
    if (tunerFavCount) tunerFavCount.textContent = String(favTotal);
    if (tunerSeenStat) tunerSeenStat.textContent = (currentLang === 'zh' ? '已记 ' : 'Seen ') + seenTotal + (currentLang === 'zh' ? ' 件' : '');

    const catHref = appState.lwaCatalogUrl || DATA.OBSIDIAN_CATALOG_URL || '';
    const askHref = appState.lwaAskUrl || DATA.OBSIDIAN_ASK_URL || '';
    if (lwaOpenLink) {
      lwaOpenLink.hidden = !catHref;
      if (catHref) lwaOpenLink.href = catHref;
    }
    if (scLwaTopLink) {
      scLwaTopLink.hidden = !catHref;
      if (catHref) scLwaTopLink.href = catHref;
    }
    if (dosLwaCard) {
      dosLwaCard.hidden = !catHref && !isHttpServer;
    }
    if (dosAskVaultLink) {
      dosAskVaultLink.hidden = !askHref;
      if (askHref) dosAskVaultLink.href = askHref;
    }
  }

  // ==================== 6 款中西文字体下拉试衣间 ====================
  function setFontMenuOpen(open) {
    if (!fontPickerMenu || !fontCycleBtn) return;
    const next = Boolean(open);
    if (next) {
      renderFontPickerMenu();
    }
    fontPickerMenu.hidden = !next;
    fontCycleBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (fontPickerWrap) fontPickerWrap.classList.toggle('open', next);
  }

  function renderFontPickerMenu() {
    if (!fontPickerList) return;
    FONT_ORDER.forEach(function (fid) {
      const f = DATA.FONT_PRESETS[fid];
      if (f && f.cssUrl) ensureFontStylesheet(f.cssUrl);
    });

    fontPickerList.innerHTML = FONT_ORDER.map(function (fid) {
      const fn = DATA.FONT_PRESETS[fid];
      if (!fn) return '';
      const isAct = fn.id === appState.preferences.fontPreset;
      return (
        '<button type="button" class="font-opt-btn' + (isAct ? ' active' : '') + '" role="menuitemradio" aria-checked="' + (isAct ? 'true' : 'false') + '" data-pick-font="' + escHtml(fn.id) + '">' +
          '<div class="font-opt-top">' +
            '<span class="font-opt-name" style="font-family:' + escHtml(fn.zhBody) + ';font-weight:' + escHtml(fn.zhBodyWeight || '400') + '">' + escHtml(fn.name) + '</span>' +
            '<span class="font-opt-badge">' + (isAct ? '✓ 当前使用' : '点选即换') + '</span>' +
          '</div>' +
          '<div class="font-opt-sample" style="font-family:' + escHtml(fn.zhBody) + ';font-weight:' + escHtml(fn.zhBodyWeight || '400') + '">' +
            escHtml(fn.sample || fn.desc) +
          '</div>' +
        '</button>'
      );
    }).join('');
  }

  // ==================== 子泡泡旁悬浮速览与一键直达卡片 ====================
  const peekState = {
    parentBall: null,
    node: null,
    hideTimer: null,
    pointerInsideCard: false
  };

  function getActiveNodeItem(node) {
    if (!node || !node.data) return null;
    const raw = (node.data.playlist && node.data.playlist[node.dom.imgIdx])
      || node.data.item
      || node.data;
    return (DATA.enrichClientItem && raw && raw.id) ? DATA.enrichClientItem(raw) : raw;
  }

  function positionBubblePeekCard() {
    if (!bubblePeekCard || bubblePeekCard.hidden || !peekState.node) return;
    const n = peekState.node;
    const sx = (W > PHY.borderSP ? n.tPosX : n.wx) || n.wx;
    const sy = (W > PHY.borderSP ? n.dom.domY : -n.wy) || (-n.wy);
    const cardW = bubblePeekCard.offsetWidth || 308;
    const cardH = bubblePeekCard.offsetHeight || 196;
    const offsetR = Math.round(122 * (n.ballScale || 1) * (n.baseScale || 1)) + 16;

    let left = sx + offsetR;
    if (left + cardW > W - 16) {
      left = sx - offsetR - cardW;
    }
    left = Math.max(14, Math.min(W - cardW - 14, left));
    const top = Math.max(70, Math.min(H - cardH - 16, sy - cardH * 0.45));
    bubblePeekCard.style.transform = 'translate3d(' + Math.round(left) + 'px, ' + Math.round(top) + 'px, 0)';
  }

  function populateBubblePeekCard() {
    if (!bubblePeekCard || !peekState.node || !peekState.parentBall) return;
    const sec = peekState.parentBall.secData;
    const node = peekState.node;
    const it = getActiveNodeItem(node);
    if (!it) return;

    if (peekBadgeEl) {
      peekBadgeEl.textContent = (sec && sec.bgSup ? sec.bgSup : 'WINDOW') + (it.civilization ? (' · ' + it.civilization) : '');
    }

    const pl = (node.data && node.data.playlist) || [];
    if (peekStepperEl && peekStepText) {
      if (pl.length > 1) {
        peekStepperEl.hidden = false;
        peekStepText.textContent = (node.dom.imgIdx + 1) + ' / ' + pl.length;
      } else {
        peekStepperEl.hidden = true;
      }
    }

    if (peekTitleEl) peekTitleEl.textContent = it.title || '';
    if (peekEnEl) {
      const enSub = it.enTitle || it.subtitle || '';
      peekEnEl.textContent = enSub;
      peekEnEl.hidden = !enSub;
    }
    if (peekDescEl) {
      const descTxt = it.story || it.quote || '';
      peekDescEl.textContent = descTxt;
      peekDescEl.hidden = !descTxt;
    }
    if (peekOpenStageBtn) {
      peekOpenStageBtn.hidden = !isVisualItem(it);
    }
    syncHeartBtnState(peekFavBtn, it.id);
    if (peekSourceLink) {
      const extHref = it.sourceUrl || it.mapUrl || ('https://zh.wikipedia.org/w/index.php?search=' + encodeURIComponent(inferDefaultWikiTitle(it)));
      peekSourceLink.href = extHref;
      peekSourceLink.textContent = it.mapUrl && !it.sourceUrl ? '↗ 坐标地图' : '↗ 原馆藏';
    }
    positionBubblePeekCard();
  }

  function showBubblePeekForNode(parentBall, node) {
    if (!bubblePeekCard || !parentBall || !node) return;
    if (isTransition || isAnyModalOpen() || !parentBall.under || parentBall.under.status !== 1 || node.dom.opacity < 0.45) {
      return;
    }
    if (peekState.hideTimer) {
      clearTimeout(peekState.hideTimer);
      peekState.hideTimer = null;
    }
    peekState.parentBall = parentBall;
    peekState.node = node;
    bubblePeekCard.hidden = false;
    populateBubblePeekCard();
    requestAnimationFrame(positionBubblePeekCard);
  }

  function scheduleHideBubblePeek() {
    if (peekState.hideTimer) clearTimeout(peekState.hideTimer);
    peekState.hideTimer = setTimeout(function () {
      if (peekState.pointerInsideCard) return;
      if (peekState.node && peekState.node.isHovered) return;
      hideBubblePeekNow();
    }, 230);
  }

  function hideBubblePeekNow() {
    if (peekState.hideTimer) {
      clearTimeout(peekState.hideTimer);
      peekState.hideTimer = null;
    }
    peekState.pointerInsideCard = false;
    peekState.node = null;
    peekState.parentBall = null;
    if (bubblePeekCard) bubblePeekCard.hidden = true;
  }

  if (bubblePeekCard) {
    bubblePeekCard.addEventListener('pointerenter', function () {
      peekState.pointerInsideCard = true;
      if (peekState.hideTimer) {
        clearTimeout(peekState.hideTimer);
        peekState.hideTimer = null;
      }
    });
    bubblePeekCard.addEventListener('pointerleave', function () {
      peekState.pointerInsideCard = false;
      scheduleHideBubblePeek();
    });
  }

  function stepPeekNodePlaylist(dir) {
    const node = peekState.node;
    if (!node || !node.data || !node.data.playlist || node.data.playlist.length <= 1) return;
    const len = node.data.playlist.length;
    node.dom.imgIdx = (node.dom.imgIdx + dir + len) % len;
    const curItem = node.data.playlist[node.dom.imgIdx];
    if (curItem) {
      getArtBubbleTex(curItem);
      node.dom.txt.innerHTML = DATA.formatBilingualBubbleLabel
        ? DATA.formatBilingualBubbleLabel(curItem)
        : (curItem.shortTitle || node.data.label[currentLang]);
    }
    populateBubblePeekCard();
    wakeRenderLoop();
  }

  if (peekPrevBtn) peekPrevBtn.addEventListener('click', function (e) { e.stopPropagation(); stepPeekNodePlaylist(-1); });
  if (peekNextBtn) peekNextBtn.addEventListener('click', function (e) { e.stopPropagation(); stepPeekNodePlaylist(1); });

  if (peekOpenSplitBtn) {
    peekOpenSplitBtn.addEventListener('click', function () {
      if (!peekState.parentBall || !peekState.node) return;
      const sec = peekState.parentBall.secData;
      const it = getActiveNodeItem(peekState.node);
      hideBubblePeekNow();
      openShowcaseFromSection(sec, it, 'split');
    });
  }
  if (peekOpenStageBtn) {
    peekOpenStageBtn.addEventListener('click', function () {
      if (!peekState.parentBall || !peekState.node) return;
      const sec = peekState.parentBall.secData;
      const it = getActiveNodeItem(peekState.node);
      hideBubblePeekNow();
      openShowcaseFromSection(sec, it, 'stage');
    });
  }
  if (peekOpenGalleryBtn) {
    peekOpenGalleryBtn.addEventListener('click', function () {
      const it = peekState.node ? getActiveNodeItem(peekState.node) : null;
      const dom = getDomainForItem(it);
      const fac = (it && it.facet) || 'all';
      hideBubblePeekNow();
      openExplorerPreset(dom, fac);
    });
  }
  if (peekFavBtn) {
    peekFavBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const it = peekState.node ? getActiveNodeItem(peekState.node) : null;
      if (it) toggleFavoriteItem(it);
    });
  }

  // ==================== 偏好持久化与去重账本 ====================
  function savePreferences(skipRemote) {
    appState.preferences.updatedAt = new Date().toISOString();
    saveLocalJson('ww_prefs_v2', appState.preferences);
    if (!skipRemote && isHttpServer) {
      fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: appState.preferences }),
        priority: 'low'
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.ok && tunerSyncMsg) {
          tunerSyncMsg.textContent = '✓ 已同步至 feed-profile/preferences.md';
        }
      }).catch(function () {});
    }
  }

  function markItemsSeen(ids) {
    if (!Array.isArray(ids) || !ids.length || appState.preferences.seenMode === 'off') return;
    const nowIso = new Date().toISOString();
    const added = [];
    ids.forEach(function (id) {
      if (!id) return;
      if (!appState.seenMap[id]) added.push(id);
      appState.seenMap[id] = nowIso;
    });
    if (!added.length) return;
    saveLocalJson('ww_seen_v2', appState.seenMap);
    updateTopPillLabels();
    if (isHttpServer) {
      fetch('/api/seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: added }),
        priority: 'low'
      }).catch(function () {});
    }
  }

  function clearSeenHistory() {
    appState.seenMap = {};
    saveLocalJson('ww_seen_v2', {});
    updateTopPillLabels();
    if (isHttpServer) {
      fetch('/api/seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
        priority: 'low'
      }).catch(function () {});
    }
  }

  let openModeSeenTimer = null;
  function scheduleOpenModeSeenIfNeeded() {
    if (openModeSeenTimer) clearTimeout(openModeSeenTimer);
    if (appState.preferences.seenMode !== 'open') return;
    openModeSeenTimer = setTimeout(function () {
      if (appState.preferences.seenMode !== 'open') return;
      const ids = [];
      DATA.sections.forEach(function (sec) {
        (sec.children || []).forEach(function (ch) {
          if (ch.item && ch.item.id) ids.push(ch.item.id);
        });
      });
      if (ids.length) markItemsSeen(ids);
    }, 3400);
  }

  function applyTheme(themeId, skipSave) {
    const theme = DATA.THEMES[themeId] || DATA.THEMES['celadon-mist'];
    appState.preferences.theme = theme.id;
    syncThemeCssVars(theme);

    heroDom.logoTexts.forEach(function (t) { t.setAttribute('fill', theme.accent); });
    heroDom.serifTexts.forEach(function (t) { t.setAttribute('fill', theme.ink); });
    heroDom.sabTexts.forEach(function (t) { t.setAttribute('fill', theme.subInk); });

    SP.setTheme(theme);
    updateTex(TEX.balls, SP.buildBallAtlas(480).canvas);
    const fa = SP.buildFrontBallAtlases(384);
    updateTex(TEX.frontSharp, fa.sharp);
    updateTex(TEX.frontSoft, fa.soft);
    updateTex(TEX.frontCombined, fa.combined);
    updateTex(TEX.bokeh, SP.buildBokehAtlas(192));
    updateTex(TEX.joint, SP.buildJointAtlas(false, 192));
    updateTex(TEX.jointBlur, SP.buildJointAtlas(true, 192));
    updateTex(TEX.bgColor, SP.buildBgColor(512));
    updateTex(TEX.bgWord, SP.buildBgWordAtlas(DATA.sections, getActiveFontPreset()));

    updateTopPillLabels();
    syncTunerActiveCards();
    wakeRenderLoop();
    if (!skipSave) savePreferences(false);
  }

  function applyFontPreset(fontId, skipSave) {
    const font = DATA.FONT_PRESETS[fontId]
      || DATA.FONT_PRESETS['caslon-zhuque']
      || DATA.FONT_PRESETS['classic-caslon'];
    appState.preferences.fontPreset = font.id;
    syncFontCssVars(font);

    heroDom.logoTexts.forEach(function (t) { t.setAttribute('font-family', font.enSans); });
    heroDom.serifTexts.forEach(function (t) { t.setAttribute('font-family', font.enDisplay); });
    heroDom.sabTexts.forEach(function (t) { t.setAttribute('font-family', font.enSans); });

    updateTex(TEX.bgWord, SP.buildBgWordAtlas(DATA.sections, font));
    if (document.fonts && document.fonts.load) {
      Promise.allSettled([
        document.fonts.load('400 72px ' + font.enDisplay),
        document.fonts.load((font.zhBodyWeight || '400') + ' 32px ' + font.zhBody)
      ]).then(function () {
        if (appState.preferences.fontPreset === font.id) {
          updateTex(TEX.bgWord, SP.buildBgWordAtlas(DATA.sections, font));
          wakeRenderLoop();
        }
      });
    }

    updateTopPillLabels();
    syncTunerActiveCards();
    if (fontPickerMenu && !fontPickerMenu.hidden) {
      renderFontPickerMenu();
    }
    wakeRenderLoop();
    if (!skipSave) savePreferences(false);
  }

  if (themeCycleBtn) {
    themeCycleBtn.addEventListener('click', function () {
      const idx = THEME_ORDER.indexOf(appState.preferences.theme);
      const nextId = THEME_ORDER[(idx + 1 + THEME_ORDER.length) % THEME_ORDER.length];
      applyTheme(nextId, false);
    });
  }

  if (fontCycleBtn) {
    fontCycleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setFontMenuOpen(fontPickerMenu ? fontPickerMenu.hidden : false);
    });
  }

  if (fontPickerList) {
    fontPickerList.addEventListener('click', function (e) {
      e.stopPropagation();
      const btn = e.target.closest('[data-pick-font]');
      if (!btn) return;
      const fid = btn.getAttribute('data-pick-font');
      if (fid) applyFontPreset(fid, false);
    });
  }

  if (eraGalleryBtn) {
    eraGalleryBtn.addEventListener('click', function () {
      openExplorerPreset('museum', 'china-tang-song');
    });
  }

  let isShuffling = false;
  async function shuffleWindow() {
    if (isShuffling || isTransition) return;
    hideBubblePeekNow();
    isShuffling = true;
    if (shuffleBtn) shuffleBtn.classList.add('is-spinning');

    if (isHttpServer) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(function () { ctrl.abort(); }, 5500);
        const resp = await fetch('/api/feed?refresh=1', { signal: ctrl.signal });
        clearTimeout(tid);
        if (resp.ok) {
          const data = await resp.json();
          const pool = data && (data.livePool || data.items);
          if (Array.isArray(pool) && pool.length) {
            appState.livePool = pool;
          }
          if (data && Array.isArray(data.aiInbox)) {
            appState.aiInbox = data.aiInbox;
          }
        }
      } catch (_) {}
    }

    appState.currentSeed = Date.now() + Math.floor(Math.random() * 10000);
    const nextSections = DATA.buildWindowFeed(
      appState.livePool,
      appState.preferences,
      appState.seenMap,
      appState.aiInbox,
      appState.currentSeed
    );

    historyState.topList = [[0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0], [0]];
    rebuildAllSections(nextSections);

    if (scrollCtrl.target > H * 0.85) {
      smoothScrollTo(0, false);
    }
    wakeRenderLoop();
    startTopView(false);
    scheduleOpenModeSeenIfNeeded();

    setTimeout(function () {
      isShuffling = false;
      if (shuffleBtn) shuffleBtn.classList.remove('is-spinning');
    }, 520);
  }

  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', function () {
      shuffleWindow();
    });
  }

  // ==================== 频道与 AI 协作偏好抽屉 (#tuner-dialog，非 Top-Layer) ====================
  function syncTunerActiveCards() {
    if (tunerThemeGrid) {
      tunerThemeGrid.querySelectorAll('[data-theme-id]').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-theme-id') === appState.preferences.theme);
      });
    }
    if (tunerFontGrid) {
      tunerFontGrid.querySelectorAll('[data-font-id]').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-font-id') === appState.preferences.fontPreset);
      });
    }
    if (tunerSeenSeg) {
      tunerSeenSeg.querySelectorAll('[data-seen-mode]').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-seen-mode') === appState.preferences.seenMode);
      });
    }
  }

  function renderTunerDialog() {
    if (!tunerDialog) return;

    FONT_ORDER.forEach(function (fid) {
      const f = DATA.FONT_PRESETS[fid];
      if (f && f.cssUrl) ensureFontStylesheet(f.cssUrl);
    });

    if (tunerThemeGrid && !tunerThemeGrid.children.length) {
      tunerThemeGrid.innerHTML = THEME_ORDER.map(function (tid) {
        const th = DATA.THEMES[tid];
        const lCols = th.lineColors || {};
        return (
          '<button type="button" class="tuner-card" data-theme-id="' + escHtml(th.id) + '">' +
            '<span class="tuner-swatches">' +
              '<i style="background:' + escHtml(th.accent) + '"></i>' +
              '<i style="background:' + escHtml(lCols[1] || '#9ec2ba') + '"></i>' +
              '<i style="background:' + escHtml(lCols[3] || '#c3abcf') + '"></i>' +
              '<i style="background:' + escHtml(th.bgHex) + '"></i>' +
            '</span>' +
            '<span class="tuner-card-title">' + escHtml(th.name) + '</span>' +
            '<span class="tuner-card-sub">' + escHtml(th.enName) + '</span>' +
          '</button>'
        );
      }).join('');
    }

    if (tunerFontGrid && !tunerFontGrid.children.length) {
      tunerFontGrid.innerHTML = FONT_ORDER.map(function (fid) {
        const fn = DATA.FONT_PRESETS[fid];
        if (!fn) return '';
        return (
          '<button type="button" class="tuner-card" data-font-id="' + escHtml(fn.id) + '">' +
            '<span class="tuner-card-title" style="font-family:' + escHtml(fn.zhBody) + ';font-weight:' + escHtml(fn.zhBodyWeight || '400') + '">' + escHtml(fn.name) + '</span>' +
            '<span class="tuner-card-sub">' + escHtml(fn.desc) + '</span>' +
          '</button>'
        );
      }).join('');
    }

    if (tunerNoteEl) {
      tunerNoteEl.value = appState.preferences.freeformNote || '';
    }

    if (tunerChannelsList) {
      tunerChannelsList.innerHTML = (appState.preferences.channels || []).map(function (ch, idx) {
        const w = Math.max(0, Math.min(5, Math.round(Number(ch.weight) || 0)));
        return (
          '<div class="tuner-ch-row" data-ch-idx="' + idx + '">' +
            '<div class="tuner-ch-top">' +
              '<span class="tuner-ch-slot">0' + (idx + 1) + '</span>' +
              '<input type="text" class="tuner-ch-name" value="' + escHtml(ch.title || '') + '" aria-label="频道名称 0' + (idx + 1) + '">' +
              '<div class="tuner-stepper">' +
                '<button type="button" class="tuner-step-btn" data-step-dir="-1" aria-label="减少权重">−</button>' +
                '<span class="tuner-step-val" data-weight-val="' + w + '">' + w + '</span>' +
                '<button type="button" class="tuner-step-btn" data-step-dir="1" aria-label="增加权重">+</button>' +
              '</div>' +
            '</div>' +
            '<input type="text" class="tuner-ch-query" value="' + escHtml(ch.query || '') + '" placeholder="随便写偏好词（英文/中文皆可，如 Song porcelain / Monet / nebula）">' +
          '</div>'
        );
      }).join('');
    }

    if (tunerSyncMsg) {
      tunerSyncMsg.textContent = isHttpServer
        ? '双向同步：feed-profile/preferences.md'
        : '离线模式：保存至浏览器本地存储';
    }

    updateTopPillLabels();
    syncTunerActiveCards();
  }

  function collectTunerEditsIntoPrefs() {
    if (tunerNoteEl) {
      appState.preferences.freeformNote = tunerNoteEl.value.trim();
    }
    if (tunerChannelsList) {
      tunerChannelsList.querySelectorAll('.tuner-ch-row').forEach(function (row) {
        const idx = parseInt(row.getAttribute('data-ch-idx'), 10);
        const ch = appState.preferences.channels[idx];
        if (!ch) return;
        const nameInput = row.querySelector('.tuner-ch-name');
        const queryInput = row.querySelector('.tuner-ch-query');
        const valSpan = row.querySelector('.tuner-step-val');
        if (nameInput && nameInput.value.trim()) ch.title = nameInput.value.trim();
        if (queryInput) ch.query = queryInput.value.trim();
        if (valSpan) {
          ch.weight = Math.max(0, Math.min(5, parseInt(valSpan.getAttribute('data-weight-val'), 10) || 0));
        }
      });
    }
  }

  function openTunerDialog() {
    if (!tunerDialog) return;
    rememberModalTrigger();
    setMenuOpen(false);
    setFontMenuOpen(false);
    hideBubblePeekNow();
    renderTunerDialog();
    renderDrawerFavoritesAndPages();
    tunerDialog.hidden = false;
    syncModalBodyClass();
    if (tunerCloseBtn) {
      try { tunerCloseBtn.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  function closeTunerDialog() {
    if (!tunerDialog || tunerDialog.hidden) return;
    tunerDialog.hidden = true;
    syncModalBodyClass();
    wakeRenderLoop();
    restoreModalTriggerFocus();
  }

  if (tunerOpenBtn) tunerOpenBtn.addEventListener('click', openTunerDialog);
  if (tunerCloseBtn) tunerCloseBtn.addEventListener('click', closeTunerDialog);
  if (tunerBackdrop) tunerBackdrop.addEventListener('click', closeTunerDialog);

  if (tunerThemeGrid) {
    tunerThemeGrid.addEventListener('click', function (e) {
      const card = e.target.closest('[data-theme-id]');
      if (card) applyTheme(card.getAttribute('data-theme-id'), false);
    });
  }
  if (tunerFontGrid) {
    tunerFontGrid.addEventListener('click', function (e) {
      const card = e.target.closest('[data-font-id]');
      if (card) applyFontPreset(card.getAttribute('data-font-id'), false);
    });
  }
  if (tunerSeenSeg) {
    tunerSeenSeg.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-seen-mode]');
      if (!btn) return;
      appState.preferences.seenMode = btn.getAttribute('data-seen-mode');
      syncTunerActiveCards();
      savePreferences(false);
      scheduleOpenModeSeenIfNeeded();
    });
  }
  if (tunerResetSeenBtn) {
    tunerResetSeenBtn.addEventListener('click', function () {
      clearSeenHistory();
      if (tunerSyncMsg) tunerSyncMsg.textContent = '✓ 已清空已看记录，下次刷新将重新纳入全部馆藏';
    });
  }
  if (tunerChannelsList) {
    tunerChannelsList.addEventListener('click', function (e) {
      const stepBtn = e.target.closest('.tuner-step-btn');
      if (!stepBtn) return;
      const row = stepBtn.closest('.tuner-ch-row');
      const valSpan = row && row.querySelector('.tuner-step-val');
      if (!valSpan) return;
      const dir = parseInt(stepBtn.getAttribute('data-step-dir'), 10) || 0;
      const cur = parseInt(valSpan.getAttribute('data-weight-val'), 10) || 0;
      const next = Math.max(0, Math.min(5, cur + dir));
      valSpan.setAttribute('data-weight-val', String(next));
      valSpan.textContent = String(next);
    });
  }
  if (tunerSaveOnlyBtn) {
    tunerSaveOnlyBtn.addEventListener('click', function () {
      collectTunerEditsIntoPrefs();
      savePreferences(false);
      const rebuilt = DATA.buildWindowFeed(
        appState.livePool,
        appState.preferences,
        appState.seenMap,
        appState.aiInbox,
        appState.currentSeed
      );
      closeTunerDialog();
      rebuildAllSections(rebuilt);
    });
  }
  if (tunerApplyShuffleBtn) {
    tunerApplyShuffleBtn.addEventListener('click', function () {
      collectTunerEditsIntoPrefs();
      savePreferences(false);
      closeTunerDialog();
      shuffleWindow();
    });
  }

  // ==================== 三态一体漫游展厅（1: 时代瀑布画卷 | 2: 图文并排·Wiki | 3: 全屏 4K 沉浸） ====================
  const showcaseState = {
    items: [],
    index: 0,
    view: 'split', // 'gallery' | 'split' | 'stage'
    eyebrow: 'WORLD WINDOW',
    title: '世界之窗',
    sigRecorded: {},
    domain: 'museum', // 'museum' | 'landscape'
    activeFacet: 'all',
    facetQueues: {},
    galleryItems: [],
    galleryPage: 0,
    galleryLoading: false,
    isJumping: false,
    coverOverride: null,
    splitCover: false,
    captionHidden: false,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    splitZoom: 1.0,
    splitPanX: 0,
    splitPanY: 0,
    splitDragging: false,
    splitDragStartX: 0,
    splitDragStartY: 0,
    imgUpgradeSeq: 0,
    wikiTrail: [],
    activeWikiTopic: '',
    currentRelatedPool: [],
    wikiReqSeq: 0,
    lastRenderedWikiItemId: '',
    curatorNote: '',
    curatorAuthor: '',
    isFavoritesGallery: false,
    isCuratedPage: false
  };

  const wikiClientCache = {};

  function normalizeClientItem(it) {
    if (!it) return null;
    return DATA.enrichClientItem ? DATA.enrichClientItem(Object.assign({}, it)) : it;
  }

  // ==================== 点心收藏（私藏画匣 Gallery）与 Fable 定制特辑书架 ====================
  function isItemFavorited(itemId) {
    if (!itemId || !Array.isArray(appState.favorites)) return false;
    return appState.favorites.some(function (x) { return x && x.id === itemId; });
  }

  function syncHeartBtnState(btnEl, itemId) {
    if (!btnEl) return;
    const fav = isItemFavorited(itemId);
    btnEl.classList.toggle('is-fav', fav);
    btnEl.setAttribute('aria-pressed', fav ? 'true' : 'false');
    const glyph = btnEl.querySelector('.fav-heart-glyph');
    if (glyph) glyph.textContent = fav ? '♥' : '♡';
  }

  function syncFavoriteButtonsUI() {
    const activeItem = showcaseState.items[showcaseState.index];
    const activeId = activeItem ? activeItem.id : '';
    syncHeartBtnState(scFavBtn, activeId);
    syncHeartBtnState(scStageFavBtn, activeId);

    const peekIt = peekState.node ? getActiveNodeItem(peekState.node) : null;
    syncHeartBtnState(peekFavBtn, peekIt ? peekIt.id : '');

    if (scGalGrid) {
      scGalGrid.querySelectorAll('.sc-gal-fav-btn[data-fav-id]').forEach(function (btn) {
        syncHeartBtnState(btn, btn.getAttribute('data-fav-id') || '');
      });
    }
    updateTopPillLabels();
  }

  function toggleFavoriteItem(rawItem) {
    const it = normalizeClientItem(rawItem);
    if (!it || !it.id) return;
    if (!Array.isArray(appState.favorites)) appState.favorites = [];

    const existIdx = appState.favorites.findIndex(function (x) { return x && x.id === it.id; });
    let added = false;
    if (existIdx >= 0) {
      appState.favorites.splice(existIdx, 1);
      added = false;
    } else {
      appState.favorites.unshift(Object.assign({}, it, { favoritedAt: new Date().toISOString() }));
      added = true;
    }

    saveLocalJson('ww_favorites_v1', appState.favorites);
    syncFavoriteButtonsUI();
    renderDrawerFavoritesAndPages();

    if (showcaseState.isFavoritesGallery && showcaseState.view === 'gallery') {
      showcaseState.galleryItems = appState.favorites.slice();
      showcaseState.items = appState.favorites.slice();
      renderGalleryView();
    }

    if (added) {
      recordPreferenceSignalForItem(it, 'more');
    }

    if (isHttpServer) {
      fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: added ? 'add' : 'remove',
          id: it.id,
          item: it
        })
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (res) {
        if (res && Array.isArray(res.favorites)) {
          appState.favorites = res.favorites.map(normalizeClientItem);
          saveLocalJson('ww_favorites_v1', appState.favorites);
          syncFavoriteButtonsUI();
          renderDrawerFavoritesAndPages();
        }
      }).catch(function () {});
    }
  }

  function buildSavedThumbButtonsHtml(list, maxCount) {
    return list.slice(0, maxCount).map(function (it, idx) {
      const src = isVisualItem(it)
        ? resolveImgUrl(it.thumbUrl || it.previewUrl || it.fullUrl)
        : SP.buildThumbDataURL(it, 180);
      return (
        '<button type="button" class="drawer-fav-thumb" data-open-fav-idx="' + idx + '" title="' + escHtml(it.title || '') + '">' +
          '<img src="' + escHtml(src) + '" data-raw-src="' + escHtml(it.thumbUrl || it.previewUrl || '') + '" alt="' + escHtml(it.title || '收藏画作') + '" loading="lazy" decoding="async">' +
          '<span>' + escHtml(it.shortTitle || it.title || '') + '</span>' +
        '</button>'
      );
    }).join('');
  }

  function attachMiniThumbFallbacks(rootEl, listRef) {
    if (!rootEl) return;
    rootEl.querySelectorAll('img').forEach(function (imgEl, i) {
      if (imgEl._boundFavErr) return;
      imgEl._boundFavErr = true;
      let retriedRaw = false;
      imgEl.addEventListener('error', function () {
        const raw = imgEl.getAttribute('data-raw-src') || '';
        if (!retriedRaw && raw && imgEl.src !== raw) {
          retriedRaw = true;
          imgEl.src = raw;
        } else {
          const itemObj = listRef[i];
          imgEl.src = SP.buildThumbDataURL(itemObj || { title: 'Saved' }, 180);
        }
      });
    });
  }

  function renderDrawerFavoritesAndPages() {
    const favs = Array.isArray(appState.favorites) ? appState.favorites : [];
    updateTopPillLabels();

    if (drawerFavGrid) {
      if (!favs.length) {
        drawerFavGrid.innerHTML = '<div class="drawer-empty-hint">在任意画作右上角或展厅顶栏点 ♡，即可收入此处私藏画匣随时重看。</div>';
      } else {
        drawerFavGrid.innerHTML = buildSavedThumbButtonsHtml(favs, 8);
        attachMiniThumbFallbacks(drawerFavGrid, favs);
      }
    }

    if (tunerFavStrip) {
      if (!favs.length) {
        tunerFavStrip.innerHTML = '<div class="drawer-empty-hint">暂无点心收藏 · 逛展时点 ♡ 即可存入画匣。</div>';
      } else {
        tunerFavStrip.innerHTML = buildSavedThumbButtonsHtml(favs, 10);
        attachMiniThumbFallbacks(tunerFavStrip, favs);
      }
    }

    const pages = Array.isArray(appState.curatedPages) ? appState.curatedPages : [];
    if (drawerPagesSection && drawerPagesList) {
      drawerPagesSection.hidden = pages.length === 0;
      if (pages.length) {
        drawerPagesList.innerHTML = pages.slice(0, 8).map(function (pg) {
          const slug = pg.slug || '';
          const authorTag = pg.author ? (' · ' + pg.author) : '';
          return (
            '<a class="drawer-page-chip" href="/p/' + escHtml(encodeURIComponent(slug)) + '" data-open-page-slug="' + escHtml(slug) + '">' +
              '<strong>' + escHtml(pg.title || slug) + '</strong>' +
              '<small>' + escHtml((pg.itemCount || 0) + ' 件风物' + authorTag) + '</small>' +
            '</a>'
          );
        }).join('');
      }
    }
  }

  function openFavoritesGallery(startIdx, viewMode) {
    closeTunerDialog();
    setMenuOpen(false);
    const favs = (appState.favorites || []).map(normalizeClientItem);
    showcaseState.galleryItems = favs.slice();
    openShowcase({
      items: favs.length ? favs : collectAllWindowItems().slice(0, 1),
      galleryItemsOverride: favs,
      startIndex: Math.max(0, startIdx || 0),
      view: viewMode || 'gallery',
      eyebrow: 'SAVED GALLERY · PERSONAL COLLECTION',
      title: '私藏画匣 · 点心收藏 (' + favs.length + ')',
      isFavoritesGallery: true,
      isCuratedPage: false,
      curatorNote: ''
    });
  }

  function openCuratedPageDoc(pageDoc, pushSlug) {
    if (!pageDoc) return;
    closeTunerDialog();
    setMenuOpen(false);
    const items = Array.isArray(pageDoc.items) && pageDoc.items.length
      ? pageDoc.items.map(normalizeClientItem)
      : collectAllWindowItems();
    if (pushSlug && pageDoc.slug && window.history && window.history.replaceState) {
      try {
        window.history.replaceState(null, '', '/p/' + encodeURIComponent(pageDoc.slug));
      } catch (_) {}
    }
    if (pageDoc.title) {
      document.title = pageDoc.title + ' — 世界之窗 · 漫游画册';
    }
    openShowcase({
      items: items,
      galleryItemsOverride: items,
      startIndex: 0,
      view: 'gallery',
      eyebrow: 'CURATED TOPIC · ' + String(pageDoc.author || 'FABLE').toUpperCase(),
      title: pageDoc.title || '专题漫游特辑',
      isFavoritesGallery: false,
      isCuratedPage: true,
      curatorNote: pageDoc.note || pageDoc.subtitle || '',
      curatorAuthor: pageDoc.author || 'Fable'
    });
  }

  function isVisualItem(it) {
    return Boolean(it && it.kind !== 'quote' && (it.fullUrl || it.previewUrl || it.thumbUrl));
  }

  function getDomainForItem(it) {
    if (!it) return 'museum';
    if (it.channel === 'landscapes' || it.channel === 'cosmos') return 'landscape';
    return 'museum';
  }

  function getFacetMeta(domain, facetId) {
    const list = domain === 'landscape'
      ? (DATA.LANDSCAPE_FACETS_UI || [])
      : (DATA.MUSEUM_FACETS_UI || []);
    const hit = list.find(function (f) { return f.id === facetId; }) || list[0];
    return hit || { id: facetId || 'all', label: domain === 'landscape' ? '远方秘境' : '时空馆藏' };
  }

  function inferDefaultWikiTitle(it) {
    if (!it) return '世界遗产';
    if (it.wikiTitle) return it.wikiTitle;
    const raw = String(it.title || '').split(/[·—\-:：]/)[0].replace(/[《》「」]/g, '').trim();
    return raw || '艺术史';
  }

  function collectAllWindowItems() {
    const out = [];
    const seenIds = new Set();
    DATA.sections.forEach(function (sec) {
      const list = (sec.allChannelItems && sec.allChannelItems.length)
        ? sec.allChannelItems
        : (sec.children || []).map(function (c) { return c.item || c; });
      list.forEach(function (it) {
        if (it && it.id && !seenIds.has(it.id)) {
          seenIds.add(it.id);
          out.push(normalizeClientItem(it));
        }
      });
    });
    return out.length ? out : DATA.CURATED_POOL.slice(0, 16).map(normalizeClientItem);
  }

  function openShowcaseFromSection(sec, activeItem, preferredView) {
    const rawList = (sec && sec.allChannelItems && sec.allChannelItems.length)
      ? sec.allChannelItems
      : ((sec && sec.children) || []).map(function (c) { return c.item || c; });
    const list = (rawList.length ? rawList : collectAllWindowItems()).map(normalizeClientItem);
    let startIdx = 0;
    if (activeItem && activeItem.id) {
      const found = list.findIndex(function (x) { return x && x.id === activeItem.id; });
      if (found >= 0) {
        startIdx = found;
      } else {
        list.unshift(normalizeClientItem(activeItem));
        startIdx = 0;
      }
    }
    openShowcase({
      items: list,
      startIndex: startIdx,
      view: preferredView || 'split',
      eyebrow: (sec && sec.bgSup) || 'WORLD WINDOW',
      title: sec ? stripBr(sec.label[currentLang]) : '世界之窗'
    });
  }

  function openDailyShowcase() {
    const all = collectAllWindowItems();
    showcaseState.galleryItems = all.slice();
    openShowcase({
      items: all,
      startIndex: 0,
      view: 'gallery',
      eyebrow: 'TODAY · FULL ATLAS STREAM',
      title: currentLang === 'zh' ? '今日世界之窗 · 全卷瀑布画册' : DATA.ui[currentLang].ball0Sub
    });
  }

  function openExplorerPreset(domain, initialFacet) {
    const dom = domain === 'landscape' ? 'landscape' : 'museum';
    const fac = initialFacet || 'all';
    const fallbackList = buildLocalFacetFallback(dom, fac, new Set());
    const initItems = fallbackList.length ? fallbackList.slice(0, 24) : collectAllWindowItems();
    showcaseState.galleryItems = initItems.slice();
    showcaseState.galleryPage = 0;
    const fMeta = getFacetMeta(dom, fac);

    openShowcase({
      items: initItems,
      startIndex: 0,
      forceDomain: dom,
      initialFacet: fac,
      view: 'gallery',
      eyebrow: dom === 'landscape' ? 'HORIZON 4K GALLERY' : 'MUSEUM ERA GALLERY',
      title: fMeta.label
    });
    loadFacetGalleryStream(dom, fac, false);
  }

  // 渐进式双阶加载：先秒出 850px 预览图防卡顿，后台静默解码 4K 原图无缝替换（严守 fetchpriority="high"）
  function attachProgressiveStageImage(imgEl, itemObj, onPreviewOrFullSrc) {
    if (!imgEl || !itemObj) return;
    const seq = ++showcaseState.imgUpgradeSeq;
    imgEl.decoding = 'async';
    imgEl.setAttribute('fetchpriority', 'high');

    const fastRaw = itemObj.previewUrl || itemObj.thumbUrl || itemObj.fullUrl || '';
    const fullRaw = itemObj.fullUrl || fastRaw;

    if (!fastRaw) {
      const gen = SP.buildThumbDataURL(itemObj, 640);
      imgEl.src = gen;
      if (onPreviewOrFullSrc) onPreviewOrFullSrc(gen);
      return;
    }

    const fastResolved = resolveImgUrl(fastRaw);
    let retriedFast = false;
    imgEl.onerror = function () {
      if (!retriedFast && fastResolved !== fastRaw) {
        retriedFast = true;
        imgEl.src = fastRaw;
        if (onPreviewOrFullSrc) onPreviewOrFullSrc(fastRaw);
      } else {
        imgEl.onerror = null;
        const gen = SP.buildThumbDataURL(itemObj, 640);
        imgEl.src = gen;
        if (onPreviewOrFullSrc) onPreviewOrFullSrc(gen);
      }
    };
    imgEl.src = fastResolved;
    if (onPreviewOrFullSrc) onPreviewOrFullSrc(fastResolved);

    if (fullRaw && fullRaw !== fastRaw) {
      const fullResolved = resolveImgUrl(fullRaw);
      const hiLoader = new Image();
      hiLoader.decoding = 'async';
      hiLoader.onload = function () {
        if (seq !== showcaseState.imgUpgradeSeq) return;
        const activeNow = showcaseState.items[showcaseState.index];
        if (!activeNow || activeNow.id !== itemObj.id) return;
        imgEl.src = fullResolved;
        if (onPreviewOrFullSrc) onPreviewOrFullSrc(fullResolved);
      };
      hiLoader.src = fullResolved;
    }
  }

  function pad2(n) {
    return n < 10 ? ('0' + n) : String(n);
  }

  function syncModeTabsUI() {
    const mode = showcaseState.view;
    [
      [scTabGallery, 'gallery'],
      [scTabSplit, 'split'],
      [scTabStage, 'stage']
    ].forEach(function (pair) {
      const el = pair[0];
      const m = pair[1];
      if (!el) return;
      const active = mode === m;
      el.classList.toggle('active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function updateShowcaseCountersAndSignals() {
    const total = showcaseState.items.length || 1;
    const cur = Math.max(0, Math.min(total - 1, showcaseState.index));
    if (scCounter) scCounter.textContent = pad2(cur + 1) + ' / ' + pad2(total);

    const activeItem = showcaseState.items[cur];
    if (scEyebrow) {
      scEyebrow.textContent = (activeItem && activeItem.civilization)
        || showcaseState.eyebrow
        || (showcaseState.domain === 'landscape' ? 'HORIZON 4K' : 'MUSEUM 4K');
    }

    if (scSourceLink && activeItem) {
      const srcHref = activeItem.sourceUrl || activeItem.mapUrl || ('https://zh.wikipedia.org/w/index.php?search=' + encodeURIComponent(inferDefaultWikiTitle(activeItem)));
      scSourceLink.href = srcHref;
      scSourceLink.textContent = (activeItem.mapUrl && !activeItem.sourceUrl) ? '↗ 坐标地图' : '↗ 原馆藏';
    }

    const rec = activeItem ? showcaseState.sigRecorded[activeItem.id] : null;
    if (scSigMoreBtn) {
      scSigMoreBtn.classList.toggle('done', rec === 'more');
      scSigMoreBtn.textContent = rec === 'more' ? '✓ 已偏爱' : '♡ 偏爱';
    }
    if (scSigLessBtn) {
      scSigLessBtn.classList.toggle('done', rec === 'less');
      scSigLessBtn.textContent = rec === 'less' ? '✓ 已少推' : '少推';
    }

    syncFavoriteButtonsUI();

    if (activeItem && activeItem.id && appState.preferences.seenMode !== 'off' && showcaseState.view !== 'gallery') {
      markItemsSeen([activeItem.id]);
    }
  }

  function renderFacetPills() {
    if (!scFacetPills) return;
    const domain = showcaseState.domain;
    if (scDomMuseumBtn) scDomMuseumBtn.classList.toggle('active', domain === 'museum');
    if (scDomLandscapeBtn) scDomLandscapeBtn.classList.toggle('active', domain === 'landscape');

    const list = domain === 'landscape'
      ? (DATA.LANDSCAPE_FACETS_UI || [])
      : (DATA.MUSEUM_FACETS_UI || []);

    if (scRandomJumpBtn && !showcaseState.isJumping && !showcaseState.galleryLoading) {
      if (showcaseState.view === 'gallery') {
        scRandomJumpBtn.innerHTML = '<span aria-hidden="true">↻</span> 换一批';
      } else {
        scRandomJumpBtn.innerHTML = '<span aria-hidden="true">↻</span> 换一件';
      }
    }

    scFacetPills.innerHTML = list.map(function (f) {
      const isAct = !showcaseState.isFavoritesGallery && !showcaseState.isCuratedPage && f.id === showcaseState.activeFacet;
      return (
        '<button type="button" class="sc-facet-pill' + (isAct ? ' active' : '') + '" role="tab" aria-selected="' + (isAct ? 'true' : 'false') + '" data-facet-id="' + escHtml(f.id) + '">' +
          escHtml(f.label) +
        '</button>'
      );
    }).join('');
  }

  function attachFilmstripImgFallbacks(containerEl, listRef) {
    if (!containerEl) return;
    containerEl.querySelectorAll('.sc-film-btn img').forEach(function (imgEl, idx) {
      if (imgEl._boundFilmErr) return;
      imgEl._boundFilmErr = true;
      let retriedRaw = false;
      imgEl.addEventListener('error', function () {
        const raw = imgEl.getAttribute('data-raw-src') || '';
        if (!retriedRaw && raw && imgEl.src !== raw) {
          retriedRaw = true;
          imgEl.src = raw;
        } else {
          const itemObj = listRef[idx] || showcaseState.items[idx];
          imgEl.src = SP.buildThumbDataURL(itemObj || { title: pad2(idx + 1) }, 160);
        }
      });
    });
  }

  function renderFilmstripInto(containerEl) {
    if (!containerEl) return;
    const list = showcaseState.items.slice(0, 40);
    containerEl.innerHTML = list.map(function (it, idx) {
      const isAct = idx === showcaseState.index;
      const rawThumb = (it && (it.thumbUrl || it.previewUrl || it.fullUrl)) || '';
      const thumbSrc = rawThumb
        ? resolveImgUrl(rawThumb)
        : SP.buildThumbDataURL(it, 160);
      const shortT = String((it && it.title) || '').replace(/^[^·]+·\s*/, '').slice(0, 10) || pad2(idx + 1);
      return (
        '<button type="button" class="sc-film-btn' + (isAct ? ' active' : '') + '" role="option" aria-selected="' + (isAct ? 'true' : 'false') + '" data-film-idx="' + idx + '" title="' + escHtml((it && it.title) || '') + '">' +
          '<img src="' + escHtml(thumbSrc) + '" data-raw-src="' + escHtml(rawThumb) + '" alt="" loading="lazy" decoding="async">' +
          '<span>' + escHtml(shortT) + '</span>' +
        '</button>'
      );
    }).join('');

    attachFilmstripImgFallbacks(containerEl, list);

    requestAnimationFrame(function () {
      const actBtn = containerEl.querySelector('.sc-film-btn.active');
      if (actBtn && actBtn.scrollIntoView) {
        actBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    });
  }

  // ==================== 模式 1：时代 / 文明 / 国家 / 自然纪实 瀑布流滚动长卷 ====================
  function buildGalleryCardsHtml(itemsList, offsetIdx) {
    return itemsList.map(function (it, localIdx) {
      const absIdx = offsetIdx + localIdx;
      const rawPreview = (it && (it.previewUrl || it.thumbUrl || it.fullUrl)) || '';
      const imgSrc = isVisualItem(it)
        ? resolveImgUrl(rawPreview)
        : SP.buildThumbDataURL(it, 420);
      const tagStr = it.civilization || (getDomainForItem(it) === 'landscape' ? '4K HORIZON' : 'MUSEUM 4K');
      const enLine = (it.enTitle && it.enTitle !== it.title) ? it.enTitle : (it.subtitle || '');
      const descText = it.story || it.quote || '';
      const fav = isItemFavorited(it.id);
      return (
        '<article class="sc-gal-card" data-gal-idx="' + absIdx + '">' +
          '<div class="sc-gal-media">' +
            '<img src="' + escHtml(imgSrc) + '" data-raw-src="' + escHtml(rawPreview) + '" alt="' + escHtml(it.title || '') + '" loading="lazy" decoding="async">' +
            '<span class="sc-gal-badge">' + escHtml(tagStr) + '</span>' +
            '<button type="button" class="sc-gal-fav-btn fav-heart-btn' + (fav ? ' is-fav' : '') + '" data-fav-idx="' + absIdx + '" data-fav-id="' + escHtml(it.id || '') + '" aria-label="收藏画作" aria-pressed="' + (fav ? 'true' : 'false') + '" title="点心收藏">' +
              '<span class="fav-heart-glyph" aria-hidden="true">' + (fav ? '♥' : '♡') + '</span>' +
            '</button>' +
            '<button type="button" class="sc-gal-full-btn" data-gal-stage="' + absIdx + '" title="纯享全屏 4K 打开">⛶ 4K</button>' +
          '</div>' +
          '<div class="sc-gal-body">' +
            '<h3 class="sc-gal-card-title">' + escHtml(it.title || '') + '</h3>' +
            (enLine ? '<div class="sc-gal-card-en">' + escHtml(enLine) + '</div>' : '') +
            (descText ? '<p class="sc-gal-card-desc">' + escHtml(descText) + '</p>' : '') +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function renderGalleryViewHeader() {
    const fMeta = getFacetMeta(showcaseState.domain, showcaseState.activeFacet);
    const count = showcaseState.galleryItems.length;
    if (scGalEyebrow) {
      if (showcaseState.isFavoritesGallery) {
        scGalEyebrow.textContent = 'SAVED GALLERY · PERSONAL COLLECTION';
      } else if (showcaseState.isCuratedPage) {
        scGalEyebrow.textContent = showcaseState.eyebrow || 'CURATED TOPIC STREAM';
      } else {
        scGalEyebrow.textContent = showcaseState.domain === 'landscape'
          ? 'NATURE, MACRO & COSMOS · 4K STREAM'
          : 'WORLD MUSEUM · ERA & CIVILIZATION STREAM';
      }
    }
    if (scGalTitle) {
      scGalTitle.textContent = showcaseState.isFavoritesGallery
        ? ('私藏画匣 · 点心收藏 (' + count + ')')
        : (showcaseState.title || fMeta.label);
    }
    if (scGalSub) {
      if (showcaseState.isFavoritesGallery) {
        scGalSub.textContent = count
          ? ('已收藏 ' + count + ' 件风物 · 点右上角 ♥ 可取消收藏，点击画面进入「图文并排 · Wiki」。')
          : '画匣还是空的 · 浏览馆藏或自然摄影时点右上角 ♡，即可把喜欢的画作收进这里。';
      } else {
        scGalSub.textContent = '已展开 ' + count + ' 件高清原片 · 点右上角 ♡ 收入画匣，点画面即入「图文并排 · Wiki」深读全章。';
      }
    }
    if (scCuratorBanner) {
      const hasNote = Boolean(showcaseState.curatorNote);
      scCuratorBanner.hidden = !hasNote;
      if (hasNote) {
        if (scCuratorMeta) {
          scCuratorMeta.textContent = 'CURATED BY ' + String(showcaseState.curatorAuthor || 'FABLE').toUpperCase();
        }
        if (scCuratorNote) {
          scCuratorNote.textContent = showcaseState.curatorNote;
        }
      }
    }
    if (scGalMoreBtn) {
      scGalMoreBtn.hidden = Boolean(showcaseState.isFavoritesGallery || showcaseState.isCuratedPage);
    }
  }

  function renderGalleryView() {
    renderFacetPills();
    if (!showcaseState.galleryItems.length && !showcaseState.isFavoritesGallery) {
      showcaseState.galleryItems = showcaseState.items.slice();
    }
    renderGalleryViewHeader();
    if (scGalGrid) {
      if (showcaseState.isFavoritesGallery && !showcaseState.galleryItems.length) {
        scGalGrid.innerHTML =
          '<div class="sc-gal-empty">' +
            '<p>还没有点心收藏的画作。</p>' +
            '<div class="sc-gal-empty-actions">' +
              '<button type="button" class="sc-gal-more-btn" data-empty-jump="museum">去逛馆藏年代</button>' +
              '<button type="button" class="sc-gal-more-btn" data-empty-jump="landscape">去看自然与微距</button>' +
            '</div>' +
          '</div>';
      } else {
        scGalGrid.innerHTML = buildGalleryCardsHtml(showcaseState.galleryItems, 0);
        attachGalleryImgFallbacks(scGalGrid);
      }
    }
    updateShowcaseCountersAndSignals();
  }

  function attachGalleryImgFallbacks(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('.sc-gal-card img').forEach(function (imgEl) {
      if (imgEl._boundErr) return;
      imgEl._boundErr = true;
      let retriedRaw = false;
      imgEl.addEventListener('error', function () {
        const raw = imgEl.getAttribute('data-raw-src') || '';
        if (!retriedRaw && raw && imgEl.src !== raw) {
          retriedRaw = true;
          imgEl.src = raw;
          return;
        }
        const card = imgEl.closest('[data-gal-idx]');
        const idx = card ? parseInt(card.getAttribute('data-gal-idx'), 10) : 0;
        const itemObj = showcaseState.galleryItems[idx] || showcaseState.items[idx];
        if (itemObj) {
          imgEl.src = SP.buildThumbDataURL(itemObj, 420);
        }
      });
    });
  }

  function buildLocalFacetFallback(domain, facetId, excludeIds) {
    const all = [].concat(appState.livePool || [], DATA.CURATED_POOL || []).filter(function (it) {
      if (!it || !it.id || excludeIds.has(it.id)) return false;
      if (!isVisualItem(it)) return false;
      if (getDomainForItem(it) !== domain) return false;
      if (!facetId || facetId === 'all') return true;
      return it.facet === facetId;
    }).map(normalizeClientItem);
    return all.sort(function () { return Math.random() - 0.5; });
  }

  async function loadFacetGalleryStream(domain, facetId, appendMode) {
    if (showcaseState.galleryLoading) return;
    showcaseState.isFavoritesGallery = false;
    showcaseState.isCuratedPage = false;
    showcaseState.curatorNote = '';
    showcaseState.domain = domain || showcaseState.domain || 'museum';
    showcaseState.activeFacet = facetId || 'all';
    const fMeta = getFacetMeta(showcaseState.domain, showcaseState.activeFacet);
    showcaseState.title = fMeta.label;
    showcaseState.eyebrow = showcaseState.domain === 'landscape' ? 'HORIZON 4K GALLERY' : 'MUSEUM ERA GALLERY';

    if (!appendMode) {
      showcaseState.galleryPage = 0;
      if (showcaseState.view !== 'gallery') {
        showcaseState.view = 'gallery';
        syncShowcaseSectionVisibility();
      }
      if (scGalleryView) scGalleryView.scrollTop = 0;
    } else {
      showcaseState.galleryPage += 1;
    }

    showcaseState.galleryLoading = true;
    renderFacetPills();
    if (scGalMoreBtn) {
      scGalMoreBtn.disabled = true;
      scGalMoreBtn.textContent = '正在从全球开放馆藏调取高清画卷…';
    }
    if (!appendMode && scGalSub) {
      scGalSub.textContent = '正在调取「' + fMeta.label + '」高清馆藏长卷…';
    }

    const existingIds = new Set(
      (appendMode ? showcaseState.galleryItems : []).map(function (x) { return x && x.id; }).filter(Boolean)
    );

    let fetched = [];
    if (isHttpServer) {
      try {
        const exCsv = Array.from(existingIds).slice(-60).join(',');
        const url = '/api/explore?domain=' + encodeURIComponent(showcaseState.domain) +
          '&facet=' + encodeURIComponent(showcaseState.activeFacet) +
          '&page=' + encodeURIComponent(String(showcaseState.galleryPage)) +
          '&exclude=' + encodeURIComponent(exCsv);
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.items)) {
            fetched = data.items.map(normalizeClientItem);
          }
        }
      } catch (_) {}
    }

    if (!fetched.length) {
      fetched = buildLocalFacetFallback(showcaseState.domain, showcaseState.activeFacet, existingIds);
    }

    const deduped = [];
    fetched.forEach(function (it) {
      if (it && it.id && !existingIds.has(it.id)) {
        existingIds.add(it.id);
        deduped.push(it);
      }
    });

    showcaseState.galleryLoading = false;
    if (scGalMoreBtn) {
      scGalMoreBtn.disabled = false;
      scGalMoreBtn.textContent = '↻ 继续展开更多同代 4K 风物';
    }

    if (!appendMode) {
      showcaseState.galleryItems = deduped.length ? deduped : buildLocalFacetFallback(showcaseState.domain, 'all', new Set()).slice(0, 20);
      showcaseState.items = showcaseState.galleryItems.slice();
      showcaseState.index = 0;
      renderGalleryView();
    } else if (deduped.length) {
      const startOffset = showcaseState.galleryItems.length;
      showcaseState.galleryItems = showcaseState.galleryItems.concat(deduped);
      showcaseState.items = showcaseState.galleryItems.slice();
      renderGalleryViewHeader();
      if (scGalGrid) {
        scGalGrid.insertAdjacentHTML('beforeend', buildGalleryCardsHtml(deduped, startOffset));
        attachGalleryImgFallbacks(scGalGrid);
      }
      updateShowcaseCountersAndSignals();
    } else if (scGalMoreBtn) {
      scGalMoreBtn.textContent = '✓ 当前分面精选已全部展开，可点上方换其他文明或秘境';
    }
    renderFacetPills();
  }

  // ==================== 模式 2：◫ 图文并排 · 左 4K 缩放展台 + 右维基百科全章与收藏库 ====================
  function applySplitTransform() {
    if (!scSplitImg) return;
    scSplitImg.style.transform =
      'translate3d(' + showcaseState.splitPanX.toFixed(1) + 'px, ' + showcaseState.splitPanY.toFixed(1) + 'px, 0) scale(' + showcaseState.splitZoom.toFixed(3) + ')';
    if (scSplitCanvas) {
      scSplitCanvas.classList.toggle('is-zoomed', showcaseState.splitZoom > 1.04);
    }
  }

  function resetSplitZoom() {
    showcaseState.splitZoom = 1.0;
    showcaseState.splitPanX = 0;
    showcaseState.splitPanY = 0;
    showcaseState.splitDragging = false;
    if (scSplitCanvas) scSplitCanvas.classList.remove('dragging');
    applySplitTransform();
  }

  function syncSplitFitUI() {
    if (scSplitCanvas) {
      scSplitCanvas.classList.toggle('is-cover', Boolean(showcaseState.splitCover));
    }
    if (scSplitFitBtn) {
      scSplitFitBtn.textContent = showcaseState.splitCover ? '⛶ 完整画幅' : '⛶ 铺满展台';
    }
  }

  function renderSplitView() {
    const it = showcaseState.items[showcaseState.index];
    if (!it) return;

    showcaseState.domain = getDomainForItem(it);
    resetSplitZoom();
    syncSplitFitUI();
    renderFacetPills();

    const hasVisual = isVisualItem(it);
    if (scSplitImg) {
      scSplitImg.hidden = !hasVisual;
      if (hasVisual) {
        scSplitImg.alt = it.title || '';
        attachProgressiveStageImage(scSplitImg, it, null);
      }
    }
    if (scSplitQuoteCard) {
      scSplitQuoteCard.hidden = hasVisual;
      if (!hasVisual) {
        if (scSqKicker) scSqKicker.textContent = (it.channel || 'LITERARY FOLIO').toUpperCase();
        if (scSqQuote) scSqQuote.textContent = '“' + (it.quote || it.story || it.title || '') + '”';
        if (scSqSub) scSqSub.textContent = it.subtitle || it.title || '';
      }
    }

    if (scSplitMapLink) {
      if (it.mapUrl) {
        scSplitMapLink.href = it.mapUrl;
        scSplitMapLink.hidden = false;
      } else {
        scSplitMapLink.hidden = true;
      }
    }
    if (scSplitTitle) scSplitTitle.textContent = it.title || '';
    if (scSplitEn) {
      scSplitEn.textContent = it.enTitle || '';
      scSplitEn.hidden = !it.enTitle;
    }
    if (scSplitSub) scSplitSub.textContent = it.subtitle || '';

    renderFilmstripInto(scSplitStrip);
    renderDossierPaneForCurrentItem();
  }

  // ==================== 模式 3：⛶ 100vw × 100dvh 真全屏 4K 沉浸画幅 ====================
  function applyStageTransform() {
    if (!scStageImg) return;
    scStageImg.style.transform =
      'translate3d(' + showcaseState.panX.toFixed(1) + 'px, ' + showcaseState.panY.toFixed(1) + 'px, 0) scale(' + showcaseState.zoom.toFixed(3) + ')';
    if (scStageView) {
      scStageView.classList.toggle('is-zoomed', showcaseState.zoom > 1.04);
    }
  }

  function resetStageZoom() {
    showcaseState.zoom = 1.0;
    showcaseState.panX = 0;
    showcaseState.panY = 0;
    showcaseState.dragging = false;
    if (scStageCanvas) scStageCanvas.classList.remove('dragging');
    applyStageTransform();
  }

  function syncStageFitClass(item) {
    if (!scStageView) return;
    const autoCover = (getDomainForItem(item) === 'landscape');
    const useCover = (showcaseState.coverOverride !== null) ? showcaseState.coverOverride : autoCover;
    scStageView.classList.toggle('is-cover', Boolean(useCover));
    if (scFitBtn) {
      scFitBtn.textContent = useCover ? '⛶ 完整画幅' : '⛶ 铺满全屏';
    }
  }

  function renderStageView() {
    const it = showcaseState.items[showcaseState.index];
    if (!it) return;

    showcaseState.domain = getDomainForItem(it);
    resetStageZoom();
    syncStageFitClass(it);
    renderFacetPills();

    if (scStageImg) {
      scStageImg.alt = it.title || '';
      attachProgressiveStageImage(scStageImg, it, function (resolvedUrl) {
        if (scStageBackdrop) {
          scStageBackdrop.style.backgroundImage = 'url("' + resolvedUrl.replace(/"/g, '%22') + '")';
        }
      });
    }

    if (scCapTag) {
      scCapTag.textContent = it.civilization || (showcaseState.domain === 'landscape' ? 'EARTH & COSMOS 4K' : 'OPEN ACCESS MUSEUM 4K');
    }
    if (scMapLink) {
      if (it.mapUrl) {
        scMapLink.href = it.mapUrl;
        scMapLink.hidden = false;
      } else {
        scMapLink.hidden = true;
      }
    }
    if (scCapTitle) scCapTitle.textContent = it.title || '';
    if (scCapSub) scCapSub.textContent = (it.enTitle ? (it.enTitle + ' · ') : '') + (it.subtitle || '');
    const storyTxt = it.story || it.quote || '';
    if (scCapStory) scCapStory.textContent = storyTxt;
    const pills = [].concat(it.meta || [], (it.tags || []).slice(0, 3)).filter(Boolean).slice(0, 5);
    if (scCapMeta) {
      scCapMeta.innerHTML = pills.map(function (m) {
        return '<span class="sc-meta-pill">' + escHtml(m) + '</span>';
      }).join('');
    }
    if (scCapDetails) {
      scCapDetails.hidden = !storyTxt && !pills.length;
    }
    if (scCaptionCard) {
      scCaptionCard.classList.toggle('is-collapsed', showcaseState.captionHidden);
    }

    renderFilmstripInto(scStageStrip);
    updateShowcaseCountersAndSignals();
  }

  async function triggerFacetRandomJump(domain, facetId) {
    const dom = domain || showcaseState.domain || 'museum';
    const fac = facetId || showcaseState.activeFacet || 'all';
    if (showcaseState.view === 'gallery') {
      loadFacetGalleryStream(dom, fac, false);
      return;
    }
    if (showcaseState.isJumping) return;
    showcaseState.domain = dom;
    showcaseState.activeFacet = fac;
    renderFacetPills();

    const qKey = dom + ':' + fac;
    if (!Array.isArray(showcaseState.facetQueues[qKey])) {
      showcaseState.facetQueues[qKey] = [];
    }

    const inShowcaseIds = new Set(showcaseState.items.map(function (x) { return x && x.id; }).filter(Boolean));
    const queue = showcaseState.facetQueues[qKey];
    while (queue.length && inShowcaseIds.has(queue[0].id)) {
      queue.shift();
    }

    if (!queue.length) {
      showcaseState.isJumping = true;
      if (scRandomJumpBtn) {
        scRandomJumpBtn.classList.add('is-loading');
        scRandomJumpBtn.textContent = '漫游调取中…';
      }

      let fetched = [];
      if (isHttpServer) {
        try {
          const exCsv = Array.from(inShowcaseIds).slice(-35).join(',');
          const url = '/api/explore?domain=' + encodeURIComponent(dom) +
            '&facet=' + encodeURIComponent(fac) +
            '&exclude=' + encodeURIComponent(exCsv);
          const resp = await fetch(url);
          if (resp.ok) {
            const data = await resp.json();
            if (data && Array.isArray(data.items)) fetched = data.items.map(normalizeClientItem);
          }
        } catch (_) {}
      }
      if (!fetched.length) {
        fetched = buildLocalFacetFallback(dom, fac, inShowcaseIds);
      }
      fetched.forEach(function (it) {
        if (it && it.id && !inShowcaseIds.has(it.id)) queue.push(it);
      });

      showcaseState.isJumping = false;
      if (scRandomJumpBtn) scRandomJumpBtn.classList.remove('is-loading');
      renderFacetPills();
    }

    const nextItem = queue.shift() || buildLocalFacetFallback(dom, 'all', new Set())[0];
    if (!nextItem) return;

    const existingIdx = showcaseState.items.findIndex(function (x) { return x && x.id === nextItem.id; });
    if (existingIdx >= 0) {
      showcaseState.index = existingIdx;
    } else {
      showcaseState.items.push(nextItem);
      showcaseState.index = showcaseState.items.length - 1;
    }
    showcaseState.lastRenderedWikiItemId = '';
    switchShowcaseView(showcaseState.view === 'stage' ? 'stage' : 'split');
  }

  // ==================== 右栏：维基百科完整多章节深读 + 顺藤摸瓜轨迹 + LWA 收藏库 ====================
  async function fetchWikiDirectFallback(title) {
    const queryHost = async function (lang) {
      const api = 'https://' + lang + '.wikipedia.org/w/api.php?origin=*&action=query&format=json&redirects=1' +
        (lang === 'zh' ? '&variant=zh-cn' : '') +
        '&prop=extracts|pageimages|links|info&inprop=url&explaintext=1&exsectionformat=wiki&pithumbsize=1280&plnamespace=0&pllimit=24&titles=' +
        encodeURIComponent(title);
      const r = await fetch(api);
      const j = await r.json();
      const pages = j && j.query && j.query.pages ? Object.values(j.query.pages) : [];
      const p = pages[0];
      if (!p || p.missing != null || !p.extract) return null;
      const lines = String(p.extract).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      const summary = [];
      const sections = [];
      let cur = null;
      lines.forEach(function (ln) {
        const m = ln.match(/^(={2,4})\s*(.+?)\s*\1$/);
        if (m) {
          cur = { heading: m[2], level: m[1].length, paragraphs: [] };
          sections.push(cur);
        } else if (!cur) {
          summary.push(ln);
        } else {
          cur.paragraphs.push(ln);
        }
      });
      return {
        ok: true,
        lang: lang,
        title: p.title,
        pageUrl: p.fullurl || ('https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(p.title)),
        thumbnail: (p.thumbnail && p.thumbnail.source) || '',
        summary: summary,
        sections: sections.filter(function (s) { return s.paragraphs.length > 0; }),
        relatedTopics: ((p.links || []).map(function (l) { return l.title; })).slice(0, 12)
      };
    };
    const isLatin = !/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(title) && /[A-Za-z\u00C0-\u024F]/.test(title);
    const firstLang = isLatin ? 'en' : 'zh';
    const secondLang = isLatin ? 'zh' : 'en';
    return (await queryHost(firstLang)) || (await queryHost(secondLang)) || { ok: false, error: '离线未命中词条' };
  }

  function renderTrailNav() {
    if (!dosTrail) return;
    if (showcaseState.wikiTrail.length <= 1) {
      dosTrail.hidden = true;
      dosTrail.innerHTML = '';
      return;
    }
    dosTrail.hidden = false;
    const parts = ['<span class="dos-trail-label">阅读轨迹：</span>'];
    showcaseState.wikiTrail.forEach(function (tName, idx) {
      if (idx > 0) parts.push('<span class="dos-trail-sep">➔</span>');
      const isCur = tName === showcaseState.activeWikiTopic;
      parts.push(
        '<button type="button" class="dos-trail-step' + (isCur ? ' current' : '') + '" data-trail-idx="' + idx + '">' +
          escHtml(tName) +
        '</button>'
      );
    });
    dosTrail.innerHTML = parts.join('');
  }

  function renderRelatedChips(item, wikiRelated) {
    if (!dosRelatedChips) return;
    const merged = [];
    const seen = new Set();
    const baseWiki = inferDefaultWikiTitle(item);
    [].concat([baseWiki], (item && item.relatedSeeds) || [], wikiRelated || []).forEach(function (topic) {
      const t = String(topic || '').trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      merged.push(t);
    });
    showcaseState.currentRelatedPool = merged;

    dosRelatedChips.innerHTML = merged.slice(0, 16).map(function (topic) {
      const isAct = topic === showcaseState.activeWikiTopic;
      return (
        '<button type="button" class="dos-topic-chip' + (isAct ? ' active' : '') + '" data-wiki-topic="' + escHtml(topic) + '">' +
          escHtml(topic) +
        '</button>'
      );
    }).join('');
  }

  async function loadLwaRelatedNotes(item, topicTitle) {
    if (!dosLwaList) return;
    const askUrl = appState.lwaAskUrl || DATA.OBSIDIAN_ASK_URL || '#';
    const catUrl = appState.lwaCatalogUrl || DATA.OBSIDIAN_CATALOG_URL || '#';

    if (!isHttpServer) {
      dosLwaList.innerHTML =
        '<div class="dos-lwa-empty">当前为静态离线页，可直接 <a class="dos-lwa-open" href="' + escHtml(catUrl) + '">在 Obsidian 打开收藏库 ↗</a></div>';
      return;
    }

    const qParts = [topicTitle, item && item.title, item && item.wikiTitle].concat((item && item.tags) || []).filter(Boolean);
    const qStr = qParts.slice(0, 5).join(' ');

    try {
      const resp = await fetch('/api/lwa-related?q=' + encodeURIComponent(qStr));
      const data = resp.ok ? await resp.json() : null;
      const list = (data && Array.isArray(data.items)) ? data.items : [];

      if (!list.length) {
        dosLwaList.innerHTML =
          '<div class="dos-lwa-empty">' +
            '收藏库暂未检出「' + escHtml(topicTitle) + '」同名笔记。' +
            '<div style="margin-top:6px"><a class="dos-lwa-open" href="' + escHtml(askUrl) + '">去 Obsidian 问收藏检索 ↗</a> · <a class="dos-lwa-open" href="' + escHtml(catUrl) + '">浏览收藏目录 ↗</a></div>' +
          '</div>';
        return;
      }

      dosLwaList.innerHTML = list.map(function (row) {
        const metaStr = [].concat(row.cats || [], row.author ? ['@' + row.author] : []).slice(0, 2).join(' · ');
        return (
          '<div class="dos-lwa-item">' +
            '<div class="dos-lwa-item-title">' + (row.starred ? '⭐ ' : '') + escHtml(row.title) + '</div>' +
            (row.summary ? '<div class="dos-lwa-item-sum">' + escHtml(row.summary) + '</div>' : '') +
            '<div class="dos-lwa-item-foot">' +
              '<span>' + escHtml(metaStr || 'LWA 收藏笔记') + '</span>' +
              '<span>' +
                '<a class="dos-lwa-open" href="' + escHtml(row.obsidianUrl || catUrl) + '">在 Obsidian 打开 ↗</a>' +
                (row.sourceUrl ? ' · <a class="dos-lwa-open" href="' + escHtml(row.sourceUrl) + '" target="_blank" rel="noopener">原帖 ↗</a>' : '') +
              '</span>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    } catch (_) {
      dosLwaList.innerHTML =
        '<div class="dos-lwa-empty"><a class="dos-lwa-open" href="' + escHtml(catUrl) + '">打开 Obsidian 收藏库 ↗</a></div>';
    }
  }

  async function loadWikiTopicIntoDossier(topicTitle, appendToTrail) {
    const cleanTopic = String(topicTitle || '').trim();
    if (!cleanTopic || !dosWikiArticle) return;

    showcaseState.activeWikiTopic = cleanTopic;
    if (appendToTrail) {
      const existingPos = showcaseState.wikiTrail.indexOf(cleanTopic);
      if (existingPos >= 0) {
        showcaseState.wikiTrail = showcaseState.wikiTrail.slice(0, existingPos + 1);
      } else {
        showcaseState.wikiTrail.push(cleanTopic);
      }
    } else if (!showcaseState.wikiTrail.length) {
      showcaseState.wikiTrail = [cleanTopic];
    }
    renderTrailNav();

    const activeItem = showcaseState.items[showcaseState.index];
    renderRelatedChips(activeItem, []);
    loadLwaRelatedNotes(activeItem, cleanTopic);

    const reqId = ++showcaseState.wikiReqSeq;
    dosWikiArticle.innerHTML = '<div class="dos-loading">正在展开「' + escHtml(cleanTopic) + '」完整维基百科章节与知识脉络…</div>';

    const fbTopic = (!appendToTrail && activeItem)
      ? String(activeItem.wikiFallback || (activeItem.relatedSeeds && activeItem.relatedSeeds[0]) || activeItem.civilization || '').trim()
      : '';
    const clientCacheKey = fbTopic ? (cleanTopic + '::' + fbTopic) : cleanTopic;

    let data = wikiClientCache[clientCacheKey] || null;
    if (!data) {
      try {
        if (isHttpServer) {
          const fbParam = (fbTopic && fbTopic !== cleanTopic) ? ('&fallback=' + encodeURIComponent(fbTopic)) : '';
          const resp = await fetch('/api/wiki?title=' + encodeURIComponent(cleanTopic) + '&lang=zh' + fbParam);
          if (resp.ok) data = await resp.json();
        } else {
          data = await fetchWikiDirectFallback(cleanTopic);
        }
      } catch (_) {
        data = { ok: false, error: '网络波动，暂未拉取到词条正文' };
      }
      if (data && data.ok) {
        wikiClientCache[clientCacheKey] = data;
      }
    }

    if (reqId !== showcaseState.wikiReqSeq) return;

    if (!data || !data.ok) {
      const searchWikiUrl = 'https://zh.wikipedia.org/w/index.php?search=' + encodeURIComponent(cleanTopic);
      dosWikiArticle.innerHTML =
        '<div class="dos-wiki-header">' +
          '<div><span class="dos-wiki-badge">WIKIPEDIA CONTEXT</span><h2 class="dos-wiki-h2">' + escHtml(cleanTopic) + '</h2></div>' +
          '<a class="dos-wiki-ext" href="' + escHtml(searchWikiUrl) + '" target="_blank" rel="noopener">去维基百科搜索 ↗</a>' +
        '</div>' +
        '<p class="dos-wiki-p">暂未直接匹配到同名长词条，可点下方「顺藤摸瓜」关联词条继续深读，或前往维基百科搜索。</p>';
      return;
    }

    renderRelatedChips(activeItem, data.relatedTopics || []);

    const showRightThumb = Boolean(data.thumbnail && (showcaseState.wikiTrail.length > 1 || !isVisualItem(activeItem)));
    const thumbResolved = showRightThumb ? resolveImgUrl(data.thumbnail) : '';
    const sumHtml = (data.summary || []).map(function (p) {
      return '<p class="dos-wiki-p">' + escHtml(p) + '</p>';
    }).join('');

    const secs = (data.sections || []).slice(0, 12);
    const tocHtml = secs.length > 1
      ? '<nav class="dos-wiki-toc" aria-label="词条章节目录">' +
          secs.map(function (s, sIdx) {
            return '<a class="dos-toc-pill" href="#dos-wiki-sec-' + sIdx + '" data-sec-jump="' + sIdx + '">' + escHtml(s.heading) + '</a>';
          }).join('') +
        '</nav>'
      : '';

    const secsHtml = secs.map(function (sec, sIdx) {
      const deferCls = sIdx >= 2 ? ' dos-sec-deferred' : '';
      const tagH = sec.level >= 3 ? 'h4' : 'h3';
      const paras = (sec.paragraphs || []).map(function (p) {
        return '<p class="dos-wiki-p">' + escHtml(p) + '</p>';
      }).join('');
      return (
        '<section class="dos-wiki-sec' + deferCls + '" id="dos-wiki-sec-' + sIdx + '">' +
          '<' + tagH + '>' + escHtml(sec.heading) + '</' + tagH + '>' +
          paras +
        '</section>'
      );
    }).join('');

    dosWikiArticle.innerHTML =
      '<div class="dos-wiki-header">' +
        '<div>' +
          '<span class="dos-wiki-badge">WIKIPEDIA FULL DOSSIER · ' + escHtml(String(data.lang || 'zh').toUpperCase()) + '</span>' +
          '<h2 class="dos-wiki-h2">' + escHtml(data.title || cleanTopic) + '</h2>' +
        '</div>' +
        '<a class="dos-wiki-ext" href="' + escHtml(data.pageUrl || '#') + '" target="_blank" rel="noopener">维基原页 ↗</a>' +
      '</div>' +
      '<div class="dos-wiki-hero' + (thumbResolved ? '' : ' no-thumb') + '">' +
        '<div>' + sumHtml + '</div>' +
        (thumbResolved ? '<img class="dos-wiki-thumb" src="' + escHtml(thumbResolved) + '" alt="' + escHtml(data.title || '') + '" loading="lazy" decoding="async">' : '') +
      '</div>' +
      tocHtml +
      secsHtml;
  }

  function renderDossierWindowList() {
    if (!dosWindowList) return;
    dosWindowList.innerHTML = showcaseState.items.slice(0, 32).map(function (it, idx) {
      const isAct = idx === showcaseState.index;
      return (
        '<button type="button" class="dos-win-btn' + (isAct ? ' active' : '') + '" data-win-idx="' + idx + '">' +
          pad2(idx + 1) + ' · ' + escHtml(it.title || '') +
        '</button>'
      );
    }).join('');
  }

  function renderDossierPaneForCurrentItem() {
    const it = showcaseState.items[showcaseState.index];
    if (!it) return;

    renderDossierWindowList();
    updateShowcaseCountersAndSignals();

    if (showcaseState.lastRenderedWikiItemId === it.id && dosWikiArticle && dosWikiArticle.children.length > 0) {
      return;
    }
    showcaseState.lastRenderedWikiItemId = it.id;

    if (dosLead) {
      const seeds = [].concat([inferDefaultWikiTitle(it)], it.relatedSeeds || []).filter(Boolean);
      const uniqSeeds = Array.from(new Set(seeds)).slice(0, 6);
      const seedBtns = uniqSeeds.map(function (sd) {
        return '<button type="button" class="dos-topic-chip" data-wiki-topic="' + escHtml(sd) + '">' + escHtml(sd) + '</button>';
      }).join('');

      dosLead.innerHTML =
        '<div class="dos-lead-kicker">' + escHtml((it.civilization || it.channel || 'CURATED DOSSIER').toUpperCase()) + '</div>' +
        '<h1 class="dos-lead-title">' + escHtml(it.title || '') + '</h1>' +
        ((it.enTitle || it.subtitle) ? '<div class="dos-lead-sub">' + escHtml([it.enTitle, it.subtitle].filter(Boolean).join(' · ')) + '</div>' : '') +
        (it.quote ? '<blockquote class="dos-lead-quote">“' + escHtml(it.quote) + '”</blockquote>' : '') +
        (it.story ? '<p class="dos-lead-story">' + escHtml(it.story) + '</p>' : '') +
        (seedBtns ? '<div class="dos-lead-seeds"><span class="dos-seed-label">延伸词条秒切：</span>' + seedBtns + '</div>' : '');
    }

    const startTopic = inferDefaultWikiTitle(it);
    showcaseState.wikiTrail = [startTopic];
    if (scSplitRight) scSplitRight.scrollTop = 0;
    loadWikiTopicIntoDossier(startTopic, false);
  }

  function syncShowcaseSectionVisibility() {
    const v = showcaseState.view;
    if (scGalleryView) scGalleryView.hidden = (v !== 'gallery');
    if (scSplitView) scSplitView.hidden = (v !== 'split');
    if (scStageView) scStageView.hidden = (v !== 'stage');
    syncModeTabsUI();
  }

  function switchShowcaseView(targetView) {
    const it = showcaseState.items[showcaseState.index];
    let nextView = targetView || 'split';
    if (nextView === 'stage' && it && !isVisualItem(it)) {
      nextView = 'split';
    }
    showcaseState.view = nextView;
    syncShowcaseSectionVisibility();

    if (nextView === 'gallery') {
      renderGalleryView();
    } else if (nextView === 'stage') {
      renderStageView();
    } else {
      renderSplitView();
    }
  }

  function stepShowcaseItem(delta) {
    const len = showcaseState.items.length;
    if (!len) return;
    showcaseState.index = (showcaseState.index + delta + len) % len;
    showcaseState.lastRenderedWikiItemId = '';
    const nextItem = showcaseState.items[showcaseState.index];
    if (showcaseState.view === 'gallery') {
      switchShowcaseView('split');
    } else if (showcaseState.view === 'stage' && !isVisualItem(nextItem)) {
      switchShowcaseView('split');
    } else {
      switchShowcaseView(showcaseState.view);
    }
  }

  function selectShowcaseIndex(idx, targetMode) {
    if (!showcaseState.items.length) return;
    const clamped = Math.max(0, Math.min(showcaseState.items.length - 1, idx));
    if (clamped !== showcaseState.index) {
      showcaseState.index = clamped;
      showcaseState.lastRenderedWikiItemId = '';
    }
    switchShowcaseView(targetMode || (showcaseState.view === 'gallery' ? 'split' : showcaseState.view));
  }

  function recordPreferenceSignalForItem(it, action) {
    if (!it || !it.id) return;
    showcaseState.sigRecorded[it.id] = action;
    updateShowcaseCountersAndSignals();

    const payload = {
      action: action,
      id: it.id,
      itemId: it.id,
      channel: it.channel || '',
      title: it.title || '',
      tags: it.tags || []
    };
    const localSigs = loadLocalJson('ww_signals_v2', []);
    localSigs.push(Object.assign({ ts: new Date().toISOString() }, payload));
    if (localSigs.length > 200) localSigs.splice(0, localSigs.length - 200);
    saveLocalJson('ww_signals_v2', localSigs);

    if (isHttpServer) {
      fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        priority: 'low'
      }).catch(function () {});
    }
  }

  function recordPreferenceSignal(action) {
    const it = showcaseState.items[showcaseState.index];
    if (it) recordPreferenceSignalForItem(it, action);
  }

  // ==================== 三态展厅交互事件绑定 ====================
  if (scPrevBtn) scPrevBtn.addEventListener('click', function () { stepShowcaseItem(-1); });
  if (scNextBtn) scNextBtn.addEventListener('click', function () { stepShowcaseItem(1); });

  [
    [scTabGallery, 'gallery'],
    [scTabSplit, 'split'],
    [scTabStage, 'stage']
  ].forEach(function (pair) {
    if (!pair[0]) return;
    pair[0].addEventListener('click', function () {
      if (pair[1] === 'gallery' && !showcaseState.galleryItems.length && !showcaseState.isFavoritesGallery) {
        showcaseState.galleryItems = showcaseState.items.slice();
      }
      switchShowcaseView(pair[1]);
    });
  });

  if (scDomMuseumBtn) {
    scDomMuseumBtn.addEventListener('click', function () {
      loadFacetGalleryStream('museum', 'china-tang-song', false);
    });
  }
  if (scDomLandscapeBtn) {
    scDomLandscapeBtn.addEventListener('click', function () {
      loadFacetGalleryStream('landscape', 'natgeo-wildlife', false);
    });
  }

  if (scFacetPills) {
    scFacetPills.addEventListener('click', function (e) {
      const pill = e.target.closest('[data-facet-id]');
      if (!pill) return;
      const fid = pill.getAttribute('data-facet-id') || 'all';
      loadFacetGalleryStream(showcaseState.domain, fid, false);
    });
  }

  if (scRandomJumpBtn) {
    scRandomJumpBtn.addEventListener('click', function () {
      triggerFacetRandomJump(showcaseState.domain, showcaseState.activeFacet);
    });
  }

  if (scGalMoreBtn) {
    scGalMoreBtn.addEventListener('click', function () {
      loadFacetGalleryStream(showcaseState.domain, showcaseState.activeFacet, true);
    });
  }

  if (scGalGrid) {
    scGalGrid.addEventListener('click', function (e) {
      const emptyJump = e.target.closest('[data-empty-jump]');
      if (emptyJump) {
        e.stopPropagation();
        const dom = emptyJump.getAttribute('data-empty-jump') === 'landscape' ? 'landscape' : 'museum';
        loadFacetGalleryStream(dom, dom === 'landscape' ? 'natgeo-wildlife' : 'china-tang-song', false);
        return;
      }
      const favBtn = e.target.closest('[data-fav-idx]');
      if (favBtn) {
        e.stopPropagation();
        const fIdx = parseInt(favBtn.getAttribute('data-fav-idx'), 10) || 0;
        const targetIt = showcaseState.galleryItems[fIdx] || showcaseState.items[fIdx];
        if (targetIt) toggleFavoriteItem(targetIt);
        return;
      }
      const stageQuick = e.target.closest('[data-gal-stage]');
      if (stageQuick) {
        e.stopPropagation();
        const sIdx = parseInt(stageQuick.getAttribute('data-gal-stage'), 10) || 0;
        showcaseState.items = showcaseState.galleryItems.slice();
        selectShowcaseIndex(sIdx, 'stage');
        return;
      }
      const card = e.target.closest('[data-gal-idx]');
      if (!card) return;
      const cIdx = parseInt(card.getAttribute('data-gal-idx'), 10) || 0;
      showcaseState.items = showcaseState.galleryItems.slice();
      selectShowcaseIndex(cIdx, 'split');
    });
  }

  [scSplitStrip, scStageStrip].forEach(function (stripEl) {
    if (!stripEl) return;
    stripEl.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-film-idx]');
      if (!btn) return;
      const fIdx = parseInt(btn.getAttribute('data-film-idx'), 10) || 0;
      selectShowcaseIndex(fIdx, showcaseState.view);
    });
  });

  if (scSplitFitBtn) {
    scSplitFitBtn.addEventListener('click', function () {
      showcaseState.splitCover = !showcaseState.splitCover;
      syncSplitFitUI();
    });
  }
  if (scSplitResetZoomBtn) {
    scSplitResetZoomBtn.addEventListener('click', resetSplitZoom);
  }
  if (scSplitToFullBtn) {
    scSplitToFullBtn.addEventListener('click', function () {
      switchShowcaseView('stage');
    });
  }
  if (scOpenDossierBtn) {
    scOpenDossierBtn.addEventListener('click', function () {
      switchShowcaseView('split');
    });
  }

  if (scFitBtn) {
    scFitBtn.addEventListener('click', function () {
      const it = showcaseState.items[showcaseState.index];
      const curCover = scStageView && scStageView.classList.contains('is-cover');
      showcaseState.coverOverride = !curCover;
      syncStageFitClass(it);
    });
  }
  if (scCaptionToggle) {
    scCaptionToggle.addEventListener('click', function () {
      showcaseState.captionHidden = !showcaseState.captionHidden;
      if (scCaptionCard) scCaptionCard.classList.toggle('is-collapsed', showcaseState.captionHidden);
    });
  }

  if (scFavBtn) {
    scFavBtn.addEventListener('click', function () {
      const it = showcaseState.items[showcaseState.index];
      if (it) toggleFavoriteItem(it);
    });
  }
  if (scStageFavBtn) {
    scStageFavBtn.addEventListener('click', function () {
      const it = showcaseState.items[showcaseState.index];
      if (it) toggleFavoriteItem(it);
    });
  }
  if (scOpenFavBtn) {
    scOpenFavBtn.addEventListener('click', function () {
      openFavoritesGallery(0, 'gallery');
    });
  }
  if (favGalleryBtn) {
    favGalleryBtn.addEventListener('click', function () {
      openFavoritesGallery(0, 'gallery');
    });
  }
  if (drawerOpenFavAll) {
    drawerOpenFavAll.addEventListener('click', function () {
      openFavoritesGallery(0, 'gallery');
    });
  }
  if (tunerOpenFavGallery) {
    tunerOpenFavGallery.addEventListener('click', function () {
      openFavoritesGallery(0, 'gallery');
    });
  }
  if (scSigMoreBtn) scSigMoreBtn.addEventListener('click', function () { recordPreferenceSignal('more'); });
  if (scSigLessBtn) scSigLessBtn.addEventListener('click', function () { recordPreferenceSignal('less'); });
  if (scCloseBtn) scCloseBtn.addEventListener('click', function () { closeShowcaseModal(); });

  // ==================== IME 安全维基百科实时搜索（顶栏 + 图文并排右栏双入口） ====================
  async function fetchWikiSearchSuggestions(queryText) {
    const q = String(queryText || '').trim();
    if (!q) return [];
    if (isHttpServer) {
      try {
        const resp = await fetch('/api/wiki-search?q=' + encodeURIComponent(q));
        if (resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.items)) return data.items;
        }
      } catch (_) {}
    }
    try {
      const isAscii = /^[\x00-\x7F]+$/.test(q);
      const lang = isAscii ? 'en' : 'zh';
      const url = 'https://' + lang + '.wikipedia.org/w/api.php?origin=*&action=query&format=json' +
        (lang === 'zh' ? '&variant=zh-cn' : '') +
        '&generator=prefixsearch&gpssearch=' + encodeURIComponent(q) +
        '&gpslimit=7&prop=pageimages|description&pithumbsize=160';
      const r = await fetch(url);
      const j = await r.json();
      const pages = j && j.query && j.query.pages ? Object.values(j.query.pages) : [];
      pages.sort(function (a, b) { return (a.index || 99) - (b.index || 99); });
      return pages.map(function (p) {
        return {
          title: p.title,
          lang: lang,
          description: p.description || '',
          thumbnail: (p.thumbnail && p.thumbnail.source) || ''
        };
      });
    } catch (_) {
      return [];
    }
  }

  async function openWikiSearchTopic(rawTitle, preferredLang, fromTopBar) {
    const cleanTitle = String(rawTitle || '').trim();
    if (!cleanTitle) return;
    const lang = preferredLang || (/^[\x00-\x7F]+$/.test(cleanTitle) ? 'en' : 'zh');

    let dossier = wikiClientCache[cleanTitle] || null;
    if (!dossier) {
      try {
        if (isHttpServer) {
          const resp = await fetch('/api/wiki?title=' + encodeURIComponent(cleanTitle) + '&lang=' + encodeURIComponent(lang));
          if (resp.ok) dossier = await resp.json();
        } else {
          dossier = await fetchWikiDirectFallback(cleanTitle);
        }
        if (dossier && dossier.ok) {
          wikiClientCache[cleanTitle] = dossier;
          if (dossier.title) wikiClientCache[dossier.title] = dossier;
        }
      } catch (_) {}
    }

    const resolvedTitle = (dossier && dossier.ok && dossier.title) ? dossier.title : cleanTitle;
    const hiImg = (dossier && (dossier.originalImage || dossier.thumbnail)) || '';

    if (!isModalOpen(showcaseDialog) || fromTopBar || showcaseState.view === 'gallery') {
      const wikiCardItem = normalizeClientItem({
        id: 'wiki-topic-' + encodeURIComponent(resolvedTitle),
        channel: 'books',
        kind: hiImg ? 'image' : 'quote',
        civilization: 'WIKIPEDIA DOSSIER',
        title: resolvedTitle,
        enTitle: (dossier && dossier.lang === 'en') ? '' : cleanTitle,
        shortTitle: resolvedTitle.slice(0, 14),
        subtitle: '维基百科专题词条 · 图文并排深读',
        thumbUrl: (dossier && dossier.thumbnail) || hiImg,
        previewUrl: hiImg || (dossier && dossier.thumbnail) || '',
        fullUrl: hiImg || (dossier && dossier.thumbnail) || '',
        sourceUrl: (dossier && dossier.pageUrl) || ('https://zh.wikipedia.org/wiki/' + encodeURIComponent(resolvedTitle)),
        wikiTitle: resolvedTitle,
        relatedSeeds: (dossier && dossier.relatedTopics ? dossier.relatedTopics.slice(0, 6) : []),
        story: (dossier && Array.isArray(dossier.summary) && dossier.summary[0]) ? dossier.summary[0].slice(0, 220) : '',
        quote: (!hiImg && dossier && Array.isArray(dossier.summary) && dossier.summary[0]) ? dossier.summary[0].slice(0, 180) : '',
        meta: ['Wikipedia Full Dossier'],
        tags: [resolvedTitle]
      });

      const list = collectAllWindowItems();
      const existingIdx = list.findIndex(function (x) { return x && x.id === wikiCardItem.id; });
      if (existingIdx >= 0) {
        list[existingIdx] = wikiCardItem;
      } else {
        list.unshift(wikiCardItem);
      }

      openShowcase({
        items: list,
        startIndex: existingIdx >= 0 ? existingIdx : 0,
        view: 'split',
        eyebrow: 'WIKIPEDIA SEARCH · SPLIT VIEW',
        title: resolvedTitle
      });
      return;
    }

    if (showcaseState.view !== 'split') {
      switchShowcaseView('split');
    }
    const curItem = showcaseState.items[showcaseState.index];
    if (hiImg && curItem && String(curItem.id || '').indexOf('wiki-topic-') === 0) {
      curItem.title = resolvedTitle;
      curItem.wikiTitle = resolvedTitle;
      curItem.previewUrl = hiImg;
      curItem.fullUrl = hiImg;
      curItem.thumbUrl = (dossier && dossier.thumbnail) || hiImg;
      if (scSplitTitle) scSplitTitle.textContent = resolvedTitle;
      if (scSplitImg) {
        scSplitImg.hidden = false;
        attachProgressiveStageImage(scSplitImg, curItem, null);
      }
      if (scSplitQuoteCard) scSplitQuoteCard.hidden = true;
    }
    if (scSplitRight) scSplitRight.scrollTop = 0;
    loadWikiTopicIntoDossier(resolvedTitle, true);
  }

  function closeAllWikiSuggestBoxes() {
    [topWikiSuggest, dosWikiSuggest].forEach(function (box) {
      if (box) {
        box.hidden = true;
        box.innerHTML = '';
      }
    });
  }

  function bindWikiSearchForm(formEl, inputEl, suggestEl, isTopBar) {
    if (!formEl || !inputEl || !suggestEl) return;
    let debounceTimer = null;
    let activeIdx = -1;
    let currentSuggestions = [];
    let lastCompositionEndAt = null;
    let reqSeq = 0;

    function hideSuggest() {
      activeIdx = -1;
      suggestEl.hidden = true;
    }

    function renderSuggestions() {
      if (!currentSuggestions.length) {
        hideSuggest();
        return;
      }
      suggestEl.innerHTML = currentSuggestions.map(function (sug, idx) {
        const isAct = idx === activeIdx;
        const thumbHtml = sug.thumbnail
          ? '<img class="wiki-sug-thumb" src="' + escHtml(resolveImgUrl(sug.thumbnail)) + '" alt="" loading="lazy" decoding="async">'
          : '<span class="wiki-sug-dot" aria-hidden="true">◇</span>';
        return (
          '<button type="button" class="wiki-sug-item' + (isAct ? ' is-active' : '') + '" role="option" aria-selected="' + (isAct ? 'true' : 'false') + '" data-sug-idx="' + idx + '">' +
            thumbHtml +
            '<span class="wiki-sug-text">' +
              '<strong>' + escHtml(sug.title || '') + '</strong>' +
              (sug.description ? '<small>' + escHtml(sug.description) + '</small>' : '') +
            '</span>' +
          '</button>'
        );
      }).join('');
      suggestEl.hidden = false;
    }

    inputEl.addEventListener('compositionend', function (event) {
      // 遵循 modern-web-guidance ime-safe-enter-submit：用 event.timeStamp 防 Safari 乱序回车误提交
      lastCompositionEndAt = event.timeStamp;
    });

    inputEl.addEventListener('input', function () {
      const val = inputEl.value.trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (!val) {
        currentSuggestions = [];
        hideSuggest();
        return;
      }
      const mySeq = ++reqSeq;
      debounceTimer = setTimeout(async function () {
        const items = await fetchWikiSearchSuggestions(val);
        if (mySeq !== reqSeq) return;
        currentSuggestions = items.slice(0, 7);
        activeIdx = -1;
        renderSuggestions();
      }, 210);
    });

    inputEl.addEventListener('keydown', function (event) {
      const imeGuard =
        event.isComposing ||
        event.keyCode === 229 ||
        (lastCompositionEndAt !== null && Math.abs(event.timeStamp - lastCompositionEndAt) < 50);

      if (event.key === 'Enter') {
        event.preventDefault();
        if (imeGuard) return;
        formEl.requestSubmit();
        return;
      }
      if (imeGuard || suggestEl.hidden || !currentSuggestions.length) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIdx = (activeIdx + 1) % currentSuggestions.length;
        renderSuggestions();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIdx = (activeIdx - 1 + currentSuggestions.length) % currentSuggestions.length;
        renderSuggestions();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        hideSuggest();
      }
    });

    suggestEl.addEventListener('click', function (e) {
      e.stopPropagation();
      const btn = e.target.closest('[data-sug-idx]');
      if (!btn) return;
      const idx = parseInt(btn.getAttribute('data-sug-idx'), 10);
      const picked = currentSuggestions[idx];
      if (!picked) return;
      inputEl.value = picked.title || '';
      hideSuggest();
      openWikiSearchTopic(picked.title, picked.lang || 'zh', isTopBar);
    });

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      const picked = (activeIdx >= 0 && currentSuggestions[activeIdx]) ? currentSuggestions[activeIdx] : null;
      const q = picked ? picked.title : inputEl.value.trim();
      const lang = picked ? (picked.lang || 'zh') : '';
      hideSuggest();
      if (!q) return;
      openWikiSearchTopic(q, lang, isTopBar);
    });
  }

  bindWikiSearchForm(topWikiForm, topWikiInput, topWikiSuggest, true);
  bindWikiSearchForm(dosWikiForm, dosWikiInput, dosWikiSuggest, false);

  if (dosRandomWikiBtn) {
    dosRandomWikiBtn.addEventListener('click', function () {
      const pool = (showcaseState.currentRelatedPool || []).filter(function (t) {
        return t && showcaseState.wikiTrail.indexOf(t) < 0;
      });
      const fallbackPool = showcaseState.currentRelatedPool || [];
      const src = pool.length ? pool : fallbackPool;
      if (!src.length) return;
      const pick = src[Math.floor(Math.random() * src.length)];
      if (pick) {
        if (dosTrail && dosTrail.scrollIntoView) dosTrail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        loadWikiTopicIntoDossier(pick, true);
      }
    });
  }

  if (scSplitRight) {
    scSplitRight.addEventListener('click', function (e) {
      const topicBtn = e.target.closest('[data-wiki-topic]');
      if (topicBtn) {
        const topic = topicBtn.getAttribute('data-wiki-topic');
        if (topic) {
          if (dosTrail && !dosTrail.hidden && dosTrail.scrollIntoView) {
            dosTrail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          loadWikiTopicIntoDossier(topic, true);
        }
        return;
      }

      const trailBtn = e.target.closest('[data-trail-idx]');
      if (trailBtn) {
        const tIdx = parseInt(trailBtn.getAttribute('data-trail-idx'), 10);
        const targetTopic = showcaseState.wikiTrail[tIdx];
        if (targetTopic) {
          showcaseState.wikiTrail = showcaseState.wikiTrail.slice(0, tIdx + 1);
          loadWikiTopicIntoDossier(targetTopic, false);
        }
        return;
      }

      const secJump = e.target.closest('[data-sec-jump]');
      if (secJump) {
        e.preventDefault();
        const sIdx = secJump.getAttribute('data-sec-jump');
        const secEl = document.getElementById('dos-wiki-sec-' + sIdx);
        if (secEl && secEl.scrollIntoView) {
          secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      const winBtn = e.target.closest('[data-win-idx]');
      if (winBtn) {
        const wIdx = parseInt(winBtn.getAttribute('data-win-idx'), 10) || 0;
        selectShowcaseIndex(wIdx, 'split');
      }
    });
  }

  if (scSplitCanvas) {
    scSplitCanvas.addEventListener('wheel', function (e) {
      if (scSplitImg && scSplitImg.hidden) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.16 : 0.86;
      showcaseState.splitZoom = Math.max(1.0, Math.min(5.2, showcaseState.splitZoom * factor));
      if (showcaseState.splitZoom <= 1.02) {
        showcaseState.splitZoom = 1.0;
        showcaseState.splitPanX = 0;
        showcaseState.splitPanY = 0;
      }
      applySplitTransform();
    }, { passive: false });

    scSplitCanvas.addEventListener('dblclick', function (e) {
      if (e.target.closest('.sc-split-tools')) return;
      if (showcaseState.splitZoom > 1.08) {
        resetSplitZoom();
      } else {
        showcaseState.splitZoom = 2.25;
        applySplitTransform();
      }
    });

    scSplitCanvas.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.sc-split-tools')) return;
      showcaseState.splitDragging = true;
      showcaseState.splitDragStartX = e.clientX - showcaseState.splitPanX;
      showcaseState.splitDragStartY = e.clientY - showcaseState.splitPanY;
      scSplitCanvas.classList.add('dragging');
    });
  }

  if (scStageCanvas) {
    scStageCanvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.16 : 0.86;
      showcaseState.zoom = Math.max(1.0, Math.min(5.2, showcaseState.zoom * factor));
      if (showcaseState.zoom <= 1.02) {
        showcaseState.zoom = 1.0;
        showcaseState.panX = 0;
        showcaseState.panY = 0;
      }
      applyStageTransform();
    }, { passive: false });

    scStageCanvas.addEventListener('dblclick', function () {
      if (showcaseState.zoom > 1.08) {
        resetStageZoom();
      } else {
        showcaseState.zoom = 2.25;
        applyStageTransform();
      }
    });

    scStageCanvas.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      showcaseState.dragging = true;
      showcaseState.dragStartX = e.clientX - showcaseState.panX;
      showcaseState.dragStartY = e.clientY - showcaseState.panY;
      scStageCanvas.classList.add('dragging');
    });
  }

  window.addEventListener('pointermove', function (e) {
    if (showcaseState.dragging) {
      showcaseState.panX = e.clientX - showcaseState.dragStartX;
      showcaseState.panY = e.clientY - showcaseState.dragStartY;
      applyStageTransform();
    }
    if (showcaseState.splitDragging) {
      showcaseState.splitPanX = e.clientX - showcaseState.splitDragStartX;
      showcaseState.splitPanY = e.clientY - showcaseState.splitDragStartY;
      applySplitTransform();
    }
  });

  window.addEventListener('pointerup', function () {
    if (showcaseState.dragging) {
      showcaseState.dragging = false;
      if (scStageCanvas) scStageCanvas.classList.remove('dragging');
    }
    if (showcaseState.splitDragging) {
      showcaseState.splitDragging = false;
      if (scSplitCanvas) scSplitCanvas.classList.remove('dragging');
    }
  });

  function showShowcaseModalElement() {
    if (!showcaseDialog) return;
    showcaseDialog.hidden = false;
    syncModalBodyClass();
    if (scCloseBtn) {
      try { scCloseBtn.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  function openShowcase(opts) {
    if (!showcaseDialog) return;
    rememberModalTrigger();
    hideBubblePeekNow();
    setFontMenuOpen(false);
    setMenuOpen(false);
    closeAllWikiSuggestBoxes();

    showcaseState.isFavoritesGallery = Boolean(opts && opts.isFavoritesGallery);
    showcaseState.isCuratedPage = Boolean(opts && opts.isCuratedPage);
    showcaseState.curatorNote = (opts && opts.curatorNote) || '';
    showcaseState.curatorAuthor = (opts && opts.curatorAuthor) || '';

    showcaseState.items = (opts && opts.items && opts.items.length)
      ? opts.items.map(normalizeClientItem)
      : collectAllWindowItems();
    showcaseState.index = Math.max(0, Math.min(showcaseState.items.length - 1, (opts && opts.startIndex) || 0));
    showcaseState.eyebrow = (opts && opts.eyebrow) || 'WORLD WINDOW';
    showcaseState.title = (opts && opts.title) || '世界之窗';
    showcaseState.coverOverride = null;
    showcaseState.lastRenderedWikiItemId = '';

    const firstItem = showcaseState.items[showcaseState.index];
    showcaseState.domain = (opts && opts.forceDomain) || getDomainForItem(firstItem);
    showcaseState.activeFacet = (opts && opts.initialFacet) || (firstItem && firstItem.facet) || 'all';
    if (opts && Array.isArray(opts.galleryItemsOverride)) {
      showcaseState.galleryItems = opts.galleryItemsOverride.map(normalizeClientItem);
    } else if (opts && opts.view === 'gallery') {
      showcaseState.galleryItems = showcaseState.items.slice();
    }

    if (scCloseBtn) scCloseBtn.textContent = DATA.ui[currentLang].backToBubbles;

    const targetMode = (opts && opts.view) || 'split';
    switchShowcaseView(targetMode);

    if (isModalOpen(showcaseDialog)) {
      return;
    }

    if (prefersReduced || motionPaused) {
      historyState.captureBeforeTransition();
      showShowcaseModalElement();
      return;
    }

    isTransition = true;
    showcaseOpeningBusy = true;
    wakeRenderLoop();
    historyState.captureBeforeTransition();

    to(sceneState, 'topLineOpacity', 0, 0.3, EASE.linear, 0);
    to(sceneState, 'jointAlpha', 0, 0.2, EASE.linear, 0);
    to(sceneState, 'frontAlpha', 0, 0.85, EASE.p3io, 0);

    frontItems.forEach(function (fi) {
      const dx = fi.wx - centerX;
      const dy = (fi.wy || centerY) - centerY;
      const ang = Math.atan2(dy, dx);
      const dist = Math.hypot(dx, dy);
      fi.transX = fi.wx;
      fi.transY = fi.wy || centerY;
      to(fi, 'transX', centerX + Math.cos(ang) * dist * 2, 0.85, EASE.p3io, 0);
      to(fi, 'transY', centerY + Math.sin(ang) * dist * 2, 0.85, EASE.p3io, 0);
    });

    mainBalls.forEach(function (b) {
      to(b.dom, 'opacity', 0, 0.2, EASE.linear, 0);
      if (b.bgWord) to(b.bgWord, 'alpha', 0, 0.2, EASE.linear, 0);
      to(b, 'wx', centerX, 0.72, EASE.p2io, 0);
      to(b, 'wy', centerY, 0.72, EASE.p2io, 0);
      to(b, 'groupScale', 0.1, 0.72, EASE.p2io, 0);

      if (b.under && b.under.isOpen) {
        b.under.lineVis = false;
        b.under.particleAlpha = 0;
        b.under.l1Nodes.forEach(function (n) {
          to(n.dom, 'opacity', 0, 0.15, EASE.linear, 0, function () {
            n.dom.btn.style.display = 'none';
          });
          to(n, 'wx', centerX, 0.65, EASE.p2io, 0);
          to(n, 'wy', centerY, 0.65, EASE.p2io, 0);
          to(n, 'trgScale', 0.01, 0.65, EASE.p2io, 0);
          n.drops.forEach(function (dr) { dr.isShow = false; stopDroplet(dr, 0.2); });
          if (n.l2 && n.l2.isOpen) {
            n.l2.lineVis = false;
            n.l2.particleAlpha = 0;
            n.l2.nodes.forEach(function (gn) {
              to(gn.dom, 'opacity', 0, 0.15, EASE.linear, 0, function () {
                gn.dom.btn.style.display = 'none';
              });
              to(gn, 'wx', centerX, 0.65, EASE.p2io, 0);
              to(gn, 'wy', centerY, 0.65, EASE.p2io, 0);
              to(gn, 'curScale', 0.01, 0.65, EASE.p2io, 0);
              gn.drops.forEach(function (dr) { dr.isShow = false; stopDroplet(dr, 0.2); });
            });
          }
        });
      }
    });

    const baseSc = W > PHY.borderSP ? W / 1900 : 0.5;
    transitionBall.vis = true;
    transitionBall.spinning = true;
    transitionBall.wx = centerX;
    transitionBall.wy = centerY;
    transitionBall.scale = 0.01;
    transitionBall.groupRz = 0;
    to(transitionBall, 'scale', baseSc * 0.65, 0.68, EASE.p3o, 0.18);

    const openModalTimer = { v: 0 };
    to(openModalTimer, 'v', 1, 0.56, EASE.linear, 0, function () {
      showShowcaseModalElement();
      setTimeout(function () {
        showcaseOpeningBusy = false;
      }, 180);
    });
  }

  function closeShowcaseModal() {
    if (!showcaseDialog || showcaseDialog.hidden) return;
    showcaseDialog.hidden = true;
    showcaseOpeningBusy = false;
    syncModalBodyClass();
    resetStageZoom();
    resetSplitZoom();

    if (!isTransition) {
      wakeRenderLoop();
      historyState.restoreAfterDetail();
      restoreModalTriggerFocus();
      return;
    }

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

    isTransition = false;
    wakeRenderLoop();

    to(transitionBall, 'scale', 0.01, 0.45, EASE.p1io, 0.04, function () {
      transitionBall.vis = false;
      transitionBall.spinning = false;
    });

    startTopView(true);
    restoreModalTriggerFocus();
  }

  // ==================== 主按钮 DOM 内容渲染与多语言热切换 ====================
  function renderDomCopy() {
    const ui = DATA.ui[currentLang];
    document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';

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

    updateTopPillLabels();

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
        if (!sec) return;
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
            const curPlItem = getActiveNodeItem(node);
            node.dom.txt.innerHTML = (DATA.formatBilingualBubbleLabel && curPlItem && curPlItem.title)
              ? DATA.formatBilingualBubbleLabel(curPlItem)
              : ((curPlItem && curPlItem.shortTitle) || node.data.label[currentLang]);
            if (node.l2) {
              node.l2.nodes.forEach(function (gn) {
                gn.dom.txt.innerHTML = (DATA.formatBilingualBubbleLabel && gn.data && gn.data.title)
                  ? DATA.formatBilingualBubbleLabel(gn.data)
                  : gn.data.label[currentLang];
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

    const lwaHref = appState.lwaCatalogUrl || DATA.OBSIDIAN_CATALOG_URL || '#top';
    const extHtml = ui.externalLinks.map(function (l) {
      if (l.action === 'lwa') {
        return '<a href="' + escHtml(lwaHref) + '"><span>' + escHtml(l.prefix) + '</span>' + escHtml(l.label) + '</a>';
      }
      return '<a href="#top" data-ext-action="' + escHtml(l.action || 'ball0') + '"><span>' + escHtml(l.prefix) + '</span>' + escHtml(l.label) + '</a>';
    }).join('');
    const polHtml = ui.policyLinks.map(function (p) {
      return '<a href="#top" data-ext-action="tuner">' + escHtml(p) + '</a>';
    }).join('');

    const menuExt = document.getElementById('menu-ext-list');
    const menuPol = document.getElementById('menu-policy-list');
    const footExt = document.getElementById('footer-ext-list');
    const footPol = document.getElementById('footer-policy-list');
    if (menuExt) menuExt.innerHTML = extHtml;
    if (menuPol) menuPol.innerHTML = polHtml;
    if (footExt) {
      footExt.innerHTML = ui.externalLinks.map(function (l) {
        if (l.action === 'lwa') {
          return '<a href="' + escHtml(lwaHref) + '"><b>' + escHtml(l.prefix) + '</b>' + escHtml(l.label) + '</a>';
        }
        return '<a href="#top" data-ext-action="' + escHtml(l.action || 'ball0') + '"><b>' + escHtml(l.prefix) + '</b>' + escHtml(l.label) + '</a>';
      }).join('');
    }
    if (footPol) footPol.innerHTML = polHtml;

    if (isModalOpen(showcaseDialog) && scCloseBtn) {
      scCloseBtn.textContent = ui.backToBubbles;
    }
  }

  // 绑定主泡泡按钮点击（0 展开今日全卷画布，1..6 展开子泡，7 换一窗新鲜风物）
  mainBalls.forEach(function (b) {
    b.dom.btn.addEventListener('click', function () {
      if (b.id === 0) {
        openDailyShowcase();
      } else if (b.id >= 1 && b.id <= 6) {
        toggleMainBall(b.id);
      } else if (b.id === 7) {
        shuffleWindow();
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
    if (open) {
      hideBubblePeekNow();
      setFontMenuOpen(false);
      closeAllWikiSuggestBoxes();
      renderDrawerFavoritesAndPages();
    }
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
    if (e.key === 'Escape') {
      if (fontPickerMenu && !fontPickerMenu.hidden) {
        e.preventDefault();
        setFontMenuOpen(false);
        return;
      }
      if (isModalOpen(tunerDialog)) {
        e.preventDefault();
        closeTunerDialog();
        return;
      }
      if (isModalOpen(showcaseDialog)) {
        e.preventDefault();
        closeShowcaseModal();
        return;
      }
      if (document.body.classList.contains('menu-open')) {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
    }

    if (isModalOpen(showcaseDialog) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (!typing) {
        if (showcaseState.view === 'stage' || showcaseState.view === 'split') {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            stepShowcaseItem(-1);
            return;
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            stepShowcaseItem(1);
            return;
          }
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          triggerFacetRandomJump(showcaseState.domain, showcaseState.activeFacet);
          return;
        }
      }
    }
  });

  langTrigger.addEventListener('click', function (e) {
    e.stopPropagation();
    setFontMenuOpen(false);
    langWrap.classList.toggle('open');
  });

  document.addEventListener('click', function (e) {
    langWrap.classList.remove('open');
    if (fontPickerMenu && !fontPickerMenu.hidden && (!fontPickerWrap || !fontPickerWrap.contains(e.target))) {
      setFontMenuOpen(false);
    }
    if (topWikiSuggest && !topWikiSuggest.hidden && (!topWikiForm || !topWikiForm.contains(e.target))) {
      topWikiSuggest.hidden = true;
    }
    if (dosWikiSuggest && !dosWikiSuggest.hidden && (!dosWikiForm || !dosWikiForm.contains(e.target))) {
      dosWikiSuggest.hidden = true;
    }
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
    wakeRenderLoop();
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
    if (isAnyModalOpen()) return;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 36;
    else if (e.deltaMode === 2) dy *= H * 0.85;
    else dy *= 0.92;
    if (dy === 0) return;
    e.preventDefault();
    hideBubblePeekNow();
    scrollCtrl.target = Math.max(0, Math.min(getMaxScroll(), scrollCtrl.target + dy));
    scrollCtrl.active = true;
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (prefersReduced || motionPaused || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (isAnyModalOpen()) return;
    const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag === 'a') {
      if (e.key === ' ' || e.key === 'Enter' || tag === 'input' || tag === 'textarea') return;
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
      openDailyShowcase();
    } else if (action === 'museum-jump') {
      openExplorerPreset('museum', 'china-tang-song');
    } else if (action === 'landscape-jump') {
      openExplorerPreset('landscape', 'natgeo-wildlife');
    } else if (action === 'fav-gallery') {
      openFavoritesGallery(0, 'gallery');
    } else if (action === 'lwa') {
      const target = appState.lwaCatalogUrl || DATA.OBSIDIAN_CATALOG_URL;
      if (target) window.location.href = target;
    } else if (action === 'shuffle') {
      shuffleWindow();
    } else if (action === 'tuner') {
      openTunerDialog();
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
    const favThumb = e.target.closest('[data-open-fav-idx]');
    if (favThumb) {
      e.preventDefault();
      const idx = parseInt(favThumb.getAttribute('data-open-fav-idx'), 10) || 0;
      openFavoritesGallery(idx, 'split');
      return;
    }
    const pageChip = e.target.closest('[data-open-page-slug]');
    if (pageChip && isHttpServer) {
      e.preventDefault();
      const slug = pageChip.getAttribute('data-open-page-slug');
      if (slug) {
        fetch('/api/pages/' + encodeURIComponent(slug))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (d && d.ok && d.page) openCuratedPageDoc(d.page, true);
          })
          .catch(function () {});
      }
      return;
    }
    const navBtn = e.target.closest('[data-nav-action]');
    if (navBtn) {
      e.preventDefault();
      handleNavAction(navBtn.getAttribute('data-nav-action'));
      return;
    }
    const extLink = e.target.closest('[data-ext-action]');
    if (extLink) {
      e.preventDefault();
      handleNavAction(extLink.getAttribute('data-ext-action'));
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

  // ==================== 主渲染循环（enterFrame：60fps 稳帧限速 + 弹窗/后台 0% GPU 休眠） ====================
  let lastNow = performance.now();
  let prevScrollY = window.scrollY;
  let scrollDis = 0;
  let frameCount = 0;
  let rafId = 0;

  function shouldPauseWebGL() {
    if (document.hidden) return true;
    if (isModalOpen(showcaseDialog) && !showcaseOpeningBusy) return true;
    if (isModalOpen(tunerDialog)) return true;
    return false;
  }

  wakeRenderLoop = function () {
    if (rafId || shouldPauseWebGL()) return;
    rafId = requestAnimationFrame(function (t) {
      rafId = 0;
      lastNow = t - 16.67;
      renderFrame(t);
    });
  };

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) wakeRenderLoop();
  });

  function hexRgbNormalized(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function renderFrame(now) {
    rafId = 0;
    if (shouldPauseWebGL()) {
      return;
    }

    const elapsed = now - lastNow;
    // 在 120Hz / 144Hz / 165Hz 屏幕上稳锁 60fps 渲染，省下一半以上 GPU 带宽，消除高刷掉帧抖动
    if (elapsed < 15.2 && frameCount > 2) {
      rafId = requestAnimationFrame(renderFrame);
      return;
    }

    const dtMs = Math.min(50, Math.max(1, elapsed));
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
            node.hoverLerp += ((node.isHovered ? 1 : 0) - node.hoverLerp) * 0.16;
            if (peekState.node === node && bubblePeekCard && !bubblePeekCard.hidden) {
              positionBubblePeekCard();
            }
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

    // Pass B: 0.5x 鼠标拖尾与点击水波纹贴图（提升边缘水波灵敏度与 6 瓣液态笔刷饱满度）
    if (animStep > 0) {
      const dxMf = Math.abs(effectX - mfPrevX);
      const dyMf = Math.abs(effectY - mfPrevY);
      mfPrevX = effectX;
      mfPrevY = effectY;
      mfTimer += animStep;
      if ((dxMf >= 1.5 || dyMf >= 1.5) && mfTimer >= 2) {
        mfTimer = 0;
        if (trailRings.length >= 42) trailRings.shift();
        trailRings.push({
          x: 0.5 * effectX,
          y: -0.5 * effectY,
          sc: 0.24,
          op: 0.94,
          rz: rnd() * Math.PI * 2
        });
      }
    }
    for (let i = trailRings.length - 1; i >= 0; i--) {
      const tr = trailRings[i];
      tr.rz += 0.02 * animStep;
      if (animStep > 0) {
        tr.op *= conf.s098a;
        tr.sc = tr.sc * conf.s098a + 7.2 * conf.s098b;
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
      effectSprites.push([ew * 0.5 + tr.x, -eh * 0.5 + tr.y, 104 * tr.sc, 104 * tr.sc, 0, 0, 1, 1, tr.rz, tr.op]);
    });
    clickRings.forEach(function (cr) {
      if (cr.vis) {
        effectSprites.push([ew * 0.5 + cr.x, -eh * 0.5 + cr.y, 96 * cr.sc, 96 * cr.sc, 0, 0, 1, 1, cr.rz, cr.op]);
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

    // Pass D: MiddleRender (横向 9 抽头硬件双线性高斯) -> BlurStageRender (纵向 9 抽头硬件双线性高斯)
    gl.disable(gl.BLEND);
    setTarget(RT.middle, null);
    gl.useProgram(PROG.blur.p);
    bindTex(0, RT.dummy.t);
    gl.uniform1i(PROG.blur.U.tex, 0);
    gl.uniform2f(PROG.blur.U.uStep, 1 / RT.middle.w, 0);
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

    // z = 1: 子泡泡放大全画幅液态水波折射画层（贴合融球有机边界 + 肥皂泡球面微透镜与釉彩边缘）
    if (!isTransition) {
      let artProgramBound = false;
      mainBalls.forEach(function (b) {
        const under = b.under;
        if (!under || under.status !== 1) return;
        under.l1Nodes.forEach(function (node) {
          const nd = node.dom;
          const sc = node.baseScale * node.trgScale * node.ballScale * node.selectScale;
          const artAlpha = Math.min(1, nd.opacity * nd.thumOp);
          if (sc > 0.04 && artAlpha > 0.02 && !(node.wy + 240 * sc < -H - 220 || node.wy - 240 * sc > 220)) {
            const artItem = getActiveNodeItem(node);
            const artTex = artItem ? getArtBubbleTex(artItem) : null;
            if (artTex) {
              if (!artProgramBound) {
                artProgramBound = true;
                gl.useProgram(PROG.artBubble.p);
                gl.uniform2f(PROG.artBubble.U.uRes, W, H);
                gl.uniform1f(PROG.artBubble.U.uRot, 0);
                gl.uniform2f(PROG.artBubble.U.uCanvasPx, canvas.width, canvas.height);
                gl.uniform2f(PROG.artBubble.U.uAsp, aspX, aspY);
                gl.uniform1f(PROG.artBubble.U.uTime, sceneState.dispTime);
                gl.uniform1f(PROG.artBubble.U.uStrength, sceneState.dispStrength);
                bindTex(1, RT.blur.t);
                gl.uniform1i(PROG.artBubble.U.uBlur, 1);
                bindTex(2, RT.noise.t);
                gl.uniform1i(PROG.artBubble.U.uNoise, 2);
                bindTex(3, RT.effect.t);
                gl.uniform1i(PROG.artBubble.U.uEffect, 3);
                gl.uniform1i(PROG.artBubble.U.uArt, 0);
              }
              bindTex(0, artTex);
              gl.uniform2f(PROG.artBubble.U.uPos, node.wx, node.wy);
              gl.uniform2f(PROG.artBubble.U.uSize, 284 * sc, 284 * sc);
              gl.uniform1f(PROG.artBubble.U.uHover, node.hoverLerp || 0);
              gl.uniform1f(PROG.artBubble.U.uAlpha, artAlpha);
              drawPlaneQuad(PROG.artBubble);
            }
          }

          if (node.l2 && node.l2.lineVis) {
            node.l2.nodes.forEach(function (gn) {
              if (gn.curScale <= 0.04 || gn.dom.opacity <= 0.02 || gn.wx <= -3500) return;
              const gTex = gn.data ? getArtBubbleTex(gn.data) : null;
              if (!gTex) return;
              if (!artProgramBound) {
                artProgramBound = true;
                gl.useProgram(PROG.artBubble.p);
                gl.uniform2f(PROG.artBubble.U.uRes, W, H);
                gl.uniform1f(PROG.artBubble.U.uRot, 0);
                gl.uniform2f(PROG.artBubble.U.uCanvasPx, canvas.width, canvas.height);
                gl.uniform2f(PROG.artBubble.U.uAsp, aspX, aspY);
                gl.uniform1f(PROG.artBubble.U.uTime, sceneState.dispTime);
                gl.uniform1f(PROG.artBubble.U.uStrength, sceneState.dispStrength);
                bindTex(1, RT.blur.t);
                gl.uniform1i(PROG.artBubble.U.uBlur, 1);
                bindTex(2, RT.noise.t);
                gl.uniform1i(PROG.artBubble.U.uNoise, 2);
                bindTex(3, RT.effect.t);
                gl.uniform1i(PROG.artBubble.U.uEffect, 3);
                gl.uniform1i(PROG.artBubble.U.uArt, 0);
              }
              bindTex(0, gTex);
              gl.uniform2f(PROG.artBubble.U.uPos, gn.wx, gn.wy);
              gl.uniform2f(PROG.artBubble.U.uSize, 284 * gn.curScale, 284 * gn.curScale);
              gl.uniform1f(PROG.artBubble.U.uHover, 0);
              gl.uniform1f(PROG.artBubble.U.uAlpha, Math.min(1, gn.dom.opacity));
              drawPlaneQuad(PROG.artBubble);
            });
          }
        });
      });
    }

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

    rafId = requestAnimationFrame(renderFrame);
  }

  // ==================== 启动入口、本地 feed-profile 状态水合与 Fable 专属专题 URL 路由 ====================
  let initialRouteHandled = false;
  async function handleInitialUrlRoute() {
    if (initialRouteHandled) return false;
    initialRouteHandled = true;
    try {
      const pathMatch = (location.pathname || '').match(/^\/p\/([^/?#]+)/);
      const sp = new URLSearchParams(location.search || '');
      const slug = (pathMatch && decodeURIComponent(pathMatch[1])) || sp.get('page') || '';
      if (slug && isHttpServer) {
        const r = await fetch('/api/pages/' + encodeURIComponent(slug));
        if (r.ok) {
          const d = await r.json();
          if (d && d.ok && d.page) {
            openCuratedPageDoc(d.page, false);
            return true;
          }
        }
      }

      const qParam = sp.get('q') || sp.get('keywords') || '';
      if (qParam && isHttpServer) {
        const apiUrl = '/api/curate?q=' + encodeURIComponent(qParam) +
          '&title=' + encodeURIComponent(sp.get('title') || qParam) +
          '&note=' + encodeURIComponent(sp.get('note') || '') +
          '&domain=' + encodeURIComponent(sp.get('domain') || '') +
          '&wiki=' + encodeURIComponent(sp.get('wiki') || '') +
          '&author=' + encodeURIComponent(sp.get('author') || 'Fable');
        const r = await fetch(apiUrl);
        if (r.ok) {
          const d = await r.json();
          if (d && d.ok && d.page) {
            openCuratedPageDoc(d.page, false);
            return true;
          }
        }
      }

      const wikiParam = sp.get('wiki') || '';
      if (wikiParam) {
        openWikiSearchTopic(wikiParam, 'zh', true);
        return true;
      }

      if (sp.get('favorites') === '1') {
        openFavoritesGallery(0, 'gallery');
        return true;
      }
    } catch (_) {}
    return false;
  }

  async function hydrateFromServer() {
    renderDrawerFavoritesAndPages();
    if (!isHttpServer) {
      await handleInitialUrlRoute();
      scheduleOpenModeSeenIfNeeded();
      return;
    }
    try {
      const resp = await fetch('/api/state');
      if (!resp.ok) {
        await handleInitialUrlRoute();
        return;
      }
      const st = await resp.json();
      let needRebuild = false;

      if (st.seen && typeof st.seen === 'object') {
        appState.seenMap = Object.assign({}, appState.seenMap, st.seen);
        saveLocalJson('ww_seen_v2', appState.seenMap);
      }
      if (Array.isArray(st.favorites)) {
        if (st.favorites.length || !appState.favorites.length) {
          appState.favorites = st.favorites.map(normalizeClientItem);
          saveLocalJson('ww_favorites_v1', appState.favorites);
        }
      }
      if (Array.isArray(st.curatedPages)) {
        appState.curatedPages = st.curatedPages;
      }
      if (st.lwaCatalogUrl) appState.lwaCatalogUrl = st.lwaCatalogUrl;
      if (st.lwaAskUrl) appState.lwaAskUrl = st.lwaAskUrl;
      if (Array.isArray(st.aiInbox) && st.aiInbox.length) {
        appState.aiInbox = st.aiInbox;
        needRebuild = true;
      }
      if (Array.isArray(st.livePool) && st.livePool.length) {
        appState.livePool = st.livePool;
        needRebuild = true;
      }
      if (st.preferences && typeof st.preferences === 'object') {
        const prevTheme = appState.preferences.theme;
        const prevFont = appState.preferences.fontPreset;
        appState.preferences = Object.assign({}, appState.preferences, st.preferences);
        saveLocalJson('ww_prefs_v2', appState.preferences);
        if (appState.preferences.theme !== prevTheme) applyTheme(appState.preferences.theme, true);
        if (appState.preferences.fontPreset !== prevFont) applyFontPreset(appState.preferences.fontPreset, true);
        needRebuild = true;
      }

      updateTopPillLabels();
      renderDrawerFavoritesAndPages();
      renderDomCopy();

      const openedRoute = await handleInitialUrlRoute();

      if (!openedRoute && needRebuild && !mainBalls.some(function (b) { return b.isOpen0; }) && !isModalOpen(showcaseDialog)) {
        const nextSecs = DATA.buildWindowFeed(
          appState.livePool,
          appState.preferences,
          appState.seenMap,
          appState.aiInbox,
          appState.currentSeed
        );
        rebuildAllSections(nextSecs);
      }

      scheduleOpenModeSeenIfNeeded();
      wakeRenderLoop();

      // 若后台尚未缓存 4K 开放馆藏池，低优先级静默预热拉取供下次「换一窗」秒开使用
      if (!appState.livePool.length) {
        fetch('/api/feed', { priority: 'low' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
          const pool = d && (d.livePool || d.items);
          if (Array.isArray(pool) && pool.length) {
            appState.livePool = pool;
          }
        }).catch(function () {});
      }
    } catch (_) {
      await handleInitialUrlRoute();
      scheduleOpenModeSeenIfNeeded();
    }
  }

  let resizeTimer = null;
  window.addEventListener('resize', function () {
    onResize();
    wakeRenderLoop();
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      onResize();
      wakeRenderLoop();
    }, 400);
  });

  renderDomCopy();
  renderDrawerFavoritesAndPages();
  onResize();
  hydrateFromServer();

  // 暴露调试与 AI 协作二次开发接口
  window.WorldWindowBubbles = {
    appState: appState,
    mainBalls: mainBalls,
    frontItems: frontItems,
    jointItems: jointItems,
    bokehList: bokehList,
    scrollCtrl: scrollCtrl,
    smoothScrollTo: smoothScrollTo,
    toggleMainBall: toggleMainBall,
    onL1BallClick: onL1BallClick,
    openShowcase: openShowcase,
    closeShowcaseModal: closeShowcaseModal,
    openDailyShowcase: openDailyShowcase,
    openExplorerPreset: openExplorerPreset,
    openFavoritesGallery: openFavoritesGallery,
    openCuratedPageDoc: openCuratedPageDoc,
    openWikiSearchTopic: openWikiSearchTopic,
    toggleFavoriteItem: toggleFavoriteItem,
    loadFacetGalleryStream: loadFacetGalleryStream,
    triggerFacetRandomJump: triggerFacetRandomJump,
    openTunerDialog: openTunerDialog,
    closeTunerDialog: closeTunerDialog,
    shuffleWindow: shuffleWindow,
    applyTheme: applyTheme,
    applyFontPreset: applyFontPreset,
    setLang: function (lang) {
      if (DATA.ui[lang]) {
        currentLang = lang;
        renderDomCopy();
      }
    }
  };

  // 短暂展示揭幕层后触发转场球收缩揭幕
  setTimeout(runInitialOpening, prefersReduced ? 0 : 80);
  rafId = requestAnimationFrame(function (t) {
    lastNow = t - 16.67;
    renderFrame(t);
  });
})();
