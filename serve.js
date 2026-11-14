/**
 * 世界之窗 · 漫游画册 — 零依赖本地推流、时空随机漫游、维基深读、私藏画匣与专题策展服务
 * 用法：node serve.js（默认端口 http://127.0.0.1:5184，可通过 .env 配置 PUBLIC_BASE_URL 与本地收藏库路径）
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
// 静态服务白名单（相对 ROOT）。工程目录里还有 .env / .git / serve.js / feed-profile 等，不能对外。
const PUBLIC_STATIC_FILES = new Set([
  'index.html', 'standalone.html', 'styles.css', 'data.js', 'sprites.js', 'renderer.js', 'favicon.ico',
  'dist/index.single.html'
]);

// 自动加载本地未入库的 .env（保护个人域名与本地目录配置不进入公开/归档代码）
(function loadLocalEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  } catch (_) {}
})();

const PORT = Number(process.env.PORT || 5184);
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

const PROFILE_DIR = path.join(ROOT, 'feed-profile');
const CACHE_DIR = path.join(PROFILE_DIR, '.cache');
const IMG_CACHE_DIR = path.join(CACHE_DIR, 'img');
const WIKI_CACHE_DIR = path.join(CACHE_DIR, 'wiki');
const PAGES_DIR = path.join(PROFILE_DIR, 'pages');

const PREF_JSON = path.join(PROFILE_DIR, 'preferences.json');
const PREF_MD = path.join(PROFILE_DIR, 'preferences.md');
const SEEN_JSON = path.join(PROFILE_DIR, 'seen.json');
const SIGNALS_JSONL = path.join(PROFILE_DIR, 'signals.jsonl');
const AI_INBOX_JSON = path.join(PROFILE_DIR, 'ai-inbox.json');
const FAVORITES_JSON = path.join(PROFILE_DIR, 'favorites.json');
const LIVE_POOL_JSON = path.join(CACHE_DIR, 'live-pool.json');
const EARTHVIEW_JSON = path.join(CACHE_DIR, 'earthview.json');
const BING_UHD_JSON = path.join(CACHE_DIR, 'bing-uhd.json');

// 只读读取本机 LWA 收藏库预构建索引（严禁触碰 vault/Wiki.md 或本地端口）
const LWA_CATALOG_JSON = process.env.LWA_CATALOG_JSON || '';
const LWA_VAULT_ID = process.env.LWA_VAULT_ID || '';

fs.mkdirSync(IMG_CACHE_DIR, { recursive: true });
fs.mkdirSync(WIKI_CACHE_DIR, { recursive: true });
fs.mkdirSync(PAGES_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

const ALLOWED_IMG_HOSTS = new Set([
  'openaccess-cdn.clevelandart.org',
  'openaccess-data.clevelandart.org',
  'www.artic.edu',
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
  'images.metmuseum.org',
  'www.gstatic.com',
  'lh3.googleusercontent.com',
  'www.bing.com',
  'cn.bing.com'
]);

const THEME_LABELS = {
  'celadon-mist': '晨露影青',
  'rice-paper': '宣纸矿彩',
  'mother-of-pearl': '珍珠母贝',
  'soft-classic': '柔化原色'
};

const FONT_LABELS = {
  'caslon-zhuque': 'Caslon + 朱雀仿宋',
  'bodoni-huiwen': 'Bodoni + 汇文明朝',
  'classic-caslon': 'Caslon + 思源细宋',
  'cormorant-wenkai': 'Cormorant + 霞鹜文楷',
  'instrument-oldsong': 'Instrument + 京华老宋',
  'playfair-bright': 'Playfair + 霞鹜晰黑',
  'playfair-editorial': 'Playfair + 思源雅宋',
  'clean-modern': '现代留白轻无衬线'
};

const KEEP_ALIVE_AGENT = new https.Agent({
  keepAlive: true,
  maxSockets: 24,
  maxFreeSockets: 8,
  timeout: 15000
});

const SEEN_LABELS = {
  inspect: '点开/展开看过的泡泡自动标已读，下次不再出现',
  open: '每次打开整屏曝光即记已读，下次全部换新',
  off: '不去重，自由随机漫游'
};

function buildCorsHeaders(req, extra) {
  const origin = String((req && req.headers && req.headers.origin) || '');
  let allowOrigin = '*';
  const headers = Object.assign({
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }, extra || {});

  if (
    (PUBLIC_BASE_URL && origin === PUBLIC_BASE_URL) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
  ) {
    allowOrigin = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  }
  headers['Access-Control-Allow-Origin'] = allowOrigin;
  return headers;
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function formatPreferencesMarkdown(prefs) {
  const th = prefs.theme || 'celadon-mist';
  const fp = prefs.fontPreset || 'classic-caslon';
  const sm = prefs.seenMode || 'inspect';
  const note = String(prefs.freeformNote || '').trim() || '（暂无额外备注）';
  const chs = Array.isArray(prefs.channels) ? prefs.channels : [];

  const lines = [
    '# 世界之窗 · 漫游推流偏好单',
    '',
    '> 这份文件与网页右上角「调音台」双向同步，人和 AI 都能直接读改（结构化主源：`preferences.json`）。',
    '',
    `- **更新时间 (\`updatedAt\`)**：\`${prefs.updatedAt || new Date().toISOString()}\``,
    `- **当前主题 (\`theme\`)**：\`${th}\`（${THEME_LABELS[th] || th}）`,
    `- **当前字体 (\`fontPreset\`)**：\`${fp}\`（${FONT_LABELS[fp] || fp}）`,
    `- **已读去重 (\`seenMode\`)**：\`${sm}\`（${SEEN_LABELS[sm] || sm}）`,
    `- **展示模式**：视觉条目默认全屏 4K 展厅（含文明/地貌随机跳），书籍/神话/影音默认维基全章深读与收藏库联动`,
    '',
    '## 随手写偏好备注（自由编辑，AI 协作可读）',
    '',
    note,
    '',
    '## 频道权重（0–5）',
    '',
    '| 窗口 | 频道 | 权重 | 偏好关键词 / 随便写 |',
    '| :--- | :--- | :---: | :--- |'
  ];

  chs.forEach((c, idx) => {
    const slotStr = String(c.slot || idx + 1).padStart(2, '0');
    const title = String(c.title || c.id || '').replace(/\|/g, '·');
    const w = Math.max(0, Math.min(5, Number(c.weight != null ? c.weight : 3)));
    const q = String(c.query || '').replace(/\|/g, ' ').replace(/\r?\n/g, ' ').trim();
    lines.push(`| ${slotStr} | ${title} (\`${c.id}\`) | ${w} | ${q} |`);
  });

  lines.push('');
  return lines.join('\n');
}

function sendJson(req, res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, buildCorsHeaders(req, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }));
  res.end(body);
}

function readRequestBody(req, maxBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// ==================== 中文偏好词 -> 英文馆藏检索映射 ====================
const KEYWORD_DICT = [
  ['影青', ['qingbai', 'celadon']],
  ['宋瓷', ['Song porcelain', 'celadon']],
  ['青瓷', ['celadon']],
  ['瓷', ['porcelain', 'ceramic']],
  ['玻璃', ['iridescent glass', 'Tiffany glass']],
  ['琉璃', ['blown glass', 'stained glass']],
  ['玉', ['jade', 'nephrite']],
  ['怀表', ['pocket watch', 'automaton clock']],
  ['珐琅', ['enamel', 'cloisonne']],
  ['青铜', ['bronze ritual vessel']],
  ['金饰', ['gold filigree', 'ancient jewelry']],
  ['莫奈', ['Claude Monet']],
  ['睡莲', ['Water Lilies Monet']],
  ['印象派', ['Impressionism', 'Renoir', 'Pissarro']],
  ['浮世绘', ['Hokusai', 'Hiroshige']],
  ['梵高', ['Vincent van Gogh']],
  ['维米尔', ['Vermeer', 'Dutch interior']],
  ['透纳', ['J. M. W. Turner']],
  ['云山', ['Chinese landscape handscroll', 'misty mountains ink']],
  ['山水', ['landscape scroll Song']],
  ['水彩', ['watercolor landscape']],
  ['冰川', ['glacier icebergs']],
  ['极光', ['aurora borealis']],
  ['峡湾', ['fjord mountains']],
  ['雪山', ['alpine lake mountains']],
  ['湖', ['glacial lake reflection']],
  ['海岸', ['sea cliffs basalt']],
  ['沙漠', ['namib dunes desert']],
  ['森林', ['misty forest redwood']],
  ['火山', ['volcano crater']],
  ['星云', ['nebula Hubble JWST']],
  ['星系', ['spiral galaxy ESO']],
  ['水晶', ['mineral crystal quartz']],
  ['矿物', ['fluorite tourmaline mineral']],
  ['化石', ['ammonite fossil']],
  ['植物', ['botanical illustration Redoute']],
  ['水母', ['Haeckel medusae']],
  ['蝴蝶', ['morpho butterfly macro']]
];

function extractEnglishTerms(rawText, defaultTerms) {
  const txt = String(rawText || '');
  const hits = [];
  for (const [zh, enArr] of KEYWORD_DICT) {
    if (txt.includes(zh)) {
      for (const e of enArr) {
        if (!hits.includes(e)) hits.push(e);
      }
    }
  }
  const asciiMatches = txt.match(/[A-Za-z]{3,}/g) || [];
  for (const w of asciiMatches) {
    if (!hits.includes(w)) hits.push(w);
  }
  return hits.length ? hits.slice(0, 5) : defaultTerms;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function buildUpstreamHeaders(parsed) {
  const host = String(parsed.hostname || '').toLowerCase();
  if (host.endsWith('wikimedia.org') || host.endsWith('wikipedia.org')) {
    return {
      'User-Agent': 'WorldWindowAtlas/3.3 (Open Cultural & Nature Reader; Node.js)',
      Accept: 'application/json, image/*, */*;q=0.8'
    };
  }
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,application/json,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  };
  if (host.includes('artic.edu')) {
    headers.Referer = 'https://www.artic.edu/';
  } else if (host.includes('clevelandart.org')) {
    headers.Referer = 'https://www.clevelandart.org/';
  }
  return headers;
}

function httpsGetBuffer(urlStr, timeoutMs = 7500, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      reject(e);
      return;
    }
    const req = https.get(
      parsed,
      {
        agent: KEEP_ALIVE_AGENT,
        headers: buildUpstreamHeaders(parsed),
        timeout: timeoutMs
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
          res.resume();
          const nextUrl = new URL(res.headers.location, parsed).toString();
          resolve(httpsGetBuffer(nextUrl, timeoutMs, redirectsLeft - 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > 32 * 1024 * 1024) {
            req.destroy(new Error('Response exceeds 32MB cap'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: res.headers['content-type'] || 'application/octet-stream'
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

async function fetchJsonHttps(urlStr, timeoutMs = 5500) {
  const { buffer } = await httpsGetBuffer(urlStr, timeoutMs, 4);
  return JSON.parse(buffer.toString('utf8'));
}

const PALETTES_BY_CHANNEL = {
  antiques: ['#7aa69f', '#eef6f4', '#d4be9e'],
  paintings: ['#7e9ec2', '#eef3f9', '#d8a69e'],
  landscapes: ['#6ea8b8', '#ecf5f8', '#9ec4b5'],
  cosmos: ['#7d79a8', '#f0eff8', '#c6a4cc'],
  quotes: ['#8da9a2', '#f3f6f4', '#d9b596'],
  stories: ['#9e89ad', '#f4f0f7', '#d6ae98']
};

// ==================== 博物馆文明/时代/国家分面配置 ====================
const MUSEUM_FACETS = {
  'china-ancient': {
    label: '商周秦汉 · 青铜古玉',
    channel: 'antiques',
    cmaTerms: ['Shang dynasty', 'Zhou dynasty bronze', 'Han dynasty', 'neolithic jade'],
    aicQuery: 'China Shang Zhou Han bronze jade',
    matchRe: /china|chinese|shang|zhou|han|qin|neolithic|hongshan|liangzhu/i,
    wikiTitle: '中国青铜器',
    relatedSeeds: ['中国青铜器', '商朝', '周朝礼制', '红山文化', '中国玉器']
  },
  'china-tang-song': {
    label: '唐宋风雅 · 书画秘色瓷',
    channel: 'antiques',
    cmaTerms: ['Song dynasty', 'Tang dynasty', 'Yuan dynasty', 'Longquan'],
    aicQuery: 'China Song Tang dynasty celadon qingbai sancai',
    matchRe: /china|chinese|song|tang|yuan|five dynasties|liao|jin dynasty|longquan|celadon|qingbai/i,
    wikiTitle: '宋朝艺术',
    relatedSeeds: ['宋朝艺术', '汝窑', '青白瓷', '龙泉窑', '院体画', '文人画']
  },
  'china-ming-qing': {
    label: '明清器物 · 青花珐琅山水',
    channel: 'antiques',
    cmaTerms: ['Ming dynasty', 'Qing dynasty porcelain', 'Kangxi', 'Qianlong'],
    aicQuery: 'China Ming Qing porcelain jade scroll',
    matchRe: /china|chinese|ming|qing|kangxi|qianlong|yongzheng|jingdezhen/i,
    wikiTitle: '青花瓷',
    relatedSeeds: ['青花瓷', '景德镇陶瓷', '景泰蓝', '吴门画派', '四王']
  },
  'egypt': {
    label: '古埃及 · 尼罗河黄金与釉陶',
    channel: 'antiques',
    cmaTerms: ['Egypt New Kingdom', 'Egypt Ptolemaic', 'Egypt faience', 'Egypt Middle Kingdom'],
    aicQuery: 'Ancient Egypt Egyptian pharaoh faience',
    matchRe: /egypt|egyptian|nile|nubia|ptolemaic|pharaoh|thebes|amun|horus/i,
    wikiTitle: '古埃及艺术',
    relatedSeeds: ['古埃及艺术', '亡灵书', '费昂斯', '阿玛纳风格', '古埃及宗教']
  },
  'mesopotamia-persia': {
    label: '两河与古波斯 · 琉璃与细密画',
    channel: 'antiques',
    cmaTerms: ['Iran Nishapur', 'Iran Safavid', 'Sasanian', 'Assyrian'],
    aicQuery: 'Iran Persian Shahnameh Nishapur Mesopotamia Islamic',
    matchRe: /iran|persia|persian|mesopotamia|assyria|babylon|sasanian|safavid|nishapur|kashan|islamic|syria|iraq/i,
    wikiTitle: '波斯细密画',
    relatedSeeds: ['波斯细密画', '列王纪', '阿契美尼德帝国', '美索不达米亚艺术', '伊斯兰陶瓷']
  },
  'greco-roman': {
    label: '古希腊罗马 · 大理石与虹彩玻璃',
    channel: 'antiques',
    cmaTerms: ['Greece Attic', 'Roman glass', 'Roman marble', 'Greek terracotta'],
    aicQuery: 'Ancient Greek Roman Attic amphora glass marble',
    matchRe: /greece|greek|attic|roman|rome|etruscan|hellenistic|mediterranean|cyprus|byzantine/i,
    wikiTitle: '古希腊艺术',
    relatedSeeds: ['古希腊艺术', '古希腊陶器', '古罗马玻璃', '希腊化时期', '庞贝壁画']
  },
  'japan-edo': {
    label: '日本 · 镰仓莳绘与江户浮世绘',
    channel: 'paintings',
    cmaTerms: ['Hokusai', 'Hiroshige', 'Edo period screen', 'Kamakura'],
    aicQuery: 'Japan Edo Hokusai Hiroshige Ukiyo-e woodblock',
    matchRe: /japan|japanese|edo|hokusai|hiroshige|ukiyo|kamakura|momoyama|meiji|kyoto/i,
    wikiTitle: '浮世绘',
    relatedSeeds: ['浮世绘', '葛饰北斋', '歌川广重', '琳派', '莳绘']
  },
  'south-asia': {
    label: '印度与喜马拉雅 · 石雕铜造像',
    channel: 'antiques',
    cmaTerms: ['India Chola', 'Gandhara', 'Tibet thangka', 'Mughal'],
    aicQuery: 'India Chola Gandhara Himalayan Tibet Nepal Mughal',
    matchRe: /india|indian|gandhara|chola|tibet|tibetan|nepal|himalaya|mughal|rajasthan|cambodia|khmer/i,
    wikiTitle: '犍陀罗艺术',
    relatedSeeds: ['犍陀罗艺术', '朱罗王朝', '唐卡', '莫卧儿绘画', '阿旃陀石窟']
  },
  'renaissance': {
    label: '欧洲文艺复兴 · 佛罗伦萨与威尼斯',
    channel: 'paintings',
    cmaTerms: ['Italy 15th century painting', 'Italy 16th century painting', 'Albrecht Durer', 'Venice 16th century'],
    aicQuery: 'Italian Renaissance Botticelli Titian Tintoretto Durer',
    matchRe: /italy|italian|florence|venice|siena|german|germany|netherlands|renaissance|botticelli|titian|durer|dürer|raphael|bellini/i,
    wikiTitle: '文艺复兴艺术',
    relatedSeeds: ['文艺复兴艺术', '佛罗伦萨画派', '威尼斯画派', '蛋彩画', '阿尔布雷希特·丢勒']
  },
  'baroque-dutch': {
    label: '巴洛克与荷兰黄金时代',
    channel: 'paintings',
    cmaTerms: ['Rembrandt', 'Dutch 17th century painting', 'Rubens', 'Caravaggio'],
    aicQuery: 'Dutch Rembrandt Rubens Hals Vermeer Ruisdael still life',
    matchRe: /dutch|netherlands|flanders|flemish|holland|rembrandt|rubens|caravaggio|baroque|spain|spanish|velazquez|italia/i,
    wikiTitle: '荷兰黄金时代绘画',
    relatedSeeds: ['荷兰黄金时代绘画', '伦勃朗', '扬·维米尔', '巴洛克艺术', '卡拉瓦乔']
  },
  'impressionism': {
    label: '印象派与现代光影',
    channel: 'paintings',
    cmaTerms: ['Claude Monet', 'Pierre-Auguste Renoir', 'Edgar Degas', 'Paul Cezanne', 'Vincent van Gogh'],
    aicQuery: 'Claude Monet Impressionism Van Gogh Seurat Renoir Degas Cezanne',
    matchRe: /france|french|monet|renoir|degas|cezanne|cézanne|gogh|seurat|pissarro|gauguin|manet|impressionis|post-impressionis/i,
    wikiTitle: '印象派',
    relatedSeeds: ['印象派', '克劳德·莫奈', '文森特·梵高', '新印象派', '保罗·塞尚']
  }
};

// ==================== Google Earth View (limhenry/earthview) 1,520 卫星 4K ====================
const COUNTRY_ZH = {
  'Iceland': '冰岛',
  'Chile': '智利',
  'Australia': '澳大利亚',
  'China': '中国',
  'United States': '美国',
  'Algeria': '阿尔及利亚',
  'Namibia': '纳米比亚',
  'Argentina': '阿根廷',
  'Bolivia': '玻利维亚',
  'Canada': '加拿大',
  'Norway': '挪威',
  'Greenland': '格陵兰',
  'Antarctica': '南极洲',
  'New Zealand': '新西兰',
  'Japan': '日本',
  'Spain': '西班牙',
  'Iran': '伊朗',
  'Madagascar': '马达加斯加',
  'Bahamas': '巴哈马',
  'The Bahamas': '巴哈马',
  'Peru': '秘鲁',
  'Brazil': '巴西',
  'Mexico': '墨西哥',
  'Mauritania': '毛里塔尼亚',
  'Libya': '利比亚',
  'Egypt': '埃及',
  'Saudi Arabia': '沙特阿拉伯',
  'Oman': '阿曼',
  'Indonesia': '印度尼西亚',
  'Russia': '俄罗斯',
  'Kazakhstan': '哈萨克斯坦',
  'France': '法国',
  'Italy': '意大利',
  'Greece': '希腊',
  'Turkey': '土耳其',
  'India': '印度',
  'Morocco': '摩洛哥',
  'Chad': '乍得',
  'Maldives': '马尔代夫',
  'French Polynesia': '法属波利尼西亚',
  'Cuba': '古巴',
  'Venezuela': '委内瑞拉',
  'Tanzania': '坦桑尼亚',
  'Kenya': '肯尼亚',
  'South Africa': '南非',
  'Mongolia': '蒙古'
};

let earthViewRamCache = null;
let earthViewLoadingPromise = null;

async function ensureEarthViewPool() {
  if (Array.isArray(earthViewRamCache) && earthViewRamCache.length) {
    return earthViewRamCache;
  }
  const disk = readJsonSafe(EARTHVIEW_JSON, null);
  if (Array.isArray(disk) && disk.length > 100) {
    earthViewRamCache = disk;
    return earthViewRamCache;
  }
  if (!earthViewLoadingPromise) {
    earthViewLoadingPromise = fetchJsonHttps('https://raw.githubusercontent.com/limhenry/earthview/master/earthview.json', 8500)
      .then((arr) => {
        if (Array.isArray(arr) && arr.length) {
          earthViewRamCache = arr;
          writeJsonSafe(EARTHVIEW_JSON, arr);
        }
        earthViewLoadingPromise = null;
        return earthViewRamCache || [];
      })
      .catch(() => {
        earthViewLoadingPromise = null;
        return [];
      });
  }
  return earthViewLoadingPromise;
}

function extractEarthViewId(row, fallbackIdx) {
  const m = String((row && row.image) || '').match(/\/(\d+)\.[a-z]+$/i);
  return m ? m[1] : String(fallbackIdx || Math.floor(Math.random() * 99999));
}

function sampleEarthViewItems(pool, count, filterRegex, excludeSet) {
  if (!Array.isArray(pool) || !pool.length) return [];
  let candidates = pool.filter((r, i) => r && r.image && !excludeSet.has(`ev-${extractEarthViewId(r, i)}`));
  if (filterRegex) {
    const filtered = candidates.filter((r) => filterRegex.test(`${r.country || ''} ${r.region || ''}`));
    if (filtered.length >= 3) candidates = filtered;
  }
  const picked = [];
  const usedIdx = new Set();
  const maxTries = Math.min(candidates.length * 2, 160);
  for (let t = 0; t < maxTries && picked.length < count; t++) {
    const idx = Math.floor(Math.random() * candidates.length);
    if (usedIdx.has(idx)) continue;
    usedIdx.add(idx);
    const r = candidates[idx];
    const evId = extractEarthViewId(r, idx);
    const countryEn = String(r.country || '').trim();
    const regionEn = String(r.region || '').trim();
    const countryZh = COUNTRY_ZH[countryEn] || countryEn || '地球秘境';
    const placeLabel = regionEn ? `${countryZh} · ${regionEn}` : countryZh;
    const wikiTarget = regionEn ? `${regionEn}, ${countryEn}` : (countryEn || '卫星影像');
    const enSub = [regionEn, countryEn].filter(Boolean).join(', ') || 'Earth Orbit';

    picked.push({
      id: `ev-${evId}`,
      channel: 'landscapes',
      kind: 'image',
      facet: 'earthview',
      title: placeLabel,
      enTitle: enSub,
      shortTitle: regionEn ? `${countryZh}<br>${regionEn.slice(0, 14)}` : countryZh,
      subtitle: `${enSub} · Google Earth View 4K`,
      thumbUrl: r.image,
      previewUrl: r.image,
      fullUrl: r.image,
      sourceUrl: r.map || `https://earthview.withgoogle.com/${evId}`,
      mapUrl: r.map || '',
      country: countryZh,
      wikiTitle: wikiTarget,
      relatedSeeds: [countryZh, regionEn, '板块构造', '地貌学'].filter(Boolean),
      story: '',
      meta: [countryZh, regionEn || 'Earth Orbit', 'Earth View 4K'].filter(Boolean),
      tags: ['轨道俯瞰', countryZh, regionEn].filter(Boolean),
      palette: PALETTES_BY_CHANNEL.landscapes
    });
  }
  return picked;
}

// ==================== Bing 全球地理遗产 3840×2160 4K UHD ====================
async function getBingUhdItems(excludeSet) {
  let cached = readJsonSafe(BING_UHD_JSON, null);
  const now = Date.now();
  if (!cached || !Array.isArray(cached.items) || !cached.ts || now - cached.ts > 6 * 3600 * 1000) {
    try {
      const [b0, b1] = await Promise.all([
        fetchJsonHttps('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN&uhd=1&uhdwidth=3840&uhdheight=2160', 5000).catch(() => ({ images: [] })),
        fetchJsonHttps('https://www.bing.com/HPImageArchive.aspx?format=js&idx=8&n=8&mkt=zh-CN&uhd=1&uhdwidth=3840&uhdheight=2160', 5000).catch(() => ({ images: [] }))
      ]);
      const rawImgs = [].concat((b0 && b0.images) || [], (b1 && b1.images) || []);
      const seenHsh = new Set();
      const built = [];
      for (const im of rawImgs) {
        if (!im || !im.url || seenHsh.has(im.hsh || im.urlbase)) continue;
        seenHsh.add(im.hsh || im.urlbase);
        const fullUrl = im.url.startsWith('http') ? im.url : `https://www.bing.com${im.url}`;
        const copyRaw = String(im.copyright || '').trim();
        const copyClean = copyRaw.replace(/\s*\(©.*?\)\s*$/, '').trim();
        const creditMatch = copyRaw.match(/\(©\s*([^)]+)\)/);
        const titleStr = String(im.title || copyClean || '全球自然地理 4K').trim();
        const guessPlace = copyClean.split(/[，,]/)[0] || titleStr;
        const previewBing = fullUrl.includes('UHD.jpg')
          ? fullUrl.replace('UHD.jpg', '1920x1080.jpg')
          : fullUrl;
        const copyLink = im.copyrightlink && im.copyrightlink.startsWith('http')
          ? im.copyrightlink
          : 'https://www.bing.com';

        built.push({
          id: `bing-${im.startdate || im.hsh}`,
          channel: 'landscapes',
          kind: 'image',
          facet: 'bing-uhd',
          title: titleStr,
          enTitle: creditMatch ? creditMatch[1].split('/')[0].trim() : guessPlace,
          subtitle: `${copyClean}${creditMatch ? ' · © ' + creditMatch[1] : ''}`,
          thumbUrl: previewBing,
          previewUrl: previewBing,
          fullUrl,
          sourceUrl: copyLink,
          wikiTitle: guessPlace,
          relatedSeeds: [guessPlace, '世界遗产', '国家公园'],
          story: copyClean && copyClean !== titleStr ? copyClean : '',
          meta: ['3840×2160 UHD', guessPlace.slice(0, 18)],
          tags: ['地理遗产', guessPlace.slice(0, 10)],
          palette: PALETTES_BY_CHANNEL.landscapes
        });
      }
      if (built.length) {
        cached = { ts: now, items: built };
        writeJsonSafe(BING_UHD_JSON, cached);
      }
    } catch (_) {}
  }
  const list = (cached && Array.isArray(cached.items)) ? cached.items : [];
  const unseen = list.filter((x) => !excludeSet.has(x.id));
  return (unseen.length ? unseen : list).sort(() => Math.random() - 0.5);
}

// ==================== 馆藏原名与出处纪年清理（绝不拼凑假分类词） ====================
const ORIGIN_ZH_RULES = [
  [/\bshang\b/i, '商代'],
  [/\bzhou\b/i, '周代'],
  [/\bhan\b/i, '汉代'],
  [/\btang\b/i, '唐代'],
  [/\bsong\b/i, '宋代'],
  [/\byuan\b/i, '元代'],
  [/\bming\b/i, '明代'],
  [/\bqing\b|\bkangxi\b|\bqianlong\b|\byongzheng\b/i, '清代'],
  [/\bchina\b|\bchinese\b/i, '中国'],
  [/\bedo\b|\bukiyo\b|\bhokusai\b|\bhiroshige\b/i, '江户日本'],
  [/\bjapan\b|\bjapanese\b|\bkamakura\b|\bkyoto\b/i, '日本'],
  [/\begypt\b|\begyptian\b|\bptolemaic\b|\bpharaoh\b/i, '古埃及'],
  [/\biran\b|\bpersia\b|\bpersian\b|\bsafavid\b|\bnishapur\b|\bsasanian\b/i, '波斯'],
  [/\bmesopotamia\b|\bassyria\b|\bbabylon\b/i, '两河流域'],
  [/\bgreece\b|\bgreek\b|\battic\b|\bhellenistic\b/i, '古希腊'],
  [/\broman\b|\brome\b|\betruscan\b|\bbyzantine\b/i, '古罗马'],
  [/\bfrance\b|\bfrench\b|\bparis\b/i, '法国'],
  [/\bitaly\b|\bitalian\b|\bflorence\b|\bvenice\b/i, '意大利'],
  [/\bdutch\b|\bnetherlands\b|\bflemish\b|\bflanders\b/i, '尼德兰'],
  [/\bgerman\b|\bgermany\b/i, '德国'],
  [/\bspain\b|\bspanish\b/i, '西班牙'],
  [/\bindia\b|\bindian\b|\bchola\b|\bgandhara\b|\bmughal\b/i, '古印度'],
  [/\btibet\b|\bhimalaya\b|\bnepal\b/i, '喜马拉雅'],
  [/\bengland\b|\bbritish\b|\blondon\b/i, '英国'],
  [/\bamerica\b|\bunited states\b/i, '美国']
];

const FAKE_PREFIX_RE = /^(?:博物奇珍|馆藏名作|地球秘境|深空观测|传世真迹|名窑古瓷|海天云影|睡莲水影|古雕造像|花果清供|宫廷器皿|典藏器物|传世画作)(?:\s*[·/]\s*(?:博物奇珍|馆藏名作|传世真迹|名窑古瓷|海天云影|睡莲水影|古雕造像|花果清供|宫廷器皿|典藏器物|传世画作|自然奇观|星云影像|春之景|仲夏光景|秋林晚照|冬雪霁色|海浪潮汐|雕花香炉|五管青瓷瓶|双鱼青瓷洗|浮雕石刻|吉金礼器|古玉清玩|虹彩琉璃|彩绘陶瓶|人物肖像|书画墨迹|版画屏风|泥金手抄页|金玉佩饰|冰川峡湾|极夜流光|深空星云|荒漠熔岩|山川幽谷))?\s*$/;

const BOILERPLATE_STORY_RE = /从距离地表数百公里的近地轨道垂直俯视|收录自每日全球自然地理与生态保护地|来自克利夫兰艺术博物馆\s*CC0\s*开放|收录于芝加哥艺术博物馆\s*Public\s*Domain|维基共享资源年度精选超清自然与纪实影像/;

function compactBubbleShortTitle(titleStr) {
  const s = String(titleStr || '').trim();
  if (!s) return '';
  if (/[\u4e00-\u9fa5]/.test(s)) {
    const parts = s.split(/[·—，,：:]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) return `${parts[0].slice(0, 7)}<br>${parts[1].slice(0, 8)}`;
    return s.length > 8 ? `${s.slice(0, 7)}<br>${s.slice(7, 14)}` : s;
  }
  const cleanEn = s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || s;
  const words = cleanEn.split(' ');
  if (words.length <= 2) return cleanEn.slice(0, 20);
  const line1 = words.slice(0, 2).join(' ');
  const rest = words.slice(2, 5).join(' ');
  return `${line1}<br>${rest.length > 18 ? rest.slice(0, 17) + '…' : rest}`;
}

function buildAuthenticOriginMeta(originHint, dateStr) {
  const probe = String(originHint || '').trim();
  let originZh = '';
  for (const [re, zh] of ORIGIN_ZH_RULES) {
    if (re.test(probe)) {
      originZh = zh;
      break;
    }
  }
  const rawOrigin = probe.split(/[·,;(]/)[0].trim().slice(0, 22);
  const era = String(dateStr || '').replace(/\s+/g, ' ').trim().slice(0, 22);
  return [originZh || rawOrigin, era].filter(Boolean).join(' · ');
}

function formatAuthenticTitle(rawTitle, originHint, dateHint) {
  const clean = String(rawTitle || '').replace(/\s+/g, ' ').trim() || 'Untitled';
  const originLine = buildAuthenticOriginMeta(originHint, dateHint);
  return {
    displayTitle: clean,
    subLabel: originLine,
    shortTitle: compactBubbleShortTitle(clean)
  };
}

function normalizeLiveItem(it) {
  if (!it || typeof it !== 'object') return it;
  const out = Object.assign({}, it);
  if (!out.previewUrl && out.thumbUrl) out.previewUrl = out.thumbUrl;
  if (!out.sourceUrl) {
    const idStr = String(out.id || '');
    if (idStr.startsWith('cma-live-')) out.sourceUrl = `https://www.clevelandart.org/art/${idStr.replace('cma-live-', '')}`;
    else if (idStr.startsWith('aic-live-')) out.sourceUrl = `https://www.artic.edu/artworks/${idStr.replace('aic-live-', '')}`;
    else if (idStr.startsWith('commons-')) out.sourceUrl = `https://commons.wikimedia.org/?curid=${idStr.replace('commons-', '')}`;
    else if (out.mapUrl) out.sourceUrl = out.mapUrl;
  }
  // 清除旧缓存里残留的模板伪分类标题与样板套话
  const curTitle = String(out.title || '').trim();
  if (FAKE_PREFIX_RE.test(curTitle) || /^(?:太空俯瞰)\s*·\s*/.test(curTitle)) {
    if (/^太空俯瞰\s*·\s*/.test(curTitle)) {
      out.title = curTitle.replace(/^太空俯瞰\s*·\s*/, '').trim();
    } else if (out.enTitle) {
      out.title = String(out.enTitle).replace(/…$/, '').trim();
      out.enTitle = buildAuthenticOriginMeta(out.civilization || (out.meta && out.meta[0]) || '', (out.meta && out.meta[1]) || '');
    }
  }
  out.shortTitle = compactBubbleShortTitle(out.title);
  if (out.story && BOILERPLATE_STORY_RE.test(out.story)) {
    out.story = '';
  }
  if (out.wikiTitle) {
    out.wikiTitle = String(out.wikiTitle)
      .replace(/^(?:attributed to|workshop of|studio of|circle of|follower of|school of|after|manner of|style of|imitator of|copy after|possibly by|probably by|possibly|probably)\s+/i, '')
      .trim();
  }
  if (!out.wikiFallback) {
    out.wikiFallback = (Array.isArray(out.relatedSeeds) && out.relatedSeeds[0]) || out.civilization || '';
  }
  return out;
}

// ==================== CMA 与芝加哥艺术博物馆 (AIC) 4K 抓取 ====================
const ATTRIBUTION_PREFIX_RE = /^(?:attributed to|workshop of|studio of|circle of|follower of|school of|after|manner of|style of|imitator of|copy after|possibly by|probably by|possibly|probably)\s+/i;

function inferArtworkWikiTopic(title, creator, culture, fallbackTopic) {
  const cleanCreator = String(creator || '')
    .split(/[(),;\r\n]/)[0]
    .replace(ATTRIBUTION_PREFIX_RE, '')
    .trim();
  if (
    cleanCreator &&
    cleanCreator.length >= 3 &&
    !/unknown|anonymous|unidentified|various|artist|maker|painter|potter|author/i.test(cleanCreator)
  ) {
    return cleanCreator;
  }
  if (fallbackTopic) return fallbackTopic;
  const cleanCulture = String(culture || '').split(',')[0].trim();
  return cleanCulture || String(title || '').slice(0, 28) || '艺术史';
}

async function fetchCmaChannel(channelId, terms, skipOffset, extraMeta) {
  const chosenTerm = Array.isArray(terms) && terms.length
    ? terms[Math.abs(skipOffset) % terms.length]
    : String(terms || '');
  const skip = extraMeta && extraMeta.matchRe ? Math.max(0, (skipOffset * 7) % 28) : Math.max(0, skipOffset % 48);
  const url = `https://openaccess-api.clevelandart.org/api/artworks/?has_image=1&cc0=1&limit=30&skip=${skip}&q=${encodeURIComponent(chosenTerm)}`;
  const json = await fetchJsonHttps(url, 6500);
  const rows = Array.isArray(json && json.data) ? json.data : [];
  const out = [];
  const matchRe = extraMeta && extraMeta.matchRe;

  for (const r of rows) {
    const web = r.images && r.images.web;
    const pr = r.images && r.images.print;
    if (!web || !web.url || !pr || !pr.url) continue;
    const w = Number(pr.width || web.width || 0);
    const h = Number(pr.height || web.height || 0);
    if (w > 0 && h > 0) {
      const ratio = w / h;
      if (ratio < 0.30 || ratio > 3.8 || Math.max(w, h) < 1400) continue;
    }
    const creator = Array.isArray(r.creators) && r.creators[0] ? r.creators[0].description : '';
    const dateStr = r.creation_date || '';
    const culture = Array.isArray(r.culture) ? r.culture.join(', ') : (r.culture || '');
    const titleClean = String(r.title || 'Untitled').trim();
    if (matchRe) {
      const probe = `${culture} ${creator} ${dateStr} ${r.department || ''} ${titleClean}`;
      if (!matchRe.test(probe)) continue;
    }
    const wallDesc = stripHtml(r.wall_description || r.description || '');
    const fbWiki = extraMeta && extraMeta.wikiTitle;
    const fmt = formatAuthenticTitle(titleClean, culture || creator, dateStr);

    out.push({
      id: `cma-live-${r.id}`,
      channel: channelId,
      kind: 'image',
      facet: (extraMeta && extraMeta.facet) || '',
      civilization: (extraMeta && extraMeta.label) || culture || '',
      title: fmt.displayTitle,
      enTitle: fmt.subLabel,
      shortTitle: fmt.shortTitle,
      subtitle: [creator || culture, dateStr, r.technique || '', w && h ? `${w}×${h}` : 'CMA CC0'].filter(Boolean).join(' · '),
      thumbUrl: web.url,
      previewUrl: web.url,
      fullUrl: pr.url,
      sourceUrl: r.url || `https://www.clevelandart.org/art/${r.accession_number || r.id}`,
      wikiTitle: inferArtworkWikiTopic(titleClean, creator, culture, fbWiki),
      wikiFallback: fbWiki || String(culture || '').split(',')[0].trim() || '艺术史',
      relatedSeeds: (extraMeta && extraMeta.relatedSeeds) || [fbWiki, culture, r.department].filter(Boolean),
      story: wallDesc ? wallDesc.slice(0, 440) : '',
      meta: [culture || (extraMeta && extraMeta.label) || 'Open Access', dateStr || r.type || '', 'Cleveland Museum of Art'].filter(Boolean).slice(0, 3),
      tags: [chosenTerm, culture].filter(Boolean).slice(0, 4),
      palette: PALETTES_BY_CHANNEL[channelId] || PALETTES_BY_CHANNEL.antiques
    });
  }
  return out;
}

async function fetchAicChannel(channelId, queryStr, pageNum, extraMeta) {
  const page = extraMeta && extraMeta.matchRe ? ((Math.abs(pageNum) % 4) + 1) : Math.max(1, (Math.abs(pageNum) % 6) + 1);
  const fields = 'id,title,image_id,artist_display,date_display,place_of_origin,medium_display,classification_title,style_title,description';
  const url =
    `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(queryStr)}` +
    `&query[term][is_public_domain]=true&limit=24&page=${page}&fields=${fields}`;
  const json = await fetchJsonHttps(url, 6500);
  const rows = Array.isArray(json && json.data) ? json.data : [];
  const out = [];
  const matchRe = extraMeta && extraMeta.matchRe;

  for (const r of rows) {
    if (!r || !r.image_id) continue;
    const artistLine = String(r.artist_display || '').replace(/\r?\n/g, ' · ').trim();
    const origin = String(r.place_of_origin || '').trim();
    const dateStr = String(r.date_display || '').trim();
    const titleClean = String(r.title || 'Untitled').trim();
    if (matchRe) {
      const probe = `${origin} ${r.style_title || ''} ${artistLine} ${dateStr} ${titleClean}`;
      if (!matchRe.test(probe)) continue;
    }
    const thumbUrl = `https://www.artic.edu/iiif/2/${r.image_id}/full/843,/0/default.jpg`;
    const fullUrl = `https://www.artic.edu/iiif/2/${r.image_id}/full/1686,/0/default.jpg`;
    const desc = stripHtml(r.description || '');
    const fbWiki = extraMeta && extraMeta.wikiTitle;
    const fmt = formatAuthenticTitle(titleClean, origin || artistLine.split('·')[0], dateStr);

    out.push({
      id: `aic-live-${r.id}`,
      channel: channelId,
      kind: 'image',
      facet: (extraMeta && extraMeta.facet) || '',
      civilization: (extraMeta && extraMeta.label) || origin || '',
      title: fmt.displayTitle,
      enTitle: fmt.subLabel,
      shortTitle: fmt.shortTitle,
      subtitle: [artistLine || origin, dateStr, r.medium_display || 'Art Institute of Chicago'].filter(Boolean).join(' · '),
      thumbUrl,
      previewUrl: thumbUrl,
      fullUrl,
      sourceUrl: `https://www.artic.edu/artworks/${r.id}`,
      wikiTitle: inferArtworkWikiTopic(titleClean, artistLine.split('·')[0], r.style_title || origin, fbWiki),
      wikiFallback: fbWiki || r.style_title || origin || '艺术史',
      relatedSeeds: (extraMeta && extraMeta.relatedSeeds) || [fbWiki, r.style_title, origin].filter(Boolean),
      story: desc ? desc.slice(0, 440) : '',
      meta: [origin || (extraMeta && extraMeta.label) || 'Public Domain', dateStr || r.style_title || '', 'Art Institute of Chicago'].filter(Boolean),
      tags: [origin, r.style_title, r.classification_title].filter(Boolean).slice(0, 4),
      palette: PALETTES_BY_CHANNEL[channelId] || PALETTES_BY_CHANNEL.paintings
    });
  }
  return out;
}

async function fetchCommonsFeatured(channelId, terms, offset, extraMeta) {
  // 对含空格的多词词组自动加双引号，避免 MediaWiki CirrusSearch 将空格拆作高优先级 AND 导致 0 命中
  const quotedTerms = (Array.isArray(terms) ? terms : [String(terms || '')])
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .map((t) => (/\s/.test(t) && !t.startsWith('"') ? `"${t}"` : t));
  const searchExpr = `incategory:"Featured_pictures_on_Wikimedia_Commons" (${quotedTerms.join(' OR ')})`;
  const off = Math.max(0, (Math.abs(offset) * 8) % 48);
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6` +
    `&gsrsearch=${encodeURIComponent(searchExpr)}&gsrlimit=28&gsroffset=${off}` +
    `&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=960&format=json`;

  const json = await fetchJsonHttps(url, 8200);
  const pages = (json && json.query && json.query.pages) ? Object.values(json.query.pages) : [];
  const out = [];

  for (const p of pages) {
    const ii = Array.isArray(p.imageinfo) ? p.imageinfo[0] : null;
    if (!ii || !ii.url) continue;
    const uLower = ii.url.toLowerCase();
    if (!uLower.endsWith('.jpg') && !uLower.endsWith('.jpeg') && !uLower.endsWith('.png')) continue;

    const w = Number(ii.width || 0);
    const h = Number(ii.height || 0);
    if (w < 1600 || h < 1000) continue;
    const ratio = w / h;
    if (ratio < 0.35 || ratio > 3.6) continue;

    const thumbUrl = ii.thumburl || ii.url;
    let fullUrl = ii.url;
    if (w > 4000 && ii.thumburl && ii.thumburl.includes('/960px-')) {
      fullUrl = ii.thumburl.replace('/960px-', '/2560px-');
    }

    const ext = ii.extmetadata || {};
    const rawTitle = stripHtml(
      (ext.ObjectName && ext.ObjectName.value) ||
      String(p.title || '').replace(/^File:/i, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' ')
    );
    const desc = stripHtml((ext.ImageDescription && ext.ImageDescription.value) || '');
    const artist = stripHtml((ext.Artist && ext.Artist.value) || '');
    const cleanTitle = rawTitle.length > 60 ? rawTitle.slice(0, 58) + '…' : rawTitle;
    const subLabel = [artist ? `© ${artist.slice(0, 26)}` : '', `${w}×${h}`].filter(Boolean).join(' · ');

    out.push({
      id: `commons-${p.pageid}`,
      channel: channelId,
      kind: 'image',
      facet: (extraMeta && extraMeta.facet) || '',
      title: cleanTitle || 'Featured Photograph',
      enTitle: (extraMeta && extraMeta.label) || subLabel,
      shortTitle: compactBubbleShortTitle(cleanTitle || 'Featured'),
      subtitle: [artist ? `摄影：${artist.slice(0, 32)}` : '', `${w}×${h}`, (extraMeta && extraMeta.label) || 'Wikimedia Featured'].filter(Boolean).join(' · '),
      thumbUrl,
      previewUrl: thumbUrl,
      fullUrl,
      sourceUrl: ii.descriptionurl || `https://commons.wikimedia.org/?curid=${p.pageid}`,
      wikiTitle: (extraMeta && extraMeta.wikiTitle) || cleanTitle.slice(0, 36),
      wikiFallback: (extraMeta && extraMeta.wikiTitle) || '自然地理学',
      relatedSeeds: (extraMeta && extraMeta.relatedSeeds) || quotedTerms.slice(0, 3).map((s) => s.replace(/"/g, '')),
      story: (desc && desc !== cleanTitle) ? desc.slice(0, 380) : '',
      meta: [(extraMeta && extraMeta.label) || 'Featured 4K', `${w}×${h}`],
      tags: quotedTerms.slice(0, 4).map((s) => s.replace(/"/g, '')),
      palette: PALETTES_BY_CHANNEL[channelId] || PALETTES_BY_CHANNEL.landscapes
    });
  }
  return out;
}

// ==================== 多维时空/地貌/纪实摄影随机漫游主引擎 (/api/explore) ====================
const LANDSCAPE_FACETS = {
  'natgeo-wildlife': {
    label: '生灵纪实 · 野生动物',
    terms: ['kingfisher', 'owl', 'fox', 'leopard', 'hummingbird', 'chameleon', 'whale', 'puffin', 'eagle'],
    evRegex: null,
    wikiTitle: '野生动物摄影',
    relatedSeeds: ['国家地理', '鸟类迁徙', '雪豹', '座头鲸', '翠鸟']
  },
  'macro-world': {
    label: '微距奇观 · 晶簇与昆虫',
    terms: ['macro', 'dragonfly', 'butterfly', 'snowflake', 'quartz crystal', 'mushroom', 'dewdrop', 'beetle'],
    evRegex: null,
    wikiTitle: '微距摄影',
    relatedSeeds: ['微距摄影', '雪花', '矿物晶体', '蜻蜓', '结构色']
  },
  'forest-mist': {
    label: '幽林飞瀑 · 雨林溪谷',
    terms: ['waterfall', 'forest', 'moss', 'redwood', 'Plitvice', 'bamboo', 'autumn trees'],
    evRegex: null,
    wikiTitle: '温带雨林',
    relatedSeeds: ['温带雨林', '屋久岛', '红杉国家公园', '十六湖国家公园', '瀑布']
  },
  'polar-fjord': {
    label: '极地流光 · 冰川峡湾',
    terms: ['aurora', 'iceberg', 'glacier', 'fjord', 'Svalbard', 'Antarctica'],
    evRegex: null,
    wikiTitle: '极光',
    relatedSeeds: ['极光', '冰川', '峡湾', '斯瓦尔巴', '瓦特纳冰原']
  },
  'alpine-lake': {
    label: '雪峰冰湖 · 高山秘境',
    terms: ['Dolomites', 'Matterhorn', 'Patagonia', 'Himalayas', 'alpine lake', 'glacier lake'],
    evRegex: null,
    wikiTitle: '多洛米蒂山',
    relatedSeeds: ['多洛米蒂山', '巴塔哥尼亚', '喜马拉雅山脉', '冰斗湖', '阿尔卑斯山']
  },
  'ocean-reef': {
    label: '深海环礁 · 海岸崖壁',
    terms: ['coral reef', 'lagoon', 'sea arch', 'cliffs', 'jellyfish', 'wave', 'coastline'],
    evRegex: null,
    wikiTitle: '珊瑚礁',
    relatedSeeds: ['珊瑚礁', '环礁', '大堡礁', '水母', '海蚀柱']
  },
  'desert-volcano': {
    label: '天象熔岩 · 荒漠盐沼',
    terms: ['volcano', 'lava', 'lightning', 'supercell', 'sand dunes', 'Namib', 'Atacama', 'canyon'],
    evRegex: null,
    wikiTitle: '火山',
    relatedSeeds: ['火山', '超级单体风暴', '纳米布沙漠', '阿塔卡马沙漠', '乌尤尼盐沼']
  },
  'deep-cosmos': {
    label: '深空星云 · 宇宙观测',
    terms: ['nebula', 'Hubble', 'James Webb', 'ESO', 'galaxy', 'Milky Way', 'supernova'],
    evRegex: null,
    channel: 'cosmos',
    wikiTitle: '星云',
    relatedSeeds: ['星云', '詹姆斯·韦伯空间望远镜', '船底座星云', '创生之柱', '银河系']
  }
};

async function exploreFacetItems(domain, facetKey, excludeSet, pageNum = 0) {
  const pageSeed = Number.isFinite(Number(pageNum)) ? Math.max(0, Math.floor(Number(pageNum))) : 0;
  const randOffset = Math.floor(Math.random() * 24) + pageSeed * 3;

  if (domain === 'museum') {
    const keys = Object.keys(MUSEUM_FACETS);
    const chosenKeys = (!facetKey || facetKey === 'all' || !MUSEUM_FACETS[facetKey])
      ? keys.sort(() => Math.random() - 0.5).slice(0, 3)
      : [facetKey];

    const tasks = [];
    for (const k of chosenKeys) {
      const cfg = MUSEUM_FACETS[k];
      const meta = Object.assign({ facet: k }, cfg);
      tasks.push(fetchCmaChannel(cfg.channel, cfg.cmaTerms, randOffset, meta).catch(() => []));
      if (chosenKeys.length === 1 && Array.isArray(cfg.cmaTerms) && cfg.cmaTerms.length > 1) {
        tasks.push(fetchCmaChannel(cfg.channel, cfg.cmaTerms, randOffset + 1, meta).catch(() => []));
      }
      tasks.push(fetchAicChannel(cfg.channel, cfg.aicQuery, randOffset, meta).catch(() => []));
    }
    const batches = await Promise.all(tasks);
    const merged = [];
    const seenLocal = new Set();
    for (const b of batches) {
      for (const it of b) {
        if (it && it.id && !seenLocal.has(it.id)) {
          seenLocal.add(it.id);
          merged.push(normalizeLiveItem(it));
        }
      }
    }
    const fresh = merged.filter((x) => !excludeSet.has(x.id));
    return (fresh.length >= 6 ? fresh : merged).sort(() => Math.random() - 0.5).slice(0, 24);
  }

  // domain === 'landscape'
  if (facetKey === 'earthview') {
    const evPool = await ensureEarthViewPool();
    return sampleEarthViewItems(evPool, 24, null, excludeSet);
  }

  if (facetKey === 'bing-uhd') {
    const bingItems = await getBingUhdItems(excludeSet);
    const evPool = await ensureEarthViewPool();
    const extraEv = sampleEarthViewItems(evPool, Math.max(8, 24 - bingItems.length), null, excludeSet);
    return bingItems.concat(extraEv).slice(0, 24);
  }

  if (!facetKey || facetKey === 'all' || !LANDSCAPE_FACETS[facetKey]) {
    const [evPool, bingItems, wildItems, macroItems] = await Promise.all([
      ensureEarthViewPool(),
      getBingUhdItems(excludeSet).catch(() => []),
      fetchCommonsFeatured('landscapes', ['kingfisher', 'fox', 'owl', 'waterfall', 'aurora'], randOffset, {
        facet: 'all',
        label: '自然地理与生灵',
        wikiTitle: '国家地理'
      }).catch(() => []),
      fetchCommonsFeatured('landscapes', ['macro', 'butterfly', 'snowflake', 'Dolomites'], randOffset + 1, {
        facet: 'all',
        label: '微距与奇观',
        wikiTitle: '微距摄影'
      }).catch(() => [])
    ]);
    const evSample = sampleEarthViewItems(evPool, 5, null, excludeSet);
    const combined = [].concat(wildItems.slice(0, 8), macroItems.slice(0, 6), bingItems.slice(0, 6), evSample).map(normalizeLiveItem);
    const fresh = combined.filter((x) => !excludeSet.has(x.id));
    return (fresh.length >= 6 ? fresh : combined).sort(() => Math.random() - 0.5).slice(0, 24);
  }

  const lCfg = LANDSCAPE_FACETS[facetKey];
  const chId = lCfg.channel || 'landscapes';
  const tasks = [
    fetchCommonsFeatured(chId, lCfg.terms, randOffset, Object.assign({ facet: facetKey }, lCfg)).catch(() => []),
    fetchCommonsFeatured(chId, lCfg.terms, randOffset + 2, Object.assign({ facet: facetKey }, lCfg)).catch(() => [])
  ];
  if (lCfg.evRegex) {
    tasks.push(ensureEarthViewPool().then((pool) => sampleEarthViewItems(pool, 6, lCfg.evRegex, excludeSet)).catch(() => []));
  }
  const resBatches = await Promise.all(tasks);
  const dedup = new Map();
  for (const batch of resBatches) {
    for (const rawIt of batch) {
      const it = normalizeLiveItem(rawIt);
      if (it && it.id && !dedup.has(it.id)) dedup.set(it.id, it);
    }
  }
  const all = Array.from(dedup.values());
  const fresh = all.filter((x) => !excludeSet.has(x.id));
  return (fresh.length >= 6 ? fresh : all).sort(() => Math.random() - 0.5).slice(0, 24);
}

// ==================== 维基百科多章节深度词条与语义关联 (/api/wiki) ====================
const WIKI_SKIP_HEADINGS = new Set([
  '参见', '參見', '参考文献', '參考文獻', '参考资料', '參考資料',
  '注释', '註釋', '脚注', '腳註', '外部链接', '外部連結', '延伸阅读', '延伸閲讀',
  'See also', 'References', 'Notes', 'External links', 'Further reading', 'Sources', 'Citations'
]);

function parseWikiPlainExtract(extractText) {
  const raw = String(extractText || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return { summary: [], sections: [] };

  const lines = raw.split('\n');
  const summary = [];
  const sections = [];
  let curSec = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(={2,4})\s*(.+?)\s*\1$/);
    if (m) {
      const level = m[1].length;
      const heading = m[2].trim();
      if (WIKI_SKIP_HEADINGS.has(heading)) {
        curSec = { skip: true };
        continue;
      }
      curSec = { heading, level, paragraphs: [] };
      sections.push(curSec);
    } else {
      if (curSec && curSec.skip) continue;
      if (!curSec) {
        summary.push(line);
      } else {
        curSec.paragraphs.push(line);
      }
    }
  }

  const cleanSections = sections.filter((s) => s.paragraphs && s.paragraphs.length > 0);
  return { summary, sections: cleanSections };
}

function isUsefulWikiTopicTitle(title, selfTitle) {
  const t = String(title || '').trim();
  if (!t || t === selfTitle) return false;
  if (t.length < 2 || t.length > 34) return false;
  if (/^\d+\s*(年|世纪|年代|月|日)?$/.test(t)) return false;
  if (/^(前?\d+年|ISBN|ISSN|OCLC|维基|維基|Help:|Category:|Portal:|List of)/i.test(t)) return false;
  return true;
}

const WIKI_EN_STOPWORDS = new Set([
  'of', 'in', 'on', 'at', 'to', 'by', 'an', 'as', 'or', 'the', 'and', 'with', 'from', 'for', 'into', 'over', 'near'
]);
const WIKI_GENERIC_SINGLE_TOKENS = new Set([
  'bowl', 'dish', 'plate', 'cup', 'jar', 'vase', 'bottle', 'box', 'fragment', 'untitled',
  'portrait', 'landscape', 'painting', 'figure', 'seated', 'standing', 'scroll', 'leaf', 'album',
  'china', 'japan', 'france', 'italy', 'india', 'mount', 'mountain', 'river', 'lake', 'forest', 'island'
]);

function stripLatinDiacritics(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isTitleRelevantHit(queryTitle, candidateTitle) {
  const qNorm = stripLatinDiacritics(queryTitle).toLowerCase().replace(/\([^)]*\)/g, ' ').trim();
  const cBase = stripLatinDiacritics(candidateTitle).replace(/\([^)]*\)/g, ' ').trim();
  const cNorm = cBase.toLowerCase();
  if (!qNorm || !cNorm) return false;
  if (/disambiguation|消歧义|消歧義|同义词|^list of |列表$/i.test(candidateTitle)) return false;
  if (qNorm === cNorm) return true;

  const hasCjk = /[\u4e00-\u9fff]/.test(qNorm) || /[\u4e00-\u9fff]/.test(cNorm);
  if (hasCjk) {
    const qCjk = qNorm.replace(/[^\u4e00-\u9fff]/g, '');
    const cCjk = cNorm.replace(/[^\u4e00-\u9fff]/g, '');
    // 严禁把纯英文/拉丁检索词（如 "Song Xu"）误匹配到仅在参考文献中带英文姓氏的中文词条（如「伪钟虫属」）
    if (!qCjk || !cCjk) return false;
    if (qCjk.includes(cCjk) && cCjk.length >= 2) return true;
    if (cCjk.includes(qCjk) && qCjk.length >= 2) return true;
    return false;
  }

  const qWords = qNorm.split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !WIKI_EN_STOPWORDS.has(w));
  const cWords = cNorm.split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !WIKI_EN_STOPWORDS.has(w));
  if (!qWords.length || !cWords.length) return false;

  const qSet = new Set(qWords);
  const cSet = new Set(cWords);
  const overlap = qWords.filter((w) => cSet.has(w));
  const required = Math.min(2, qWords.length);
  if (overlap.length >= required) {
    if (overlap.length === 1 && WIKI_GENERIC_SINGLE_TOKENS.has(overlap[0]) && cWords.length > 1) return false;
    return true;
  }
  // 允许长标题照片（如 "Common kingfisher in flight"）命中完整被包含的百科词条（如 "Common kingfisher"）
  if (cWords.length >= 1 && cBase.length >= 5 && cWords.every((w) => qSet.has(w))) {
    if (cWords.length === 1 && WIKI_GENERIC_SINGLE_TOKENS.has(cWords[0])) return false;
    return true;
  }
  return false;
}

async function queryWikiHost(hostLang, queryTitle, opts) {
  const options = opts || {};
  const wantZhLink = Boolean(options.wantZhLink && hostLang === 'en');
  const exactOnly = Boolean(options.exactOnly);
  const baseApi = `https://${hostLang}.wikipedia.org/w/api.php`;
  const variantParam = hostLang === 'zh' ? '&variant=zh-cn' : '';
  const langlinkProp = wantZhLink ? '|langlinks' : '';
  const langlinkParam = wantZhLink ? '&lllang=zh&lllimit=5' : '';

  const fetchByExactTitle = async (exactTitle) => {
    const url =
      `${baseApi}?action=query&format=json&redirects=1${variantParam}` +
      `&prop=extracts|pageimages|links|info|pageprops${langlinkProp}&ppprop=disambiguation${langlinkParam}` +
      `&inprop=url&explaintext=1&exsectionformat=wiki` +
      `&piprop=thumbnail|original&pithumbsize=1280&plnamespace=0&pllimit=36&titles=${encodeURIComponent(exactTitle)}`;
    const json = await fetchJsonHttps(url, 6200);
    const pages = (json && json.query && json.query.pages) ? Object.values(json.query.pages) : [];
    const p = pages[0];
    if (!p || p.missing != null || (p.pageprops && 'disambiguation' in p.pageprops)) {
      return null;
    }
    const extText = String(p.extract || '').trim();
    if (extText.length < 55) return null;
    if (!options.allowTaxonomy && extText.length < 420 && /是.{0,22}(?:科|目|纲|门)的一?(?:属|种)/.test(extText)) {
      return null;
    }
    return p;
  };

  let page = await fetchByExactTitle(queryTitle).catch(() => null);
  if (!page && !exactOnly) {
    // 1. 仅按标题词匹配 intitle:，并做相关性复核（绝不把参考文献正文撞词当成命中）
    const intitleUrl =
      `${baseApi}?action=query&format=json${variantParam}&list=search` +
      `&srsearch=${encodeURIComponent('intitle:' + queryTitle)}&srlimit=5`;
    const sJson = await fetchJsonHttps(intitleUrl, 5200).catch(() => null);
    const hits = (sJson && sJson.query && sJson.query.search) || [];
    for (const hit of hits) {
      if (hit && hit.title && isTitleRelevantHit(queryTitle, hit.title)) {
        page = await fetchByExactTitle(hit.title).catch(() => null);
        if (page) break;
      }
    }
    // 2. 长短语（>=3 词，如摄影描述标题）尝试常规检索，但依然必须通过标题相关性校验
    if (!page && String(queryTitle).trim().split(/\s+/).length >= 3) {
      const phraseUrl =
        `${baseApi}?action=query&format=json${variantParam}&list=search` +
        `&srsearch=${encodeURIComponent(queryTitle)}&srlimit=5`;
      const pJson = await fetchJsonHttps(phraseUrl, 5200).catch(() => null);
      const pHits = (pJson && pJson.query && pJson.query.search) || [];
      for (const hit of pHits) {
        if (hit && hit.title && isTitleRelevantHit(queryTitle, hit.title)) {
          page = await fetchByExactTitle(hit.title).catch(() => null);
          if (page) break;
        }
      }
    }
  }
  if (!page) return null;

  const resolvedTitle = page.title;
  const morelikeUrl =
    `${baseApi}?action=query&format=json${variantParam}&list=search` +
    `&srsearch=${encodeURIComponent('morelike:' + resolvedTitle)}&srlimit=10`;
  const mlJson = await fetchJsonHttps(morelikeUrl, 4500).catch(() => null);
  const mlHits = ((mlJson && mlJson.query && mlJson.query.search) || []).map((h) => h.title);
  const internalLinks = ((page && page.links) || []).map((l) => l.title);

  const relatedTopics = [];
  const seenRel = new Set();
  for (const cand of [].concat(mlHits, internalLinks)) {
    if (isUsefulWikiTopicTitle(cand, resolvedTitle) && !seenRel.has(cand)) {
      seenRel.add(cand);
      relatedTopics.push(cand);
      if (relatedTopics.length >= 14) break;
    }
  }

  const zhLanglink = (wantZhLink && Array.isArray(page.langlinks) && page.langlinks[0] && page.langlinks[0]['*'])
    ? String(page.langlinks[0]['*']).trim()
    : '';
  const parsed = parseWikiPlainExtract(page.extract);
  return {
    ok: true,
    lang: hostLang,
    title: resolvedTitle,
    zhLanglink,
    pageUrl: page.fullurl || `https://${hostLang}.wikipedia.org/wiki/${encodeURIComponent(resolvedTitle)}`,
    thumbnail: (page.thumbnail && page.thumbnail.source) || '',
    originalImage: (page.original && page.original.source) || (page.thumbnail && page.thumbnail.source) || '',
    summary: parsed.summary,
    sections: parsed.sections,
    relatedTopics
  };
}

async function searchWikiSuggestions(rawQuery) {
  const q = String(rawQuery || '').trim();
  if (!q) return { ok: true, items: [] };

  const queryOneLang = async (hostLang, limit) => {
    const variantParam = hostLang === 'zh' ? '&variant=zh-cn' : '';
    const url =
      `https://${hostLang}.wikipedia.org/w/api.php?action=query&format=json${variantParam}` +
      `&generator=prefixsearch&gpssearch=${encodeURIComponent(q)}&gpslimit=${limit}` +
      `&prop=pageimages|description|extracts&exintro=1&explaintext=1&exchars=90&pithumbsize=240`;
    const json = await fetchJsonHttps(url, 4800).catch(() => null);
    const pages = (json && json.query && json.query.pages) ? Object.values(json.query.pages) : [];
    pages.sort((a, b) => (a.index || 99) - (b.index || 99));
    return pages.map((p) => ({
      title: p.title,
      lang: hostLang,
      snippet: stripHtml(p.description || p.extract || '').slice(0, 72),
      thumb: (p.thumbnail && p.thumbnail.source) || ''
    }));
  };

  const preferEn = /^[A-Za-z0-9\s\-_.,'()]+$/.test(q);
  const [zhList, enList] = await Promise.all([
    queryOneLang('zh', preferEn ? 5 : 7),
    queryOneLang('en', preferEn ? 7 : 4)
  ]);

  const merged = preferEn ? enList.concat(zhList) : zhList.concat(enList);
  const seen = new Set();
  const out = [];
  for (const it of merged) {
    const key = `${it.lang}:${String(it.title || '').toLowerCase()}`;
    if (!it.title || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= 9) break;
  }
  return { ok: true, query: q, items: out };
}

async function getWikiDossier(rawTitle, preferredLang, rawFallback) {
  const cleanTitle = String(rawTitle || '').trim();
  const cleanFallback = String(rawFallback || '').trim();
  if (!cleanTitle) return { ok: false, error: 'Missing title' };

  const lang = preferredLang === 'en' ? 'en' : 'zh';
  const cacheKey = crypto
    .createHash('sha1')
    .update(`v2:${lang}:${cleanTitle.toLowerCase()}|fb:${cleanFallback.toLowerCase()}`)
    .digest('hex');
  const cacheFile = path.join(WIKI_CACHE_DIR, `${cacheKey}.json`);

  const cached = readJsonSafe(cacheFile, null);
  if (cached && cached.ok && cached.cachedAt && Date.now() - cached.cachedAt < 14 * 86400 * 1000) {
    return cached;
  }

  const isLatinQuery =
    !/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(cleanTitle) &&
    /[A-Za-z\u00C0-\u024F]/.test(cleanTitle);
  const allowTaxonomy = /微距|野生|动物|昆虫|鸟|植物|珊瑚|物种|biology|macro|wildlife|species/i.test(`${cleanTitle} ${cleanFallback}`);
  let result = null;

  if (isLatinQuery) {
    // 英文/欧洲变音/拼音检索词（如 "Song Xu"、"Urban Hörle"、"Celadon"）先走英文维基精确/标题匹配，经跨语言链接跳中文，杜绝中文全文撞参考文献
    const enRes = await queryWikiHost('en', cleanTitle, { wantZhLink: lang === 'zh', allowTaxonomy });
    if (enRes) {
      // 仅在英文维基存在官方同实体 Wikidata 跨语言链接（zhLanglink）时跳中文，防止同名古人串台（如画家宋旭 1525 vs 进士宋旭 1429）
      if (lang === 'zh' && enRes.zhLanglink) {
        const zhExact = await queryWikiHost('zh', enRes.zhLanglink, { exactOnly: true, allowTaxonomy });
        if (zhExact) result = zhExact;
      }
      if (!result) result = enRes;
    } else if (lang === 'zh') {
      result = await queryWikiHost('zh', cleanTitle, { exactOnly: true, allowTaxonomy });
    }
  } else {
    result = await queryWikiHost(lang, cleanTitle, { allowTaxonomy });
    if (!result && lang === 'zh') {
      result = await queryWikiHost('en', cleanTitle, { allowTaxonomy });
    }
  }

  // 若具体画作标题/生僻工匠无同名百科条目（如 "Mt. Daochang"、"P. Herbier"），平滑回退至专题或器物时代/窑口/门类词条
  if (!result && cleanFallback && cleanFallback.toLowerCase() !== cleanTitle.toLowerCase()) {
    const fbRes = await getWikiDossier(cleanFallback, preferredLang, '');
    if (fbRes && fbRes.ok) {
      result = Object.assign({}, fbRes, { fallbackFrom: cleanTitle });
    }
  }

  if (!result) {
    return { ok: false, error: '未检索到对应维基词条', title: cleanTitle };
  }

  result.cachedAt = Date.now();
  writeJsonSafe(cacheFile, result);
  return result;
}

// ==================== 只读 LWA 收藏库语义关联匹配 (/api/lwa-related) ====================
let lwaCacheState = { mtimeMs: 0, items: [] };

function loadLwaCatalogReadOnly() {
  try {
    if (!fs.existsSync(LWA_CATALOG_JSON)) return [];
    const st = fs.statSync(LWA_CATALOG_JSON);
    if (lwaCacheState.mtimeMs === st.mtimeMs && lwaCacheState.items.length) {
      return lwaCacheState.items;
    }
    const raw = JSON.parse(fs.readFileSync(LWA_CATALOG_JSON, 'utf8'));
    const list = Array.isArray(raw && raw.items) ? raw.items : [];
    lwaCacheState = { mtimeMs: st.mtimeMs, items: list };
    return list;
  } catch (_) {
    return [];
  }
}

const LWA_STOPWORDS = new Set([
  '的', '与', '和', '及', '或', '在', '了', '是', '有', '百年', '世纪', '时代', '时期',
  '馆藏', '开放', '精选', '原片', '高清', '超清', '世界之窗', '漫游', '切片', '故事',
  '4k', 'cc0', 'uhd', 'the', 'and', 'for', 'with', 'from', 'art', 'museum', 'untitled'
]);

function tokenizeSearchQuery(qStr) {
  const raw = String(qStr || '').toLowerCase();
  const parts = raw
    .split(/[\s,，。·・/\\|;；:：()（）《》「」『』"']+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !LWA_STOPWORDS.has(s));

  const tokens = [];
  const seen = new Set();
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      tokens.push(p);
    }
    // 对偏长中文短语拆出核心双字/三字词根提高召回
    if (/^[\u4e00-\u9fa5]{4,8}$/.test(p)) {
      const sub2a = p.slice(0, 2);
      const sub2b = p.slice(-2);
      for (const sub of [sub2a, sub2b]) {
        if (!LWA_STOPWORDS.has(sub) && !seen.has(sub)) {
          seen.add(sub);
          tokens.push(sub);
        }
      }
    }
  }
  return tokens.slice(0, 10);
}

function makeObsidianOpenUrl(vaultRelFile) {
  if (!LWA_VAULT_ID) return '';
  const cleanFile = String(vaultRelFile || '').replace(/\.md$/i, '');
  return `obsidian://open?vault=${encodeURIComponent(LWA_VAULT_ID)}&file=${encodeURIComponent(cleanFile)}`;
}

function searchLwaRelated(queryStr, limit = 6) {
  const items = loadLwaCatalogReadOnly();
  const catalogUrl = makeObsidianOpenUrl('📘【小红书收藏目录】');
  const askUrl = makeObsidianOpenUrl('❔️  收藏搜索');

  if (!items.length) {
    return { ok: true, available: false, items: [], catalogUrl, askUrl };
  }

  const tokens = tokenizeSearchQuery(queryStr);
  if (!tokens.length) {
    return { ok: true, available: true, totalVaultCount: items.length, items: [], catalogUrl, askUrl };
  }

  const scored = [];
  for (const it of items) {
    if (!it || !it.title) continue;
    const titleL = String(it.title || '').toLowerCase();
    const sumL = String(it.summary || '').toLowerCase();
    const tagsL = [].concat(it.tags || [], it.hashtags || [], it.topics || []).join(' ').toLowerCase();
    const catsL = [].concat(it.cats || [], it.author ? [it.author] : []).join(' ').toLowerCase();

    let score = 0;
    let matchedTokens = 0;
    for (const tk of tokens) {
      let hit = false;
      const weightBoost = tk.length >= 3 ? 1.35 : 1.0;
      if (titleL.includes(tk)) { score += 5.0 * weightBoost; hit = true; }
      if (tagsL.includes(tk)) { score += 4.0 * weightBoost; hit = true; }
      if (catsL.includes(tk)) { score += 2.2 * weightBoost; hit = true; }
      if (sumL.includes(tk)) { score += 1.6 * weightBoost; hit = true; }
      if (hit) matchedTokens++;
    }

    if (score >= 3.2 || matchedTokens >= 2) {
      if (it.starred) score += 0.8;
      scored.push({ score, it });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit).map(({ it }) => ({
    id: it.id,
    title: it.title,
    summary: String(it.summary || '').slice(0, 140),
    author: it.author || '',
    source: it.source || '',
    starred: Boolean(it.starred),
    cats: (it.cats || []).slice(0, 2),
    tags: (it.tags || []).slice(0, 4),
    obsidianUrl: it.note ? makeObsidianOpenUrl(it.note) : catalogUrl,
    sourceUrl: it.url || ''
  }));

  return {
    ok: true,
    available: true,
    totalVaultCount: items.length,
    items: top,
    catalogUrl,
    askUrl
  };
}

// ==================== 常规首页换一窗候选池刷新 ====================
async function refreshLivePool(prefs, seenMap) {
  const chMap = {};
  (prefs.channels || []).forEach((c) => { chMap[c.id] = c; });
  const note = prefs.freeformNote || '';
  const randSeed = Math.floor(Math.random() * 35);

  const tasks = [];
  const antTerms = extractEnglishTerms((chMap.antiques && chMap.antiques.query) + ' ' + note, ['celadon', 'iridescent glass', 'jade', 'porcelain']);
  const artTerms = extractEnglishTerms((chMap.paintings && chMap.paintings.query) + ' ' + note, ['Monet', 'Impressionism', 'Hokusai', 'watercolor']);
  const landTerms = extractEnglishTerms((chMap.landscapes && chMap.landscapes.query) + ' ' + note, ['glacier', 'aurora borealis', 'fjord', 'alpine lake']);
  const cosTerms = extractEnglishTerms((chMap.cosmos && chMap.cosmos.query) + ' ' + note, ['nebula Hubble', 'spiral galaxy', 'mineral crystal']);

  if (!chMap.antiques || Number(chMap.antiques.weight) > 0) {
    tasks.push(fetchCmaChannel('antiques', antTerms, randSeed).catch(() => []));
  }
  if (!chMap.paintings || Number(chMap.paintings.weight) > 0) {
    tasks.push(fetchCmaChannel('paintings', artTerms, randSeed).catch(() => []));
    tasks.push(fetchAicChannel('paintings', artTerms.join(' '), randSeed).catch(() => []));
  }
  if (!chMap.landscapes || Number(chMap.landscapes.weight) > 0) {
    tasks.push(fetchCommonsFeatured('landscapes', landTerms, randSeed).catch(() => []));
    tasks.push(ensureEarthViewPool().then((pool) => sampleEarthViewItems(pool, 6, null, new Set(Object.keys(seenMap || {})))).catch(() => []));
  }
  if (!chMap.cosmos || Number(chMap.cosmos.weight) > 0) {
    tasks.push(fetchCommonsFeatured('cosmos', cosTerms, randSeed).catch(() => []));
  }

  const results = await Promise.all(tasks);
  const existing = readJsonSafe(LIVE_POOL_JSON, []);
  const byId = new Map();

  for (const batch of results) {
    for (const it of batch) {
      if (it && it.id && !byId.has(it.id)) byId.set(it.id, it);
    }
  }
  for (const old of (Array.isArray(existing) ? existing : [])) {
    if (old && old.id && !byId.has(old.id)) byId.set(old.id, old);
  }

  const merged = Array.from(byId.values())
    .sort((a, b) => ((seenMap[a.id] ? 1 : 0) - (seenMap[b.id] ? 1 : 0)))
    .slice(0, 220);

  writeJsonSafe(LIVE_POOL_JSON, merged);
  return merged;
}

// ==================== 图片本地磁盘缓存代理 ====================
async function handleImageProxy(req, res, queryUrl) {
  if (!queryUrl) {
    res.writeHead(400, buildCorsHeaders(req, { 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Missing ?u= parameter');
    return;
  }
  let parsed;
  try {
    parsed = new URL(queryUrl);
  } catch (_) {
    res.writeHead(400, buildCorsHeaders(req, { 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Invalid URL');
    return;
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_IMG_HOSTS.has(parsed.hostname)) {
    res.writeHead(403, buildCorsHeaders(req, { 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Host not in allowlist: ' + parsed.hostname);
    return;
  }

  const hash = crypto.createHash('sha1').update(queryUrl).digest('hex');
  const binPath = path.join(IMG_CACHE_DIR, hash + '.bin');
  const metaPath = path.join(IMG_CACHE_DIR, hash + '.json');

  if (fs.existsSync(binPath) && fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const buf = fs.readFileSync(binPath);
      res.writeHead(200, buildCorsHeaders(req, {
        'Content-Type': meta.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, immutable'
      }));
      res.end(buf);
      return;
    } catch (_) {}
  }

  try {
    const { buffer, contentType } = await httpsGetBuffer(queryUrl, 11000, 4);
    if (!String(contentType).startsWith('image/')) {
      res.writeHead(502, buildCorsHeaders(req, { 'Content-Type': 'text/plain; charset=utf-8' }));
      res.end('Upstream did not return an image');
      return;
    }
    fs.writeFile(binPath, buffer, () => {});
    fs.writeFile(metaPath, JSON.stringify({ url: queryUrl, contentType, cachedAt: Date.now() }), () => {});
    res.writeHead(200, buildCorsHeaders(req, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=604800, immutable'
    }));
    res.end(buffer);
  } catch (err) {
    res.writeHead(502, buildCorsHeaders(req, { 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Image proxy error: ' + err.message);
  }
}

// ==================== 私藏画匣 (Favorites) 与 Fable 专题特辑 (Curated Pages) ====================
function readFavoritesList() {
  const raw = readJsonSafe(FAVORITES_JSON, { updatedAt: null, items: [] });
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw && raw.items) ? raw.items : []);
  return list.map(normalizeLiveItem);
}

function saveFavoritesList(list) {
  writeJsonSafe(FAVORITES_JSON, {
    updatedAt: new Date().toISOString(),
    items: list
  });
}

function sanitizeSlug(rawSlug, fallbackTitle) {
  const base = String(rawSlug || '').trim().toLowerCase().replace(/[^a-z0-9\-_]+/g, '-').replace(/^-+|-+$/g, '');
  if (base && base.length >= 2) return base.slice(0, 64);
  const hash = crypto.createHash('sha1').update(String(fallbackTitle || Date.now())).digest('hex').slice(0, 8);
  return `curated-${hash}`;
}

function listCuratedPagesMeta() {
  try {
    if (!fs.existsSync(PAGES_DIR)) return [];
    const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.json'));
    const pages = [];
    for (const f of files) {
      const p = readJsonSafe(path.join(PAGES_DIR, f), null);
      if (!p || !p.slug || !p.title) continue;
      const firstImg = Array.isArray(p.items) && p.items[0] ? (p.items[0].thumbUrl || p.items[0].previewUrl || '') : '';
      pages.push({
        slug: p.slug,
        title: p.title,
        subtitle: p.subtitle || '',
        note: p.note || '',
        author: p.author || 'Fable',
        wikiTitle: p.wikiTitle || '',
        count: Array.isArray(p.items) ? p.items.length : 0,
        coverUrl: p.coverUrl || firstImg,
        createdAt: p.createdAt || '',
        updatedAt: p.updatedAt || '',
        shortUrl: `/p/${encodeURIComponent(p.slug)}`,
        publicUrl: PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/p/${encodeURIComponent(p.slug)}` : `http://127.0.0.1:${PORT}/p/${encodeURIComponent(p.slug)}`
      });
    }
    pages.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    return pages;
  } catch (_) {
    return [];
  }
}

async function curateItemsByKeywords(keywordsInput, domainPref, wikiHint) {
  const rawKw = Array.isArray(keywordsInput) ? keywordsInput.join(' ') : String(keywordsInput || '').trim();
  const enTerms = extractEnglishTerms(rawKw, []);
  const extraMap = [
    [/微距|昆虫|露珠|晶|雪花|蝴蝶|蜻蜓/, ['macro', 'snowflake', 'butterfly', 'quartz crystal']],
    [/野生|动物|鸟|狐|鲸|豹|生灵|国家地理/, ['kingfisher', 'fox', 'owl', 'leopard', 'hummingbird']],
    [/森林|瀑布|雨林|溪谷|苔藓|竹/, ['waterfall', 'forest', 'moss', 'redwood']],
    [/极光|冰川|峡湾|极地|雪山/, ['aurora', 'glacier', 'iceberg', 'Dolomites']],
    [/海洋|珊瑚|环礁|水母|海浪/, ['coral reef', 'jellyfish', 'lagoon', 'sea arch']],
    [/火山|沙漠|风暴|闪电|盐沼/, ['volcano', 'lava', 'supercell', 'sand dunes']],
    [/星云|宇宙|星系|深空|韦伯/, ['nebula', 'James Webb', 'spiral galaxy']],
    [/宋|青瓷|汝窑|秘色|影青|瓷/, ['Song dynasty', 'celadon', 'porcelain']],
    [/青花|元代|明代|景德镇/, ['blue and white porcelain', 'Ming dynasty']],
    [/山水|水墨|手卷|册页|书画/, ['Chinese landscape scroll', 'handscroll', 'ink painting']],
    [/浮世绘|北斋|广重|江户/, ['ukiyo-e', 'Hokusai', 'Hiroshige']],
    [/印象派|莫奈|睡莲|梵高|雷诺阿/, ['Claude Monet', 'Impressionism', 'Vincent van Gogh']],
    [/埃及|法老|莎草纸/, ['Ancient Egypt', 'faience']],
    [/波斯|细密画|伊斯兰/, ['Persian miniature', 'Nishapur']],
    [/希腊|罗马|大理石|青铜/, ['Greek amphora', 'Roman marble', 'bronze']]
  ];
  for (const [re, mapped] of extraMap) {
    if (re.test(rawKw)) {
      for (const m of mapped) {
        if (!enTerms.includes(m)) enTerms.push(m);
      }
    }
  }
  const expandedTerms = [];
  for (const t of enTerms) {
    const words = String(t).trim().split(/\s+/).filter(Boolean);
    if (words.length <= 2) {
      if (!expandedTerms.includes(t)) expandedTerms.push(t);
    } else {
      for (const w of words) {
        if (w.length >= 3 && !/^(and|the|with|from|for|into)$/i.test(w) && !expandedTerms.includes(w)) {
          expandedTerms.push(w);
        }
      }
    }
  }
  const finalTerms = expandedTerms.length ? expandedTerms.slice(0, 6) : [rawKw || 'masterpiece'];
  const isMuseumCue = /宋|唐|明|清|瓷|窑|玉|青铜|书画|手卷|浮世绘|印象派|博物馆|celadon|porcelain|dynasty|scroll|bronze|painting|ukiyo|monet/i.test(rawKw);
  const isLandscape = domainPref === 'landscape' || (!isMuseumCue && /微距|野生|动物|森林|瀑布|极光|冰川|海洋|火山|星云|风景|自然|landscape|macro|wildlife|aurora|nebula|forest|glacier/i.test(rawKw));
  const seed = Math.floor(Math.random() * 4);
  const meta = {
    facet: 'curated',
    label: wikiHint || rawKw.slice(0, 18) || '专题特辑',
    wikiTitle: wikiHint || rawKw.split(/[\s,，·]+/)[0] || ''
  };

  const tasks = [];
  if (domainPref === 'landscape') {
    tasks.push(fetchCommonsFeatured('landscapes', finalTerms, seed, meta).catch(() => []));
    tasks.push(fetchCommonsFeatured('landscapes', finalTerms, seed + 1, meta).catch(() => []));
  } else if (domainPref === 'museum') {
    tasks.push(fetchCmaChannel('antiques', finalTerms, 0, meta).catch(() => []));
    if (finalTerms.length > 1) tasks.push(fetchCmaChannel('paintings', finalTerms, 1, meta).catch(() => []));
    // fetchAicChannel 的第 3 个参数是偏移（0 → page=1）；传 1 会落到 page=2，正好跳过真正搜中的第 1 页。
    tasks.push(fetchAicChannel('paintings', finalTerms.slice(0, 3).join(' '), 0, meta).catch(() => []));
  } else if (isLandscape) {
    tasks.push(fetchCommonsFeatured('landscapes', finalTerms, seed, meta).catch(() => []));
    tasks.push(fetchCommonsFeatured('landscapes', finalTerms, seed + 1, meta).catch(() => []));
    tasks.push(fetchCmaChannel('paintings', finalTerms, 0, meta).catch(() => []));
  } else {
    tasks.push(fetchCmaChannel('antiques', finalTerms, 0, meta).catch(() => []));
    if (finalTerms.length > 1) tasks.push(fetchCmaChannel('paintings', finalTerms, 1, meta).catch(() => []));
    tasks.push(fetchAicChannel('paintings', finalTerms.slice(0, 3).join(' '), 0, meta).catch(() => []));
    tasks.push(fetchCommonsFeatured('landscapes', finalTerms, 0, meta).catch(() => []));
  }

  const batches = await Promise.all(tasks);
  const seen = new Set();
  const out = [];
  for (const b of batches) {
    for (const rawIt of b) {
      const it = normalizeLiveItem(rawIt);
      if (it && it.id && !seen.has(it.id)) {
        seen.add(it.id);
        out.push(it);
      }
    }
  }
  return out.slice(0, 24);
}

// ==================== HTTP 路由主入口 ====================
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, buildCorsHeaders(req));
    res.end();
    return;
  }

  const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const urlPath = decodeURIComponent(reqUrl.pathname);

  // 1. 读取当前全量状态
  if (urlPath === '/api/state' && req.method === 'GET') {
    const preferences = readJsonSafe(PREF_JSON, null);
    const seenObj = readJsonSafe(SEEN_JSON, { updatedAt: null, items: {} });
    const aiInbox = readJsonSafe(AI_INBOX_JSON, []);
    const livePoolRaw = readJsonSafe(LIVE_POOL_JSON, []);
    const livePool = Array.isArray(livePoolRaw) ? livePoolRaw.map(normalizeLiveItem) : [];
    const favorites = readFavoritesList();
    const curatedPages = listCuratedPagesMeta();
    const seenItems = (seenObj && seenObj.items) || {};
    sendJson(req, res, 200, {
      ok: true,
      preferences,
      seen: seenItems,
      seenCount: Object.keys(seenItems).length,
      aiInbox: Array.isArray(aiInbox) ? aiInbox : [],
      livePool,
      favorites,
      curatedPages,
      lwaCatalogUrl: makeObsidianOpenUrl('📘【小红书收藏目录】'),
      lwaAskUrl: makeObsidianOpenUrl('❔️  收藏搜索')
    });
    return;
  }

  // 2. 保存偏好与频道权重（同步写 JSON + Markdown 供 AI 读取）
  if (urlPath === '/api/preferences' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const incoming = (body && body.preferences && typeof body.preferences === 'object') ? body.preferences : body;
      const current = readJsonSafe(PREF_JSON, {});
      const merged = Object.assign({}, current, incoming, {
        updatedAt: new Date().toISOString()
      });
      delete merged.detailMode;
      writeJsonSafe(PREF_JSON, merged);
      fs.writeFileSync(PREF_MD, formatPreferencesMarkdown(merged), 'utf8');
      sendJson(req, res, 200, { ok: true, preferences: merged });
    } catch (e) {
      sendJson(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 3. 记录或清空已曝光/已读条目
  if (urlPath === '/api/seen' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      let seenObj = readJsonSafe(SEEN_JSON, { updatedAt: null, items: {} });
      if (!seenObj || typeof seenObj.items !== 'object') {
        seenObj = { updatedAt: null, items: {} };
      }
      if (body.reset) {
        seenObj.items = {};
      } else if (Array.isArray(body.ids)) {
        const nowTs = Date.now();
        body.ids.forEach((id) => {
          if (id) seenObj.items[String(id)] = nowTs;
        });
      }
      seenObj.updatedAt = new Date().toISOString();
      writeJsonSafe(SEEN_JSON, seenObj);
      sendJson(req, res, 200, {
        ok: true,
        seen: seenObj.items,
        seenCount: Object.keys(seenObj.items).length
      });
    } catch (e) {
      sendJson(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 4. 追加后台口味偏好信号（写入 signals.jsonl）
  if (urlPath === '/api/signal' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const entry = {
        ts: new Date().toISOString(),
        action: body.action === 'less' ? 'less' : 'more',
        id: String(body.id || body.itemId || ''),
        title: String(body.title || ''),
        channel: String(body.channel || ''),
        tags: Array.isArray(body.tags) ? body.tags.slice(0, 8) : [],
        source: 'world-window-ui'
      };
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
      fs.appendFileSync(SIGNALS_JSONL, JSON.stringify(entry) + '\n', 'utf8');
      sendJson(req, res, 200, { ok: true, entry });
    } catch (e) {
      sendJson(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 5. 实时拉取新一波 4K 馆藏与自然影像
  if (urlPath === '/api/feed' && req.method === 'GET') {
    try {
      const prefs = readJsonSafe(PREF_JSON, {});
      const seenObj = readJsonSafe(SEEN_JSON, { items: {} });
      const aiInbox = readJsonSafe(AI_INBOX_JSON, []);
      const wantRefresh = reqUrl.searchParams.get('refresh') === '1';
      let livePool = readJsonSafe(LIVE_POOL_JSON, []);
      if (wantRefresh || !Array.isArray(livePool) || livePool.length < 8) {
        livePool = await refreshLivePool(prefs, (seenObj && seenObj.items) || {});
      }
      livePool = Array.isArray(livePool) ? livePool.map(normalizeLiveItem) : [];
      sendJson(req, res, 200, {
        ok: true,
        livePool,
        aiInbox: Array.isArray(aiInbox) ? aiInbox : [],
        seen: (seenObj && seenObj.items) || {}
      });
    } catch (e) {
      const fbPool = readJsonSafe(LIVE_POOL_JSON, []);
      sendJson(req, res, 200, {
        ok: true,
        livePool: Array.isArray(fbPool) ? fbPool.map(normalizeLiveItem) : [],
        aiInbox: readJsonSafe(AI_INBOX_JSON, []),
        warning: e.message
      });
    }
    return;
  }

  // 6. 多维时空/地貌漫游画卷接口（博物馆文明/时代/国家 & 风景地貌/太空俯瞰，支持 page 分页）
  if (urlPath === '/api/explore' && req.method === 'GET') {
    try {
      const domain = reqUrl.searchParams.get('domain') === 'landscape' ? 'landscape' : 'museum';
      const facet = reqUrl.searchParams.get('facet') || 'all';
      const page = Number(reqUrl.searchParams.get('page') || 0);
      const seenObj = readJsonSafe(SEEN_JSON, { items: {} });
      const excludeSet = new Set(Object.keys((seenObj && seenObj.items) || {}));
      const extraExclude = String(reqUrl.searchParams.get('exclude') || '').split(',').filter(Boolean);
      extraExclude.forEach((id) => excludeSet.add(id));

      const items = await exploreFacetItems(domain, facet, excludeSet, page);
      sendJson(req, res, 200, { ok: true, domain, facet, page, items });
    } catch (e) {
      sendJson(req, res, 200, { ok: false, error: e.message, items: [] });
    }
    return;
  }

  // 7. 维基百科多章节深度词条与语义关联接口 + 实时联想搜索接口
  if (urlPath === '/api/wiki' && req.method === 'GET') {
    try {
      const title = reqUrl.searchParams.get('title') || '';
      const lang = reqUrl.searchParams.get('lang') || 'zh';
      const fallback = reqUrl.searchParams.get('fallback') || '';
      const dossier = await getWikiDossier(title, lang, fallback);
      sendJson(req, res, 200, dossier);
    } catch (e) {
      sendJson(req, res, 200, { ok: false, error: e.message });
    }
    return;
  }

  if (urlPath === '/api/wiki-search' && req.method === 'GET') {
    try {
      const q = reqUrl.searchParams.get('q') || '';
      const result = await searchWikiSuggestions(q);
      sendJson(req, res, 200, result);
    } catch (e) {
      sendJson(req, res, 200, { ok: false, error: e.message, items: [] });
    }
    return;
  }

  // 7b. 私藏画匣（点心收藏 Gallery）读写接口
  if (urlPath === '/api/favorites' && req.method === 'GET') {
    const favorites = readFavoritesList();
    sendJson(req, res, 200, { ok: true, favorites });
    return;
  }

  if (urlPath === '/api/favorites' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      let list = readFavoritesList();
      const targetItem = body && body.item && typeof body.item === 'object' ? body.item : null;
      const targetId = String((targetItem && targetItem.id) || body.id || '').trim();
      if (!targetId) {
        sendJson(req, res, 400, { ok: false, error: 'Missing item id' });
        return;
      }
      const existingIdx = list.findIndex((x) => x && x.id === targetId);
      let favorited = false;
      if (body.action === 'remove' || (body.action !== 'add' && existingIdx !== -1)) {
        if (existingIdx !== -1) list.splice(existingIdx, 1);
        favorited = false;
      } else if (targetItem) {
        const saved = Object.assign({}, normalizeLiveItem(targetItem), {
          favoritedAt: new Date().toISOString()
        });
        if (existingIdx !== -1) list[existingIdx] = saved;
        else list.unshift(saved);
        favorited = true;
      }
      saveFavoritesList(list);
      sendJson(req, res, 200, { ok: true, id: targetId, favorited, favorites: list });
    } catch (e) {
      sendJson(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 7c. Fable / AI 专属主题策展页接口（支持无状态 URL 直出 /api/curate 与持久化专题页 /api/pages + /p/<slug>）
  if (urlPath === '/api/curate' && req.method === 'GET') {
    try {
      const q = reqUrl.searchParams.get('q') || reqUrl.searchParams.get('keywords') || '';
      const title = reqUrl.searchParams.get('title') || q || '专题漫游';
      const note = reqUrl.searchParams.get('note') || '';
      const domain = reqUrl.searchParams.get('domain') || '';
      const wikiTitle = reqUrl.searchParams.get('wiki') || q.split(/[\s,，·]+/)[0] || '';
      const items = await curateItemsByKeywords(q, domain, wikiTitle);
      sendJson(req, res, 200, {
        ok: true,
        page: {
          slug: '',
          title,
          note,
          author: reqUrl.searchParams.get('author') || 'Fable',
          keywords: q,
          wikiTitle,
          items
        }
      });
    } catch (e) {
      sendJson(req, res, 200, { ok: false, error: e.message, page: null });
    }
    return;
  }

  if (urlPath === '/api/pages' && req.method === 'GET') {
    sendJson(req, res, 200, { ok: true, pages: listCuratedPagesMeta() });
    return;
  }

  if (urlPath.startsWith('/api/pages/') && req.method === 'GET') {
    const slug = sanitizeSlug(urlPath.slice('/api/pages/'.length), '');
    const pagePath = path.join(PAGES_DIR, `${slug}.json`);
    const pageObj = readJsonSafe(pagePath, null);
    if (!pageObj) {
      sendJson(req, res, 404, { ok: false, error: 'Curated page not found' });
      return;
    }
    pageObj.items = Array.isArray(pageObj.items)
      ? pageObj.items.map((rawIt) => {
          const norm = normalizeLiveItem(rawIt);
          if (norm && pageObj.wikiTitle) {
            norm.wikiFallback = pageObj.wikiTitle;
          }
          return norm;
        })
      : [];
    sendJson(req, res, 200, { ok: true, page: pageObj });
    return;
  }

  if (urlPath.startsWith('/api/pages/') && req.method === 'DELETE') {
    const slug = sanitizeSlug(urlPath.slice('/api/pages/'.length), '');
    const pagePath = path.join(PAGES_DIR, `${slug}.json`);
    try {
      if (fs.existsSync(pagePath)) fs.unlinkSync(pagePath);
      sendJson(req, res, 200, { ok: true, pages: listCuratedPagesMeta() });
    } catch (e) {
      sendJson(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (urlPath === '/api/pages' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const title = String(body.title || body.keywords || '专题画卷').trim();
      const keywords = body.keywords || body.q || title;
      const slug = sanitizeSlug(body.slug, title);
      const wikiTitle = String(body.wikiTitle || body.wiki || String(keywords).split(/[\s,，·]+/)[0] || '').trim();
      let items = (Array.isArray(body.items) && body.items.length
        ? body.items.map(normalizeLiveItem)
        : await curateItemsByKeywords(keywords, body.domain || '', wikiTitle)).filter((it) => it && it.id);
      // 0 件就不建页、不进书架：上游限流（Wikimedia 429）或关键词太冷门时，空页打开是白板且不报错。
      if (!items.length) {
        sendJson(req, res, 422, {
          ok: false,
          error: '0 件作品，没建页：可能是图源在限流（如 Wikimedia too many requests），或关键词太冷门。换个关键词、换 --domain，或用 --items 自己挑。',
          itemCount: 0
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const existing = readJsonSafe(path.join(PAGES_DIR, `${slug}.json`), null);
      const pageDoc = {
        slug,
        title,
        subtitle: String(body.subtitle || '').trim(),
        note: String(body.note || '').trim(),
        author: String(body.author || 'Fable').trim(),
        keywords: Array.isArray(keywords) ? keywords.join(', ') : String(keywords || ''),
        domain: String(body.domain || ''),
        wikiTitle,
        coverUrl: body.coverUrl || (items[0] ? (items[0].thumbUrl || items[0].previewUrl || '') : ''),
        createdAt: (existing && existing.createdAt) || nowIso,
        updatedAt: nowIso,
        items
      };
      writeJsonSafe(path.join(PAGES_DIR, `${slug}.json`), pageDoc);
      const shortUrl = `/p/${encodeURIComponent(slug)}`;
      const publicUrl = PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}${shortUrl}` : `http://127.0.0.1:${PORT}${shortUrl}`;
      sendJson(req, res, 200, {
        ok: true,
        slug,
        shortUrl,
        url: publicUrl,
        itemCount: items.length,
        page: pageDoc,
        pages: listCuratedPagesMeta()
      });
    } catch (e) {
      sendJson(req, res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 8. 只读 LWA 收藏库关联检索接口
  if (urlPath === '/api/lwa-related' && req.method === 'GET') {
    try {
      const q = reqUrl.searchParams.get('q') || '';
      const resObj = searchLwaRelated(q, 6);
      sendJson(req, res, 200, resObj);
    } catch (e) {
      sendJson(req, res, 200, { ok: false, error: e.message, items: [] });
    }
    return;
  }

  // 9. 白名单 4K/预览图代理与磁盘缓存
  if (urlPath === '/api/img' && req.method === 'GET') {
    await handleImageProxy(req, res, reqUrl.searchParams.get('u'));
    return;
  }

  // 10. 静态资源服务（/ 与 /p/<slug> 统一返回 index.html 交由前端路由呈现专题页）
  const isSpaPageRoute = urlPath === '/' || /^\/p\/[A-Za-z0-9\-_%]+\/?$/.test(urlPath);
  // /p/<slug> 页里 index.html 的 ./styles.css 等相对资源会被浏览器解析成 /p/styles.css；
  // 这里把 /p/ 下的资源请求落回站点根目录（不改 index.html：bundle.js 按 ./styles.css 字面量内联）。
  const relPath = isSpaPageRoute ? 'index.html' : urlPath.replace(/^\/p\//, '/').replace(/^\/+/, '');
  const fullPath = path.resolve(ROOT, relPath);

  if (!fullPath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  if (urlPath === '/favicon.ico' && !fs.existsSync(fullPath)) {
    res.writeHead(204);
    res.end();
    return;
  }

  // 只放前端真正要的文件；.env、.git、serve.js、feed-profile/（含 .cache）、snapshots/ 一律 404。
  // 前端新加静态文件时要同步加进这张表。
  if (!PUBLIC_STATIC_FILES.has(relPath.replace(/\\/g, '/'))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + urlPath);
    return;
  }

  fs.readFile(fullPath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, buildCorsHeaders(req, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    }));
    res.end(buf);
  });
});

server.on('listening', () => {
  const addr = server.address();
  const actualPort = (addr && addr.port) || PORT;
  console.log(`World Window Atlas server running at http://127.0.0.1:${actualPort}`);
  // 启动后静默预热一次 Earth View 离线索引表，后续随机跳 0 延迟
  ensureEarthViewPool().catch(() => {});
});

function startListen(port) {
  server.once('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && !process.env.PORT && port < 5195) {
      startListen(port + 1);
    } else {
      throw err;
    }
  });
  server.listen(port, '127.0.0.1');
}

startListen(PORT);
