/* ============================================================
   TVBox Pro - 核心引擎
   视频源管理 · 数据缓存 · 多线路切换 · 存储管理
   ============================================================ */

// ========= 存储管理 =========
const Store = {
  _prefix: 'tvbox_',
  set(key, val) { try { localStorage.setItem(this._prefix + key, JSON.stringify(val)); } catch(e) { console.warn('Store.set error:', e); } },
  get(key, def = null) { try { const v = localStorage.getItem(this._prefix + key); return v ? JSON.parse(v) : def; } catch(e) { return def; } },
  remove(key) { localStorage.removeItem(this._prefix + key); },
  clear() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(this._prefix))
      .forEach(k => localStorage.removeItem(k));
  }
};

// ========= 视频源管理器 =========
const SourceManager = {
  _key: 'vod_sources',
  _sources: [],
  _activeId: null,

  init() {
    this._sources = Store.get(this._key, []);
    this._activeId = Store.get('active_source_id', null);
    // 默认源
    if (!this._sources.length) {
      this._sources.push({
        id: 'default',
        name: '默认数据源（演示）',
        url: '',
        type: 'built-in',
        active: true,
        addTime: Date.now()
      });
      this._activeId = 'default';
      this.save();
    }
    if (!this._activeId) this._activeId = this._sources[0]?.id;
  },

  getAll() { return [...this._sources]; },

  getActive() {
    return this._sources.find(s => s.id === this._activeId) || this._sources[0];
  },

  setActive(id) {
    this._activeId = id;
    Store.set('active_source_id', id);
  },

  add(name, url, type = 'json') {
    const src = {
      id: 'src_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name,
      url,
      type,
      active: false,
      addTime: Date.now()
    };
    this._sources.push(src);
    this.save();
    return src;
  },

  remove(id) {
    this._sources = this._sources.filter(s => s.id !== id);
    if (this._activeId === id) this._activeId = this._sources[0]?.id;
    this.save();
  },

  save() {
    Store.set(this._key, this._sources);
  }
};

// ========= 视频数据 API 适配器 =========
const VodAPI = {
  // 缓存
  _cache: {},
  _cacheTime: {},
  _cacheTTL: 5 * 60 * 1000, // 5分钟

  _getCached(key) {
    if (this._cache[key] && Date.now() - this._cacheTime[key] < this._cacheTTL) {
      return this._cache[key];
    }
    return null;
  },

  _setCache(key, data) {
    this._cache[key] = data;
    this._cacheTime[key] = Date.now();
  },

  // 演示数据
  _demoData: null,

  _getDemoData() {
    if (this._demoData) return this._demoData;
    const colors = ['linear-gradient(135deg,#1a1a2e,#16213e)', 'linear-gradient(135deg,#2d1b69,#11998e)', 'linear-gradient(135deg,#1e3c72,#2a5298)', 'linear-gradient(135deg,#0f0c29,#302b63)', 'linear-gradient(135deg,#141e30,#243b55)', 'linear-gradient(135deg,#3a1c71,#d76d77)', 'linear-gradient(135deg,#0f2027,#203a43)', 'linear-gradient(135deg,#1a0530,#2c0b3a)', 'linear-gradient(135deg,#0c0c1d,#1a1a3e)', 'linear-gradient(135deg,#1b1b2f,#162447)'];
    const titles = {
      '电影': [
        '沙丘2', '奥本海默', '流浪地球3', '封神第二部', '热辣滚烫',
        '飞驰人生2', '第二十条', '周处除三害', '功夫熊猫4', '哥斯拉大战金刚2',
        '抓娃娃', '默杀', '异形：夺命舰', '死侍与金刚狼', '头脑特工队2',
        '志愿军：存亡之战', '想飞的女孩', '角斗士2', '小丑2', '海关战线'
      ],
      '电视剧': [
        '庆余年2', '繁花', '狂飙', '长相思', '与凤行',
        '墨雨云间', '玫瑰的故事', '庆余年', '大江大河', '漫长的季节',
        '三体', '人世间', '开端', '觉醒年代', '隐秘的角落',
        '去有风的地方', '爱情而已', '县委大院', '警察荣誉', '风吹半夏'
      ],
      '动漫': [
        '进击的巨人 最终季', '鬼灭之刃 柱训练篇', '咒术回战', '间谍过家家',
        '电锯人', '葬送的芙莉莲', '我独自升级', '药屋少女的呢喃',
        '迷宫饭', '排球少年 垃圾场决战', '蓝色禁区', '死神少爷与黑女仆',
        '中国奇谭', '刺客伍六七', '斗破苍穹 年番', '完美世界', '一念永恒'
      ],
      '综艺': [
        '歌手2024', '奔跑吧', '披荆斩棘的哥哥', '向往的生活',
        '我是歌手', '极限挑战', '花儿与少年', '声生不息',
        '乘风破浪', '中国好声音', '脱口秀大会', '王牌对王牌',
        '欢乐喜剧人', '奔跑吧兄弟', '最强大脑', '梦想的声音'
      ]
    };
    const actors = ['张译', '吴京', '沈腾', '黄渤', '刘德华', '梁朝伟', '周星驰', '马丽', '贾玲', '赵丽颖', '杨幂', '杨紫', '迪丽热巴', '肖战', '王一博', '刘亦菲', '陈道明', '张颂文', '王传君', '于和伟'];

    const makeMovies = (category, titleList) => {
      return titleList.map((title, i) => {
        const year = 2024 + Math.floor(Math.random() * 3);
        const score = (6 + Math.random() * 3.5).toFixed(1);
        const area = ['中国大陆', '中国香港', '美国', '韩国', '日本'][Math.floor(Math.random() * 5)];
        const genreList = {
          '电影': ['动作', '科幻', '喜剧', '剧情', '悬疑', '爱情', '战争', '动画', '奇幻', '犯罪'],
          '电视剧': ['都市', '古装', '悬疑', '家庭', '军旅', '科幻', '爱情', '历史', '谍战', '喜剧'],
          '动漫': ['热血', '冒险', '搞笑', '奇幻', '战斗', '治愈', '推理', '恋爱', '日常', '运动'],
          '综艺': ['真人秀', '音乐', '脱口秀', '竞技', '旅行', '美食', '访谈', '搞笑', '选秀', '文化']
        };
        const genres = genreList[category];
        const genre1 = genres[Math.floor(Math.random() * genres.length)];
        const genre2 = genres[Math.floor(Math.random() * genres.length)];
        const epCount = category === '电影' ? 1 : (3 + Math.floor(Math.random() * 40));
        const badge = Math.random() > 0.7 ? 'hot' : (Math.random() > 0.8 ? 'new' : null);
        const note = category === '电影' ? (Math.random() > 0.5 ? 'HD' : '4K') : `更新至${Math.min(epCount, 40)}集`;

        return {
          id: `${category}_${i}`,
          title,
          pic: colors[i % colors.length],
          type: category === '电影' ? '电影' : (category === '动漫' ? '动漫' : '电视剧'),
          year,
          area,
          score: parseFloat(score),
          director: actors[Math.floor(Math.random() * actors.length)],
          actor: actors.sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 4)).join(' / '),
          desc: `${title}是一部${year}年${area}出品的${genre1}${genre2}作品。由${actors[Math.floor(Math.random() * actors.length)]}领衔主演，${Math.floor(Math.random() * 200 + 50)}万人评分${score}分。${year % 2 === 0 ? '影片口碑与票房双丰收' : '凭借精良的制作和出色的表演获得观众喜爱'}，是${year}年度${category === '综艺' ? '热门综艺节目' : '最受关注的作品'}之一。`,
          badge,
          note,
          episodes: epCount > 1 ? Array.from({length: epCount}, (_, j) => ({
            name: `第${j + 1}集`,
            url: ''
          })) : [{name: '正片', url: ''}],
          // 多线路支持
          sources: [
            { name: '线路1', episodes: Array.from({length: epCount}, (_, j) => ({name: epCount === 1 ? '正片' : `第${j+1}集`, url: ''})) },
            ...(Math.random() > 0.4 ? [{name: '线路2', episodes: Array.from({length: epCount}, (_, j) => ({name: epCount === 1 ? '正片' : `第${j+1}集`, url: ''})) }] : []),
            ...(Math.random() > 0.7 ? [{name: '线路3', episodes: Array.from({length: epCount}, (_, j) => ({name: epCount === 1 ? '正片' : `第${j+1}集`, url: ''})) }] : [])
          ],
          genre: [genre1, genre2],
          lang: ['国语', '粤语', '英语', '日语', '韩语'][Math.floor(Math.random() * 5)]
        };
      });
    };

    this._demoData = {
      home: {
        banner: [
          { id: 'b1', title: '沙丘2', pic: 'linear-gradient(135deg,#1a1a2e,#0f3460,#533483)', desc: '保罗·厄崔迪与弗瑞曼人联合，踏上复仇之路，同时面对宇宙中已知与未知的威胁', score: 8.2, year: 2024, tags: ['科幻', '冒险'], badge: 'hot' },
          { id: 'b2', title: '庆余年2', pic: 'linear-gradient(135deg,#2d1b69,#d76d77)', desc: '范闲从一个身世神秘的少年，一路披荆斩棘，历经家族、江湖、庙堂的种种考验', score: 8.5, year: 2024, tags: ['古装', '权谋'], badge: 'hot' },
          { id: 'b3', title: '狂飙', pic: 'linear-gradient(135deg,#0f2027,#2c5364)', desc: '刑警安欣与鱼贩高启强命运交汇，一场正邪较量横跨二十年', score: 9.0, year: 2023, tags: ['犯罪', '悬疑'], badge: 'hot' },
          { id: 'b4', title: '进击的巨人 最终季', pic: 'linear-gradient(135deg,#1b1b2f,#3a1c71)', desc: '调查兵团与艾伦的最终对决，人类与巨人的命运交织', score: 9.5, year: 2024, tags: ['热血', '奇幻'], badge: 'hot' },
        ],
        sections: [
          { title: '热门推荐', key: 'hot', movies: makeMovies('电影', titles['电影'].slice(0, 10)).concat(makeMovies('电视剧', titles['电视剧'].slice(0, 6))) },
          { title: '最新电影', key: 'new_movie', movies: makeMovies('电影', titles['电影']) },
          { title: '热播电视剧', key: 'hot_series', movies: makeMovies('电视剧', titles['电视剧']) },
          { title: '国产动漫', key: 'anime', movies: makeMovies('动漫', titles['动漫']) },
          { title: '热门综艺', key: 'variety', movies: makeMovies('综艺', titles['综艺'].slice(0, 10)) },
          { title: '高分经典', key: 'classic', movies: makeMovies('电影', titles['电影'].slice(5)).filter(m => m.score > 7.5) },
          { title: '科幻冒险', key: 'scifi', movies: makeMovies('电影', titles['电影'].slice(10, 18)).concat(makeMovies('动漫', titles['动漫'].slice(0, 4))) },
        ]
      },
      categories: {
        '电影': makeMovies('电影', titles['电影']),
        '电视剧': makeMovies('电视剧', titles['电视剧']),
        '动漫': makeMovies('动漫', titles['动漫']),
        '综艺': makeMovies('综艺', titles['综艺']),
      },
      search: (keyword) => {
        const all = [...titles['电影'], ...titles['电视剧'], ...titles['动漫'], ...titles['综艺']];
        const results = all.filter(t => t.toLowerCase().includes(keyword.toLowerCase()));
        return results.slice(0, 12).map((t, i) => {
          const cat = t in titles['电影'] ? '电影' : (t in titles['电视剧'] ? '电视剧' : '动漫');
          const base = makeMovies(cat, [t])[0];
          base.note = cat === '电影' ? 'HD' : `更新至${base.episodes.length}集`;
          return base;
        });
      }
    };
    return this._demoData;
  },

  // 获取首页数据
  async getHome() {
    const cached = this._getCached('home');
    if (cached) return cached;
    const data = this._getDemoData().home;
    this._setCache('home', data);
    return data;
  },

  // 获取分类数据
  async getCategory(cat) {
    const key = 'cat_' + cat;
    const cached = this._getCached(key);
    if (cached) return cached;
    const allData = this._getDemoData();
    const data = allData.categories[cat] || allData.categories['电影'];
    this._setCache(key, data);
    return data;
  },

  // 搜索
  async search(keyword) {
    if (!keyword) return [];
    const key = 'search_' + keyword;
    const cached = this._getCached(key);
    if (cached) return cached;
    const results = this._getDemoData().search(keyword);
    this._setCache(key, results);
    return results;
  },

  // 获取影片详情
  async getDetail(movieId) {
    const data = this._getDemoData();
    const cat = movieId.startsWith('电视剧') ? '电视剧' : (movieId.startsWith('动漫') ? '动漫' : (movieId.startsWith('综艺') ? '综艺' : '电影'));
    const idx = parseInt(movieId.split('_')[1]);
    const movies = data.categories[cat];
    if (movies && movies[idx]) return movies[idx];
    return null;
  },

  // 解析真实视频源（支持未来扩展）
  async fetchFromSource(source) {
    if (!source || !source.url) return null;
    try {
      const resp = await fetch(source.url);
      const json = await resp.json();
      return json;
    } catch(e) {
      console.error('Fetch source error:', e);
      return null;
    }
  }
};

// ========= 历史记录管理器 =========
const HistoryManager = {
  _key: 'history',
  _max: 100,

  getAll() { return Store.get(this._key, []); },

  add(movie, episode) {
    const list = this.getAll();
    const existing = list.findIndex(h => h.id === movie.id && h.episode === episode);
    if (existing > -1) list.splice(existing, 1);
    list.unshift({
      id: movie.id,
      title: movie.title,
      pic: movie.pic,
      episode,
      time: Date.now(),
      progress: 0
    });
    if (list.length > this._max) list.length = this._max;
    Store.set(this._key, list);
  },

  getProgress(movieId, episode) {
    const list = this.getAll();
    const h = list.find(h => h.id === movieId && h.episode === episode);
    return h ? h.progress : 0;
  },

  setProgress(movieId, episode, progress) {
    const list = this.getAll();
    const h = list.find(h => h.id === movieId && h.episode === episode);
    if (h) { h.progress = progress; Store.set(this._key, list); }
  },

  clear() { Store.remove(this._key); }
};

// ========= 收藏管理器 =========
const FavoriteManager = {
  _key: 'favorites',

  getAll() { return Store.get(this._key, []); },

  toggle(movie) {
    const list = this.getAll();
    const idx = list.findIndex(f => f.id === movie.id);
    if (idx > -1) {
      list.splice(idx, 1);
      Store.set(this._key, list);
      return false;
    } else {
      list.unshift({
        id: movie.id,
        title: movie.title,
        pic: movie.pic,
        score: movie.score,
        type: movie.type,
        desc: movie.desc,
        episodes: movie.episodes,
        sources: movie.sources,
        addTime: Date.now()
      });
      Store.set(this._key, list);
      return true;
    }
  },

  isFavorite(movieId) {
    return this.getAll().some(f => f.id === movieId);
  }
};

// ========= 工具函数 =========
function showToast(msg, type = 'info', duration = 2500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)'; setTimeout(() => toast.remove(), 300); }, duration);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.() || document.documentElement.webkitRequestFullscreen?.();
  } else {
    document.exitFullscreen?.() || document.documentElement.webkitExitFullscreen?.();
  }
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

function generatePosterGradient(index) {
  const gradients = [
    ['#667eea','#764ba2'], ['#f093fb','#f5576c'], ['#4facfe','#00f2fe'],
    ['#43e97b','#38f9d7'], ['#fa709a','#fee140'], ['#a18cd1','#fbc2eb'],
    ['#fccb90','#d57eeb'], ['#e0c3fc','#8ec5fc'], ['#f5576c','#ff6a88'],
    ['#667eea','#764ba2'], ['#a1c4fd','#c2e9fb'], ['#d4fc79','#96e6a1'],
  ];
  const [c1, c2] = gradients[index % gradients.length];
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}
