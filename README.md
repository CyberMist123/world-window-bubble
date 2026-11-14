# 世界之窗 · 漫游画册（World Window · Window of Floating Worlds）

基于 WebGL2 单世界流体融球渲染引擎打造的每日高清艺术、自然纪实、微距深空与维基百科深度关联漫游画册，支持 AI 协作推流调音与「珍珠策展」混合叙事专题页生成。

> `snapshots/v1.0-1to1-ref-base/` 完整保留了最初的纯程序化 1:1 物理与着色器底板存档。

## 核心特性

1. **多馆藏三巨头 + 自然科学多源聚合（按真实像素分级标注 `4K / 2K / HD`）**：
   - **博物馆开放馆藏**：**大都会艺术博物馆（The Met `v1.1` Search API + Wikidata QID 实体对齐）**、**克利夫兰艺术博物馆（CMA CC0）**、**芝加哥艺术博物馆（AIC IIIF HD · 1686w）**。
   - **自然、生灵与深空**：**Wikimedia Commons 三级评选（`assessment:featured|quality|valued`）**、**iNaturalist 科研级物种观察（CC0/CC-BY + 物种维基直连）**、**NASA Images API（JWST / Hubble / ISS 科学实拍）**、**Google Earth View**、**Bing UHD**。
2. **三态一体展厅（非 Top-Layer，原生兼容划词与双语网页翻译插件）**：
   - **◈ 漫游画卷**：支持画作珍珠、单张串词手记、跨双列 **维基百科知识切片卡（`kind: "wiki"`）** 与 **幕间拾句卡（`kind: "quote"`）** 混排叙事。
   - **◫ 图文并排 · Wiki**：左侧原图滚轮无级缩放 + 胶片条快切，右侧独立滚动完整多章节维基百科词条（支持 Wikidata `QID` 精确消歧与跨语种同实体跳转）、顺藤摸瓜知识轨迹与只读收藏库联动。
   - **⛶ 全屏沉浸**：`100vw × 100dvh` 暗房观画。
3. **IME 安全维基百科实时搜索 + ♡ 点心收藏（私藏画匣）**：
   - 顶栏与展厅右栏双入口实时词条联想；任意画作一键点心收藏至抽屉 `私藏画匣 · GALLERY`（`feed-profile/favorites.json`）。
4. **Fable / AI 轻量「珍珠策展」工作流（省 Token · 14 天冷却去重 · 零跑题）**：
   - **Step 1 — 轻量候选探针**（用 `|` 一次并行搜多个意象，每条仅返回约 28 tokens 的短 ID 与核心元数据，完整图链自动沉入本地 `feed-profile/pearls-vault.json`）：
     ```powershell
     node fable-page.js --search "astrolabe | armillary sphere | Carina Nebula | nudibranch" --limit 16
     ```
   - **Step 2 — 串珠成链发布混合叙事页**（支持短 ID、单张旁白 `caption`、`kind: "wiki"` 百科知识切片、`kind: "quote"` 幕间拾句自由混排，自动记录 14 天策展冷却账本 `collection-history.json`，用户点过 `♡` 的作品自动豁免冷却）：
     ```powershell
     node fable-page.js --curate plan.json
     # 或直接传短 ID 快速建页：
     node fable-page.js --slug brass-stars --title "黄铜里的星空" --ids "met-live-444408,met-live-451699,nasa-carina_nebula" --wiki "星盘" --note "导览寄语"
     ```
   - **辅助查询与单步兼容命令**：
     ```powershell
     node fable-page.js --list       # 查看所有已发布专题页
     node fable-page.js --history    # 查看 14 天冷却去重账本与她的 ♡ 收藏
     node fable-page.js --slug song-celadon-mist --title "天青等烟雨" --q "Song dynasty celadon" --wiki "汝窑"
     ```

## 本地运行

```powershell
Copy-Item .env.example .env   # 按需填写端口、公开域名或本地只读收藏库索引路径
node serve.js                 # 默认监听 http://127.0.0.1:5184
```

如需导出单文件离线版 HTML：
```powershell
node bundle.js                # 输出至 dist/index.single.html
```
