# 世界之窗 · 心绪泡泡（1:1 代码级物理与交互参照底板）

这个目录是以后做 **「世界之窗」** 与 **「心绪泡泡」** 的干净模块化底板。所有物理参数、22 个着色器公式、三级泡泡展开状态机、胶质融球与水珠回流、开场/点击聚合转场都按原站源码做了 **1:1 代码级复刻**，并且 **100% 程序化生成所有贴图与缩略图**（零外部图片依赖、零原站品牌素材）。

## 目录结构

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面骨架（单 `#gl-world` WebGL2 画布、开场红幕、顶部栏、全屏导航、固定热区舞台、原生 `<dialog closedby="any">` 详情卡片） |
| `data.js` | **唯一需要常改的数据层**：标题、中英双语文案、6 扇窗口（`01–04` 支持 L1+L2 三级展开，`05–06` 支持 L1 直接展开）及物理布局配置 |
| `sprites.js` | 程序化贴图合成器：极坐标样条水彩主泡图集（`pink / coral / citrus / orange / blue / mint / magenta / lavender`）、反相前景釉面球、散景球、连线发光水珠、笔刷波纹、全息背景色带、胶片噪点、`2x` 超采样衬线背景大字、水彩卡片缩略图 |
| `styles.css` | 1:1 还原 `>1200px`、`<=1200px`、`<=600px` 三档响应式排版、整颗球大热区按钮、双层细白悬停外环、原生 `<dialog>` 进出场过渡 |
| `renderer.js` | 单世界 WebGL2 渲染管线（`[1,1,1,0]` 透明白底离屏清屏、31 抽头 Alpha 加权高斯融球、精确 Z 轴分层）+ 三级展开/兄弟退避/母球避让/历史位置自动恢复状态机 |
| `serve.js` | 零依赖本地静态预览服务（`node serve.js` -> `http://localhost:5178`） |
| `bundle.js` | 一键把模块化代码打包成单文件 `index.html`（`node bundle.js`） |

## 本地运行与修改方式

1. **直接双击打开**：支持 `file://` 直接打开 `index.html`（零 CORS 报错）。
2. **本地服务预览**：
   ```powershell
   node serve.js
   ```
   浏览器访问 `http://localhost:5178`。
3. **改成自己的世界之窗内容**：
   - 打开 `data.js`，直接改 `brand`、`ui` 和 `sections` 里的标题、描述、水彩配色 `palette` 与图案类型 `motif`（支持 `'horizon' | 'orbit' | 'arch' | 'leaf' | 'ripple' | 'window' | 'bloom'`，或者后续在 `sprites.js` 的 `buildThumbDataURL` 里换成你自己的真实图片 URL）。
   - 如果需要同步生成单文件版本，运行 `node bundle.js` 即可。

## 调试与二次开发接口

页面加载后会在 `window.WorldWindowBubbles` 暴露控制句柄：
- `WorldWindowBubbles.toggleMainBall(1..6)`：展开/收起指定主泡泡
- `WorldWindowBubbles.onL1BallClick(mainBalls[1], 0)`：展开/收起指定子泡泡的 L2 孙级气泡
- `WorldWindowBubbles.openLeafDetail(payload)`：触发中心转场球聚合并打开详情卡片
- `WorldWindowBubbles.setLang('zh' | 'en')`：热切换界面语言
