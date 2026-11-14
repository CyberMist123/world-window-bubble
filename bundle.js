/**
 * 单文件打包同步脚本（bundle.js）
 *
 * 将模块化工程（index.html + styles.css + data.js + sprites.js + renderer.js）
 * 合并输出为完全自包含、双击即可打开的单文件 index.html，
 * 并自动同步回原参照目录（也可通过命令行参数指定输出路径）。
 *
 * 用法：node bundle.js [可选输出路径]
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DEFAULT_OUT = process.env.BUNDLE_OUT_PATH
  ? path.resolve(process.env.BUNDLE_OUT_PATH)
  : path.join(ROOT, 'dist', 'index.single.html');

const outPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const dataJs = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8');
const spritesJs = fs.readFileSync(path.join(ROOT, 'sprites.js'), 'utf8');
const rendererJs = fs.readFileSync(path.join(ROOT, 'renderer.js'), 'utf8');

function safeInlineScript(code) {
  return code.replace(/<\/script>/gi, '<\\/script>');
}

let bundled = html.replace(
  '<link rel="stylesheet" href="./styles.css">',
  () => `<style>\n${css}\n  </style>`
);

bundled = bundled.replace(
  /\s*<script src="\.\/data\.js"><\/script>\s*<script src="\.\/sprites\.js"><\/script>\s*<script src="\.\/renderer\.js"><\/script>/,
  () =>
    `\n  <script>\n${safeInlineScript(dataJs)}\n  </script>\n` +
    `  <script>\n${safeInlineScript(spritesJs)}\n  </script>\n` +
    `  <script>\n${safeInlineScript(rendererJs)}\n  </script>`
);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bundled, 'utf8');

console.log(`Bundled single-file HTML (${(Buffer.byteLength(bundled, 'utf8') / 1024).toFixed(1)} KB) -> ${outPath}`);
