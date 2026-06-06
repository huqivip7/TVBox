/* ============================================================
   TVBox Pro - UI 渲染层
   所有页面的渲染逻辑
   ============================================================ */

// ========= 页面路由 =========
function navigateTo(page, data = {}) {
  // 保存历史
  if (AppState.currentPage !== page) {
    FE._navHistory.push({ page: AppState.currentPage, data: AppState.currentData });
    if (FE._navHistory.length > 20) FE._navHistory.shift();
  }

  AppState.currentPage = page;
  AppState.currentData = data;

  // 切换页面显示
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) {
    target.classList.add('active');
    target.scrollTop = 0;
  }

  // 更新侧边栏高亮
  document.querySelectorAll('#sidebar .nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });

  // 更新顶部栏
  const titles = {
    home: '首页', movies: '电影', series: '电视剧',
    anime: '动漫', variety: '综艺', search: '搜索',
    detail: '详情', player: '播放', history: '历史记录',
    favorite: '我的收藏', settings: '设置',
    live: '直播', 'live-player': '直播中',
  };
  document.getElementById('topbar-title').textContent = titles[page] || page;

  // 渲染对应页面
  switch (page) {
    case 'home': renderHome(); break;
    case 'movies': renderCategory('电影'); break;
    case 'series': renderCategory('电视剧'); break;
    case 'anime': renderCategory('动漫'); break;
    case 'variety': renderCategory('综艺'); break;
    case 'search': renderSearch(data.keyword || ''); break;
    case 'detail': renderDetail(data.movie); break;
    case 'player': renderPlayer(data.movie, data.episodeIndex, data.sourceIndex); break;
    case 'history': renderHistory(); break;
    case 'favorite': renderFavorite(); break;
    case 'settings': renderSettings(); break;
    case 'live': renderLive(); break;
    case 'live-player': renderLivePlayer(data.channel); break;
  }

  // 延迟刷新焦点
  requestAnimationFrame(() => setTimeout(() => FE.refresh(), 100));
}

// ========= 首页渲染 =========
async function renderHome() {
  const page = document.getElementById('page-home');
  page.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>加载中...</span></div>';

  try {
    const data = await VodAPI.getHome();

    // Hero Banner
    const banner = data.banner || [];
    let heroHtml = '';
    if (banner.length) {
      heroHtml = `
        <div class="hero-banner" id="hero-banner" data-focusable onclick="navigateTo('detail', {movie: window.__heroData[${FE._heroIdx || 0}]})">
          <div class="hero-bg" id="hero-bg" style="background:${banner[FE._heroIdx || 0].pic || '#1a1a2e'}"></div>
          <div class="hero-content" id="hero-content">
            <div class="hero-tags">
              ${(banner[FE._heroIdx || 0].tags || []).map(t => `<span class="hero-tag">${t}</span>`).join('')}
              ${banner[FE._heroIdx || 0].badge === 'hot' ? '<span class="hero-tag hot">热播</span>' : ''}
            </div>
            <div class="hero-title" id="hero-title">${banner[FE._heroIdx || 0].title}</div>
            <div class="hero-meta" id="hero-meta">
              <span class="score">⭐ ${banner[FE._heroIdx || 0].score || '-'}</span>
              <span>${banner[FE._heroIdx || 0].year || ''}</span>
            </div>
            <div class="hero-desc" id="hero-desc">${banner[FE._heroIdx || 0].desc || ''}</div>
            <div class="hero-actions" id="hero-actions">
              <button class="hero-play-btn" data-focusable onclick="event.stopPropagation();navigateTo('detail', {movie: window.__heroData[${FE._heroIdx || 0}]})">▶ 立即观看</button>
              <button class="hero-info-btn" data-focusable onclick="event.stopPropagation();navigateTo('detail', {movie: window.__heroData[${FE._heroIdx || 0}]})">ℹ 详情</button>
            </div>
          </div>
          <div class="hero-indicators">
            ${banner.map((_, i) => `<div class="hero-dot ${i === (FE._heroIdx || 0) ? 'active' : ''}" onclick="FE.heroNavigate(0, ${banner.length}, switchHero)"></div>`).join('')}
          </div>
        </div>
      `;
      // 存储 hero 数据用于点击
      window.__heroData = banner.map(b => ({
        id: 'hero_' + b.title, title: b.title, pic: b.pic,
        desc: b.desc, score: b.score, year: b.year,
        episodes: [{name: '正片', url: ''}],
        sources: [{name: '线路1', episodes: [{name: '正片', url: ''}]}],
        type: '电影', genre: b.tags || [], badge: b.badge
      }));
      // 启动自动轮播
      FE.startHeroAuto(banner, switchHero);
    }

    // 内容区块
    let sectionsHtml = '';
    const sections = data.sections || [];
    for (const section of sections) {
      sectionsHtml += `
        <div class="section-header">
          <div class="section-title">${section.title}</div>
          <div class="section-more" data-focusable onclick="navigateTo('movies')">更多 ›</div>
        </div>
        <div class="card-row">
          ${section.movies.map(m => renderMovieCard(m)).join('')}
        </div>
      `;
    }

    // 直播快捷入口
    sectionsHtml += `
      <div class="section-header">
        <div class="section-title">直播频道</div>
        <div class="section-more" data-focusable onclick="navigateTo('live')">进入直播 ›</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:32px;">
        ${[
          {icon:'📺',name:'CCTV 央视',desc:'中央广播电视总台'},
          {icon:'🌏',name:'卫视频道',desc:'各省市卫星电视'},
          {icon:'⚽',name:'体育直播',desc:'球赛赛事直播'},
          {icon:'🎬',name:'电影频道',desc:'经典电影24小时'},
          {icon:'🎵',name:'综艺娱乐',desc:'综艺节目直播'},
        ].map(item => `
          <div data-focusable onclick="navigateTo('live')"
            style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:14px;"
            onmouseenter="this.style.borderColor='var(--accent)';this.style.background='var(--accent-soft)'"
            onmouseleave="this.style.borderColor='var(--border)';this.style.background='var(--bg-card)'">
            <div style="font-size:30px;width:48px;height:48px;background:var(--bg-hover);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${item.icon}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:600;">${item.name}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${item.desc}</div>
            </div>
            <div class="channel-live-dot"></div>
          </div>
        `).join('')}
      </div>
    `;

    page.innerHTML = heroHtml + sectionsHtml;
  } catch(e) {
    page.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>加载失败，请检查网络</p><small>${e.message}</small></div>`;
  }
}

// Hero 轮播切换
function switchHero(idx) {
  const data = window.__heroData;
  if (!data || !data[idx]) return;
  FE._heroIdx = idx;
  const bg = document.getElementById('hero-bg');
  const title = document.getElementById('hero-title');
  const meta = document.getElementById('hero-meta');
  const desc = document.getElementById('hero-desc');
  const content = document.getElementById('hero-content');
  if (bg) bg.style.background = data[idx].pic;
  if (title) title.textContent = data[idx].title;
  if (meta) meta.innerHTML = `<span class="score">⭐ ${data[idx].score || '-'}</span><span>${data[idx].year || ''}</span>`;
  if (desc) desc.textContent = data[idx].desc || '';
  // 更新标签
  if (content) {
    const tags = content.querySelector('.hero-tags');
    if (tags) tags.innerHTML = (data[idx].genre || []).map(t => `<span class="hero-tag">${t}</span>`).join('') + (data[idx].badge === 'hot' ? '<span class="hero-tag hot">热播</span>' : '');
  }
  // 更新指示器
  document.querySelectorAll('.hero-dot').forEach((dot, i) => dot.classList.toggle('active', i === idx));
}

// ========= 影片卡片渲染 =========
function renderMovieCard(m) {
  const posterStyle = m.pic && m.pic.startsWith('http')
    ? `<img src="${m.pic}" alt="${m.title}" loading="lazy">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${m.pic || generatePosterGradient(Math.random()*10)};font-size:36px;color:rgba(255,255,255,0.15);font-weight:800;">${(m.title||'?')[0]}</div>`;

  return `
    <div class="movie-card" data-focusable
         onclick="navigateTo('detail', {movie: ${JSON.stringify(m).replace(/"/g, '&quot;')}})"
         data-title="${m.title || ''}">
      <div class="card-poster">
        ${posterStyle}
        ${m.badge === 'hot' ? '<span class="card-badge hot">热播</span>' : ''}
        ${m.badge === 'new' ? '<span class="card-badge new">新</span>' : ''}
        ${m.badge === 'vip' ? '<span class="card-badge vip">VIP</span>' : ''}
        ${m.score ? `<span class="card-score">⭐${m.score}</span>` : ''}
        ${m.note ? `<span class="card-note">${m.note}</span>` : ''}
      </div>
      <div class="card-info">
        <div class="card-title">${m.title || '未知'}</div>
        <div class="card-subtitle">${m.year || ''} ${m.area || ''} ${m.genre ? m.genre[0] : ''}</div>
      </div>
    </div>
  `;
}

// ========= 分类页渲染 =========
async function renderCategory(cat) {
  const page = document.getElementById('page-' + (cat === '电影' ? 'movies' : cat === '电视剧' ? 'series' : cat === '动漫' ? 'anime' : 'variety'));
  if (!page) return;
  page.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>加载中...</span></div>';

  try {
    const movies = await VodAPI.getCategory(cat);
    const genres = [...new Set(movies.flatMap(m => m.genre || []))].slice(0, 12);

    let html = `
      <div class="filter-bar">
        <div class="filter-tag active" data-focusable onclick="filterCategory(this, '')">全部</div>
        ${genres.map(g => `<div class="filter-tag" data-focusable onclick="filterCategory(this, '${g}')">${g}</div>`).join('')}
      </div>
      <div class="card-grid" id="category-grid">
        ${movies.map(m => renderMovieCard(m)).join('')}
      </div>
    `;
    page.innerHTML = html;
    // 存储用于筛选
    page._allMovies = movies;
  } catch(e) {
    page.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>加载失败</p></div>`;
  }
}

function filterCategory(el, genre) {
  el.closest('.filter-bar').querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  const page = el.closest('.page');
  const movies = page._allMovies || [];
  const filtered = genre ? movies.filter(m => (m.genre || []).includes(genre)) : movies;
  document.getElementById('category-grid').innerHTML = filtered.map(m => renderMovieCard(m)).join('');
  requestAnimationFrame(() => setTimeout(() => FE.refresh(), 50));
}

// ========= 搜索页渲染 =========
function renderSearch(keyword) {
  const page = document.getElementById('page-search');

  const hotWords = ['庆余年', '狂飙', '流浪地球', '三体', '长相思', '沙丘', '封神', '鬼灭之刃', '繁花', '周处除三害'];

  let html = `
    <div class="search-container">
      <div class="search-input-wrap" id="search-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" id="search-input" placeholder="输入电影、电视剧名称..."
               value="${keyword}" oninput="handleSearch(this.value)" autofocus>
        <span class="clear-btn" onclick="clearSearch()" style="display:${keyword ? 'block' : 'none'}">✕</span>
      </div>
      ${keyword ? `<div id="search-results" class="card-grid"></div>` : `
        <div class="hot-search">
          <div class="hot-search-title">🔥 热门搜索</div>
          <div class="hot-tags">
            ${hotWords.map((w, i) => `
              <div class="hot-tag" data-focusable onclick="doSearch('${w}')">
                <span class="rank ${i < 3 ? 'top' : ''}">${i + 1}</span>${w}
              </div>
            `).join('')}
          </div>
        </div>
        ${AppState.searchHistory.length ? `
          <div class="search-history">
            <div class="search-history-header">
              <span class="search-history-title">🕐 搜索历史</span>
              <span class="clear-history-btn" data-focusable onclick="clearSearchHistory()">清除</span>
            </div>
            <div class="hot-tags">
              ${AppState.searchHistory.slice(0, 10).map(w => `
                <div class="hot-tag" data-focusable onclick="doSearch('${w}')">${w}</div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      `}
    </div>
  `;
  page.innerHTML = html;

  // 聚焦搜索框
  setTimeout(() => {
    const input = document.getElementById('search-input');
    if (input && keyword) {
      input.focus();
      handleSearch(keyword);
    } else {
      FE.refresh();
    }
  }, 100);
}

const handleSearch = debounce(async function(keyword) {
  const results = document.getElementById('search-results');
  const clearBtn = document.querySelector('.clear-btn');
  if (clearBtn) clearBtn.style.display = keyword ? 'block' : 'none';

  if (!keyword || keyword.trim().length < 1) {
    if (results) results.innerHTML = '';
    return;
  }

  if (results) results.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>搜索中...</span></div>';

  const movies = await VodAPI.search(keyword.trim());
  if (results) {
    if (!movies.length) {
      results.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>未找到相关内容</p><small>换个关键词试试</small></div>';
    } else {
      results.innerHTML = movies.map(m => renderMovieCard(m)).join('');
    }
  }
}, 350);

function doSearch(keyword) {
  if (!AppState.searchHistory.includes(keyword)) {
    AppState.searchHistory.unshift(keyword);
    if (AppState.searchHistory.length > 20) AppState.searchHistory.pop();
    Store.set('search_history', AppState.searchHistory);
  }
  navigateTo('search', { keyword });
}

function clearSearch() {
  const input = document.getElementById('search-input');
  if (input) { input.value = ''; input.focus(); }
  const results = document.getElementById('search-results');
  if (results) results.innerHTML = '';
  const clearBtn = document.querySelector('.clear-btn');
  if (clearBtn) clearBtn.style.display = 'none';
  navigateTo('search');
}

function clearSearchHistory() {
  AppState.searchHistory = [];
  Store.remove('search_history');
  navigateTo('search');
  showToast('搜索历史已清除', 'success');
}

// ========= 详情页渲染 =========
function renderDetail(movie) {
  if (!movie) return;
  const page = document.getElementById('page-detail');
  const isFav = FavoriteManager.isFavorite(movie.id);
  const sources = movie.sources || [{ name: '线路1', episodes: movie.episodes || [] }];
  const activeSource = sources[0];
  const episodes = activeSource.episodes || movie.episodes || [];

  const posterStyle = movie.pic && movie.pic.startsWith('http')
    ? `<img src="${movie.pic}" alt="${movie.title}">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${movie.pic || generatePosterGradient(0)};font-size:64px;color:rgba(255,255,255,0.15);font-weight:800;">${(movie.title||'?')[0]}</div>`;

  page.innerHTML = `
    <div class="detail-layout fade-in">
      <div class="detail-poster">${posterStyle}</div>
      <div class="detail-info">
        <div class="detail-title">${movie.title}</div>
        <div class="detail-tags">
          ${(movie.genre || []).map(g => `<span class="detail-tag">${g}</span>`).join('')}
          ${movie.lang ? `<span class="detail-tag">${movie.lang}</span>` : ''}
        </div>
        <div class="detail-meta">
          ${movie.score ? `<span class="score">⭐ ${movie.score}</span>` : ''}
          ${movie.year ? `<span>${movie.year}</span>` : ''}
          ${movie.area ? `<span>${movie.area}</span>` : ''}
          ${movie.director ? `<span>导演: ${movie.director}</span>` : ''}
        </div>
        <div class="detail-desc">${movie.desc || '暂无简介'}</div>
        <div class="detail-actions">
          <button class="btn-play" data-focusable onclick="playMovie(${JSON.stringify(movie).replace(/"/g, '&quot;')}, 0, 0)">▶ 立即播放</button>
          <button class="btn-fav ${isFav ? 'active' : ''}" data-focusable id="fav-btn" onclick="toggleFavorite(this, ${JSON.stringify(movie).replace(/"/g, '&quot;')})">
            ${isFav ? '⭐ 已收藏' : '☆ 收藏'}
          </button>
        </div>
      </div>
    </div>

    <div class="source-selector fade-in-up" style="margin-top:20px;">
      <div class="source-tabs" id="source-tabs">
        ${sources.map((s, i) => `<div class="source-tab ${i === 0 ? 'active' : ''}" data-focusable data-idx="${i}" onclick="switchSource(${i})">${s.name}</div>`).join('')}
      </div>
      <div class="section-title" style="margin-top:16px;margin-bottom:12px;font-size:15px;">选集</div>
      <div class="episode-grid" id="episode-grid">
        ${episodes.map((ep, i) => `
          <div class="episode-item" data-focusable data-idx="${i}" onclick="playMovie(${JSON.stringify(movie).replace(/"/g, '&quot;')}, ${i}, getCurrentSourceIdx())">${ep.name}</div>
        `).join('')}
      </div>
    </div>
  `;

  // 存储当前影片
  window.__currentDetailMovie = movie;
  window.__currentDetailSources = sources;
}

function getCurrentSourceIdx() {
  const activeTab = document.querySelector('.source-tab.active');
  return activeTab ? parseInt(activeTab.dataset.idx) : 0;
}

function switchSource(idx) {
  document.querySelectorAll('.source-tab').forEach((t, i) => t.classList.toggle('active', i === idx));
  const sources = window.__currentDetailSources || [];
  const episodes = (sources[idx]?.episodes || sources[0]?.episodes || []);
  const movie = window.__currentDetailMovie;
  const grid = document.getElementById('episode-grid');
  if (grid && movie) {
    grid.innerHTML = episodes.map((ep, i) => `
      <div class="episode-item" data-focusable data-idx="${i}" onclick="playMovie(${JSON.stringify(movie).replace(/"/g, '&quot;')}, ${i}, ${idx})">${ep.name}</div>
    `).join('');
  }
}

function toggleFavorite(btn, movie) {
  const result = FavoriteManager.toggle(movie);
  btn.classList.toggle('active', result);
  btn.innerHTML = result ? '⭐ 已收藏' : '☆ 收藏';
  showToast(result ? '已添加到收藏' : '已取消收藏', 'success');
}

function playMovie(movie, epIdx, srcIdx) {
  if (!movie) return;
  const sources = movie.sources || [{ name: '线路1', episodes: movie.episodes || [] }];
  const source = sources[srcIdx] || sources[0];
  const episode = source.episodes[epIdx] || source.episodes[0] || { name: '正片', url: '' };

  // 记录历史
  HistoryManager.add(movie, epIdx);
  // 播放
  navigateTo('player', { movie, episodeIndex: epIdx, sourceIndex: srcIdx || 0 });
}

// ========= 播放页渲染 =========
let _playerHls = null;

function renderPlayer(movie, epIdx = 0, srcIdx = 0) {
  const page = document.getElementById('page-player');
  const sources = movie?.sources || [{ name: '线路1', episodes: movie?.episodes || [] }];
  const source = sources[srcIdx] || sources[0];
  const episodes = source?.episodes || [];
  const episode = episodes[epIdx] || episodes[0] || { name: '正片', url: '' };

  page.innerHTML = `
    <div class="player-wrap">
      <div class="player-video" id="player-video-area">
        <video id="main-video" playsinline></video>
        <div class="player-overlay" id="player-overlay">
          <div>
            <div class="player-title">${movie?.title || '未知'}</div>
            <div class="player-ep-info">${source?.name || ''} · ${episode.name}</div>
          </div>
          <div class="player-controls">
            <button class="player-ctrl" data-focusable onclick="switchPrevEpisode()" title="上一集">⏮</button>
            <button class="player-ctrl" data-focusable onclick="switchNextEpisode()" title="下一集">⏭</button>
            <button class="player-ctrl" data-focusable onclick="toggleFullscreen()" title="全屏">⛶</button>
            <button class="player-ctrl" data-focusable onclick="togglePlayerMute()" id="mute-btn" title="静音">🔊</button>
            <button class="player-ctrl" data-focusable onclick="navigateTo('detail', {movie: window.__currentDetailMovie || ${JSON.stringify(movie).replace(/"/g, '&quot;')}})" title="返回详情">↩</button>
          </div>
        </div>
        <div class="player-loading" id="player-loading" style="display:none;"><div class="spinner"></div><span>加载中...</span></div>
        <div class="player-error" id="player-error" style="display:none;">
          <div style="font-size:48px;opacity:0.3;margin-bottom:16px;">⚠️</div>
          <p>视频加载失败</p>
          <button class="error-retry-btn" data-focusable onclick="retryPlay()">重试</button>
        </div>
      </div>
      <div class="player-ep-panel" id="player-ep-panel">
        <div class="player-ep-row">
          ${episodes.map((ep, i) => `
            <div class="player-ep-btn ${i === epIdx ? 'active' : ''}" data-focusable data-idx="${i}" onclick="switchEpisode(${i})">${ep.name}</div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // 存储播放状态
  window.__playerMovie = movie;
  window.__playerEpIdx = epIdx;
  window.__playerSrcIdx = srcIdx;

  // 尝试播放
  setTimeout(() => tryPlayVideo(episode), 200);
}

function tryPlayVideo(episode) {
  const video = document.getElementById('main-video');
  const loading = document.getElementById('player-loading');
  const error = document.getElementById('player-error');

  if (!episode?.url) {
    // 演示模式
    if (loading) loading.style.display = 'none';
    if (error) error.style.display = 'flex';
    return;
  }

  if (loading) loading.style.display = 'flex';
  if (error) error.style.display = 'none';

  // 清理旧 HLS 实例
  if (_playerHls) { _playerHls.destroy(); _playerHls = null; }

  const url = episode.url;

  if (url.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
    _playerHls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });
    _playerHls.loadSource(url);
    _playerHls.attachMedia(video);
    _playerHls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
      if (loading) loading.style.display = 'none';
    });
    _playerHls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        if (loading) loading.style.display = 'none';
        if (error) error.style.display = 'flex';
      }
    });
  } else {
    video.src = url;
    video.addEventListener('canplay', () => {
      video.play().catch(() => {});
      if (loading) loading.style.display = 'none';
    }, { once: true });
    video.addEventListener('error', () => {
      if (loading) loading.style.display = 'none';
      if (error) error.style.display = 'flex';
    }, { once: true });
    video.load();
  }
}

function retryPlay() {
  const movie = window.__playerMovie;
  const epIdx = window.__playerEpIdx;
  const srcIdx = window.__playerSrcIdx;
  if (!movie) return;
  renderPlayer(movie, epIdx, srcIdx);
}

function switchEpisode(idx) {
  const movie = window.__playerMovie;
  const srcIdx = window.__playerSrcIdx;
  if (!movie) return;
  window.__playerEpIdx = idx;
  // 更新按钮状态
  document.querySelectorAll('.player-ep-btn').forEach((btn, i) => btn.classList.toggle('active', i === idx));
  const sources = movie.sources || [{ episodes: movie.episodes }];
  const source = sources[srcIdx] || sources[0];
  const episode = source.episodes[idx];
  tryPlayVideo(episode);
  HistoryManager.add(movie, idx);
}

function switchPrevEpisode() {
  const idx = (window.__playerEpIdx || 1) - 1;
  if (idx >= 0) switchEpisode(idx);
}

function switchNextEpisode() {
  const movie = window.__playerMovie;
  const srcIdx = window.__playerSrcIdx;
  const sources = movie?.sources || [{ episodes: movie?.episodes }];
  const source = sources[srcIdx] || sources[0];
  const total = (source?.episodes || []).length;
  const idx = (window.__playerEpIdx || 0) + 1;
  if (idx < total) switchEpisode(idx);
  else showToast('已经是最后一集', 'info');
}

function togglePlayerMute() {
  const video = document.getElementById('main-video');
  const btn = document.getElementById('mute-btn');
  if (!video) return;
  video.muted = !video.muted;
  if (btn) btn.textContent = video.muted ? '🔇' : '🔊';
}

// ========= 历史记录页 =========
function renderHistory() {
  const page = document.getElementById('page-history');
  const list = HistoryManager.getAll();

  if (!list.length) {
    page.innerHTML = '<div class="empty-state"><div class="icon">⏱</div><p>暂无观看记录</p><small>观看影片后自动记录</small></div>';
    return;
  }

  page.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:600;">共 ${list.length} 条记录</div>
      <button class="btn-secondary" data-focusable onclick="HistoryManager.clear();renderHistory();showToast('记录已清除','success')" style="font-size:12px;padding:6px 16px;">清除全部</button>
    </div>
    <div class="card-grid">
      ${list.map(h => `
        <div class="movie-card" data-focusable onclick="navigateTo('detail', {movie: ${JSON.stringify({id:h.id,title:h.title,pic:h.pic}).replace(/"/g, '&quot;')}})">
          <div class="card-poster">
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${h.pic || generatePosterGradient(Math.random()*10)};font-size:36px;color:rgba(255,255,255,0.15);font-weight:800;">${(h.title||'?')[0]}</div>
            <span class="card-note">${h.episode !== undefined ? `看到第${h.episode + 1}集` : '正片'}</span>
          </div>
          <div class="card-info">
            <div class="card-title">${h.title}</div>
            <div class="card-subtitle">${formatTimeAgo(h.time)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

// ========= 收藏页渲染 =========
function renderFavorite() {
  const page = document.getElementById('page-favorite');
  const list = FavoriteManager.getAll();

  if (!list.length) {
    page.innerHTML = '<div class="empty-state"><div class="icon">⭐</div><p>暂无收藏</p><small>在影片详情页点击收藏按钮</small></div>';
    return;
  }

  page.innerHTML = `
    <div class="card-grid">
      ${list.map(m => renderMovieCard(m)).join('')}
    </div>
  `;
}

// ========= 设置页渲染 =========
function renderSettings() {
  const page = document.getElementById('page-settings');
  const sources = SourceManager.getAll();
  const activeId = SourceManager.getActive()?.id;

  page.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">🌐 在线获取源（一键更新）</div>
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">推荐仓库：</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
          ${OnlineSourceFetcher.getRecommendedRepos().map(r => `
            <button class="source-btn" data-focusable onclick="fetchFromRepo('${r.name}')" style="font-size:11px;padding:5px 10px;">${r.name}</button>
          `).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
        <input class="modal-input" id="online-repo-input" placeholder="输入 GitHub 仓库（如：gaotianliuyun/gao）或文件 URL" style="flex:1;min-width:200px;">
        <button class="btn-primary" data-focusable onclick="fetchFromRepoInput()" style="font-size:13px;padding:8px 16px;">获取源</button>
      </div>
      <div id="online-sources-result" style="min-height:40px;"></div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">📡 点播视频源管理</div>
      <div id="sources-list">
        ${sources.map(s => `
          <div class="source-item">
            <div>
              <div class="source-item-name">${s.name} ${s.id === activeId ? '<span style="color:var(--accent);font-size:11px;">✓ 当前使用</span>' : ''}</div>
              <div class="source-item-url">${s.url || '内置数据'}</div>
            </div>
            <div class="source-item-btns">
              ${s.type !== 'built-in' ? `<button class="source-btn" data-focusable onclick="switchSource('${s.id}')">使用</button><button class="source-btn danger" data-focusable onclick="removeSource('${s.id}')">删除</button>` : '<span style="color:var(--text-muted);font-size:12px;">默认</span>'}
            </div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:16px;">
        <button class="btn-primary" data-focusable onclick="showAddSourceModal()" style="font-size:13px;padding:8px 20px;">+ 添加点播源</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">📺 直播源管理（M3U）</div>
      <div id="live-sources-list">
        ${(function() {
          const liveSrcs = LiveSourceManager.getAll();
          if (!liveSrcs.length) return '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无直播源，请添加 M3U 直播源</div>';
          return liveSrcs.map(s => `
            <div class="source-item">
              <div>
                <div class="source-item-name">${s.name} ${LiveState.currentSource === s.id ? '<span style="color:var(--accent);font-size:11px;">✓ 当前使用</span>' : ''}</div>
                <div class="source-item-url">${s.url}</div>
                ${s.channelCount ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${s.channelCount} 个频道</div>` : ''}
              </div>
              <div class="source-item-btns">
                <button class="source-btn" data-focusable onclick="LiveState.currentSourceId='${s.id}';navigateTo('live')">打开</button>
                <button class="source-btn danger" data-focusable onclick="removeLiveSourceFromSettings('${s.id}')">删除</button>
              </div>
            </div>
          `).join('');
        })()}
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;">
        <button class="btn-primary" data-focusable onclick="showAddLiveSourceModal()" style="font-size:13px;padding:8px 20px;">+ 添加直播源</button>
        <button class="btn-secondary" data-focusable onclick="navigateTo('live')" style="font-size:13px;padding:8px 20px;">📡 进入直播</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">🔧 系统设置</div>
      <div class="source-item">
        <div><div class="source-item-name">版本</div><div class="source-item-url">TVBox Pro v2.0</div></div>
        <span style="color:var(--text-muted);font-size:12px;">Web版</span>
      </div>
      <div class="source-item">
        <div><div class="source-item-name">播放器</div><div class="source-item-url">HLS.js + HTML5 Video</div></div>
        <span style="color:var(--green);font-size:12px;">已加载</span>
      </div>
      <div class="source-item">
        <div><div class="source-item-name">数据缓存</div><div class="source-item-url">LocalStorage 本地存储</div></div>
        <button class="source-btn danger" data-focusable onclick="clearAllData()">清除</button>
      </div>
    </div>
  `;
}

function switchSource(id) {
  SourceManager.setActive(id);
  showToast('已切换视频源', 'success');
  renderSettings();
}

function removeSource(id) {
  SourceManager.remove(id);
  showToast('已删除视频源', 'info');
  renderSettings();
}

function clearAllData() {
  if (confirm('确定要清除所有缓存数据吗？')) {
    Store.clear();
    showToast('所有数据已清除', 'success');
    setTimeout(() => navigateTo('home'), 500);
  }
}

// ========= 弹窗 =========
function showModal(html) {
  let overlay = document.querySelector('.modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal" data-focusable>${html}</div>`;
  requestAnimationFrame(() => {
    overlay.classList.add('show');
    const firstFocusable = overlay.querySelector('[data-focusable]');
    if (firstFocusable) FE.focus(firstFocusable);
  });
}

function hideModal() {
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.classList.remove('show');
}

function showAddSourceModal() {
  showModal(`
    <div class="modal-title">添加点播视频源</div>
    <div class="modal-field">
      <div class="modal-label">源名称</div>
      <input class="modal-input" id="new-source-name" placeholder="例如：我的视频源" autofocus>
    </div>
    <div class="modal-field">
      <div class="modal-label">源地址（JSON API）</div>
      <input class="modal-input" id="new-source-url" placeholder="http://xxx.xxx/api.json">
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" data-focusable onclick="hideModal()">取消</button>
      <button class="btn-primary" data-focusable onclick="addNewSource()">添加</button>
    </div>
  `);
}

function addNewSource() {
  const name = document.getElementById('new-source-name')?.value?.trim();
  const url = document.getElementById('new-source-url')?.value?.trim();
  if (!name) { showToast('请输入源名称', 'error'); return; }
  if (!url) { showToast('请输入源地址', 'error'); return; }
  SourceManager.add(name, url, 'json');
  hideModal();
  showToast('视频源添加成功', 'success');
  renderSettings();
}

function showAddLiveSourceModal() {
  showModal(`
    <div class="modal-title">添加直播源（M3U）</div>
    <div class="modal-field">
      <div class="modal-label">源名称</div>
      <input class="modal-input" id="new-live-name" placeholder="例如：我的直播源" autofocus>
    </div>
    <div class="modal-field">
      <div class="modal-label">M3U 地址</div>
      <input class="modal-input" id="new-live-url" placeholder="http://xxx.xxx/live.m3u">
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" data-focusable onclick="hideModal()">取消</button>
      <button class="btn-primary" data-focusable onclick="addNewLiveSource()">添加</button>
    </div>
  `);
}

function addNewLiveSource() {
  const name = document.getElementById('new-live-name')?.value?.trim();
  const url = document.getElementById('new-live-url')?.value?.trim();
  if (!name) { showToast('请输入源名称', 'error'); return; }
  if (!url) { showToast('请输入 M3U 地址', 'error'); return; }
  LiveSourceManager.add(name, url);
  hideModal();
  showToast('直播源添加成功', 'success');
  renderSettings();
}

function removeLiveSource(id) {
  LiveSourceManager.remove(id);
  showToast('直播源已删除', 'info');
}

// ========= 在线获取源 (v2.1) =========
let _onlineSources = []; // 当前获取的源列表
let _onlinePreviewData = null; // JSON 展开预览数据

async function fetchFromRepoInput() {
  const input = document.getElementById('online-repo-input');
  if (!input || !input.value.trim()) {
    showToast('请输入仓库地址或 URL', 'error');
    return;
  }
  await fetchFromRepo(input.value.trim());
}

async function fetchFromRepo(repoInput) {
  const resultDiv = document.getElementById('online-sources-result');
  if (!resultDiv) return;
  resultDiv.innerHTML = '<div class="loading-spinner" style="padding:12px;"><div class="spinner"></div><span>正在获取源列表...</span></div>';

  try {
    // 判断是 repo 还是直接 URL
    if (repoInput.startsWith('http')) {
      // 直接 URL
      const sources = await OnlineSourceFetcher.fetchFromUrl(repoInput);
      _onlineSources = sources;
      renderOnlineSourcesResult(sources, repoInput);
    } else {
      // GitHub 仓库
      const sources = await OnlineSourceFetcher.fetchFromRepo(repoInput);
      _onlineSources = sources;
      renderOnlineSourcesResult(sources, repoInput);
    }
  } catch (e) {
    resultDiv.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px 0;">获取失败：${e.message}</div>`;
  }
}

function renderOnlineSourcesResult(sources, origin) {
  const resultDiv = document.getElementById('online-sources-result');
  if (!resultDiv) return;

  if (!sources || !sources.length) {
    resultDiv.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">未找到可用源</div>';
    return;
  }

  let html = `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">找到 ${sources.length} 个可用源，选择要添加的：</div>`;
  html += '<div style="display:flex;flex-direction:column;gap:6px;">';

  sources.forEach((s, i) => {
    const isVod = s.type === 'vod';
    const icon = isVod ? '📡' : '📺';
    const typeLabel = isVod ? '<span style="color:var(--blue);font-size:11px;">点播</span>' : '<span style="color:var(--accent);font-size:11px;">直播</span>';
    const extra = s.groupCount ? ` · ${s.groupCount}组` : (s.channelCount ? ` · ${s.channelCount}频道` : (s.channels ? ` · ${s.channels}频道` : ''));
    const previewBtn = s.needsPreview ? `<button class="source-btn" data-focusable onclick="previewOnlineSource(${i})" style="font-size:11px;padding:3px 8px;">预览</button>` : '';

    html += `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-card);border-radius:var(--radius);border:1px solid var(--border);">
        <input type="checkbox" id="osel_${i}" checked style="flex-shrink:0;" onchange="toggleOnlineSourceSelect(${i}, this.checked)">
        <span style="font-size:14px;flex-shrink:0;">${icon}</span>
        <div style="flex:1;min-width:0;overflow:hidden;">
          <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name}</div>
          <div style="font-size:11px;color:var(--text-muted);display:flex;gap:6px;align-items:center;">
            ${typeLabel}${extra}
            ${s.groups ? `<span style="color:var(--text-muted);">${s.groups}</span>` : ''}
          </div>
        </div>
        ${previewBtn}
      </div>
    `;
  });

  html += '</div>';
  html += `<div style="display:flex;gap:8px;margin-top:10px;">
    <button class="btn-primary" data-focusable onclick="importSelectedSources('${origin.replace(/'/g, "\\'")}')" style="font-size:13px;padding:7px 18px;">导入选中源</button>
    <button class="btn-secondary" data-focusable onclick="document.getElementById('online-sources-result').innerHTML=''" style="font-size:13px;padding:7px 18px;">清除</button>
  </div>`;

  resultDiv.innerHTML = html;
  // 默认全选
  _onlineSelected = sources.map((_, i) => i);
}

let _onlineSelected = [];

function toggleOnlineSourceSelect(idx, checked) {
  if (checked) {
    if (!_onlineSelected.includes(idx)) _onlineSelected.push(idx);
  } else {
    _onlineSelected = _onlineSelected.filter(i => i !== idx);
  }
}

async function previewOnlineSource(idx) {
  const s = _onlineSources[idx];
  if (!s) return;

  showModal(`
    <div class="modal-title">预览源内容</div>
    <div id="preview-loading" style="padding:20px;text-align:center;color:var(--text-muted);">
      <div class="spinner" style="margin:0 auto 8px;"></div>加载中...
    </div>
    <div id="preview-content"></div>
    <div class="modal-actions">
      <button class="btn-secondary" data-focusable onclick="hideModal()">关闭</button>
    </div>
  `);

  try {
    let items = [];
    if (s.fileType === 'json' || s.format === 'json') {
      items = await OnlineSourceFetcher.previewJsonSource(s.url);
    } else if (s.fileType === 'txt' || s.format === 'txt') {
      items = await OnlineSourceFetcher.previewTxtSource(s.url);
    }
    const content = document.getElementById('preview-content');
    const loading = document.getElementById('preview-loading');
    if (loading) loading.style.display = 'none';
    if (content) {
      if (!items || !items.length) {
        content.innerHTML = '<div style="color:var(--text-muted);padding:12px;">未找到可导入的源</div>';
        return;
      }
      content.innerHTML = `<div style="max-height:50vh;overflow-y:auto;">
        ${items.map((item, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border);">
            <input type="checkbox" id="psel_${i}" checked>
            <span style="flex:1;font-size:13px;">${item.name}</span>
            ${item.url ? `<span style="font-size:11px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.url.slice(0, 40)}</span>` : ''}
          </div>
        `).join('')}
      </div>`;
      // 存储预览数据供导入使用
      _onlinePreviewData = items;
    }
  } catch (e) {
    const content = document.getElementById('preview-content');
    if (content) content.innerHTML = `<div style="color:var(--red);padding:12px;">预览失败：${e.message}</div>`;
    const loading = document.getElementById('preview-loading');
    if (loading) loading.style.display = 'none';
  }
}

async function importSelectedSources(origin) {
  if (!_onlineSelected.length) {
    showToast('请先选择要导入的源', 'error');
    return;
  }

  let imported = 0;
  const sources = _onlineSources;

  for (const idx of _onlineSelected) {
    const s = sources[idx];
    if (!s) continue;

    try {
      if (s.type === 'vod') {
        // 点播源：如果是 JSON 且包含 sites，逐个添加
        if (s.source && s.source.api) {
          SourceManager.add(s.name, s.source.api, 'json');
          imported++;
        } else if (s.url) {
          SourceManager.add(s.name, s.url, s.format || 'json');
          imported++;
        }
      } else {
        // 直播源
        LiveSourceManager.add(s.name, s.url, s.format || 'auto');
        imported++;
      }
    } catch (e) {
      console.warn('导入源失败:', s.name, e);
    }
  }

  showToast(`成功导入 ${imported} 个源`, 'success');
  // 刷新设置页
  const resultDiv = document.getElementById('online-sources-result');
  if (resultDiv) resultDiv.innerHTML = '';
  _onlineSources = [];
  _onlineSelected = [];
  renderSettings();
}
