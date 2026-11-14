/**
 * 世界之窗 · 漫游画册 (World Window & Curated Bubble Feed) — 数据、主题、字体与精选种子池
 *
 * 既支持本地 `node serve.js` 实时拉取博物馆 / Wikimedia 4K 开放馆藏并与 `feed-profile/` 双向同步，
 * 也支持单文件离线打开时直接从内置精选 4K 种子池 + localStorage 完成换一窗、去重与频道调权。
 */
(function () {
  'use strict';

  const THEMES = {
    'celadon-mist': {
      id: 'celadon-mist',
      name: '晨露影青',
      enName: 'Celadon Mist',
      bgHex: '#f2f5f4',
      silkBase: [242, 245, 244],
      silkAmp: 0.56,
      accent: '#4a6f6d',
      accentSoft: 'rgba(74, 111, 109, 0.12)',
      ink: '#172020',
      subInk: '#4d5b5b',
      footerBg: '#283838',
      curtainBg: '#334847',
      // 将原版高饱和球色向影青/香槟杏/冰盐蓝/雾紫方向柔化提亮
      desat: 0.46,
      lift: 0.34,
      hueShiftDeg: 8,
      tintRgb: [243, 248, 246],
      lineColors: { 1: '#8ab5ad', 2: '#7fb3c2', 3: '#b99fc9', 4: '#d9ad8b', 5: '#8ab5ad', 6: '#b59ebe' }
    },
    'rice-paper': {
      id: 'rice-paper',
      name: '宣纸矿彩',
      enName: 'Xuan Mineral',
      bgHex: '#f5f1e9',
      silkBase: [245, 241, 233],
      silkAmp: 0.48,
      accent: '#945343',
      accentSoft: 'rgba(148, 83, 67, 0.12)',
      ink: '#221c18',
      subInk: '#5c5149',
      footerBg: '#382c26',
      curtainBg: '#4a3830',
      desat: 0.48,
      lift: 0.32,
      hueShiftDeg: -6,
      tintRgb: [250, 245, 235],
      lineColors: { 1: '#cfa07e', 2: '#84aba2', 3: '#c7959d', 4: '#cfb07c', 5: '#c88d84', 6: '#a894b3' }
    },
    'mother-of-pearl': {
      id: 'mother-of-pearl',
      name: '珍珠母贝',
      enName: 'Mother of Pearl',
      bgHex: '#f4f3f7',
      silkBase: [244, 243, 247],
      silkAmp: 0.62,
      accent: '#5f5878',
      accentSoft: 'rgba(95, 88, 120, 0.12)',
      ink: '#1a1824',
      subInk: '#555168',
      footerBg: '#2c2838',
      curtainBg: '#39344a',
      desat: 0.38,
      lift: 0.42,
      hueShiftDeg: 18,
      tintRgb: [248, 246, 252],
      lineColors: { 1: '#b8a9d1', 2: '#8ebbc9', 3: '#cfa4c2', 4: '#d8b6a4', 5: '#bfa8cf', 6: '#9fb4d4' }
    },
    'soft-classic': {
      id: 'soft-classic',
      name: '柔化原色',
      enName: 'Softened Classic',
      bgHex: '#f2f2f2',
      silkBase: [242, 242, 242],
      silkAmp: 0.65,
      accent: '#b54956',
      accentSoft: 'rgba(181, 73, 86, 0.12)',
      ink: '#161616',
      subInk: '#4e4e4e',
      footerBg: '#3b2428',
      curtainBg: '#522c33',
      desat: 0.68,
      lift: 0.24,
      hueShiftDeg: 0,
      tintRgb: [252, 250, 249],
      lineColors: { 1: '#eba56a', 2: '#74cab9', 3: '#e08fc9', 4: '#eba56a', 5: '#ea8598', 6: '#df8ec7' }
    }
  };

  const FONT_PRESETS = {
    'caslon-zhuque': {
      id: 'caslon-zhuque',
      name: '朱雀仿宋 · Caslon',
      shortLabel: '朱雀仿宋',
      desc: '雕版斜势清雅仿宋 + Libre Caslon',
      sample: '山色空蒙雨亦奇 · Floating Worlds',
      cssUrl: 'https://cdn.jsdelivr.net/npm/@chinese-fonts/zqfs@3.0.0/dist/ZhuqueFangsong-Regular/result.css',
      enDisplay: '"Libre Caslon Display", "Zhuque Fangsong (technical preview)", "Noto Serif SC", Georgia, serif',
      enSans: '"Libre Franklin", "Zhuque Fangsong (technical preview)", "Noto Sans SC", sans-serif',
      zhBody: '"Zhuque Fangsong (technical preview)", "Noto Serif SC", "Songti SC", serif',
      zhUi: '"Zhuque Fangsong (technical preview)", "Noto Sans SC", sans-serif',
      zhBodyWeight: '400'
    },
    'bodoni-huiwen': {
      id: 'bodoni-huiwen',
      name: '汇文明朝 · Bodoni',
      shortLabel: '汇文明朝',
      desc: '旧画报铅字明朝体 + Bodoni Moda',
      sample: '博物奇珍与远方山海 · Museum Curios',
      cssUrl: 'https://cdn.jsdelivr.net/npm/@chinese-fonts/hwmct@3.0.0/dist/%E6%B1%87%E6%96%87%E6%98%8E%E6%9C%9D%E4%BD%93/result.css',
      enDisplay: '"Bodoni Moda", "Huiwen-mincho", "Noto Serif SC", Georgia, serif',
      enSans: '"Plus Jakarta Sans", "Huiwen-mincho", "Noto Sans SC", sans-serif',
      zhBody: '"Huiwen-mincho", "Noto Serif SC", Georgia, serif',
      zhUi: '"Huiwen-mincho", "Noto Sans SC", sans-serif',
      zhBodyWeight: '400'
    },
    'classic-caslon': {
      id: 'classic-caslon',
      name: '思源极细宋 · Caslon',
      shortLabel: '极细雅宋',
      desc: '思源宋体 Light 纤细衬线 + Libre Caslon',
      sample: '天青色等烟雨 · Celadon Horizon',
      cssUrl: '',
      enDisplay: '"Libre Caslon Display", "Noto Serif SC", Georgia, serif',
      enSans: '"Libre Franklin", "Noto Sans SC", sans-serif',
      zhBody: '"Noto Serif SC", "Songti SC", Georgia, serif',
      zhUi: '"Noto Serif SC", "Noto Sans SC", sans-serif',
      zhBodyWeight: '300'
    },
    'cormorant-wenkai': {
      id: 'cormorant-wenkai',
      name: '霞鹜细楷 · Cormorant',
      shortLabel: '霞鹜细楷',
      desc: '温润手写细楷 + Cormorant 古典斜体',
      sample: '竹杖芒鞋轻胜马 · Poetic Scroll',
      cssUrl: 'https://cdn.jsdelivr.net/npm/@chinese-fonts/lxgwwenkai@3.0.0/dist/LXGWWenKai-Light/result.css',
      enDisplay: '"Cormorant Garamond", "LXGW WenKai Light", "Noto Serif SC", Georgia, serif',
      enSans: '"Plus Jakarta Sans", "LXGW WenKai Light", sans-serif',
      zhBody: '"LXGW WenKai Light", "STKaiti", "KaiTi", "Noto Serif SC", serif',
      zhUi: '"LXGW WenKai Light", "Noto Sans SC", sans-serif',
      zhBodyWeight: '300'
    },
    'instrument-oldsong': {
      id: 'instrument-oldsong',
      name: '京华老宋 · Instrument',
      shortLabel: '京华老宋',
      desc: '传统雕版老宋气韵 + Instrument 修长衬线',
      sample: '星垂平野阔 · Deep Cosmos',
      cssUrl: 'https://cdn.jsdelivr.net/npm/@chinese-fonts/jhlst@3.0.0/dist/%E4%BA%AC%E8%8F%AF%E8%80%81%E5%AE%8B%E4%BD%93v2_002/result.css',
      enDisplay: '"Instrument Serif", "KingHwa_OldSong", "Noto Serif SC", Georgia, serif',
      enSans: '"Libre Franklin", "KingHwa_OldSong", "Noto Sans SC", sans-serif',
      zhBody: '"KingHwa_OldSong", "Noto Serif SC", Georgia, serif',
      zhUi: '"KingHwa_OldSong", "Noto Sans SC", sans-serif',
      zhBodyWeight: '400'
    },
    'playfair-bright': {
      id: 'playfair-bright',
      name: '文楷明体 · Playfair',
      shortLabel: '文楷明体',
      desc: '欧文衬线融合细楷 + Playfair 画册风',
      sample: '浮生若梦为欢几何 · Editorial Art',
      cssUrl: 'https://cdn.jsdelivr.net/npm/@chinese-fonts/lxgwwenkaibright@2.0.0/dist/LXGWBright-Light/result.css',
      enDisplay: '"Playfair Display", "LXGW Bright Light", "Noto Serif SC", Georgia, serif',
      enSans: '"Plus Jakarta Sans", "LXGW Bright Light", sans-serif',
      zhBody: '"LXGW Bright Light", "Noto Serif SC", Georgia, serif',
      zhUi: '"LXGW Bright Light", "Noto Sans SC", sans-serif',
      zhBodyWeight: '300'
    }
  };

  const OBSIDIAN_CATALOG_URL = '';
  const OBSIDIAN_ASK_URL = '';

  const MUSEUM_FACETS_UI = [
    { id: 'all', label: '全部馆藏' },
    { id: 'china-ancient', label: '商周秦汉' },
    { id: 'china-tang-song', label: '唐宋风雅' },
    { id: 'china-ming-qing', label: '明清器物' },
    { id: 'egypt', label: '古埃及' },
    { id: 'mesopotamia-persia', label: '两河波斯' },
    { id: 'greco-roman', label: '希腊罗马' },
    { id: 'japan-edo', label: '江户浮世绘' },
    { id: 'south-asia', label: '南亚喜马拉雅' },
    { id: 'renaissance', label: '文艺复兴' },
    { id: 'baroque-dutch', label: '巴洛克与尼德兰' },
    { id: 'impressionism', label: '印象派与现代' }
  ];

  const LANDSCAPE_FACETS_UI = [
    { id: 'all', label: '全境总览' },
    { id: 'natgeo-wildlife', label: '生灵纪实' },
    { id: 'macro-world', label: '微距奇观' },
    { id: 'forest-mist', label: '幽林飞瀑' },
    { id: 'polar-fjord', label: '极地流光' },
    { id: 'alpine-lake', label: '雪峰冰湖' },
    { id: 'ocean-reef', label: '深海环礁' },
    { id: 'desert-volcano', label: '天象熔岩' },
    { id: 'bing-uhd', label: '地理遗产' },
    { id: 'earthview', label: '轨道俯瞰' },
    { id: 'deep-cosmos', label: '深空星云' }
  ];

  const DEFAULT_PREFERENCES = {
    theme: 'celadon-mist',
    fontPreset: 'caslon-zhuque',
    seenMode: 'inspect', // 'inspect' | 'open' | 'off'
    freeformNote:
      '偏爱宋代影青瓷、古罗马虹彩玻璃、怀表与温润玉器；画作喜欢印象派水面光影、浮世绘与宋人云山小品；风景想要太空俯瞰地球、冰川、极光、高山湖泊与星云；书籍与神话想读完整有脉络的词条，比如博尔赫斯、卡尔维诺、枕草子、希腊神话或电影幕后，不要碎片鸡汤。',
    channels: [
      { id: 'antiques', slot: 1, title: '古董与奇珍', enTitle: ['CURIOS &', 'ANTIQUES'], sup: 'WINDOW 01', weight: 3, query: '宋瓷 影青 玻璃 玉器 青铜 珐琅' },
      { id: 'paintings', slot: 2, title: '画作与光影', enTitle: ['FINE ART', '& LIGHT'], sup: 'WINDOW 02', weight: 3, query: '莫奈 睡莲 印象派 浮世绘 梵高 云山' },
      { id: 'landscapes', slot: 3, title: '远方4K秘境', enTitle: ['HORIZON', 'EARTH 4K'], sup: 'WINDOW 03', weight: 3, query: '太空俯瞰 冰川 极光 峡湾 雪山湖泊 盐沼' },
      { id: 'quotes', slot: 4, title: '书籍·漫游拾句', enTitle: ['BOOKS &', 'PASSAGES'], sup: 'WINDOW 04', weight: 3, query: '博尔赫斯 卡尔维诺 枕草子 佩索阿 庄子' },
      { id: 'cosmos', slot: 5, title: '星云与博物', enTitle: ['COSMOS &', 'MINERALS'], sup: 'WINDOW 05', weight: 2, query: '星云 星系 韦伯望远镜 博物图谱' },
      { id: 'stories', slot: 6, title: '神话·影音·哲思', enTitle: ['MYTH &', 'CINEMA'], sup: 'WINDOW 06', weight: 2, query: '希腊神话 库布里克 塔可夫斯基 思想实验 科学史' }
    ]
  };

  // ==================== 真实 4K 开放馆藏 + 高品味文学/哲思/神话切片种子库 ====================
  const CURATED_POOL = [
    // ---------- 01 古董与奇珍 (antiques) ----------
    {
      id: 'cma-380118-qingbai',
      channel: 'antiques',
      kind: 'image',
      title: '南宋 · 景德镇影青釉银扣盖碗一对',
      shortTitle: '南宋影青<br>银扣盖碗',
      subtitle: '12–13 世纪 · 克利夫兰艺术博物馆藏 (3400px 4K)',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/2020.173/2020.173_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/2020.173/2020.173_print.jpg',
      story: '宋人把这种介于青与白之间的薄胎瓷叫作「影青」——对着窗光看，胎体薄得几乎透出手指的影子，积釉处却像雨后初晴的一汪浅湖水。窑工特意用松柴烧造以阻绝氧化，出窑后再在口沿镶上一圈纤细的银扣，八百年前的茶席审美清冷得没有一丝火气。',
      meta: ['南宋 · 1100s–1200s', '青白釉镶银口', 'Cleveland Museum of Art CC0'],
      tags: ['宋瓷', '影青', '青瓷', '茶器', 'qingbai', 'celadon'],
      palette: ['#82b2ad', '#eef6f5', '#d5dfd9']
    },
    {
      id: 'cma-695985-goryeo-celadon',
      channel: 'antiques',
      kind: 'image',
      title: '高丽翡色青瓷暗花莲瓣碗',
      shortTitle: '高丽翡色<br>青瓷莲碗',
      subtitle: '13 世纪 · 高丽王朝 · 克利夫兰艺术博物馆 (3400×2477)',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/2025.179/2025.179_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/2025.179/2025.179_print.jpg',
      story: '北宋徐兢出使高丽时，在《宣和奉使高丽图经》里惊叹当地秘色瓷「色泽温润如美玉」。放大到 4K 看碗壁，整片灰青色玻璃质釉层下布满了细如蝉翼的天然冰裂开片，底下隐约浮出手工剔刻的莲瓣暗纹。',
      meta: ['13 世纪 · 高丽王朝', '秘色青瓷 · 冰裂开片', '3400×2477 4K 原片'],
      tags: ['青瓷', '冰裂纹', '高丽', '宋瓷', 'celadon'],
      palette: ['#78a69a', '#ecf4f1', '#c7d8d0']
    },
    {
      id: 'cma-370537-iridescent-vase',
      channel: 'antiques',
      kind: 'image',
      title: '蒂芙尼风格虹彩吹制玻璃天南星花瓶',
      shortTitle: '虹彩吹制<br>琉璃花器',
      subtitle: '约 1900–1920 · 新艺术运动时期 (2585×3400 4K)',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/2019.244/2019.244_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/2019.244/2019.244_print.jpg',
      story: '十九世纪末的玻璃匠人迷上了古罗马出土玻璃表面的银蓝色包浆——那是玻璃埋在湿润泥土里两千年后自然风化出的薄膜干涉虹彩。于是他们在炽热软化的玻璃表面喷上金属盐蒸汽，把孔雀羽、肥皂泡和晨露的折光永远冻在了这朵舒展的喇叭形花口上。',
      meta: ['c. 1900–1920', '虹彩吹制玻璃', '2585×3400 4K 原片'],
      tags: ['玻璃', '虹彩', '新艺术', '琉璃', 'glass'],
      palette: ['#6fa3b8', '#ebf4f8', '#dfbe99']
    },
    {
      id: 'cma-144577-northern-celadon',
      channel: 'antiques',
      kind: 'image',
      title: '北宋 · 耀州窑刻花缠枝牡丹青瓷碗',
      shortTitle: '北宋耀州<br>刻花青瓷',
      subtitle: '12 世纪 · 北方青瓷 · 克利夫兰艺术博物馆 (4K)',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/1969.226/1969.226_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/1969.226/1969.226_print.jpg',
      story: '北方耀州窑最绝的手艺叫「刀刀见泥」：匠人趁坯体半干时斜执竹刀飞快旋刻，深处积聚厚厚的橄榄绿玻璃釉，浅处露出淡青亮脊，一深一浅之间，整朵牡丹就像浮在水波底下一样立体。',
      meta: ['北宋 · 1100s', '耀州窑刻花青釉', 'Cleveland Museum of Art CC0'],
      tags: ['宋瓷', '青瓷', '耀州窑', 'celadon', 'porcelain'],
      palette: ['#849c78', '#eff4ec', '#d4cca8']
    },
    {
      id: 'cma-93173-poppy-inkwell',
      channel: 'antiques',
      kind: 'image',
      title: '百年书桌上的虞美人雕花黄铜玻璃墨水台',
      shortTitle: '虞美人花<br>古董墨水台',
      subtitle: '约 1898–1906 · 蒂芙尼工坊 · 纽约 (3400×2601 4K)',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/2018.289/2018.289_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/2018.289/2018.289_print.jpg',
      story: '在钢笔还没普及的年代，写信是一件很有仪式感的事：掀开镂空黄铜铸造的虞美人花苞盖子，底下衬着乳青色半透明花纹玻璃。哪怕一百年过去，依然能想象深夜台灯下蘸水笔尖轻碰瓶口那声清脆的轻响。',
      meta: ['c. 1898–1906', '镂空黄铜与压花玻璃', '3400×2601 4K 原片'],
      tags: ['文房', '玻璃', '铜器', '新艺术', '古董'],
      palette: ['#8c9e82', '#f2f5ef', '#d4a87e']
    },
    {
      id: 'cma-97491-comma-jade',
      channel: 'antiques',
      kind: 'image',
      title: '公元五世纪 · 翠绿硬玉勾玉坠饰',
      shortTitle: '五世纪<br>翠色勾玉',
      subtitle: '公元 400 年代 · 三国时代 · 3400×3137 4K 微距',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/1917.1057/1917.1057_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/1917.1057/1917.1057_print.jpg',
      story: '一千六百年前没有金属高速钻头，工匠纯粹靠石英砂沾水一点点研磨穿孔，把一块带天然云絮纹理的翠色硬玉磨得像刚凝结的春水豆荚。放大到 4K 能清晰看见玉石内部散开的白色云根与温润包浆。',
      meta: ['公元 5 世纪', '天然硬玉微距', '3400×3137 4K 原片'],
      tags: ['玉器', '古玉', '翡翠', 'jade'],
      palette: ['#6ca88c', '#eaf5f0', '#c8dfd3']
    },
    {
      id: 'cma-142716-stained-window',
      channel: 'antiques',
      kind: 'image',
      title: '光穿过的花园 · 1900 年乳白彩绘玻璃花窗',
      shortTitle: '百年彩绘<br>琉璃花窗',
      subtitle: '约 1900 · 纽约老宅旧藏 (1717×3400 4K)',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/1966.432/1966.432_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/1966.432/1966.432_print.jpg',
      story: '不用一滴颜料上色，全靠在熔融玻璃里混入不同深浅的钴蓝、琥珀与乳白氧化物，趁热拉出天然云霞纹再一片片嵌进铅条里。每当室外云层飘过，整扇窗自己就会呼吸明暗。',
      meta: ['c. 1900', '乳光彩色玻璃窗', '1717×3400 4K 原片'],
      tags: ['玻璃', '花窗', '琉璃', '古董', 'glass'],
      palette: ['#7a9ab8', '#eef3f8', '#e3c099']
    },
    {
      id: 'cma-111801-celadon-winepot',
      channel: 'antiques',
      kind: 'image',
      title: '宋元之际 · 龙泉青瓷瓜棱执壶',
      shortTitle: '龙泉青瓷<br>瓜棱执壶',
      subtitle: '13–14 世纪 · 龙泉窑粉青釉 (3400px 4K)',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/1930.325/1930.325_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/1930.325/1930.325_print.jpg',
      story: '饱满圆润的瓜棱壶腹配上一弯修长流口，粉青厚釉在棱线处微微泛白，在凹槽里积成柔和的湖绿色——这是龙泉窑最迷人的「出筋」效果，不靠繁复彩绘，单凭光线在起伏釉面上的厚薄折射就足够耐看。',
      meta: ['13–14 世纪', '龙泉窑粉青釉', 'Cleveland Museum of Art CC0'],
      tags: ['宋瓷', '龙泉窑', '青瓷', 'celadon', 'porcelain'],
      palette: ['#7db0a0', '#ebf5f2', '#cddfd8']
    },

    // ---------- 02 画作与光影 (paintings) ----------
    {
      id: 'cma-136510-monet-agapanthus',
      channel: 'paintings',
      kind: 'image',
      title: '莫奈 · 《睡莲与百子莲》晨光长卷',
      shortTitle: '莫奈睡莲<br>水光长卷',
      subtitle: 'Claude Monet · c. 1915–1926 · 吉维尼花园 (3400×1581 4K)',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/1960.81/1960.81_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/1960.81/1960.81_print.jpg',
      story: '晚年莫奈在吉维尼水塘边画下这幅超过四米宽的巨作时，完全省去了岸边与地平线——整张画布只有低头看见的水面：紫蓝色的云影沉在水底，几朵淡粉白睡莲浮在波光上面，你分不清眼睛看到的是深水还是倒映的天空。',
      meta: ['Claude Monet, c. 1915–26', '布面油画 · 425 cm 巨幅长卷', '3400×1581 4K 原片'],
      tags: ['莫奈', '睡莲', '印象派', 'Monet', 'impressionism'],
      palette: ['#7b93c4', '#eef1fa', '#d8a6c4']
    },
    {
      id: 'cma-136950-malin-clouds',
      channel: 'paintings',
      kind: 'image',
      title: '南宋马麟 · 《坐看云起图》纨扇页',
      shortTitle: '南宋马麟<br>坐看云起',
      subtitle: '1256 年 · 宋理宗御题王维诗 · 绢本水墨设色 (3400×2821 4K)',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/1961.421.1/1961.421.1_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/1961.421.1/1961.421_print.jpg',
      story: '七百七十年前的一把团扇：溪边山石上敞胸闲坐的文人连鞋都懒得穿好，仰头看着峡谷尽头一团刚从水汽里蒸腾起来的白云——恰好是王维那句「行到水穷处，坐看云起时」最松弛的宋代实景切片。放大到 4K 连南宋双丝细绢的经纬都清晰可数。',
      meta: ['马麟 · 南宋宝祐四年 (1256)', '绢本团扇 · 3400×2821 4K', 'Cleveland Museum of Art CC0'],
      tags: ['宋画', '云山', '马麟', '王维', '山水'],
      palette: ['#a99c82', '#f6f2ea', '#899b96']
    },
    {
      id: 'aic-14620-monet-pourville',
      channel: 'paintings',
      kind: 'image',
      title: '莫奈 · 《普维尔悬崖海风散步》',
      shortTitle: '普维尔崖顶<br>海风散步',
      subtitle: 'Claude Monet · 1882 · 芝加哥艺术博物馆藏 (IIIF 高清)',
      thumbUrl: 'https://www.artic.edu/iiif/2/b0effb1c-ff23-bbaa-f809-9fd94e31c1a0/full/843,/0/default.jpg',
      fullUrl: 'https://www.artic.edu/iiif/2/b0effb1c-ff23-bbaa-f809-9fd94e31c1a0/full/1686,/0/default.jpg',
      story: '1882 年夏天诺曼底海岸的晴风几乎要从画框里吹出来：草甸上的野花、海面跳跃的碎白浪、远处倾斜的白帆和女士被吹起的纱巾全用同一套短促轻快的笔触写成。整幅画连一处沉闷的阴影都没有，全是咸湿明亮的夏天。',
      meta: ['Claude Monet · 1882', '诺曼底海岸写生', 'Art Institute of Chicago CC0'],
      tags: ['莫奈', '海岸', '印象派', 'Monet', 'impressionism'],
      palette: ['#6ca4c4', '#ecf5fa', '#e5a99e']
    },
    {
      id: 'aic-16564-monet-seine-mist',
      channel: 'paintings',
      kind: 'image',
      title: '莫奈 · 《吉维尼塞纳河畔的晨雾》',
      shortTitle: '塞纳河畔<br>粉紫晨雾',
      subtitle: 'Claude Monet · 1897 · 清晨五点半的水面显影',
      thumbUrl: 'https://www.artic.edu/iiif/2/838d8c33-a3b4-68ea-587b-87ceec2011af/full/843,/0/default.jpg',
      fullUrl: 'https://www.artic.edu/iiif/2/838d8c33-a3b4-68ea-587b-87ceec2011af/full/1686,/0/default.jpg',
      story: '莫奈那年夏天每天凌晨三点半起床，撑着装满十几块画布的小船停在塞纳河支流中央，只为抓天刚蒙蒙亮那二十分钟——雾气还没散尽，树影和水面全融在淡丁香紫、冰青与珍珠粉的薄纱里，静得连桨声都不忍心惊动。',
      meta: ['Claude Monet · 1897', '晨雾系列 · 布面油画', 'Art Institute of Chicago CC0'],
      tags: ['莫奈', '晨雾', '印象派', 'Monet'],
      palette: ['#9aa6c9', '#f1f3fa', '#d8b4c8']
    },
    {
      id: 'aic-27992-seurat-grande-jatte',
      channel: 'paintings',
      kind: 'image',
      title: '修拉 · 《大碗岛的星期天下午》点彩光谱',
      shortTitle: '大碗岛的<br>周日午后',
      subtitle: 'Georges Seurat · 1884–1886 · 芝加哥艺术博物馆镇馆之作',
      thumbUrl: 'https://www.artic.edu/iiif/2/2d484387-2509-5e8e-2c43-22f9981972eb/full/843,/0/default.jpg',
      fullUrl: 'https://www.artic.edu/iiif/2/2d484387-2509-5e8e-2c43-22f9981972eb/full/1686,/0/default.jpg',
      story: '修拉把光学论文搬上了画布：他不在调色盘上把蓝和黄混成绿色，而是用成千上万颗纯粹的小色点并排点在画布上，退后三步由你的视网膜自己去合成发光的草地。放大滚轮细看，连树荫里都藏着橘粉与群青的跳跃像素。',
      meta: ['Georges Seurat · 1884–86', '光学点彩派代表作', 'Art Institute of Chicago CC0'],
      tags: ['修拉', '点彩', '印象派', '光影'],
      palette: ['#7fa886', '#eff6f0', '#d9a482']
    },
    {
      id: 'aic-109314-vangogh-spring',
      channel: 'paintings',
      kind: 'image',
      title: '梵高 · 《克利希桥畔的春日垂钓》',
      shortTitle: '梵高春日<br>河岸垂钓',
      subtitle: 'Vincent van Gogh · 1887 · 巴黎时期最明快的一抹薄荷绿',
      thumbUrl: 'https://www.artic.edu/iiif/2/5512cee9-6d00-d01b-b0be-ac7843cc8f76/full/843,/0/default.jpg',
      fullUrl: 'https://www.artic.edu/iiif/2/5512cee9-6d00-d01b-b0be-ac7843cc8f76/full/1686,/0/default.jpg',
      story: '很少见到这么轻盈舒展的梵高：刚到巴黎接触印象派与日本浮世绘那年春天，他脱掉了早期暗沉的土褐色，用清透的柠檬黄、薄荷绿与水蓝色短横笔触画下塞纳河边安静钓鱼的小船，整幅画都在春风里轻轻摇晃。',
      meta: ['Vincent van Gogh · 1887', '布面油画 · 巴黎时期', 'Art Institute of Chicago CC0'],
      tags: ['梵高', '印象派', '春天', 'Van Gogh'],
      palette: ['#7cb89d', '#edf7f2', '#e8ca7e']
    },
    {
      id: 'cma-115050-twachtman-clouds',
      channel: 'paintings',
      kind: 'image',
      title: '特瓦奇曼 · 《低垂的雨云与银色水面》',
      shortTitle: '银灰雨云<br>低垂水面',
      subtitle: 'John Henry Twachtman · 1880 · 3400×2050 4K',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/1935.217/1935.217_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/1935.217/1935.217_print.jpg',
      story: '整张画面八成留给了刚吸饱水汽、正缓缓压向河湾的灰蓝色云层，只在天际裂口处漏出一线温润的珍珠白，像极了阵雨落下前三分钟空气里微凉的气息。',
      meta: ['John Henry Twachtman · 1880', '3400×2050 4K 原片', 'Cleveland Museum of Art CC0'],
      tags: ['风景画', '云层', '水岸', '光影'],
      palette: ['#7b8fa3', '#edf1f5', '#c9bfb0']
    },
    {
      id: 'aic-28560-vangogh-bedroom',
      channel: 'paintings',
      kind: 'image',
      title: '梵高 · 《阿尔勒的黄色小屋卧室》',
      shortTitle: '阿尔勒的<br>淡蓝卧室',
      subtitle: 'Vincent van Gogh · 1889 · 他写信说这幅画只关于「绝对的休息」',
      thumbUrl: 'https://www.artic.edu/iiif/2/6644829f-f292-c5c4-a73c-0356a6fdbf0d/full/843,/0/default.jpg',
      fullUrl: 'https://www.artic.edu/iiif/2/6644829f-f292-c5c4-a73c-0356a6fdbf0d/full/1686,/0/default.jpg',
      story: '梵高在给弟弟提奥的信里特意交代：淡紫蓝色的墙、柠檬黄木床、浅绿窗框——所有家具都成双成对（两把椅子、两只枕头、两幅墙画），画面故意省略阴影，像日本木版画一样平涂，只为了让看画的人眼睛和大脑都彻底歇下来。',
      meta: ['Vincent van Gogh · 1889', '布面油画 · 芝加哥藏第二版', 'Art Institute of Chicago CC0'],
      tags: ['梵高', '浮世绘', '色彩', 'Van Gogh'],
      palette: ['#7ea0c9', '#edf3fa', '#ebca78']
    },

    // ---------- 03 远方4K地貌 (landscapes) ----------
    {
      id: 'wiki-143032322-myvatn-aurora',
      channel: 'landscapes',
      kind: 'image',
      title: '冰岛米湖上空折叠的翡翠极光倒影',
      shortTitle: '冰岛米湖<br>极光镜面',
      subtitle: 'Mývatn, Iceland · Wikimedia 年度精选摄影 (6837×4560 超清)',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/99/039_Northern_lights_over_M%C3%BDvatn_%28Iceland%29_Photo_by_Giles_Laurent.jpg/960px-039_Northern_lights_over_M%C3%BDvatn_%28Iceland%29_Photo_by_Giles_Laurent.jpg',
      fullUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/99/039_Northern_lights_over_M%C3%BDvatn_%28Iceland%29_Photo_by_Giles_Laurent.jpg/2560px-039_Northern_lights_over_M%C3%BDvatn_%28Iceland%29_Photo_by_Giles_Laurent.jpg',
      story: '距离地表一百公里的高空大气里，太阳风电子撞击氧原子激发出 557.7 纳米的翠绿光带，刚好遇上冰岛北部米湖无风结冰前的静水夜，整条发光的丝绸在湖面上上下对称铺开。',
      meta: ['冰岛米湖 · Giles Laurent 摄', 'Wikimedia Featured Picture', '4K 超清无损缩略流'],
      tags: ['极光', '冰岛', '湖泊', 'aurora', 'iceland'],
      palette: ['#5ea898', '#eaf6f3', '#7f8cc4']
    },
    {
      id: 'wiki-8472717-upsala-glacier',
      channel: 'landscapes',
      kind: 'image',
      title: '巴塔哥尼亚乌普萨拉冰川的冰蓝裂隙',
      shortTitle: '巴塔哥尼亚<br>乌普萨拉冰川',
      subtitle: '南美安第斯冰原 · 4288×2848 4K 航拍实景',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2e/Upsala_Glacier%2C_Argentina.jpg/960px-Upsala_Glacier%2C_Argentina.jpg',
      fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2e/Upsala_Glacier%2C_Argentina.jpg',
      story: '为什么万年冰川深处是孔雀蓝而不是白色的？因为积雪被自身重量挤压数百年后排空了所有微小气泡，致密的冰晶吸收了阳光里的红橙长波，只把最清澈的短波蓝光散射回你的眼睛里。',
      meta: ['阿根廷洛斯格拉西亚雷斯', '4288×2848 4K 原片', 'Wikimedia Featured Picture'],
      tags: ['冰川', '雪山', '南美', 'glacier'],
      palette: ['#6da8c9', '#eaf4fa', '#bfd8e6']
    },
    {
      id: 'wiki-124751480-gokyo-lake',
      channel: 'landscapes',
      kind: 'image',
      title: '海拔 4750 米 · 喜马拉雅戈基奥冰川绿松石湖',
      shortTitle: '喜马拉雅<br>绿松石冰湖',
      subtitle: 'Gokyo Lake, Nepal · 4027×2685 4K 精选地貌',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Gokyo_Ri_summit%2C_Gokyo_Lake%2C_Nepal%2C_Himalayas.jpg/960px-Gokyo_Ri_summit%2C_Gokyo_Lake%2C_Nepal%2C_Himalayas.jpg',
      fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Gokyo_Ri_summit%2C_Gokyo_Lake%2C_Nepal%2C_Himalayas.jpg',
      story: '世界上海拔最高的淡水湖系之一。冰川研磨岩石产生的极细微「冰川岩粉」常年悬浮在融雪水体中，让湖面在正午高海拔阳光下呈现出仿佛上过宋代松石釉般的乳青色。',
      meta: ['尼泊尔 · 海拔 4,750m', '4027×2685 4K 原片', 'Wikimedia Featured Picture'],
      tags: ['雪山', '湖泊', '冰川', '喜马拉雅', 'mountain'],
      palette: ['#5fa2ad', '#e9f5f7', '#cbbca8']
    },
    {
      id: 'wiki-154986747-zagedan-cirque',
      channel: 'landscapes',
      kind: 'image',
      title: '高加索山脉扎格丹冰斗湖的夏末晨光',
      shortTitle: '高加索山<br>冰斗双湖',
      subtitle: 'Zagedan Lakes, Caucasus · 4912×3264 4K',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/88/Zagedan_Lakes%2C_Mountain_cirque%2C_Caucasus_Mountains.jpg/960px-Zagedan_Lakes%2C_Mountain_cirque%2C_Caucasus_Mountains.jpg',
      fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/88/Zagedan_Lakes%2C_Mountain_cirque%2C_Caucasus_Mountains.jpg',
      story: '古冰川退却后在山脊高处挖出的天然石碗，盛着两汪清澈见底的融雪水。八月末高山草甸刚染上一层浅金与苔绿，风还没起，整座山峰像印在玻璃上一样清晰。',
      meta: ['高加索山脉冰斗湖', '4912×3264 4K 原片', 'Wikimedia Featured Picture'],
      tags: ['高山湖泊', '草甸', '雪山', 'lake', 'mountain'],
      palette: ['#6ca094', '#edf6f4', '#d8c596']
    },
    {
      id: 'wiki-148263164-magenta-aurora',
      channel: 'landscapes',
      kind: 'image',
      title: '罕见 G5 级地磁暴下的品红与浅紫极光穹顶',
      shortTitle: '北欧海湾<br>品红极光夜',
      subtitle: '瑞典西海岸 Lysekil · 5184×3456 4K 实拍',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e3/Magenta_G5_aurora_over_Tuntorp%2C_Lysekil_Municipality_11.jpg/960px-Magenta_G5_aurora_over_Tuntorp%2C_Lysekil_Municipality_11.jpg',
      fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e3/Magenta_G5_aurora_over_Tuntorp%2C_Lysekil_Municipality_11.jpg',
      story: '平时极光多为绿色，只有当强烈太阳风暴把高能粒子一路推入低空氮分子层时，蓝光与高空氧原子的红光才会混合出这种如梦似幻的洋红、丁香紫与珊瑚粉光柱——跟世界之窗丝绸背景里的棱镜光谱几乎同源。',
      meta: ['瑞典 Lysekil · G5 极光夜', '5184×3456 4K 原片', 'Wikimedia Featured Picture'],
      tags: ['极光', '北欧', '星空', 'aurora'],
      palette: ['#b580ba', '#f6eef7', '#7aa4c4']
    },
    {
      id: 'wiki-51789190-svalbard-glacier',
      channel: 'landscapes',
      kind: 'image',
      title: '北纬七十八度 · 斯瓦尔巴群岛入海冰墙崩解瞬间',
      shortTitle: '北极斯瓦尔巴<br>入海冰墙',
      subtitle: 'Svitjordbreen, Svalbard · 4969×2795 4K',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e2/Svitjordbreen_on_Svalbard_calving.jpg/960px-Svitjordbreen_on_Svalbard_calving.jpg',
      fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Svitjordbreen_on_Svalbard_calving.jpg',
      story: '北极圈深处的冰舌缓缓推入深海峡湾，几十米高的淡青色冰壁在寂静中剥落入海，激起一圈乳白色水雾，封存了上万年的古大气气泡在海水里咝咝释放出来。',
      meta: ['北极斯瓦尔巴群岛', '4969×2795 4K 原片', 'Wikimedia Featured Picture'],
      tags: ['北极', '冰川', '峡湾', '海岸', 'glacier', 'fjord'],
      palette: ['#729eb5', '#ecf4f8', '#cbdbe3']
    },
    {
      id: 'wiki-915077-jokulsarlon',
      channel: 'landscapes',
      kind: 'image',
      title: '冰岛杰古沙龙冰河湖 · 漂向大海的浮冰雕塑',
      shortTitle: '冰岛冰河湖<br>漂流蓝冰',
      subtitle: 'Jökulsárlón, Iceland · 2921×1931 高清摄影',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a5/Jokulsarlon_lake%2C_Iceland.jpg/960px-Jokulsarlon_lake%2C_Iceland.jpg',
      fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Jokulsarlon_lake%2C_Iceland.jpg',
      story: '瓦特纳冰原脱落的巨大浮冰在这片安静的潟湖里慢慢融化、翻转，每一块都被水和风雕成独一无二的半透明形状，最后顺着水道漂进黑沙滩外的大西洋。',
      meta: ['冰岛东南岸 · Jökulsárlón', '2921×1931 原片', 'Wikimedia Featured Picture'],
      tags: ['冰岛', '浮冰', '海岸', '湖泊', 'iceland'],
      palette: ['#6e9cb8', '#edf4f9', '#b8cdd9']
    },
    {
      id: 'wiki-99193060-sofia-massif',
      channel: 'landscapes',
      kind: 'image',
      title: '云端雪线与翠谷 · 索菲亚冰川山峰全景',
      shortTitle: '雪线飞瀑与<br>高山翠谷',
      subtitle: 'Sofia Glacier, Caucasus · 4912×2760 4K 宽幅',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/16/Sofia_Massif_and_Sofia_Glacier%2C_Karachay-Cherkessia%2C_Caucasus_Mountains.jpg/960px-Sofia_Massif_and_Sofia_Glacier%2C_Karachay-Cherkessia%2C_Caucasus_Mountains.jpg',
      fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/16/Sofia_Massif_and_Sofia_Glacier%2C_Karachay-Cherkessia%2C_Caucasus_Mountains.jpg',
      story: '上半截是终年不化的银白悬冰川与灰蓝花岗岩刃脊，下半截十几道细长的融雪飞瀑垂直跌进松林和野花盛开的翠绿河谷，像一幅把冬天和盛夏叠在同一帧里的宽银幕。',
      meta: ['索菲亚山脉 · 4912×2760 4K', 'Wikimedia Featured Picture', '双季同框地貌'],
      tags: ['雪山', '瀑布', '冰川', '山谷', 'mountain'],
      palette: ['#739e8c', '#eef6f2', '#9fb8cc']
    },
    {
      id: 'ev-1820',
      channel: 'landscapes',
      kind: 'image',
      facet: 'earthview',
      title: '太空俯瞰 · 冰岛南岸瓦特纳冰川辫状河网',
      shortTitle: '太空俯瞰<br>冰岛辫状河',
      subtitle: 'Google Earth View 卫星 4K · Southern Iceland (63.75°N, 17.50°W)',
      thumbUrl: 'https://www.gstatic.com/prettyearth/assets/full/1820.jpg',
      fullUrl: 'https://www.gstatic.com/prettyearth/assets/full/1820.jpg',
      mapUrl: 'https://www.google.com/maps/@63.749262,-17.503828,15z/data=!3m1!1e3',
      country: '冰岛',
      wikiTitle: '瓦特纳冰原',
      relatedSeeds: ['瓦特纳冰原', '辫状河流', '冰岛地理', '冰川融水'],
      story: '从近地轨道垂直俯视冰岛南岸火山黑砂平原：富含火山灰与玄武岩矿粉的冰川融水在大地上分叉交织成银蓝色与乳青色的树根状水网，像极了一幅自己会流动的宋代矿彩长卷。',
      meta: ['冰岛南岸 · 卫星遥感', 'Google Earth View 4K', '63.75°N 地球坐标'],
      tags: ['太空俯瞰', '冰岛', '冰川', 'earthview'],
      palette: ['#6ea8b8', '#ecf5f8', '#9ec4b5']
    },
    {
      id: 'ev-1027',
      channel: 'landscapes',
      kind: 'image',
      facet: 'earthview',
      title: '太空俯瞰 · 巴哈马伊柳塞拉岛海底翡翠潮汐沙洲',
      shortTitle: '太空俯瞰<br>巴哈马潮汐海',
      subtitle: 'Google Earth View 卫星 4K · South Eleuthera, Bahamas',
      thumbUrl: 'https://www.gstatic.com/prettyearth/assets/full/1027.jpg',
      fullUrl: 'https://www.gstatic.com/prettyearth/assets/full/1027.jpg',
      mapUrl: 'https://www.google.com/maps/@24.936413,-76.333179,14z/data=!3m1!1e3',
      country: '巴哈马',
      wikiTitle: '大巴哈马浅滩',
      relatedSeeds: ['巴哈马', '伊柳塞拉岛', '珊瑚礁', '鲕粒灰岩'],
      story: '大西洋洋流每天两次冲刷大巴哈马浅滩洁白的钙质珊瑚砂，在水下几米深处雕出羽毛般的翡翠与孔雀蓝潮汐水道。连阿波罗宇航员当年在轨道上都说，全地球最好认的颜色就是巴哈马这抹荧光浅蓝。',
      meta: ['巴哈马 · 珊瑚浅滩', 'Google Earth View 4K', '24.94°N 地球坐标'],
      tags: ['太空俯瞰', '海岸', '珊瑚礁', 'earthview'],
      palette: ['#5db5be', '#e9f7f8', '#bce3df']
    },
    {
      id: 'ev-5945',
      channel: 'landscapes',
      kind: 'image',
      facet: 'earthview',
      title: '太空俯瞰 · 玻利维亚安第斯高原盐沼矿脉纹理',
      shortTitle: '太空俯瞰<br>安第斯盐沼',
      subtitle: 'Google Earth View 卫星 4K · Daniel Campos, Bolivia',
      thumbUrl: 'https://www.gstatic.com/prettyearth/assets/full/5945.jpg',
      fullUrl: 'https://www.gstatic.com/prettyearth/assets/full/5945.jpg',
      mapUrl: 'https://www.google.com/maps/@-19.863042,-67.193161,14z/data=!3m1!1e3',
      country: '玻利维亚',
      wikiTitle: '乌尤尼盐沼',
      relatedSeeds: ['乌尤尼盐沼', '阿尔蒂普拉诺高原', '安第斯山脉', '盐湖'],
      story: '海拔三千六百米的玻利维亚高原古内陆海干涸后，留下数万平方公里的纯白锂盐壳与火山碎屑冲积扇，在稀薄洁净的高原阳光下显出宣纸洒金与松石绿般的天然几何纹样。',
      meta: ['玻利维亚 · 海拔 3,656m', 'Google Earth View 4K', '19.86°S 地球坐标'],
      tags: ['太空俯瞰', '盐沼', '南美', 'earthview'],
      palette: ['#8caea8', '#f2f6f4', '#d8be9c']
    },
    {
      id: 'ev-5583',
      channel: 'landscapes',
      kind: 'image',
      facet: 'earthview',
      title: '太空俯瞰 · 纳米布八千万年古红沙漠与枯水河界',
      shortTitle: '太空俯瞰<br>纳米布红沙海',
      subtitle: 'Google Earth View 卫星 4K · Gobabeb, Namibia',
      thumbUrl: 'https://www.gstatic.com/prettyearth/assets/full/5583.jpg',
      fullUrl: 'https://www.gstatic.com/prettyearth/assets/full/5583.jpg',
      mapUrl: 'https://www.google.com/maps/@-23.537088,15.023289,17z/data=!3m1!1e3',
      country: '纳米比亚',
      wikiTitle: '纳米布沙漠',
      relatedSeeds: ['纳米布沙漠', '苏丝斯黎', '本格拉寒流', '风成地貌'],
      story: '地球上最古老的沙漠被库伊塞布间歇河一刀切开：南侧是氧化铁染成珊瑚橘红的百米高新月形沙丘，北侧却是寸沙难越的灰白砾石荒原，季节性洪水每年准时把企图过河的沙舌冲回大海。',
      meta: ['纳米比亚 · 戈巴贝布', 'Google Earth View 4K', '23.54°S 地球坐标'],
      tags: ['太空俯瞰', '沙漠', '纳米比亚', 'earthview'],
      palette: ['#cf9678', '#f8f1ec', '#8aa3ad']
    },

    // ---------- 04 有意思的句子 (quotes) ----------
    {
      id: 'quote-sei-shonagon-makura',
      channel: 'quotes',
      kind: 'quote',
      title: '清少纳言在一千年前列的「想起来就让人开心的小事」',
      shortTitle: '《枕草子》<br>微末欢喜单',
      subtitle: '清少纳言 · 《枕草子》（平安时代随笔）',
      quote: '把撕碎的信纸随手拼起来，居然一下就对准了裂口；夜里醒来渴得要命，摸黑居然正好有冰凉的水喝；夏天傍晚洗完头坐在穿堂风里，发梢还没全干的时候，有人送来一封字迹清秀的短笺。',
      story: '一千年前京都宫廷里的清少纳言既不写宏大史诗，也不讲大道理，她把皇后的赏赐一沓好纸藏在枕头底下，专门给世间万物拉清单：「令人扫兴的事」「明明很远却近在眼前的事」「看着很优雅其实心里直打鼓的事」。读她的笔记总觉得她要是活在今天，绝对是最会发碎碎念的朋友。',
      meta: ['清少纳言 · 公元 1000 年前后', '《枕草子》生活切片', '反宏大叙事鼻祖'],
      tags: ['枕草子', '随笔', '日常审美', '冷幽默'],
      palette: ['#82afa6', '#eef7f5', '#e4b9a8']
    },
    {
      id: 'quote-calvino-lightness',
      channel: 'quotes',
      kind: 'quote',
      title: '卡尔维诺谈「轻盈」：像小鸟一样轻，而不是像羽毛一样轻',
      shortTitle: '卡尔维诺<br>精准的轻盈',
      subtitle: '伊塔洛·卡尔维诺 · 《未来千年文学备忘录 · 轻》',
      quote: '请你们注意，我所说的轻，总是与精确和坚定连在一起的，而不是与模糊和随波逐流相连。保罗·瓦莱里说过：「应当像小鸟一样轻，而不是像羽毛一样轻。」',
      story: '羽毛的轻是被风吹到哪算哪；小鸟的轻却是心里清楚要停在哪根树枝上，拍拍翅膀就能干脆利落地掠过沉重的地面。卡尔维诺写《树上的男爵》里一辈子住在树冠上不肯下地却依然谈恋爱、救火、跟拿破仑聊天的柯希莫，讲的就是这种带骨架的轻盈。',
      meta: ['伊塔洛·卡尔维诺 · 1985', '《未来千年文学备忘录》', '轻盈与精确'],
      tags: ['卡尔维诺', '文学', '轻盈', '哲思'],
      palette: ['#7fa4bf', '#edf4f9', '#e3c496']
    },
    {
      id: 'quote-pessoa-cloud-clerk',
      channel: 'quotes',
      kind: 'quote',
      title: '里斯本会计员佩索阿：我的心略大于整个宇宙',
      shortTitle: '佩索阿<br>道拉多雷斯街',
      subtitle: '费尔南多·佩索阿 · 《不安之书》',
      quote: '今天我突然领悟到一个荒谬而千真万确的事实：从来没有人真正到过道拉多雷斯街之外的地方。一切风景都在你怎样看下午四点钟斜照在会计账本边缘的那道光里。',
      story: '佩索阿白天在里斯本贸易公司当老老实实的商业信函翻译员，晚上回到租来的房间，给自己捏造了七十多个性格、文风甚至星座都完全不同的「异名者」（有牧羊人诗人、有工程师、有古典医生），让他们在杂志上互相写信争论。去世后人们打开他留下的大木箱，里面整整躺着两万五千页手稿。',
      meta: ['费尔南多·佩索阿', '《不安之书》', '里斯本木箱手稿'],
      tags: ['佩索阿', '文学', '漫游', '冷幽默'],
      palette: ['#939ec4', '#f0f2fa', '#dbb59e']
    },
    {
      id: 'quote-borges-paradise-library',
      channel: 'quotes',
      kind: 'quote',
      title: '博尔赫斯：如果每颗沙粒都是一页没有重复文字的泡泡',
      shortTitle: '博尔赫斯<br>地图与疆域',
      subtitle: '豪尔赫·路易斯·博尔赫斯 · 《论科学的精确性》全篇仅一段',
      quote: '在那个帝国里，制图术达到了如此精确的地步：一个省的地图就占满整座城市，帝国的地图占满整个省。后来制图师们仍不满足，造出了一幅与帝国一比一完全重合的地图。后代觉得这幅巨图毫无用处，便任由它在日晒雨淋中破败；如今西方的沙漠里，还零星残存着地图的碎片，栖息着野兽和乞丐。',
      story: '这篇小说全文只有一百多个字，却把「完美复刻现实」这件事调侃到了极致：当一张地图真的做到了跟世界一模一样大，它就不再是窗口，而变成了冗余的负担。好玩的窗口永远得留点呼吸的缝隙。',
      meta: ['豪尔赫·路易斯·博尔赫斯 · 1946', '百字微型小说神作', '冷幽默寓言'],
      tags: ['博尔赫斯', '冷幽默', '寓言', '哲思'],
      palette: ['#c9a47e', '#f8f3eb', '#84a6a1']
    },
    {
      id: 'quote-zhuangzi-useless-tree',
      channel: 'quotes',
      kind: 'quote',
      title: '庄子劝惠施：你嫌大葫芦和大树没用，为什么不躺树底下乘凉打个盹？',
      shortTitle: '庄子与惠施<br>大树底下乘凉',
      subtitle: '《庄子 · 逍遥游》最松弛的一段斗嘴',
      quote: '今子有大树，患其无用，何不树之于无何有之乡，广莫之野，彷徨乎无为其侧，逍遥乎寝卧其下？不夭斤斧，物无害者，无所可用，安所困苦哉！',
      story: '逻辑学家惠施跑去跟庄子吐槽：我家院子里长了棵臭椿树，树干疙疙瘩瘩没法拉墨线，树枝歪七扭八没法做规矩家具，木匠路过连看都不看一眼，跟你庄子讲的话一样大而无当。庄子一点不恼，笑眯眯回他：正因为做不了栋梁才没人拿斧头砍它呀，你搬张竹床躺它影子里吹风睡午觉，不比啥都强？',
      meta: ['《庄子 · 逍遥游》', '先秦最佳损友斗嘴', '无用之用'],
      tags: ['庄子', '哲学', '冷幽默', '小院'],
      palette: ['#80ab8e', '#eef6f0', '#d8be8c']
    },
    {
      id: 'quote-szymborska-possibilities',
      channel: 'quotes',
      kind: 'quote',
      title: '辛波斯卡的《种种可能》：偏爱不守时的绿色与荒谬的例外',
      shortTitle: '辛波斯卡<br>偏爱清单',
      subtitle: '维斯瓦娃·辛波斯卡（1996 诺贝尔文学奖）',
      quote: '我偏爱电影。我偏爱猫。我偏爱瓦尔塔河沿岸的橡树。我偏爱狄更斯胜过陀思妥耶夫斯基……我偏爱写诗的荒谬胜过不写诗的荒谬。我偏爱绿色的许多可能性。我偏爱不把一切都归咎于理性的例外。',
      story: '波兰女诗人辛波斯卡一辈子最怕严肃腔调，连领诺贝尔奖演讲开头都是「『我不知道』这四个字很小，但长着强壮的翅膀」。她用几十个毫不讲道理的「我偏爱」写成一首诗——人的品味本来就不必凑成严谨公式，喜欢哪颗泡泡全凭当下的心动。',
      meta: ['维斯瓦娃·辛波斯卡', '《种种可能》', '轻灵诗意'],
      tags: ['辛波斯卡', '诗歌', '偏爱', '冷幽默'],
      palette: ['#7fb096', '#edf6f1', '#dfa2b0']
    },
    {
      id: 'quote-wilde-fog',
      channel: 'quotes',
      kind: 'quote',
      title: '王尔德的逆向观察：不是画模仿自然，是伦敦的大雾在模仿印象派',
      shortTitle: '王尔德<br>伦敦雾模仿画',
      subtitle: '奥斯卡·王尔德 · 《谎言的衰落》(1889)',
      quote: '在画家把伦敦的雾画出来之前，伦敦的雾从哪里来？街上当然一直有让人咳嗽的气象水汽，但在惠斯勒和印象派把它们画成紫罗兰色与银灰色的夜曲之前，从来没有人真正「看见」过棕色与银色的雾。自然总是在模仿艺术。',
      story: '王尔德用半开玩笑的毒舌点破了一个极准的心理学现象：你先在莫奈或宋瓷里见过某种微妙的天青色和晚霞紫，第二天傍晚推门下楼，抬头突然发现整条街的天空居然全长成了画里的配色。',
      meta: ['奥斯卡·王尔德 · 1889', '《谎言的衰落》美学悖论', '艺术重塑眼睛'],
      tags: ['王尔德', '印象派', '美学', '冷幽默'],
      palette: ['#9c95be', '#f2f0f8', '#d9ad9c']
    },
    {
      id: 'quote-feynman-flower',
      channel: 'quotes',
      kind: 'quote',
      title: '费曼反驳画家朋友：懂物理只会给一朵花增加更多层的好看',
      shortTitle: '费曼看花<br>微观也是诗',
      subtitle: '理查德·费曼 · 《发现的乐趣》',
      quote: '我有个艺术家朋友总说：「你们科学家把一朵花拆成枯燥的分子，把它的美全毁了。」我觉得他才有点奇怪——我也看得见花瓣柔和的颜色，可我还能同时想象里面一个个细胞在忙活，想象花为什么为了昆虫演化出光谱颜色，这意味着昆虫也有审美？科学知识从来只做加法，不做减法。',
      story: '这位没事喜欢撬同事密码柜、在巴西狂欢节敲桑巴手鼓的诺奖物理学家晚年自己也学起了素描，还跟朋友约定互换课时——他教画家量子电动力学，画家教他怎么画人体线条。',
      meta: ['理查德·费曼', '物理与审美的和解', '科学小品'],
      tags: ['费曼', '科学史', '哲思', '好奇心'],
      palette: ['#6ca6b8', '#ecf5f8', '#e6b87d']
    },

    // ---------- 05 星云与博物 (cosmos) ----------
    {
      id: 'wiki-5254504-carina-nebula',
      channel: 'cosmos',
      kind: 'image',
      title: '距离地球 7500 光年 · 船底座星云恒星诞生尘埃柱',
      shortTitle: '船底座星云<br>发光尘埃云',
      subtitle: '欧洲南方天文台 ESO 观测 · 5828×3524 4K 深空摄影',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/45/ESO_-_The_Carina_Nebula_%28by%29.jpg/960px-ESO_-_The_Carina_Nebula_%28by%29.jpg',
      fullUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/45/ESO_-_The_Carina_Nebula_%28by%29.jpg/2560px-ESO_-_The_Carina_Nebula_%28by%29.jpg',
      story: '南天星空里最璀璨的恒星育婴室之一：年轻大质量恒星吹出的剧烈星风把周围氢气与星际尘埃雕琢成半透明的玫瑰色与冰蓝色泡泡云墙，每一缕丝绒般的亮边背后都有新恒星正在点燃核聚变。',
      meta: ['ESO 智利拉西拉天文台', '距地球约 7,500 光年', '5828×3524 深空 4K'],
      tags: ['星云', '深空', '天文', 'nebula', 'cosmos'],
      palette: ['#b57ea8', '#f6eef4', '#6d9ec4']
    },
    {
      id: 'wiki-1669175-helix-nebula',
      channel: 'cosmos',
      kind: 'image',
      title: '上帝之眼 · 宝瓶座螺旋星云的红外丝绒环',
      shortTitle: '宝瓶座<br>螺旋星云之眼',
      subtitle: 'NASA 斯皮策空间望远镜 · 4279×3559 4K',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7f/Comets_Kick_up_Dust_in_Helix_Nebula_%28PIA09178%29.jpg/960px-Comets_Kick_up_Dust_in_Helix_Nebula_%28PIA09178%29.jpg',
      fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Comets_Kick_up_Dust_in_Helix_Nebula_%28PIA09178%29.jpg',
      story: '一颗类似太阳的恒星在生命尾声温柔吐出外层气体壳，核心留下一颗白矮星静静照亮四周直径超过两光年的双层彩色气泡环。最奇妙的是中心红晕来自劫后余生的外围彗星彼此碰撞扬起的微尘。',
      meta: ['NASA / JPL-Caltech · PIA09178', '距地球约 650 光年', '4279×3559 4K 原片'],
      tags: ['星云', '宇宙泡泡', 'NASA', 'nebula'],
      palette: ['#6da3b8', '#ebf4f8', '#d9847c']
    },
    {
      id: 'wiki-18919964-cygnus-loop',
      channel: 'cosmos',
      kind: 'image',
      title: '天鹅座面纱星云 · 一万五千年前超新星留下的紫外丝带',
      shortTitle: '天鹅座面纱<br>紫外星云丝带',
      subtitle: 'GALEX 紫外空间望远镜 · 6000×5208 超清',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5b/Ultraviolet_image_of_the_Cygnus_Loop_Nebula_crop.jpg/960px-Ultraviolet_image_of_the_Cygnus_Loop_Nebula_crop.jpg',
      fullUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5b/Ultraviolet_image_of_the_Cygnus_Loop_Nebula_crop.jpg/2560px-Ultraviolet_image_of_the_Cygnus_Loop_Nebula_crop.jpg',
      story: '一万五千年前，当地球上的人类刚开始在洞穴岩壁上画野牛时，天鹅座方向一颗恒星绽放成超新星；它的冲击波至今仍在星际介质中以每秒上百公里滑行，在紫外波段显影出如同青蓝色水墨丝缕般的纤细褶皱。',
      meta: ['NASA GALEX 紫外波段', '天鹅座面纱星云', '6000×5208 超清采样'],
      tags: ['星云', '面纱星云', '紫外光', 'cosmos'],
      palette: ['#6298c9', '#ebf2fa', '#a58cc9']
    },
    {
      id: 'wiki-1380626-antennae-galaxies',
      channel: 'cosmos',
      kind: 'image',
      title: '正在慢动作拥抱的两座星系 · 乌鸦座触须星系',
      shortTitle: '乌鸦座<br>双星系慢舞',
      subtitle: '哈勃空间望远镜拍摄 · 3915×3885 4K',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f6/Antennae_galaxies_xl.jpg/960px-Antennae_galaxies_xl.jpg',
      fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f6/Antennae_galaxies_xl.jpg',
      story: '两座原本各自旋转的漩涡星系在数亿年间缓缓靠近、像两颗巨大水彩泡泡一样彼此融合成心形轮廓——虽然包含上千亿颗恒星，但由于星际空间极其空旷，恒星本身几乎不会相撞，反而压缩气体云催生出成串的蓝白色年轻星团。',
      meta: ['Hubble Space Telescope', 'NGC 4038 / NGC 4039', '3915×3885 4K 原片'],
      tags: ['星系', '哈勃', '天文', 'galaxy'],
      palette: ['#7f93c4', '#eef1fa', '#df96a8']
    },
    {
      id: 'wiki-25271481-lagoon-nebula',
      channel: 'cosmos',
      kind: 'image',
      title: '穿透尘埃迷雾 · 礁湖星云红外透视长卷',
      shortTitle: '礁湖星云<br>红外星海',
      subtitle: 'ESO VISTA 红外巡天望远镜 · 5990×2659 4K',
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/VISTA%27s_infrared_view_of_the_Lagoon_Nebula_%28Messier_8%29.jpg/960px-VISTA%27s_infrared_view_of_the_Lagoon_Nebula_%28Messier_8%29.jpg',
      fullUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/VISTA%27s_infrared_view_of_the_Lagoon_Nebula_%28Messier_8%29.jpg/2560px-VISTA%27s_infrared_view_of_the_Lagoon_Nebula_%28Messier_8%29.jpg',
      story: '可见光会被星际尘埃遮挡，但红外望远镜能像透过磨砂玻璃一样直接看穿整团梅西耶 8 号星云，把藏在乳白色星云背后的数十万颗银河系背景繁星一粒不漏地显影出来。',
      meta: ['人马座 · Messier 8', 'ESO VISTA 红外巡天', '5990×2659 宽幅 4K'],
      tags: ['星云', '银河', '深空', 'nebula'],
      palette: ['#7ba6b5', '#ecf4f7', '#d8b493']
    },
    {
      id: 'cma-130939-hongshan-jade',
      channel: 'cosmos',
      kind: 'image',
      title: '距今五千五百年 · 新石器时代红山文化黄玉神人兽面佩',
      shortTitle: '五千年前<br>红山黄玉佩',
      subtitle: '约公元前 4700–2920 年 · 远古先民的宇宙图腾 (4K)',
      thumbUrl: 'https://openaccess-cdn.clevelandart.org/1953.628/1953.628_web.jpg',
      fullUrl: 'https://openaccess-cdn.clevelandart.org/1953.628/1953.628_print.jpg',
      story: '比甲骨文还要早两千年的辽河流域，史前玉匠用温润泛蜜糖色的岫岩透闪石雕出这枚仅巴掌大的坐姿神兽——线条极简却充满现代雕塑般的张力，是远古人类仰望星空与自然时留下的第一批实物密码。',
      meta: ['新石器时代 · 红山文化', '2302×3400 4K 微距原片', 'Cleveland Museum of Art CC0'],
      tags: ['博物', '红山玉器', '考古', 'jade'],
      palette: ['#bfa878', '#f7f3ea', '#8da398']
    },

    // ---------- 06 神话·电影·哲思 (stories) ----------
    {
      id: 'story-sisyphus-lunch-break',
      channel: 'stories',
      kind: 'quote',
      title: '西西弗斯其实先把死神锁进了自家衣柜，害人间好几年没人死成',
      shortTitle: '西西弗斯<br>反锁死神轶事',
      subtitle: '古希腊神话原版前传 · 比推石头好玩得多的一章',
      quote: '大家只记得西西弗斯在冥界推石头，却常忘了他为什么受罚：宙斯派死神塔纳托斯去抓他，他笑嘻嘻请死神试戴一副「特制新款项链」，咔哒一声用铁链把死神锁进了储藏室。结果那阵子人间战场上刀砍断了都没人咽气，急得战神阿瑞斯亲自跑去撬锁救人。',
      story: '被抓进冥界后他还没消停：临走前偷偷嘱咐妻子千万别给他办葬礼，到了冥王哈迪斯面前哭诉妻子不孝，骗得冥王放他回阳间三天「教训老婆」——结果他一回科林斯就坐在海边晒太阳喝葡萄酒，死活不肯回去了，硬是活到老死才被赫尔墨斯揪着耳朵拎回山脚下。所以加缪说「应当想象西西弗斯是幸福的」，按他本人的滑头脾气，下山那趟说不定真在吹口哨。',
      meta: ['希腊神话冷知识', '西西弗斯前传', '加缪之外的另一面'],
      tags: ['希腊神话', '西西弗斯', '冷幽默', '加缪'],
      palette: ['#8ca4bf', '#eff3f8', '#dfaf8c']
    },
    {
      id: 'story-kubrick-candlelight',
      channel: 'stories',
      kind: 'quote',
      title: '库布里克为了不用一盏电灯拍十八世纪烛光，直接找 NASA 借了登月镜头',
      shortTitle: '库布里克借<br>NASA 烛光镜头',
      subtitle: '电影幕后奇闻 · 《巴里·林登》(1975)',
      quote: '所有古装片拍烛光晚宴都在画外藏着几千瓦的聚光灯，库布里克偏不干：「十八世纪没有电灯，我的画面就只准点蜂蜡蜡烛。」摄影师摊手说普通电影镜头全黑拍不出东西，库布里克转头就去把蔡司给 NASA 阿波罗计划拍月球背面暗部特制的 f/0.7 超大光圈镜头买了三颗回来。',
      story: '这颗镜头光圈大到景深只有薄薄几毫米——演员只要稍微前后歪一下脑袋就会失焦，剧组只好在地上拉刻度线，用工程车改装机身卡口。最终银幕上呈现出的烛光橘金色晕染，跟十八世纪英国油画一模一样，连油画颜料的空气感都复刻出来了。',
      meta: ['电影史名场面 · 1975', 'Stanley Kubrick × Carl Zeiss f/0.7', '技术疯子浪漫'],
      tags: ['电影故事', '库布里克', '光影', 'NASA'],
      palette: ['#cfa06e', '#f8f2e8', '#7d92ab']
    },
    {
      id: 'story-mary-room-color',
      channel: 'stories',
      kind: 'quote',
      title: '黑白房间里的超级科学家玛丽，推门第一次看见真番茄时学到了新东西吗？',
      shortTitle: '哲学思想实验<br>玛丽的房间',
      subtitle: '弗兰克·杰克逊 (1982) · 意识哲学最著名的「感质」谜题',
      quote: '假设玛丽是一位全知全能的视觉神经科学家，但她从小住在一间纯黑白的屋子里，只通过黑白屏幕研究世界。她掌握了关于「红色」的一切物理波长（约 650nm）、视锥细胞电位和大脑皮层反应公式。某天她推门走出房间，亲眼看见了一颗熟透的红番茄——请问：这一刻她学到了任何新知识吗？',
      story: '如果物理数据已经是全部事实，她明明早就背熟了；可直觉告诉每个人，第一次被真实色彩击中的「哇，原来红是这种感觉！」（哲学家叫它 Qualia 感质）是任何公式都替代不了的第一人称体验。后来连提出这个实验的杰克逊本人自己都改过一次立场，至今每次讨论都能让神经科学家和哲学家吵上一下午。',
      meta: ['心灵哲学思想实验', 'Qualia（感质）之谜', '带例子的哲学切片'],
      tags: ['哲学', '思想实验', '色彩', '意识'],
      palette: ['#c9888e', '#f9eff0', '#7ca3a8']
    },
    {
      id: 'story-tarkovsky-polaroid',
      channel: 'stories',
      kind: 'quote',
      title: '塔可夫斯基的宝丽来相册：为什么我们总想把刚溜走的那一秒留住？',
      shortTitle: '塔可夫斯基<br>晨雾宝丽来',
      subtitle: '安德烈·塔可夫斯基 · 《雕刻时光》与《Instant Light》',
      quote: '人去电影院到底是去寻找什么？是去寻找失去的时间。电影历史上第一次把「时间」像黏土一样直接印在胶片上——风吹歪草叶的弧度、水洼慢慢变干的边缘，都不是符号，而是时间本身的指纹。',
      story: '1979 年拍完《潜行者》后，意大利诗人托尼诺送给塔可夫斯基一台宝丽来 SX-70 相机。这位拍长镜头极其苛刻的导演立刻迷上了等待显影的那九十秒，在乡下木屋窗边拍下了晨雾里的茶杯、狗、妻儿的背影。每张小方片都泛着淡淡的青蓝色调，安静得像梦醒后还没散掉的余温。',
      meta: ['电影与摄影手记', '宝丽来 SX-70 切片', '雕刻时光'],
      tags: ['电影故事', '塔可夫斯基', '摄影', '时间'],
      palette: ['#799ea8', '#edf4f6', '#cbb497']
    },
    {
      id: 'story-apollo-blue-marble',
      channel: 'stories',
      kind: 'quote',
      title: '人类拍得最广的一张「偷拍照」：阿波罗 17 号宇航员在太空随手倒拿哈苏按下的蓝色弹珠',
      shortTitle: '阿波罗 17 号<br>蓝色弹珠幕后',
      subtitle: '科学史切片 · 1972 年 12 月 7 日距地球 29,000 公里',
      quote: 'NASA 原本的飞行任务表里压根没安排这张照片！飞向月球途中，三名宇航员回头透过舷窗，突然发现阳光正好从背后完整照亮整颗地球——它看起来真像小孩手心里一颗脆弱透明的蓝色玻璃弹珠。三个人忙着互相递哈苏相机抢拍，回地球后谁都不肯承认是别人按的快门。',
      story: '更逗的是：太空里根本没有上下之分，宇航员其实拍出来的原片里南极洲是在正上方的！NASA 发布前怕地面读者看着头晕，特意把底片旋转了 180 度才洗印出来。',
      meta: ['科学史幕后 · 1972', 'The Blue Marble 原片趣闻', '宇宙视角'],
      tags: ['科学史', '宇宙', '摄影', '冷幽默'],
      palette: ['#6497c4', '#eaf2fa', '#c2d8e8']
    },
    {
      id: 'story-hermes-cattle',
      channel: 'stories',
      kind: 'quote',
      title: '出生第一天上午学会弹琴，下午顺走哥哥五十头牛：神界小学生赫尔墨斯',
      shortTitle: '赫尔墨斯<br>出生当日奇遇',
      subtitle: '《荷马颂诗 · 致赫尔墨斯》· 奥林匹斯最机灵的谈判家',
      quote: '赫尔墨斯清晨刚在山洞里出生，中午溜出门捡到一只乌龟壳做成世上第一把里拉琴，傍晚觉得肚子饿，跑去把太阳神阿波罗放牧的五十头神牛倒着穿草鞋牵走了——牛蹄印全朝后，害阿波罗顺着脚印越找越反。',
      story: '阿波罗气冲冲找上门时，刚满一天的赫尔墨斯正裹着尿布躺在摇篮里装睡：「我昨天才出生，连门槛都没迈过，哪知道牛长啥样！」宙斯在旁边听得哈哈大笑。最后赫尔墨斯掏出那把乌龟壳竖琴弹了一曲，阿波罗当场听迷了眼，心甘情愿拿整群牛加一根金手杖换了那把琴，哥俩从此成了奥林匹斯最好的搭档。',
      meta: ['古希腊神话切片', '《荷马颂诗》喜剧名篇', '里拉琴的诞生'],
      tags: ['希腊神话', '赫尔墨斯', '音乐', '冷幽默'],
      palette: ['#d4a86e', '#f9f3e8', '#7fa89e']
    }
  ];

  // 为每条精选种子挂载精确维基百科词条、时空/地貌分面与顺藤摸瓜关联词条，消除碎片化
  const CURATED_WIKI_ENRICH = {
    'cma-380118-qingbai': { facet: 'china-tang-song', wikiTitle: '青白瓷', relatedSeeds: ['景德镇陶瓷', '宋朝艺术', '点茶', '汝窑'] },
    'cma-695985-goryeo-celadon': { facet: 'china-tang-song', wikiTitle: '高丽青瓷', relatedSeeds: ['秘色瓷', '越窑', '宣和奉使高丽图经'] },
    'cma-370537-iridescent-vase': { facet: 'greco-roman', wikiTitle: '路易斯·康福特·蒂芙尼', relatedSeeds: ['新艺术运动', '古罗马玻璃', '彩色玻璃'] },
    'cma-144577-northern-celadon': { facet: 'china-tang-song', wikiTitle: '耀州窑', relatedSeeds: ['青瓷', '北宋', '龙泉窑'] },
    'cma-93173-poppy-inkwell': { facet: 'baroque-dutch', wikiTitle: '新艺术运动', relatedSeeds: ['蒂芙尼', '工艺美术运动', '装饰艺术'] },
    'cma-97491-comma-jade': { facet: 'japan-edo', wikiTitle: '勾玉', relatedSeeds: ['翡翠', '古坟时代', '中国玉器'] },
    'cma-142716-stained-window': { facet: 'renaissance', wikiTitle: '花窗玻璃', relatedSeeds: ['哥特式建筑', '新艺术运动', '圣礼拜堂'] },
    'cma-111801-celadon-winepot': { facet: 'china-tang-song', wikiTitle: '龙泉窑', relatedSeeds: ['青瓷', '哥窑', '南宋'] },

    'cma-136510-monet-agapanthus': { facet: 'impressionism', wikiTitle: '睡莲 (莫奈)', relatedSeeds: ['克劳德·莫奈', '吉维尼', '印象派', '橘园美术馆'] },
    'cma-136950-malin-clouds': { facet: 'china-tang-song', wikiTitle: '马麟 (画家)', relatedSeeds: ['马远', '王维', '终南别业', '南宋院体'] },
    'aic-14620-monet-pourville': { facet: 'impressionism', wikiTitle: '克劳德·莫奈', relatedSeeds: ['印象派', '诺曼底', '外光主义', '日出·印象'] },
    'aic-16564-monet-seine-mist': { facet: 'impressionism', wikiTitle: '克劳德·莫奈', relatedSeeds: ['塞纳河', '鲁昂大教堂 (莫奈)', '印象派'] },
    'aic-27992-seurat-grande-jatte': { facet: 'impressionism', wikiTitle: '大碗岛的星期天下午', relatedSeeds: ['乔治·修拉', '点彩画派', '新印象派', '保罗·西涅克'] },
    'aic-109314-vangogh-spring': { facet: 'impressionism', wikiTitle: '文森特·梵高', relatedSeeds: ['后印象派', '浮世绘', '提奥·梵高', '星夜'] },
    'cma-115050-twachtman-clouds': { facet: 'impressionism', wikiTitle: '印象派', relatedSeeds: ['詹姆斯·麦克尼尔·惠斯勒', '色调主义', '风景画'] },
    'aic-28560-vangogh-bedroom': { facet: 'impressionism', wikiTitle: '在亚尔的卧室', relatedSeeds: ['文森特·梵高', '黄房子', '阿尔勒', '保罗·高更'] },

    'wiki-143032322-myvatn-aurora': { facet: 'polar-fjord', wikiTitle: '米湖', relatedSeeds: ['极光', '冰岛地理', '地磁暴'] },
    'wiki-8472717-upsala-glacier': { facet: 'polar-fjord', wikiTitle: '冰川国家公园 (阿根廷)', relatedSeeds: ['巴塔哥尼亚', '莫雷诺冰川', '安第斯山脉'] },
    'wiki-124751480-gokyo-lake': { facet: 'alpine-lake', wikiTitle: '萨加玛塔国家公园', relatedSeeds: ['喜马拉雅山脉', '珠穆朗玛峰', '冰碛湖'] },
    'wiki-154986747-zagedan-cirque': { facet: 'alpine-lake', wikiTitle: '大高加索山脉', relatedSeeds: ['冰斗', '高山草甸', '厄尔布鲁士山'] },
    'wiki-148263164-magenta-aurora': { facet: 'polar-fjord', wikiTitle: '极光', relatedSeeds: ['2024年5月太阳风暴', '太阳风', '电离层'] },
    'wiki-51789190-svalbard-glacier': { facet: 'polar-fjord', wikiTitle: '斯瓦尔巴', relatedSeeds: ['斯瓦尔巴全球种子库', '北极圈', '冰架崩解'] },
    'wiki-915077-jokulsarlon': { facet: 'polar-fjord', wikiTitle: '杰古沙龙冰河湖', relatedSeeds: ['瓦特纳冰原', '冰山', '冰岛'] },
    'wiki-99193060-sofia-massif': { facet: 'alpine-lake', wikiTitle: '高加索山脉', relatedSeeds: ['悬谷', '冰川地貌', '瀑布'] },

    'quote-sei-shonagon-makura': { wikiTitle: '枕草子', relatedSeeds: ['清少纳言', '平安时代', '紫式部', '源氏物语', '徒然草'] },
    'quote-calvino-lightness': { wikiTitle: '伊塔洛·卡尔维诺', relatedSeeds: ['树上的男爵', '看不见的城市', '如果在冬夜，一个旅人', '保罗·瓦莱里', '乌力波'] },
    'quote-pessoa-cloud-clerk': { wikiTitle: '费尔南多·佩索阿', relatedSeeds: ['惶然录', '里斯本', '异名', '葡萄牙文学'] },
    'quote-borges-paradise-library': { wikiTitle: '豪尔赫·路易斯·博尔赫斯', relatedSeeds: ['虚构集', '巴别图书馆', '小径分岔的花园', '阿莱夫', '魔幻现实主义'] },
    'quote-zhuangzi-useless-tree': { wikiTitle: '逍遥游', relatedSeeds: ['庄子', '惠施', '齐物论', '道家', '魏晋玄学'] },
    'quote-szymborska-possibilities': { wikiTitle: '维斯瓦娃·辛波斯卡', relatedSeeds: ['诺贝尔文学奖', '切斯瓦夫·米洛什', '波兰文学', '查尔斯·狄更斯'] },
    'quote-wilde-fog': { wikiTitle: '奥斯卡·王尔德', relatedSeeds: ['唯美主义', '道林·格雷的画像', '詹姆斯·麦克尼尔·惠斯勒', '印象派'] },
    'quote-feynman-flower': { wikiTitle: '理查德·费曼', relatedSeeds: ['别闹了，费曼先生！', '量子电动力学', '费曼物理学讲义', '纳米技术'] },

    'wiki-5254504-carina-nebula': { facet: 'deep-cosmos', wikiTitle: '船底座星云', relatedSeeds: ['海山二', '恒星形成', '詹姆斯·韦伯空间望远镜', '鹰星云'] },
    'wiki-1669175-helix-nebula': { facet: 'deep-cosmos', wikiTitle: '螺旋星云', relatedSeeds: ['行星状星云', '白矮星', '环状星云'] },
    'wiki-18919964-cygnus-loop': { facet: 'deep-cosmos', wikiTitle: '面纱星云', relatedSeeds: ['超新星遗迹', '蟹状星云', '星际介质'] },
    'wiki-1380626-antennae-galaxies': { facet: 'deep-cosmos', wikiTitle: '触须星系', relatedSeeds: ['相互作用星系', '仙女座星系-银河系碰撞', '哈勃空间望远镜'] },
    'wiki-25271481-lagoon-nebula': { facet: 'deep-cosmos', wikiTitle: '礁湖星云', relatedSeeds: ['三叶星云', '梅西耶天体', '人马座'] },
    'cma-130939-hongshan-jade': { facet: 'china-ancient', wikiTitle: '红山文化', relatedSeeds: ['玉猪龙', '良渚文化', '新石器时代', '中国玉器'] },

    'story-sisyphus-lunch-break': { wikiTitle: '西西弗斯', relatedSeeds: ['西西弗神话', '阿尔贝·加缪', '塔纳托斯', '哈迪斯', '荒诞主义'] },
    'story-kubrick-candlelight': { wikiTitle: '巴里·林登', relatedSeeds: ['斯坦利·库布里克', '2001太空漫游', '卡尔·蔡司', '威廉·贺加斯'] },
    'story-mary-room-color': { wikiTitle: '知识论证', relatedSeeds: ['感质', '心灵哲学', '意识难题', '哲学的僵尸', '物理主义'] },
    'story-tarkovsky-polaroid': { wikiTitle: '安德烈·塔可夫斯基', relatedSeeds: ['潜行者 (1979年电影)', '镜子 (1975年电影)', '乡愁 (电影)', '宝丽来'] },
    'story-apollo-blue-marble': { wikiTitle: '蓝色弹珠', relatedSeeds: ['阿波罗17号', '暗淡蓝点', '地出', '总览效应'] },
    'story-hermes-cattle': { wikiTitle: '赫耳墨斯', relatedSeeds: ['阿波罗', '荷马颂诗', '里拉琴', '奥林匹斯十二主神'] }
  };

  CURATED_POOL.forEach(function (it) {
    const enrich = CURATED_WIKI_ENRICH[it.id];
    if (enrich) {
      if (enrich.facet && !it.facet) it.facet = enrich.facet;
      if (enrich.wikiTitle && !it.wikiTitle) it.wikiTitle = enrich.wikiTitle;
      if (enrich.relatedSeeds && !it.relatedSeeds) it.relatedSeeds = enrich.relatedSeeds;
    }
  });

  // 中文常见词 -> 分类/标签辅助匹配，方便「随手写偏好」立刻在本地生效
  const KEYWORD_HINTS = [
    { re: /瓷|影青|青瓷|汝|官窑|龙泉|釉|碗|壶/i, boost: ['宋瓷', '影青', '青瓷', 'celadon', 'porcelain'], ch: 'antiques' },
    { re: /玻璃|琉璃|花窗|墨水|怀表|钟表|珐琅|铜/i, boost: ['玻璃', '琉璃', '古董', 'glass'], ch: 'antiques' },
    { re: /玉|翡翠|红山|勾玉/i, boost: ['玉器', 'jade'], ch: 'antiques' },
    { re: /莫奈|睡莲|印象派|梵高|修拉|浮世绘|油画|宋画|山水|云山/i, boost: ['莫奈', '印象派', '梵高', '宋画', 'Monet'], ch: 'paintings' },
    { re: /冰川|雪山|极光|冰岛|湖|峡湾|海|森林/i, boost: ['冰川', '极光', '雪山', '湖泊', 'glacier', 'aurora'], ch: 'landscapes' },
    { re: /博尔赫斯|卡尔维诺|枕草子|佩索阿|庄子|辛波斯卡|王尔德|诗|句子|冷幽默/i, boost: ['博尔赫斯', '卡尔维诺', '枕草子', '佩索阿', '冷幽默'], ch: 'quotes' },
    { re: /星云|星系|宇宙|哈勃|天文|矿物|水晶|博物/i, boost: ['星云', '星系', '深空', '博物', 'nebula'], ch: 'cosmos' },
    { re: /神话|电影|哲学|库布里克|塔可夫斯基|西西弗斯|科学/i, boost: ['希腊神话', '电影故事', '哲学', '科学史'], ch: 'stories' }
  ];

  function scoreItem(item, prefs, channelCfg, rng) {
    let s = (rng ? rng() : Math.random()) * 2.2;
    const textBlob = [
      item.title || '',
      item.subtitle || '',
      item.quote || '',
      item.story || '',
      (item.tags || []).join(' '),
      (item.meta || []).join(' ')
    ].join(' ').toLowerCase();

    const qWords = String((channelCfg && channelCfg.query) || '')
      .split(/[\s,，、；;|]+/)
      .map(function (w) { return w.trim().toLowerCase(); })
      .filter(Boolean);
    qWords.forEach(function (w) {
      if (w.length >= 1 && textBlob.indexOf(w) >= 0) s += 1.6;
    });

    const note = String((prefs && prefs.freeformNote) || '');
    if (note) {
      KEYWORD_HINTS.forEach(function (kh) {
        if (kh.re.test(note)) {
          kh.boost.forEach(function (tag) {
            if (textBlob.indexOf(tag.toLowerCase()) >= 0) s += 0.9;
          });
        }
      });
      // 识别「少一点xxx / 不要xxx / 不看xxx」降权
      const negMatches = note.match(/(?:少一点|少看|少推|不要|不想看|避开)([^\s,，。；;！!]{1,8})/g) || [];
      negMatches.forEach(function (phrase) {
        const kw = phrase.replace(/^(?:少一点|少看|少推|不要|不想看|避开)/, '').trim().toLowerCase();
        if (kw && textBlob.indexOf(kw) >= 0) s -= 6.0;
      });
    }

    if (String(item.id || '').indexOf('ai-') === 0) s += 2.5;
    return s;
  }

  const EN_FALLBACK_BY_CHANNEL = {
    antiques: 'Museum Curio',
    paintings: 'Fine Art Plate',
    landscapes: 'Earth Horizon',
    quotes: 'Literary Folio',
    cosmos: 'Deep Cosmos',
    stories: 'Myth & Cinema'
  };

  function extractEditorialEn(it) {
    if (it.enTitle) return String(it.enTitle).trim();
    const probe = [it.subtitle || '', (it.meta || []).join(' · ')].join(' · ');
    const m = probe.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’&.,\-\s]{3,32}/g);
    if (m && m.length) {
      for (let i = 0; i < m.length; i++) {
        const cand = m[i].replace(/\b(4K|UHD|CC0|IIIF|px)\b/gi, '').trim();
        if (cand.length >= 4) return cand.slice(0, 26);
      }
    }
    return EN_FALLBACK_BY_CHANNEL[it.channel] || 'Floating World';
  }

  function formatEnglishBubbleShort(titleStr) {
    const clean = String(titleStr || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || String(titleStr || '').trim();
    const words = clean.split(' ').filter(Boolean);
    if (words.length <= 2) return escapeMiniHtml(clean.slice(0, 22));
    const l1 = words.slice(0, 2).join(' ');
    const rest = words.slice(2, 5).join(' ');
    return escapeMiniHtml(l1) + '<br>' + escapeMiniHtml(rest.length > 18 ? rest.slice(0, 17) + '…' : rest);
  }

  function enrichClientItem(it) {
    if (!it || typeof it !== 'object') return it;
    if (!it.previewUrl && it.thumbUrl) it.previewUrl = it.thumbUrl;
    if (!it.sourceUrl) {
      const idStr = String(it.id || '');
      if (it.mapUrl) {
        it.sourceUrl = it.mapUrl;
      } else if (idStr.indexOf('met-live-') === 0) {
        it.sourceUrl = 'https://www.metmuseum.org/art/collection/search/' + idStr.replace('met-live-', '');
      } else if (idStr.indexOf('cma-live-') === 0) {
        it.sourceUrl = 'https://www.clevelandart.org/art/' + idStr.replace('cma-live-', '');
      } else if (idStr.indexOf('aic-live-') === 0) {
        it.sourceUrl = 'https://www.artic.edu/artworks/' + idStr.replace('aic-live-', '');
      } else if (idStr.indexOf('commons-') === 0) {
        it.sourceUrl = 'https://commons.wikimedia.org/?curid=' + idStr.replace('commons-', '');
      } else if (idStr.indexOf('inat-') === 0) {
        it.sourceUrl = 'https://www.inaturalist.org/observations/' + idStr.replace('inat-', '').split('-')[0];
      } else if (idStr.indexOf('nasa-') === 0) {
        it.sourceUrl = 'https://images.nasa.gov/details/' + encodeURIComponent(idStr.replace('nasa-', ''));
      } else if (it.fullUrl && it.fullUrl.indexOf('clevelandart.org') >= 0) {
        const acc = it.fullUrl.match(/\/([0-9.a-zA-Z_-]+)_print\.jpg/i);
        it.sourceUrl = acc ? ('https://www.clevelandart.org/art/' + acc[1]) : 'https://www.clevelandart.org/art/collection/search';
      } else if (it.wikiTitle) {
        it.sourceUrl = 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(it.wikiTitle);
      }
    }
    const fakeRe = /^(?:博物奇珍|馆藏名作|地球秘境|深空观测)(?:\s*[·/]\s*.*)?$/;
    if (fakeRe.test(String(it.title || '').trim()) && it.enTitle) {
      it.title = String(it.enTitle).trim();
      it.enTitle = String(it.civilization || (it.meta && it.meta[0]) || '').trim();
    }
    if (it.title && /[\u4e00-\u9fa5]/.test(it.title)) {
      if (!it.shortTitle || /博物奇珍|馆藏名作/.test(it.shortTitle)) {
        it.shortTitle = formatShortLabel(it.title);
      }
    } else if (it.title) {
      it.shortTitle = formatEnglishBubbleShort(it.title);
    }
    if (!it.enTitle) {
      it.enTitle = extractEditorialEn(it);
    }
    if (it.story && /从距离地表数百公里的近地轨道垂直俯视|收录自每日全球自然地理|来自克利夫兰艺术博物馆\s*CC0|收录于芝加哥艺术博物馆\s*Public\s*Domain|维基共享资源年度精选/.test(it.story)) {
      it.story = '';
    }
    return it;
  }

  CURATED_POOL.forEach(enrichClientItem);

  function escapeMiniHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function truncateWords(str, maxLen) {
    const clean = String(str || '').trim();
    if (clean.length <= maxLen) return clean;
    const cut = clean.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace >= 8 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\-\s]+$/, '') + '…';
  }

  function formatBilingualBubbleLabel(item) {
    const primaryHtml = item.shortTitle || (
      /[\u4e00-\u9fa5]/.test(String(item.title || ''))
        ? formatShortLabel(item.title)
        : formatEnglishBubbleShort(item.title)
    );
    const subRaw = String(item.enTitle || extractEditorialEn(item) || '').trim();
    const subShort = truncateWords(subRaw, 24);
    if (!subShort || subShort.toLowerCase() === String(item.title || '').trim().toLowerCase()) {
      return '<span class="sab-zh">' + primaryHtml + '</span>';
    }
    return '<span class="sab-zh">' + primaryHtml + '</span><span class="sab-en">' + escapeMiniHtml(subShort) + '</span>';
  }

  /**
   * 根据当前偏好权重、已读账本、AI 投递箱和候选池（种子 + 实时 API 池），组装 6 扇主泡窗口
   */
  function buildWindowFeed(extraPool, prefsInput, seenItemsMap, aiInboxList, seedNum) {
    const prefs = Object.assign({}, DEFAULT_PREFERENCES, prefsInput || {});
    const seen = (prefs.seenMode === 'off') ? {} : (seenItemsMap || {});
    const channels = (prefs.channels && prefs.channels.length)
      ? prefs.channels.map(function (c) { return Object.assign({}, c); })
      : DEFAULT_PREFERENCES.channels.map(function (c) { return Object.assign({}, c); });

    // 合并去重候选池：AI 投递箱 -> 实时 API 池 -> 内置精选种子池
    const byId = new Map();
    [].concat(aiInboxList || [], extraPool || [], CURATED_POOL).forEach(function (it) {
      if (!it || !it.id) return;
      if (!byId.has(it.id)) byId.set(it.id, enrichClientItem(Object.assign({}, it)));
    });
    const allItems = Array.from(byId.values());

    // 简易可复现随机源
    let s = (seedNum || Date.now()) >>> 0;
    const rng = function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // 按权重分配 6 个主泡槽位：若某频道权重被调成 0，把它的主泡槽位借给权重最高的频道开「分卷」
    const activeChs = channels.filter(function (c) { return Number(c.weight) > 0; });
    const basePool = activeChs.length ? activeChs : channels;
    const sortedByWeight = basePool.slice().sort(function (a, b) { return (Number(b.weight) || 1) - (Number(a.weight) || 1); });

    const slotPlan = [];
    let borrowIdx = 0;
    for (let i = 0; i < 6; i++) {
      const orig = channels[i] || DEFAULT_PREFERENCES.channels[i];
      if (Number(orig.weight) > 0 || !activeChs.length) {
        slotPlan.push({ ch: orig, isExtraSplit: false });
      } else {
        const donor = sortedByWeight[borrowIdx % sortedByWeight.length];
        borrowIdx++;
        slotPlan.push({
          ch: Object.assign({}, donor, {
            title: donor.title + ' · 续卷',
            sup: 'WINDOW 0' + (i + 1)
          }),
          isExtraSplit: true
        });
      }
    }

    const usedGlobal = new Set();
    const sections = slotPlan.map(function (slotObj, sIdx) {
      const secId = sIdx + 1;
      const ch = slotObj.ch;
      const childCount = (secId <= 4) ? 4 : 3; // 严格保持 1:1 物理坐标槽数（01-04 四子泡，05-06 三子泡）
      const perBubbleDepth = Number(ch.weight) >= 4 ? 2 : 1; // 高权重频道每个子泡内置 2 张轮播切片

      const candidates = allItems.filter(function (it) {
        return it.channel === ch.id && !usedGlobal.has(it.id);
      });

      const unseen = candidates.filter(function (it) { return !seen[it.id]; });
      const fallbackSeen = candidates
        .filter(function (it) { return !!seen[it.id]; })
        .sort(function (a, b) { return (seen[a.id] || 0) - (seen[b.id] || 0); });

      unseen.sort(function (a, b) { return scoreItem(b, prefs, ch, rng) - scoreItem(a, prefs, ch, rng); });

      let picked = unseen.slice(0, childCount * perBubbleDepth);
      if (picked.length < childCount) {
        const need = childCount - picked.length;
        picked = picked.concat(fallbackSeen.slice(0, need));
      }
      // 极端兜底：若某自定义频道没匹配到，从全局未读补齐
      if (picked.length < childCount) {
        const globalFill = allItems.filter(function (it) { return !usedGlobal.has(it.id) && !seen[it.id]; });
        picked = picked.concat(globalFill.slice(0, childCount - picked.length));
      }

      picked.forEach(function (it) { usedGlobal.add(it.id); });

      const children = [];
      for (let c = 0; c < childCount; c++) {
        const primary = picked[c] || picked[0] || CURATED_POOL[(sIdx * 4 + c) % CURATED_POOL.length];
        const playlist = [primary];
        if (perBubbleDepth > 1 && picked[childCount + c]) {
          playlist.push(picked[childCount + c]);
        }
        const labelHtml = formatBilingualBubbleLabel(primary);
        children.push({
          id: primary.id,
          item: primary,
          playlist: playlist,
          palette: primary.palette || ['#7ca9a2', '#eef6f4', '#d9b391'],
          motif: primary.kind === 'quote' ? 'quote' : 'horizon',
          label: { zh: labelHtml, en: labelHtml },
          desc: { zh: primary.story || primary.quote || '', en: primary.story || primary.quote || '' }
        });
      }

      const zhLabel = formatMainLabel(ch.title);
      const enArr = Array.isArray(ch.enTitle) && ch.enTitle.length >= 2
        ? ch.enTitle
        : [String(ch.id || 'WINDOW').toUpperCase(), 'CURATION'];

      return {
        id: secId,
        channelId: ch.id,
        weight: Number(ch.weight) || 0,
        bgSup: ch.sup || ('WINDOW 0' + secId),
        bgTitle: enArr,
        label: { zh: zhLabel, en: enArr.join('<br>') },
        directLeaf: true, // 点开子泡直接进入画卷长轴 / 播客电台，不再多绕一层空壳！
        allChannelItems: picked,
        children: children
      };
    });

    return sections;
  }

  function formatShortLabel(title) {
    const clean = String(title || '').replace(/^[《「]/, '').replace(/[》」]$/, '').trim();
    if (clean.indexOf('·') > 0) {
      const parts = clean.split('·').map(function (s) { return s.trim(); });
      if (parts[0].length <= 6 && parts[1]) {
        return parts[0] + '<br>' + parts[1].slice(0, 8);
      }
    }
    if (clean.length <= 6) return clean;
    return clean.slice(0, 6) + '<br>' + clean.slice(6, 13);
  }

  function formatMainLabel(title) {
    const t = String(title || '').trim();
    if (t.indexOf('<br>') >= 0) return t;
    if (t.length <= 4) return t;
    if (t.indexOf('·') > 0) {
      const p = t.split('·');
      return p[0].trim() + '<br>' + p.slice(1).join('·').trim();
    }
    if (t.indexOf('与') > 0 && t.length <= 7) {
      const idx = t.indexOf('与') + 1;
      return t.slice(0, idx) + '<br>' + t.slice(idx);
    }
    const mid = Math.ceil(t.length / 2);
    return t.slice(0, mid) + '<br>' + t.slice(mid);
  }

  const initialSections = buildWindowFeed([], DEFAULT_PREFERENCES, {}, [], 20261114);

  window.WORLD_DATA = {
    defaultLang: 'zh',
    THEMES: THEMES,
    FONT_PRESETS: FONT_PRESETS,
    DEFAULT_PREFERENCES: DEFAULT_PREFERENCES,
    MUSEUM_FACETS_UI: MUSEUM_FACETS_UI,
    LANDSCAPE_FACETS_UI: LANDSCAPE_FACETS_UI,
    OBSIDIAN_CATALOG_URL: OBSIDIAN_CATALOG_URL,
    OBSIDIAN_ASK_URL: OBSIDIAN_ASK_URL,
    CURATED_POOL: CURATED_POOL,
    buildWindowFeed: buildWindowFeed,
    enrichClientItem: enrichClientItem,
    formatBilingualBubbleLabel: formatBilingualBubbleLabel,

    brand: {
      mark: 'WORLD · WINDOW',
      heroLines: ['WINDOW OF', 'FLOATING', 'WORLDS'],
      heroSub: ['4K CURIOS & ART', 'EARTH HORIZONS', '& CONNECTED WIKI'],
      footerWatermark: ['WINDOW OF', 'FLOATING', 'WORLDS'],
      copyright: '© WINDOW OF FLOATING WORLDS'
    },

    ui: {
      zh: {
        langLabel: 'ZH',
        pauseMotion: '暂停动效',
        playMotion: '恢复动效',
        menuOpenLabel: '打开导航与私藏画匣',
        menuCloseLabel: '关闭导航抽屉',
        ball0Sup: ['TODAY', 'ATLAS'],
        ball0Sub: '全屏漫游今日长卷',
        ball7Lines: ['SHUFFLE', 'WINDOW'],
        ball7Sub: '换一窗新鲜风物',
        backToBubbles: '返回星图',
        navItems: [
          { label: 'TOP · 回到顶部星图', action: 'top' },
          { label: 'ATLAS · 全屏漫游今日画卷', action: 'ball0' },
          { label: 'GALLERY · 私藏画匣（点心收藏）', action: 'fav-gallery' },
          { label: 'MUSEUM · 博物馆文明漫游', action: 'museum-jump' },
          { label: 'HORIZON · 自然纪实与微距深空', action: 'landscape-jump' },
          { label: '01 · 古董与奇珍', action: 'sec1' },
          { label: '02 · 画作与光影', action: 'sec2' },
          { label: '03 · 远方 4K 秘境', action: 'sec3' },
          { label: '04 · 书籍·漫游拾句', action: 'sec4' },
          { label: '05 · 星云与博物', action: 'sec5' },
          { label: '06 · 神话·影音·哲思', action: 'sec6' }
        ],
        externalLinks: [
          { prefix: '♡', label: '打开私藏画匣 Gallery', action: 'fav-gallery' },
          { prefix: '◇', label: '在 Obsidian 打开收藏库 (LWA)', action: 'lwa' },
          { prefix: '◈', label: '博物馆文明与年代画卷', action: 'museum-jump' },
          { prefix: '✦', label: '频道权重与 AI 偏好面板', action: 'tuner' }
        ],
        policyLinks: ['AI 协作目录：feed-profile/preferences.md', '4K 开放馆藏：CMA / AIC / Commons / Earth View', '支持 Fable 定制专题链接与维基全章检索']
      },
      en: {
        langLabel: 'EN',
        pauseMotion: 'Pause',
        playMotion: 'Play',
        menuOpenLabel: 'Open navigation & saved gallery',
        menuCloseLabel: 'Close navigation menu',
        ball0Sup: ['TODAY', 'ATLAS'],
        ball0Sub: 'Open Fullscreen Atlas',
        ball7Lines: ['REFRESH', 'WINDOW'],
        ball7Sub: 'Shuffle Unseen Feed',
        backToBubbles: 'Back to Bubbles',
        navItems: [
          { label: 'TOP · CONSTELLATION', action: 'top' },
          { label: 'ATLAS · FULLSCREEN GALLERY', action: 'ball0' },
          { label: 'GALLERY · SAVED FAVORITES', action: 'fav-gallery' },
          { label: 'MUSEUM · CIVILIZATION ATLAS', action: 'museum-jump' },
          { label: 'HORIZON · WILDLIFE, MACRO & EARTH', action: 'landscape-jump' },
          { label: '01 · CURIOS & ANTIQUES', action: 'sec1' },
          { label: '02 · FINE ART & LIGHT', action: 'sec2' },
          { label: '03 · EARTH HORIZONS 4K', action: 'sec3' },
          { label: '04 · BOOKS & PASSAGES', action: 'sec4' },
          { label: '05 · COSMOS & MINERALS', action: 'sec5' },
          { label: '06 · MYTH & CINEMA', action: 'sec6' }
        ],
        externalLinks: [
          { prefix: '♡', label: 'Open Saved Favorites Gallery', action: 'fav-gallery' },
          { prefix: '◇', label: 'Open Obsidian LWA Library', action: 'lwa' },
          { prefix: '◈', label: 'Museum Civilization Atlas', action: 'museum-jump' },
          { prefix: '✦', label: 'Channel Weights & AI Profile', action: 'tuner' }
        ],
        policyLinks: ['AI Sync: feed-profile/preferences.md', '4K Sources: CMA / AIC / Commons / Earth View', 'Fable Curated Pages & Live Wikipedia Search']
      }
    },

    sections: initialSections,

    // ===== 1:1 官网级精确物理与坐标参数（取自 glmain.min.js） =====
    physics: {
      borderSP: 600,
      borderMid: 1200,
      mainBalls: [
        { id: 0, fam: 0, scale: 1.30, pc: { x: 0.75, y: -380 },  fa: 0.88, sp: { x: 0.62, y: -510,  scale: 0.68 }, lerp: 0.40, sabR: 125, pitch: 0 },
        { id: 1, fam: 1, scale: 1.00, pc: { x: 0.32, y: -1080 }, fa: 0.62, sp: { x: 0.28, y: -958,  scale: 0.54 }, lerp: 0.30, sabR: 122, pitch: -390 },
        { id: 2, fam: 2, scale: 0.84, pc: { x: 0.74, y: -1560 }, fa: 0.58, sp: { x: 0.76, y: -1320, scale: 0.48 }, lerp: 0.20, sabR: 122, pitch: -390 },
        { id: 3, fam: 3, scale: 1.05, pc: { x: 0.37, y: -2100 }, fa: 0.86, sp: { x: 0.30, y: -1698, scale: 0.54 }, lerp: 0.15, sabR: 122, pitch: -390 },
        { id: 4, fam: 1, scale: 0.90, pc: { x: 0.73, y: -2660 }, fa: 0.62, sp: { x: 0.72, y: -2126, scale: 0.52 }, lerp: 0.40, sabR: 122, pitch: -390 },
        { id: 5, fam: 0, scale: 0.84, pc: { x: 0.30, y: -3280 }, fa: 0.86, sp: { x: 0.27, y: -2622, scale: 0.46 }, lerp: 0.15, sabR: 122, pitch: -350 },
        { id: 6, fam: 3, scale: 1.05, pc: { x: 0.57, y: -3980 }, fa: 0.86, sp: { x: 0.73, y: -3022, scale: 0.55 }, lerp: 0.20, sabR: 122, pitch: -350 },
        { id: 7, fam: 1, scale: 0.45, pc: { x: 0.82, y: -512 },  fa: 0.62, sp: { x: 0.72, y: -292,  scale: 0.24 }, lerp: 0.30, sabR: 122, pitch: -350 }
      ],
      links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [4, 7]],
      jointCells: [0, 1, 2, 3, 1, 0, 1],
      particleCells: { 1: 1, 2: 2, 3: 3, 4: 1, 5: 0, 6: 3 },
      lineColors: { 1: '#8ab5ad', 2: '#7fb3c2', 3: '#b99fc9', 4: '#d9ad8b', 5: '#8ab5ad', 6: '#b59ebe' },
      l1PC: {
        1: [[4, 480, 1.00], [-29, 680, 1.20], [-62, 480, 0.92], [-95, 560, 1.10]],
        2: [[-170, 640, 1.28], [-137, 480, 1.00], [-104, 600, 0.90], [-71, 480, 1.15]],
        3: [[-12, 640, 1.25], [-45, 480, 0.92], [-78, 590, 1.10], [-111, 480, 0.90]],
        4: [[-178, 680, 1.28], [-145, 540, 1.20], [-112, 640, 1.00], [-79, 460, 1.00]],
        5: [[-36, 530, 1.25], [-72, 480, 0.90], [-108, 550, 1.00]],
        6: [[-120, 540, 1.00], [-80, 480, 1.00], [-40, 520, 1.00]]
      },
      l1SP: {
        left:  [[-42, 342.5, 0.90], [-88, 387.5, 0.75], [-68.5, 618.75, 0.80], [-93, 740, 0.85]],
        id4:   [[-140, 342.5, 0.90], [-88, 350.0, 0.75], [-114, 537.5, 0.80], [-88, 612.5, 0.85]],
        right: [[-140, 342.5, 0.90], [-90, 387.5, 0.75], [-112, 618.75, 0.80], [-88, 740, 0.85]]
      },
      l2PC: {
        left:  [[25, 440, 1.00], [-22, 460, 1.25], [-80, 340, 0.90]],
        right: [[163, 520, 1.15], [-154, 400, 1.00], [-95, 340, 0.95]]
      },
      l2SP: {
        left:  [[-147, 240, 0.60], [-112, 410, 0.80], [-84, 250, 0.60]],
        right: [[-100, 250, 0.60], [-69, 410, 0.80], [-42, 240, 0.65]]
      },
      frontBalls: [
        { trgN: 0, scale: 0.80, x: 0.30, y: 400,  color: 0, scrollScale: 1.20, sinH: 30, sinS:  0.005, sp: { scale: 0.30, x: 0.20,   y: 210   } },
        { trgN: 0, scale: 0.70, x: 0.83, y: -180, color: 0, scrollScale: 1.20, sinH: 40, sinS: -0.006, sp: { scale: 0.40, x: 0.95,   y: -50   } },
        { trgN: 1, scale: 1.00, x: 0.98, y: 130,  color: 0, scrollScale: 1.30, sinH: 40, sinS:  0.010, sp: { scale: 1.40, x: -100,   y: 20000 } },
        { trgN: 1, scale: 0.50, x: 0.20, y: 245,  color: 1, scrollScale: 1.20, sinH: 30, sinS: -0.006, sp: { scale: 0.30, x: 0.65,   y: 198   } },
        { trgN: 2, scale: 0.45, x: 0.83, y: 310,  color: 2, scrollScale: 1.25, sinH: 30, sinS:  0.010, sp: { scale: 0.45, x: 0.00,   y: 177   } },
        { trgN: 3, scale: 0.70, x: 0.24, y: 230,  color: 3, scrollScale: 1.20, sinH: 30, sinS: -0.010, sp: { scale: 1.40, x: -100,   y: 20000 } },
        { trgN: 3, scale: 0.48, x: 0.94, y: 60,   color: 3, scrollScale: 1.10, sinH: 50, sinS:  0.010, sp: { scale: 0.35, x: 0.85,   y: 83    } },
        { trgN: 4, scale: 0.60, x: 0.86, y: 280,  color: 1, scrollScale: 1.20, sinH: 30, sinS: -0.004, sp: { scale: 1.40, x: -100,   y: 2000  } },
        { trgN: 4, scale: 0.35, x: 0.22, y: 140,  color: 1, scrollScale: 1.45, sinH: 40, sinS: -0.010, sp: { scale: 0.35, x: -10000, y: 2000  } },
        { trgN: 6, scale: 0.58, x: 0.66, y: 290,  color: 3, scrollScale: 1.15, sinH: 26, sinS:  0.007, sp: { scale: 0.35, x: 0.82,   y: 160   } },
        { trgN: 5, scale: 0.44, x: 0.16, y: -120, color: 0, scrollScale: 1.20, sinH: 28, sinS: -0.007, sp: { scale: 0.30, x: 0.14,   y: -90   } }
      ]
    }
  };
})();
