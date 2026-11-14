#!/usr/bin/env node
/**
 * Fable / AI 专属主题页面生成器（World Window Curated Page CLI）
 *
 * 用法示例：
 *   node fable-page.js --slug celadon-mist --title "天青等烟雨 · 宋瓷与山水" --q "Song dynasty celadon handscroll" --wiki "汝窑" --note "挑了几件雨过天青的宋代器物与水墨山水，配着维基慢慢看。"
 *   node fable-page.js --list
 *
 * 也支持免建文件直接发无状态链接给用户：
 *   https://<domain>/?title=微距雪花与晶簇&q=macro+snowflake+crystal&wiki=雪花&note=...
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

(async () => {
  const args = parseArgs(process.argv);
  if (args.list) {
    const res = await requestLocalApi('GET', '/api/pages');
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  const title = args.title || args.q || args.keywords;
  if (!title) {
    console.error('用法: node fable-page.js --title "主题标题" --q "关键词" [--slug custom-slug] [--wiki "关联维基词条"] [--note "导览寄语"] [--domain museum|landscape]');
    process.exit(1);
  }
  const res = await requestLocalApi('POST', '/api/pages', {
    slug: args.slug || '',
    title,
    subtitle: args.subtitle || '',
    note: args.note || '',
    author: args.author || 'Fable',
    keywords: args.q || args.keywords || title,
    domain: args.domain || '',
    wikiTitle: args.wiki || ''
  });
  if (!res || !res.ok) {
    console.error('创建失败:', res);
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
