#!/usr/bin/env node
/**
 * Fable / AI 专属主题策展器（World Window Pearl Curation CLI · V3.4）
 *
 * 【推荐两步策展流 · 极省 Token 且零跑题】
 *   Step 1 — 多馆藏 + 自然科学轻量探针（支持 | 并行搜多个意象，每条仅 ~28 tokens）：
 *     node fable-page.js --search "astrolabe | armillary sphere | Carina Nebula" [--domain museum|landscape] [--limit 18]
 *
 *   Step 2 — 串珠成链（支持「画作短ID + 单张串词批注 + Wiki知识切片卡 + 幕间拾句卡」混合叙事流）：
 *     node fable-page.js --curate plan.json
 *     （或直接传短 ID 列表：node fable-page.js --slug brass-stars --title "黄铜里的星空" --ids "met-live-444854,cma-live-..." --wiki "星盘" --note "..."）
 *
 *   plan.json 示例：
 *   {
 *     "slug": "brass-and-nebula",
 *     "title": "把星空折进黄铜里",
 *     "note": "开篇导览寄语……",
 *     "wiki": "星盘",
 *     "pearls": [
 *       { "id": "met-live-444854", "caption": "Fable 对这张器物的单张旁白……" },
 *       { "kind": "wiki", "wiki": "星盘", "title": "一块黄铜圆盘怎么测算星辰？", "caption": "顺着这张知识切片看懂刻度——" },
 *       "cma-live-111514",
 *       { "kind": "quote", "quote": "一句过渡拾句……", "subtitle": "—— 幕间手记" }
 *     ]
 *   }
 *
 * 【其他辅助与兼容命令】
 *   node fable-page.js --list       # 查看所有已发布专题页
 *   node fable-page.js --history    # 查看 14 天冷却去重账本与她的点心收藏 ♡
 *   node fable-page.js --slug celadon-mist --title "天青等烟雨" --q "Song dynasty celadon" --wiki "汝窑"
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
(function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) {
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
})();

const PORT = Number(process.env.PORT || 5184);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function requestLocalApi(method, apiPath, bodyObj) {
  return new Promise((resolve, reject) => {
    const payload = bodyObj ? Buffer.from(JSON.stringify(bodyObj), 'utf8') : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: apiPath,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': payload.length }
          : {}
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (e) {
            reject(new Error(Buffer.concat(chunks).toString('utf8')));
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function readJsonInput(fileArg) {
  const rawStr = fileArg === '-'
    ? fs.readFileSync(0, 'utf8')
    : fs.readFileSync(path.resolve(String(fileArg)), 'utf8');
  return JSON.parse(rawStr.replace(/^\uFEFF/, ''));
}

(async () => {
  const args = parseArgs(process.argv);

  if (args.list) {
    const res = await requestLocalApi('GET', '/api/pages');
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (args.history) {
    const res = await requestLocalApi('GET', '/api/pearls/history');
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (args.search) {
    const q = typeof args.search === 'string' ? args.search : (args.q || args.keywords || '');
    if (!q) {
      console.error('用法: node fable-page.js --search "astrolabe | Carina Nebula" [--domain museum|landscape] [--limit 18]');
      process.exit(1);
    }
    const qs = new URLSearchParams({ q });
    if (args.domain) qs.set('domain', String(args.domain));
    if (args.wiki) qs.set('wiki', String(args.wiki));
    if (args.limit) qs.set('limit', String(args.limit));
    if (args['include-cooled'] || args.includeCooled) qs.set('includeCooled', '1');
    const res = await requestLocalApi('GET', `/api/pearls/search?${qs.toString()}`);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  let plan = {};
  if (args.curate) {
    try {
      const loaded = readJsonInput(args.curate);
      plan = Array.isArray(loaded) ? { pearls: loaded } : (loaded || {});
    } catch (e) {
      console.error('读不了 --curate 编排文件:', e.message);
      process.exit(1);
    }
  }

  let items;
  let pearls = Array.isArray(plan.pearls) ? plan.pearls : null;
  if (args.ids) {
    pearls = String(args.ids).split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (args.items) {
    try {
      const raw = readJsonInput(args.items);
      const arr = Array.isArray(raw) ? raw : (raw && raw.pearls) || (raw && raw.page && raw.page.items) || (raw && raw.items);
      if (!Array.isArray(arr) || !arr.length) {
        console.error('--items / pearls 数组为空。');
        process.exit(1);
      }
      items = arr;
    } catch (e) {
      console.error('读不了 --items 文件:', e.message);
      process.exit(1);
    }
  } else if (!pearls && Array.isArray(plan.items) && plan.items.length) {
    items = plan.items;
  }

  const title = args.title || plan.title || args.q || args.keywords || plan.keywords || plan.q;
  if (!title) {
    console.error(
      '用法:\n' +
      '  1) 探针选品: node fable-page.js --search "astrolabe | Carina Nebula" [--limit 18]\n' +
      '  2) 编排成册: node fable-page.js --curate plan.json\n' +
      '  3) 快速建页: node fable-page.js --title "主题标题" --ids "met-live-444854,cma-live-..." [--wiki "关联词条"] [--note "寄语"]\n' +
      '  4) 自动检索: node fable-page.js --title "主题标题" --q "关键词" [--domain museum|landscape]'
    );
    process.exit(1);
  }

  const payload = {
    ...(pearls ? { pearls } : {}),
    ...(items ? { items } : {}),
    slug: args.slug || plan.slug || '',
    title,
    subtitle: args.subtitle || plan.subtitle || '',
    note: args.note || plan.note || '',
    author: args.author || plan.author || 'Fable',
    keywords: args.q || args.keywords || plan.keywords || plan.q || title,
    domain: args.domain || plan.domain || '',
    wikiTitle: args.wiki || plan.wiki || plan.wikiTitle || ''
  };

  const res = await requestLocalApi('POST', '/api/pages', payload);
  if (!res || !res.ok) {
    console.error('创建失败:', (res && res.error) || res);
    process.exit(1);
  }
  console.log(JSON.stringify({
    ok: true,
    slug: res.slug,
    title: res.page && res.page.title,
    itemCount: res.itemCount,
    url: res.url,
    shortUrl: res.shortUrl
  }, null, 2));
})();
