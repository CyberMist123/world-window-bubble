/**
 * 世界之窗 · 心绪泡泡 (World Window & Mood Bubbles) — 数据与配置层
 *
 * 以后改自己的「世界之窗」或「心绪泡泡」内容时，只需要改这个文件里的 WORLD_DATA 即可，
 * 物理参数、着色器、展开状态机都在 renderer.js 里自动读取这里的节点树。
 */
(function () {
  'use strict';

  window.WORLD_DATA = {
    defaultLang: 'zh',

    // 顶部品牌与大标题（保持官网同款衬线+无衬线混排比例，零官网商标）
    brand: {
      mark: 'WINDOW·BUBBLE',
      heroLines: ['WINDOW OF', 'FLOATING', 'WORLDS'],
      heroSub: ['OBSERVATION', 'REVERIE', '& ARCHIVE'],
      footerWatermark: ['WINDOW OF', 'FLOATING', 'WORLDS'],
      copyright: '© WORLD WINDOW & MOOD BUBBLES ARCHIVE'
    },

    // 界面通用文案（支持右上角 ZH / EN 一键切换）
    ui: {
      zh: {
        langLabel: 'ZH',
        pauseMotion: '暂停动效',
        playMotion: '恢复动效',
        menuOpenLabel: '打开导航菜单',
        menuCloseLabel: '关闭导航菜单',
        ball0Sup: ['WORLD', 'WINDOW'],
        ball0Sub: '世界之窗序章',
        ball0Card: {
          tag: 'PROLOGUE · 序章',
          title: '世界之窗与心绪泡泡',
          subtitle: '把远方的风声、光影切片与瞬时心绪收进会呼吸的水彩气泡里。',
          body: '每一颗主泡代表一扇观察世界的窗口；点开主泡会浮现四个子主题气泡，再点开子主题则会绽放出三枚具体的记忆或灵感切片。靠近的泡泡会自动融合成柔润的胶质边缘，水珠顺着引力方向缓缓回流。',
          meta: ['交互参照 · 1:1 物理与着色器底板', '数据解耦 · 直接编辑 data.js 即可替换内容']
        },
        ball7Lines: ['ALL', 'BUBBLES'],
        ball7Sub: '全部气泡索引',
        ball7Card: {
          tag: 'INDEX · 全景索引',
          title: '全部气泡与心绪切片总览',
          subtitle: '跨越六扇窗口的 22 组分类气泡与 48 枚微观切片。',
          body: '这里预留给未来的全景检索视图（按心绪色系、时间线或地理位置筛选所有泡泡）。点击任意卡片外部或按 Esc 即可回到刚才展开的泡泡位置。',
          meta: ['共 8 颗主泡 · 6 组展开分支', '支持浏览位置与展开状态自动记忆恢复']
        },
        backToBubbles: '返回泡泡星图',
        navItems: [
          { label: 'TOP · 星图首页', action: 'top' },
          { label: 'PROLOGUE · 漫游序章', action: 'ball0' },
          { label: '01 · 远方风物志', action: 'sec1' },
          { label: '02 · 器物与触感', action: 'sec2' },
          { label: '03 · 光影信号场', action: 'sec3' },
          { label: '04 · 漫游坐标集', action: 'sec4' },
          { label: '05 · 小院与手记', action: 'sec5' },
          { label: '06 · 近期回响', action: 'sec6' }
        ],
        externalLinks: [
          { prefix: '✦', label: 'Observation Log · 观察手记' },
          { prefix: '◎', label: 'Color Field · 水彩色谱' },
          { prefix: '◌', label: 'Sound Postcards · 声音明信片' }
        ],
        policyLinks: ['使用说明与数据格式', '无障碍与减弱动态说明', '本地离线运行指南']
      },
      en: {
        langLabel: 'EN',
        pauseMotion: 'Pause',
        playMotion: 'Play',
        menuOpenLabel: 'Open navigation menu',
        menuCloseLabel: 'Close navigation menu',
        ball0Sup: ['WORLD', 'WINDOW'],
        ball0Sub: 'Our Prologue',
        ball0Card: {
          tag: 'PROLOGUE',
          title: 'Window of Floating Worlds',
          subtitle: 'A living watercolor bubble atlas for distant horizons, tactile objects, and fleeting moods.',
          body: 'Each primary sphere opens into first-level thematic bubbles, and spheres 01–04 further bloom into three leaf memory fragments. Nearby spheres merge organically via alpha-weighted Gaussian metaball thresholding while droplets drift back along each branch.',
          meta: ['1:1 Physics & Shader Reference Foundation', 'Edit data.js to customize your own worlds']
        },
        ball7Lines: ['ALL', 'BUBBLES'],
        ball7Sub: 'Archive Index',
        ball7Card: {
          tag: 'ARCHIVE INDEX',
          title: 'Complete Bubble Constellation',
          subtitle: 'All 6 thematic windows, 22 sub-clusters, and 48 placeholder memory fragments.',
          body: 'Reserved for your future filterable archive view (by mood palette, season, or coordinates). Dismissing this dialog restores your exact scroll position and expanded bubble branch.',
          meta: ['8 Primary Spheres · 3-Tier Expansion', 'Automatic History & Scroll State Restore']
        },
        backToBubbles: 'Back to Bubbles',
        navItems: [
          { label: 'TOP', action: 'top' },
          { label: 'PROLOGUE', action: 'ball0' },
          { label: '01 · HORIZON DRIFT', action: 'sec1' },
          { label: '02 · TACTILE FORMS', action: 'sec2' },
          { label: '03 · LIGHT SIGNALS', action: 'sec3' },
          { label: '04 · ATLAS COORDS', action: 'sec4' },
          { label: '05 · QUIET YARD', action: 'sec5' },
          { label: '06 · FIELD NOTES', action: 'sec6' }
        ],
        externalLinks: [
          { prefix: '✦', label: 'Observation Log' },
          { prefix: '◎', label: 'Color Field' },
          { prefix: '◌', label: 'Sound Postcards' }
        ],
        policyLinks: ['Data Schema Guide', 'Motion & Accessibility', 'Offline Reference Notes']
      }
    },

    // 6 个可展开主泡（01–04 含 L1 + L2 三级展开；05–06 含 L1 展开并直达卡片）
    sections: [
      {
        id: 1,
        bgSup: 'WINDOW 01',
        bgTitle: ['HORIZON', 'DRIFT'],
        label: { zh: '远方<br>风物志', en: 'HORIZON<br>DRIFT' },
        children: [
          {
            label: { zh: '晨雾与<br>海岸线', en: 'Morning Mist &<br>Coastlines' },
            items: [
              {
                palette: ['#3d7ea6', '#dceef5', '#f7c59f'],
                motif: 'horizon',
                label: { zh: '北纬四十三度<br>白雾灯塔', en: '43°N White Fog<br>Lighthouse' },
                desc: {
                  zh: '潮水退去后的砾石滩还留着夜雨的凉意，远处灯塔每十二秒扫过一次乳白色的海雾。',
                  en: 'Pebble shores cool after night rain while a distant beacon sweeps across milky sea fog every twelve seconds.'
                }
              },
              {
                palette: ['#5da399', '#e8f6f3', '#fbe2b4'],
                motif: 'orbit',
                label: { zh: '盐田日落<br>镜面微风', en: 'Salt Pan Sunset<br>Mirror Breeze' },
                desc: {
                  zh: '浅浅的卤水把晚霞切成整齐的几何格，风一吹，整片粉橘色的天空都在水面轻轻晃动。',
                  en: 'Shallow brine pools slice dusk into pastel rectangles, rippling the peach sky with every gust.'
                }
              },
              {
                palette: ['#ee7b6b', '#fde8e1', '#6e8fb2'],
                motif: 'arch',
                label: { zh: '渡轮尾迹与<br>海鸥低飞', en: 'Ferry Wake &<br>Low Gulls' },
                desc: {
                  zh: '慢船驶离港口时翻起青白色的泡沫带，三两只海鸥贴着浪尖滑翔，不急着去任何地方。',
                  en: 'Pale seafoam trails behind the departing ferry as gulls glide inches above the swell.'
                }
              }
            ]
          },
          {
            label: { zh: '山谷回声<br>与林间道', en: 'Valley Echoes &<br>Forest Trails' },
            items: [
              {
                palette: ['#6ca965', '#eef7e6', '#f6c85f'],
                motif: 'leaf',
                label: { zh: '雨后苔原<br>松针气息', en: 'Post-Rain Moss<br>Pine Scent' },
                desc: {
                  zh: '踩过吸饱雨水的厚青苔像踩在静音地毯上，阳光穿过冷杉林，落下一地碎金色的光斑。',
                  en: 'Rain-soaked moss softens every footstep while sunbeams scatter warm gold across cedar needles.'
                }
              },
              {
                palette: ['#e59a3c', '#fff4df', '#5f8d78'],
                motif: 'ripple',
                label: { zh: '溪石浅滩<br>午后水声', en: 'Brook Stones &<br>Noon Current' },
                desc: {
                  zh: '清澈见底的融雪溪流绕着花岗岩打转，把树影揉成一团团流动的翡翠色波纹。',
                  en: 'Snowmelt eddies around smooth granite boulders, weaving emerald tree shadows into liquid rings.'
                }
              },
              {
                palette: ['#7f8cc4', '#eceff9', '#f4a9a8'],
                motif: 'horizon',
                label: { zh: '暮色山脊线<br>第一颗星', en: 'Dusk Ridgeline<br>First Star' },
                desc: {
                  zh: '山谷里的炊烟慢慢沉下来的时候，靛蓝色的天际线上刚刚亮起今晚第一颗安静的星子。',
                  en: 'Just as valley mist settles for the evening, a single steady star pierces the indigo ridge.'
                }
              }
            ]
          },
          {
            label: { zh: '街角晴雨<br>观察录', en: 'Street-Corner<br>Weather Log' },
            items: [
              {
                palette: ['#f08a5d', '#fff0e5', '#4b6584'],
                motif: 'window',
                label: { zh: '屋檐雨滴<br>玻璃水痕', en: 'Eaves Raindrops<br>Window Traces' },
                desc: {
                  zh: '隔着起雾的咖啡馆玻璃窗看阵雨落下，两滴水珠在半途相遇，忽然加速滑进窗框深处。',
                  en: 'Through a steamed cafe pane, two raindrops collide mid-glass and race together toward the sill.'
                }
              },
              {
                palette: ['#f3b54a', '#fff8e6', '#d96b6b'],
                motif: 'bloom',
                label: { zh: '午后四点<br>梧桐斜影', en: '4 PM Sycamore<br>Slanted Light' },
                desc: {
                  zh: '秋日下午四点的阳光最偏心，把老墙上的爬山虎和路过的单车影子拉得像老电影一样长。',
                  en: 'Four-o-clock autumn light stretches bicycle shadows and ivy leaves across warm plaster walls.'
                }
              },
              {
                palette: ['#5aa8c9', '#e7f5fb', '#f6b3c2'],
                motif: 'orbit',
                label: { zh: '阵雨初晴<br>水洼倒影', en: 'After-Shower<br>Puddle Sky' },
                desc: {
                  zh: '柏油路上的积水像散落在地面的小镜子，低头走路的人一不小心就跨过了一整朵白云。',
                  en: 'Sidewalk puddles turn into pocket mirrors holding drifting cumulus clouds upside down.'
                }
              }
            ]
          },
          {
            label: { zh: '夜航列车<br>车窗切片', en: 'Night Train<br>Window Cuts' },
            items: [
              {
                palette: ['#3d5a80', '#e5ecf4', '#ee6c4d'],
                motif: 'arch',
                label: { zh: '跨海铁桥<br>远岸灯火', en: 'Sea Viaduct &<br>Harbor Lights' },
                desc: {
                  zh: '列车驶上跨海大桥的瞬间，轮轨声忽然变得空旷，海面上的渔火像撒在墨色丝绒上的碎钻。',
                  en: 'Rails hum hollow over the bay bridge while harbor lights shimmer across ink-dark water.'
                }
              },
              {
                palette: ['#9c6ade', '#f3ecfc', '#f7b267'],
                motif: 'window',
                label: { zh: '无人小站<br>暖黄月台', en: 'Quiet Halts &<br>Amber Lamps' },
                desc: {
                  zh: '停靠两分钟的乡间小站没有广播，只有自动贩卖机和一盏暖黄路灯在夜风里静静亮着。',
                  en: 'A two-minute country stop with no announcements, lit only by one warm platform lamp.'
                }
              },
              {
                palette: ['#e06d94', '#fcebf1', '#679499'],
                motif: 'horizon',
                label: { zh: '破晓之前<br>青紫色天光', en: 'Pre-Dawn<br>Violet Glow' },
                desc: {
                  zh: '天快亮时车窗外的田野先变成柔和的青紫色，紧接着第一缕金粉色的晨光擦亮了地平线。',
                  en: 'Fields turn soft violet just before daybreak, then a thin rose-gold ribbon ignites the horizon.'
                }
              }
            ]
          }
        ]
      },
      {
        id: 2,
        bgSup: 'WINDOW 02',
        bgTitle: ['TACTILE', 'FORMS'],
        label: { zh: '器物与<br>日常触感', en: 'TACTILE<br>FORMS' },
        children: [
          {
            label: { zh: '纸张肌理<br>与墨迹', en: 'Paper Grain &<br>Ink Washes' },
            items: [
              {
                palette: ['#489fb5', '#e8f6f8', '#ffa62b'],
                motif: 'ripple',
                label: { zh: '棉浆水彩纸<br>自然晕染', en: 'Cotton Rag<br>Wet-on-Wet' },
                desc: {
                  zh: '笔尖蘸满清水点进未干的群青色边缘，颜料自己顺着粗纹纸纤维慢慢长出羽毛般的分叉。',
                  en: 'Clean water touches damp ultramarine pigment, blooming feathery edges along cotton fibers.'
                }
              },
              {
                palette: ['#82c09a', '#edf8f1', '#e87a7a'],
                motif: 'leaf',
                label: { zh: '旧书页边角<br>铅笔批注', en: 'Deckle Edges &<br>Pencil Notes' },
                desc: {
                  zh: '泛着暖米色的旧纸页留着几十年前轻手轻脚写下的2B铅笔字迹，连擦痕都带着温度。',
                  en: 'Warm ivory pages preserve gentle graphite marginalia from decades past.'
                }
              },
              {
                palette: ['#5c7aff', '#ebeeff', '#f7b2bd'],
                motif: 'window',
                label: { zh: '半透明硫酸纸<br>叠影实验', en: 'Translucent Vellum<br>Layered Tint' },
                desc: {
                  zh: '两张彩色半透明描图纸叠在一起时，交界处像泡泡相融一样浮现出意料之外的柔和间色。',
                  en: 'Two sheets of tinted vellum overlap to form soft third colors where light passes through.'
                }
              }
            ]
          },
          {
            label: { zh: '陶土釉色<br>与器皿', en: 'Ceramic Glaze &<br>Vessels' },
            items: [
              {
                palette: ['#46b5a7', '#e6f8f5', '#f29f67'],
                motif: 'orbit',
                label: { zh: '天青冰裂纹<br>手握茶杯', en: 'Celadon Crackle<br>Tea Cup' },
                desc: {
                  zh: '出窑时冷却收缩留下的细密开片像凝固的春冰，每次注满热茶都会折射出温润的光泽。',
                  en: 'Fine celadon crackle lines catch warm amber light whenever hot tea fills the cup.'
                }
              },
              {
                palette: ['#d97757', '#fbf0eb', '#69a297'],
                motif: 'arch',
                label: { zh: '粗陶素烧<br>指腹拉坯痕', en: 'Raw Stoneware<br>Wheel Rings' },
                desc: {
                  zh: '不上釉的外壁保留着陶土原本的砂粒感，一圈圈微小的起伏记录着掌心旋转时的呼吸。',
                  en: 'Unglazed stoneware rings trace the quiet rhythm of hands shaping wet clay on the wheel.'
                }
              },
              {
                palette: ['#729ea1', '#ecf4f4', '#ec9ded'],
                motif: 'bloom',
                label: { zh: '乳白甜白釉<br>晨光小碟', en: 'Milky Glaze<br>Morning Dish' },
                desc: {
                  zh: '边缘薄得微微透光的白瓷小碟，盛着刚洗好的几颗红樱桃，像水彩泡泡里的一点朱砂。',
                  en: 'Thin porcelain rims glow translucent beside bright cherries washed in morning water.'
                }
              }
            ]
          },
          {
            label: { zh: '玻璃折光<br>小标本', en: 'Glass Prisms &<br>Specimens' },
            items: [
              {
                palette: ['#3fa7d6', '#e6f5fc', '#f79d84'],
                motif: 'bloom',
                label: { zh: '吹制气泡玻璃<br>镇纸球', en: 'Seeded Glass<br>Paperweight' },
                desc: {
                  zh: '透明玻璃球心封存着十几颗上升到一半的小气泡，转动角度时整间屋子的窗户都缩在里面。',
                  en: 'Tiny air bubbles suspended inside hand-blown glass bend the room into miniature horizons.'
                }
              },
              {
                palette: ['#59c3c3', '#e8f9f9', '#f4d06f'],
                motif: 'horizon',
                label: { zh: '棱镜窗挂与<br>墙面彩虹', en: 'Window Prism<br>Wall Spectrum' },
                desc: {
                  zh: '每到晴天下午三点半，书架尽头的白墙上就会准时游过一小段会缓慢移动的七彩光谱。',
                  en: 'At 3:30 every sunny afternoon, a small rainbow band drifts slowly across the white bookshelf.'
                }
              },
              {
                palette: ['#6d8ea0', '#edf3f6', '#efa7a7'],
                motif: 'orbit',
                label: { zh: '海滩磨砂玻璃<br>薄荷碎片', en: 'Tumbled Mint<br>Sea Glass' },
                desc: {
                  zh: '被海浪打磨了不知多少年的汽水瓶碎片，早已没了棱角，对着光看像一块半融化的薄荷糖。',
                  en: 'Decades of surf turn broken bottle glass into frosted mint lozenges soft to the touch.'
                }
              }
            ]
          },
          {
            label: { zh: '织物经纬<br>与温度', en: 'Woven Linen &<br>Warmth' },
            items: [
              {
                palette: ['#6ab09e', '#eaf6f3', '#f3b778'],
                motif: 'window',
                label: { zh: '亚麻纱帘与<br>穿堂夏风', en: 'Sheer Linen &<br>Cross Breeze' },
                desc: {
                  zh: '疏松透光的本白亚麻帘子轻轻鼓起又落下，把刺眼的盛夏正午滤成了柔和的奶白色。',
                  en: 'Unbleached linen curtains billow softly, filtering harsh noon glare into creamy daylight.'
                }
              },
              {
                palette: ['#4d908e', '#e8f3f2', '#f9844a'],
                motif: 'ripple',
                label: { zh: '植物染蓝布<br>深浅云纹', en: 'Indigo Tie-Dye<br>Cloud Wash' },
                desc: {
                  zh: '板蓝根染缸里浸过三遍的棉布晾在竹竿上，折叠处留下的白纹像极了夏夜高空的卷云。',
                  en: 'Sun-dried indigo cotton unfolds to reveal pale cloud streaks where threads were bound.'
                }
              },
              {
                palette: ['#84a59d', '#eff5f3', '#f28482'],
                motif: 'leaf',
                label: { zh: '冬日粗针羊毛<br>暖手围巾', en: 'Chunky Wool<br>Winter Knit' },
                desc: {
                  zh: '燕麦色混纺着一点珊瑚红杂线的羊毛针脚，光是看着就能想起推门进屋时那口热可可。',
                  en: 'Oatmeal wool flecked with coral yarn evokes coming indoors to a mug of hot cocoa.'
                }
              }
            ]
          }
        ]
      },
      {
        id: 3,
        bgSup: 'WINDOW 03',
        bgTitle: ['LIGHT', 'SIGNALS'],
        label: { zh: '光影与<br>心绪信号', en: 'LIGHT<br>SIGNALS' },
        children: [
          {
            label: { zh: '瞬时心绪<br>色谱仪', en: 'Fleeting Mood<br>Spectra' },
            items: [
              {
                palette: ['#e066b5', '#fce9f6', '#8ecae6'],
                motif: 'bloom',
                label: { zh: '雀跃时刻<br>柑橘气泡粉', en: 'Spark of Joy<br>Citrus Rose' },
                desc: {
                  zh: '想到一个绝妙点子时的心情，就像拧开冰镇蜜桃苏打水，细密的小气泡争先恐后往上冒。',
                  en: 'Sudden inspiration feels like uncapping chilled peach soda—effervescent rose bubbles rising fast.'
                }
              },
              {
                palette: ['#b57edc', '#f5eefb', '#ffb5a7'],
                motif: 'orbit',
                label: { zh: '放空漫游<br>薰衣草薄雾', en: 'Daydream Drift<br>Lavender Haze' },
                desc: {
                  zh: '什么都不必赶着完成的周六傍晚，思绪在淡紫色与杏粉色的云朵之间慢悠悠地晃荡。',
                  en: 'Unscheduled Saturday twilight where thoughts float weightlessly between lilac and apricot clouds.'
                }
              },
              {
                palette: ['#f2789f', '#fdebf1', '#95d5b2'],
                motif: 'ripple',
                label: { zh: '安静笃定<br>海盐薄荷绿', en: 'Quiet Clarity<br>Sea-Salt Mint' },
                desc: {
                  zh: '把杂乱的线头一根根理顺之后的清爽感，像清晨推开窗迎面吹来的第一口薄荷味凉风。',
                  en: 'Sorting tangled threads into calm clarity—cool morning air tinged with mint and sea salt.'
                }
              }
            ]
          },
          {
            label: { zh: '声音切片<br>留声机', en: 'Ambient Sound<br>Postcards' },
            items: [
              {
                palette: ['#c77dff', '#f6ebff', '#ffd166'],
                motif: 'ripple',
                label: { zh: '黑胶空白轨<br>细微底噪', en: 'Vinyl Lead-In<br>Warm Crackle' },
                desc: {
                  zh: '唱针落下后、第一个音符响起前那两秒钟轻微的沙沙声，让整个房间瞬间安静下来。',
                  en: 'Two seconds of warm stylus crackle before the first piano chord hushes the entire room.'
                }
              },
              {
                palette: ['#e56b8f', '#fce9ef', '#72efdd'],
                motif: 'arch',
                label: { zh: '夏夜风铃与<br>远处蝉鸣', en: 'Glass Windchime<br>Summer Dusk' },
                desc: {
                  zh: '挂在廊下的江户风铃偶尔清脆地响一声，反而把傍晚的微风衬托得更加凉爽悠长。',
                  en: 'A single clear ring from a porch glass chime makes the evening breeze feel twice as cool.'
                }
              },
              {
                palette: ['#9d7cd8', '#f1ecfa', '#f4a261'],
                motif: 'horizon',
                label: { zh: '深夜键盘声<br>与煮水壶', en: 'Midnight Keys &<br>Simmering Kettle' },
                desc: {
                  zh: '万籁俱寂的凌晨一点，只有清脆的敲字节奏和厨房里水壶即将烧开的咕嘟声彼此陪伴。',
                  en: 'At 1 AM, rhythmic keystrokes keep company with the gentle murmur of a kettle coming to boil.'
                }
              }
            ]
          },
          {
            label: { zh: '动态波纹<br>交互实验', en: 'Interactive Wave<br>Experiments' },
            items: [
              {
                palette: ['#ec6ead', '#fce9f3', '#64dfdf'],
                motif: 'orbit',
                label: { zh: '水彩胶质融球<br>阈值张力', en: 'Metaball Glaze<br>Surface Tension' },
                desc: {
                  zh: '两颗旋转的水彩球靠近时，高斯模糊场在 0.125 阈值处自然拉出丝滑的胶质连接桥。',
                  en: 'Alpha-weighted blur meets a sharp threshold to pull silky liquid bridges between neighbor spheres.'
                }
              },
              {
                palette: ['#d279ee', '#f8ebfc', '#ffcad4'],
                motif: 'bloom',
                label: { zh: '指尖涟漪场<br>笔刷折射', en: 'Cursor Wake<br>Brush Refraction' },
                desc: {
                  zh: '鼠标划过画布时留下渐隐的白色笔刷环，实时扭曲泡泡边缘并叠加上一层清透的高光。',
                  en: 'Soft brush rings trail behind pointer movement, refracting bubble edges with a subtle luminous lift.'
                }
              },
              {
                palette: ['#f07199', '#fde9f0', '#a8dadc'],
                motif: 'window',
                label: { zh: '重力回流水珠<br>呼吸周期', en: 'Gravity Droplets<br>Return Cycle' },
                desc: {
                  zh: '展开的子泡泡每隔数秒便释放一颗微小水珠，沿着连线反方向缓缓飘散消融在空气里。',
                  en: 'Expanded child spheres periodically release tiny droplets that drift and dissolve along their tether.'
                }
              }
            ]
          },
          {
            label: { zh: '梦境碎片<br>显影室', en: 'Lucid Fragment<br>Darkroom' },
            items: [
              {
                palette: ['#b87ae2', '#f4ebfb', '#ffd6a5'],
                motif: 'arch',
                label: { zh: '漂浮图书馆<br>失重阶梯', en: 'Floating Library<br>Zero-G Stairs' },
                desc: {
                  zh: '醒来前五分钟记下的奇异画面：所有书架都漂在半空，翻开书页就能看见实时流动的海浪。',
                  en: 'Five minutes before waking: weightless bookshelves where open pages ripple like real ocean tide.'
                }
              },
              {
                palette: ['#f26ca7', '#fde8f2', '#9bf6ff'],
                motif: 'bloom',
                label: { zh: '透明天文台<br>极光穹顶', en: 'Glass Observatory<br>Aurora Dome' },
                desc: {
                  zh: '站在巨大的肥皂泡穹顶中央仰望，翠绿色与品红色的极光像丝绸一样在头顶轻轻折叠。',
                  en: 'Beneath an iridescent dome, emerald and magenta ribbons fold overhead like weightless silk.'
                }
              },
              {
                palette: ['#9381ff', '#efecff', '#ffc8dd'],
                motif: 'horizon',
                label: { zh: '云端邮局与<br>慢递信封', en: 'Cloud Post &<br>Slow Letters' },
                desc: {
                  zh: '寄给未来自己的信不需要贴邮票，只要装进一只淡紫色泡泡，顺着季风就会准时飘到。',
                  en: 'Letters addressed to a future self need no stamp—only a violet bubble riding the trade winds.'
                }
              }
            ]
          }
        ]
      },
      {
        id: 4,
        bgSup: 'WINDOW 04',
        bgTitle: ['ATLAS', 'COORDS'],
        label: { zh: '漫游<br>坐标集', en: 'ATLAS<br>COORDS' },
        children: [
          {
            label: { zh: '东亚海风<br>与老街巷', en: 'East Coastlines &<br>Laneways' },
            items: [
              {
                palette: ['#f79d3e', '#fff2e2', '#68b0ab'],
                motif: 'arch',
                label: { zh: '坡道电车与<br>柑橘汽水', en: 'Hillside Tram &<br>Mandarin Fizz' },
                desc: {
                  zh: '顺着陡峭的石板坡道一路走到尽头，叮当驶过的绿皮电车后面忽然露出一整片蔚蓝大海。',
                  en: 'At the bottom of a steep stone lane, a passing tram unveils a sudden sweep of bright sea.'
                }
              },
              {
                palette: ['#8ac926', '#f2fae3', '#ff924c'],
                motif: 'leaf',
                label: { zh: '竹影茶席与<br>山泉新绿', en: 'Bamboo Courtyard<br>Spring Green' },
                desc: {
                  zh: '半敞的木廊外新笋拔节，风吹过竹叶的沙沙声把整个下午的时间都调慢了半拍。',
                  en: 'Rustling bamboo outside an open timber veranda slows the afternoon down to half-tempo.'
                }
              },
              {
                palette: ['#ff7f51', '#ffece5', '#4ea8de'],
                motif: 'window',
                label: { zh: '骑楼晚风与<br>糖水铺灯光', en: 'Arcade Breeze &<br>Lantern Glow' },
                desc: {
                  zh: '南国夏夜九点半依然温热的风里，老街骑楼下亮着暖橘色灯牌，飘来清甜的陈皮绿豆沙香。',
                  en: 'Warm 9:30 PM tropical air carries sweet citrus aromas beneath softly lit arcade colonnades.'
                }
              }
            ]
          },
          {
            label: { zh: '南半球<br>季风来信', en: 'Southern<br>Trade Winds' },
            items: [
              {
                palette: ['#f4a261', '#fdf1e7', '#2a9d8f'],
                motif: 'horizon',
                label: { zh: '十一月蓝花楹<br>紫色晨街', en: 'November Jacaranda<br>Violet Streets' },
                desc: {
                  zh: '南半球的初夏在十一月准时抵达，一夜微风吹落满地蓝紫色花瓣，连清晨的影子都是香的。',
                  en: 'Early summer arrives in November, carpeting quiet morning sidewalks in fallen jacaranda blossoms.'
                }
              },
              {
                palette: ['#e9c46a', '#fcf7e8', '#457b9d'],
                motif: 'orbit',
                label: { zh: '海岸砂岩步道<br>太平洋白浪', en: 'Sandstone Cliff<br>Ocean Swell' },
                desc: {
                  zh: '沿着蜂蜜色的砂岩悬崖散步，脚下太平洋的长浪一层层拍上来，水雾在阳光里闪着细碎白光。',
                  en: 'Honey-colored cliff paths overlook long turquoise swells breaking into sunlit ocean spray.'
                }
              },
              {
                palette: ['#e76f51', '#fbe9e5', '#8ab17d'],
                motif: 'bloom',
                label: { zh: '桉树林晚霞<br>粉金色云层', en: 'Eucalyptus Dusk<br>Rose-Gold Sky' },
                desc: {
                  zh: '傍晚六点的天空大刀阔斧地铺开琥珀色与玫瑰粉，空气里混着淡淡的尤加利叶清香。',
                  en: 'Wide southern skies blaze amber and rose while evening air carries crisp eucalyptus.'
                }
              }
            ]
          },
          {
            label: { zh: '北欧极昼<br>与峡湾', en: 'Northern Fjords &<br>White Nights' },
            items: [
              {
                palette: ['#90be6d', '#eff6ea', '#f9c74f'],
                motif: 'horizon',
                label: { zh: '午夜十一点<br>不落金阳', en: '11 PM Midnight<br>Low Gold Sun' },
                desc: {
                  zh: '太阳贴着海平面滑行却始终不肯落下，给彩色木屋和停泊的帆船镀上一层长长的蜂蜜色。',
                  en: 'At 11 PM the sun skims the water without setting, bathing timber harbors in endless honey light.'
                }
              },
              {
                palette: ['#f8961e', '#fef0de', '#577590'],
                motif: 'arch',
                label: { zh: '峡湾倒影与<br>雪线瀑布', en: 'Mirror Fjord &<br>Snowline Falls' },
                desc: {
                  zh: '没有一丝风的清晨，深邃的峡湾水面平静得像黑曜石镜子，把两侧雪峰和银白色飞瀑完整复制。',
                  en: 'Windless fjord waters mirror snow-dusted peaks and slender silver waterfalls without a crease.'
                }
              },
              {
                palette: ['#f3722c', '#fdeae0', '#43aa8b'],
                motif: 'window',
                label: { zh: '桦木林小屋<br>莓果果酱', en: 'Birch Cabin &<br>Cloudberry Jam' },
                desc: {
                  zh: '白桦树皮在阳光下白得发亮，木桌上摆着刚熬好的金黄色云莓果酱和热腾腾的肉桂卷。',
                  en: 'Silver birch trunks gleam outside while golden cloudberry jam cools beside fresh cinnamon buns.'
                }
              }
            ]
          },
          {
            label: { zh: '未知岛屿<br>留白处', en: 'Uncharted Isles &<br>Blank Margins' },
            items: [
              {
                palette: ['#f9844a', '#feede4', '#4d908e'],
                motif: 'orbit',
                label: { zh: '古地图边缘<br>微风航线', en: 'Map Margin<br>Breeze Route' },
                desc: {
                  zh: '在还没有名字的坐标点画下一枚小小的水彩圆圈，留给下一次说走就走的偶然相遇。',
                  en: 'A small watercolor ring penciled onto blank map coordinates, saved for a future detour.'
                }
              },
              {
                palette: ['#99d98c', '#f0faee', '#f48c06'],
                motif: 'ripple',
                label: { zh: '珊瑚浅礁<br>透明薄荷海', en: 'Lagoon Shoal<br>Mint Shallows' },
                desc: {
                  zh: '小船浮在透明得看不见水体的浅海里，船底的影子直接投在五米深处的白沙波纹上。',
                  en: 'Water so clear a wooden skiff seems to hover in mid-air above sunlit sand ripples below.'
                }
              },
              {
                palette: ['#f9c74f', '#fef7e5', '#e07a5f'],
                motif: 'bloom',
                label: { zh: '火山黑沙滩<br>金色泡沫', en: 'Obsidian Shore<br>Gilded Foam' },
                desc: {
                  zh: '细密的黑色玄武岩沙滩上，退潮时留下的白色浪花边缘映着落日，像镶了一道金边。',
                  en: 'Retreating surf leaves lacy white foam rimmed with sunset gold across black basalt sand.'
                }
              }
            ]
          }
        ]
      },
      {
        id: 5,
        bgSup: 'YARD NOTES',
        bgTitle: ['QUIET', 'YARD'],
        label: { zh: '关于这扇<br>世界之窗', en: 'QUIET<br>YARD' },
        directLeaf: true,
        children: [
          {
            palette: ['#ef627c', '#fde8ec', '#fbd3c6'],
            motif: 'window',
            label: { zh: '造窗初衷', en: 'Why This<br>Window' },
            desc: {
              zh: '把零散的阅读、旅途见闻与转瞬即逝的心绪，从枯燥的列表里解放出来，放进有呼吸感、会彼此靠近融合的水彩气泡星图里。',
              en: 'Freeing notes, travels, and passing moods from rigid lists into a breathing constellation of watercolor bubbles.'
            }
          },
          {
            palette: ['#f48da0', '#fef0f3', '#86d86a'],
            motif: 'orbit',
            label: { zh: '物理与着色<br>1:1 架构', en: '1:1 Shader &<br>Physics Spec' },
            desc: {
              zh: '完整复刻单世界离屏管线：白底透明清屏、31 抽头 Alpha 加权高斯模糊、80x-10 胶质阈值、卫星球呼吸鼓包、回流水珠与三级状态机。',
              en: 'Full single-world offscreen pipeline: [1,1,1,0] clear, 31-tap alpha-weighted blur, 80a-10 metaball threshold, satellite bulges, and 3-tier state machine.'
            }
          },
          {
            palette: ['#ee5866', '#fde7e9', '#5cccbc'],
            motif: 'bloom',
            label: { zh: '如何改成<br>自己的泡泡', en: 'Customize<br>Your Bubbles' },
            desc: {
              zh: '打开 data.js，直接修改 sections 数组里的标题、文案、调色盘或缩略图纹样，无需改动任何 WebGL 着色器代码即可生成专属泡泡页。',
              en: 'Simply edit sections in data.js—titles, stories, palettes, or thumbnail motifs—without touching WebGL shaders.'
            }
          }
        ]
      },
      {
        id: 6,
        bgSup: 'ARCHIVE LOG',
        bgTitle: ["WHAT'S", 'FLOATING'],
        label: { zh: '近期心绪<br>与回响', en: 'FIELD<br>NOTES' },
        directLeaf: true,
        children: [
          {
            palette: ['#e45fca', '#fceaF8', '#fcd4c4'],
            motif: 'ripple',
            label: { zh: '心绪月报', en: 'Mood<br>Chronicle' },
            desc: {
              zh: '按月份汇总最近冒出来的颜色与高频词：如果这个月蓝色与薄荷绿泡泡变多，说明日子过得格外清透舒展。',
              en: 'Monthly color weather report—watching cerulean and mint spheres gather during unhurried weeks.'
            }
          },
          {
            palette: ['#c387ee', '#f6effd', '#f982b8'],
            motif: 'leaf',
            label: { zh: '灵感拾遗', en: 'Found<br>Sparks' },
            desc: {
              zh: '随手记下的半句话、一张好看的光影配色、一段想做的小工具点子，都在这里慢慢发酵成形。',
              en: 'Half-sentences, overheard melodies, and tool sketches saved before they evaporate.'
            }
          },
          {
            palette: ['#f674b8', '#feebf5', '#9ccbe8'],
            motif: 'horizon',
            label: { zh: '星图更新志', en: 'Constellation<br>Changelog' },
            desc: {
              zh: '记录每一次给世界之窗添砖加瓦的节点：从 1:1 参照底板出发，长出属于自己的交互小宇宙。',
              en: 'Milestones as this 1:1 reference foundation grows into your personal World Window universe.'
            }
          }
        ]
      }
    ],

    // ===== 1:1 官网级精确物理与坐标参数（取自 glmain.min.js） =====
    physics: {
      borderSP: 600,
      borderMid: 1200,
      // 8 颗主泡配置（id 7 的 y 相对于 id 4）
      mainBalls: [
        { id: 0, fam: 0, scale: 1.30, pc: { x: 0.75, y: -380 },  fa: 1.00, sp: { x: 0.62, y: -510,  scale: 0.68 }, lerp: 0.40, sabR: 125, pitch: 0 },
        { id: 1, fam: 1, scale: 1.00, pc: { x: 0.32, y: -1080 }, fa: 0.65, sp: { x: 0.28, y: -958,  scale: 0.54 }, lerp: 0.30, sabR: 122, pitch: -390 },
        { id: 2, fam: 2, scale: 0.84, pc: { x: 0.74, y: -1560 }, fa: 0.60, sp: { x: 0.76, y: -1320, scale: 0.48 }, lerp: 0.20, sabR: 122, pitch: -390 },
        { id: 3, fam: 3, scale: 1.05, pc: { x: 0.37, y: -2100 }, fa: 1.00, sp: { x: 0.30, y: -1698, scale: 0.54 }, lerp: 0.15, sabR: 122, pitch: -390 },
        { id: 4, fam: 1, scale: 0.90, pc: { x: 0.73, y: -2660 }, fa: 0.65, sp: { x: 0.72, y: -2126, scale: 0.52 }, lerp: 0.40, sabR: 122, pitch: -390 },
        { id: 5, fam: 0, scale: 0.84, pc: { x: 0.30, y: -3280 }, fa: 1.00, sp: { x: 0.27, y: -2622, scale: 0.46 }, lerp: 0.15, sabR: 122, pitch: -350 },
        { id: 6, fam: 3, scale: 1.05, pc: { x: 0.57, y: -3980 }, fa: 1.00, sp: { x: 0.73, y: -3022, scale: 0.55 }, lerp: 0.20, sabR: 122, pitch: -350 },
        { id: 7, fam: 1, scale: 0.45, pc: { x: 0.82, y: -512 },  fa: 0.65, sp: { x: 0.72, y: -292,  scale: 0.24 }, lerp: 0.30, sabR: 122, pitch: -350 }
      ],
      links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [4, 7]],
      jointCells: [0, 1, 2, 3, 1, 0, 1],
      particleCells: { 1: 1, 2: 2, 3: 3, 4: 1, 5: 0, 6: 3 },
      lineColors: { 1: '#FC9230', 2: '#55CEB4', 3: '#E971C6', 4: '#FC9230', 5: '#F15A79', 6: '#E971C6' },
      // L1 子泡泡坐标 [角度deg(Y向上), 半径px, 基础缩放]
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
      // L2 孙泡泡坐标（glSecondSabBall）
      l2PC: {
        left:  [[25, 440, 1.00], [-22, 460, 1.25], [-80, 340, 0.90]],
        right: [[163, 520, 1.15], [-154, 400, 1.00], [-95, 340, 0.95]]
      },
      l2SP: {
        left:  [[-147, 240, 0.60], [-112, 410, 0.80], [-84, 250, 0.60]],
        right: [[-100, 250, 0.60], [-69, 410, 0.80], [-42, 240, 0.65]]
      },
      // 11 组前景装饰球（glFrontBall，含 PC 与 SP 参数）
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
        { trgN: 5, scale: 1.20, x: 0.02, y: 640,  color: 0, scrollScale: 1.35, sinH: 60, sinS:  0.010, sp: { scale: 0.40, x: 1.00,   y: 42    } },
        { trgN: 6, scale: 0.74, x: 0.74, y: 360,  color: 3, scrollScale: 1.40, sinH: 60, sinS:  0.010, sp: { scale: 0.45, x: 0.20,   y: 232   } }
      ]
    }
  };
})();
