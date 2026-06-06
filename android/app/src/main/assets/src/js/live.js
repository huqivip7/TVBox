/**
 * TVBox v2.0 - 直播模块（增强版）
 * 支持 M3U/M3U8/JSON/TXT 多格式直播源
 * 支持 EPG 节目单、频道号快速切换、收藏分组、多线路
 * 参考 my-tv-0、iptv-api、TVBoxOSC 设计
 */

// ============ 直播源管理器 (v2.0) ============
const LiveSourceManager = {
  _key: 'tvbox_live_sources',

  getAll() {
    return Store.get(this._key, []);
  },

  save(list) {
    Store.set(this._key, list);
  },

  add(name, url, format = 'auto') {
    const list = this.getAll();
    const id = 'live_' + Date.now();
    list.push({
      id,
      name,
      url,
      format: this._detectFormat(url, format),
      enabled: true,
      channelCount: 0,
      epgUrl: '',
      groupFavorites: [],   // 收藏的分组名
      addedAt: Date.now()
    });
    this.save(list);
    return id;
  },

  update(id, updates) {
    const list = this.getAll();
    const idx = list.findIndex(s => s.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates };
      this.save(list);
    }
  },

  remove(id) {
    let list = this.getAll();
    list = list.filter(s => s.id !== id);
    this.save(list);
    // 清除缓存
    Store.remove('tvbox_live_channels_' + id);
    Store.remove('tvbox_live_epg_' + id);
  },

  getById(id) {
    return this.getAll().find(s => s.id === id) || null;
  },

  _detectFormat(url, hint) {
    if (hint && hint !== 'auto') return hint;
    const lower = url.toLowerCase();
    if (lower.includes('.json')) return 'json';
    if (lower.includes('.txt')) return 'txt';
    return 'm3u';
  }
};

// ============ 多格式直播源解析器 ============
const LiveParser = {
  /**
   * 自动根据格式调用对应解析器
   */
  async parse(source) {
    const format = source.format || 'm3u';
    switch (format) {
      case 'json': return this.parseJSON(source);
      case 'txt':  return this.parseTXT(source);
      case 'm3u':
      default:
        return this.parseM3U(source);
    }
  },

  /**
   * 解析 M3U 格式
   * 支持 #EXTINF, group-title, tvg-logo, tvg-name, tvg-id
   */
  async parseM3U(source) {
    const text = await this._fetchText(source.url);
    const lines = text.split('\n').map(l => l.trim());
    const channels = [];
    let pending = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line === '#EXTM3U') continue;

      if (line.startsWith('#EXTINF')) {
        pending = {
          id: '',
          name: '',
          url: '',
          group: '默认',
          logo: '',
          tvgId: '',
          epg: '',
          num: 0
        };

        // tvg-id（用于 EPG 匹配）
        const idMatch = line.match(/tvg-id="([^"]*)"/i);
        if (idMatch) pending.tvgId = idMatch[1];

        // group-title
        const groupMatch = line.match(/group-title="([^"]*)"/i);
        if (groupMatch) pending.group = groupMatch[1] || '默认';

        // tvg-logo
        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
        if (logoMatch) pending.logo = logoMatch[1];

        // tvg-name
        const tvgNameMatch = line.match(/tvg-name="([^"]*)"/i);

        // 频道名称（逗号后内容）
        const commaIdx = line.lastIndexOf(',');
        const displayName = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
        pending.name = displayName || (tvgNameMatch ? tvgNameMatch[1] : '未知频道');

        // 频道号（从 tvg-num 或名称中提取）
        const numMatch = line.match(/tvg-num="(\d+)"/i);
        if (numMatch) pending.num = parseInt(numMatch[1]);
      } else if (line.startsWith('http') || line.startsWith('rtmp://') ||
                 line.startsWith('rtp://') || line.startsWith('rtsp://') ||
                 line.startsWith('udp://')) {
        if (pending) {
          pending.url = line;
          pending.id = 'ch_' + channels.length;
          if (pending.num === 0) pending.num = channels.length + 1;
          channels.push({ ...pending });
          pending = null;
        }
      } else if (pending && line && !line.startsWith('#')) {
        // 非注释非协议头的行，作为 URL 降级处理
        pending.url = line;
        pending.id = 'ch_' + channels.length;
        if (pending.num === 0) pending.num = channels.length + 1;
        channels.push({ ...pending });
        pending = null;
      }
    }
    return channels;
  },

  /**
   * 解析 JSON 格式直播源
   * 格式: { "channels": [{ "name":"...", "url":"...", "group":"...", "logo":"..." }] }
   * 兼容 tvbox-api / iptv-api 格式
   */
  async parseJSON(source) {
    const text = await this._fetchText(source.url);
    const data = JSON.parse(text);
    const channels = [];

    // 支持多种 JSON 结构
    const items = data.channels || data.data || data.list || (Array.isArray(data) ? data : null);
    if (!items || !Array.isArray(items)) {
      throw new Error('JSON 格式不支持：未找到频道列表');
    }

    items.forEach((ch, idx) => {
      channels.push({
        id: 'ch_' + idx,
        name: ch.name || ch.title || ch.channelName || '未知频道',
        url: ch.url || ch.stream || ch.streamUrl || ch.link || '',
        group: ch.group || ch.category || ch.type || '默认',
        logo: ch.logo || ch.icon || ch.logoUrl || '',
        tvgId: ch.tvgId || ch.id || '',
        epg: '',
        num: ch.num || ch.channelNo || idx + 1
      });
    });
    return channels;
  },

  /**
   * 解析 TXT 格式直播源
   * 格式: 频道名,http://url
   * 或: 频道名#分组#http://url
   */
  async parseTXT(source) {
    const text = await this._fetchText(source.url);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const channels = [];

    lines.forEach((line, idx) => {
      if (line.startsWith('#') || line.startsWith('//')) return; // 注释

      let name = '', url = '', group = '默认', logo = '';

      // 尝试解析 "名称,URL" 或 "名称#分组#URL" 或 "名称$分组$URL"
      if (line.includes(',') && line.indexOf(',') > 0) {
        const parts = line.split(',');
        name = parts[0].trim();
        url = parts[1].trim();
      } else if (line.includes('#')) {
        const parts = line.split('#');
        name = parts[0].trim();
        group = parts[1] ? parts[1].trim() : '默认';
        url = parts[2] ? parts[2].trim() : '';
      } else if (line.includes('$')) {
        const parts = line.split('$');
        name = parts[0].trim();
        group = parts[1] ? parts[1].trim() : '默认';
        url = parts[2] ? parts[2].trim() : '';
      }

      // 如果 URL 在名称后面（无分隔符，且包含 http）
      if (!url && line.includes('http')) {
        const httpIdx = line.indexOf('http');
        name = line.substring(0, httpIdx).replace(/[,#$\s]+$/, '');
        url = line.substring(httpIdx);
      }

      if (name && url && url.startsWith('http')) {
        channels.push({
          id: 'ch_' + channels.length,
          name,
          url,
          group,
          logo,
          tvgId: '',
          epg: '',
          num: channels.length + 1
        });
      }
    });
    return channels;
  },

  /**
   * 按分组整理频道
   */
  groupChannels(channels) {
    const groups = {};
    channels.forEach(ch => {
      const g = ch.group || '默认';
      if (!groups[g]) groups[g] = [];
      groups[g].push(ch);
    });
    return groups;
  },

  /**
   * 获取所有分组名（有序）
   */
  getGroupNames(groups) {
    const names = Object.keys(groups);
    // 把"全部"和"收藏"作为特殊分组
    return ['全部', ...names];
  },

  // 内部：fetch 文本
  async _fetchText(url) {
    if (url.startsWith('demo://')) {
      // 演示数据
      return DEMO_CHANNELS_M3U;
    }
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.text();
  }
};

// ============ EPG 节目单管理器 ============
const EPGManager = {
  _cacheKey(id) {
    return 'tvbox_live_epg_' + id;
  },

  /**
   * 获取 EPG 数据
   * 支持 XMLTV 格式（.xml.gz / .xml）和 JSON 格式
   * EPG URL 可在直播源配置中设置
   */
  async fetchEPG(sourceId, channelName, tvgId) {
    const source = LiveSourceManager.getById(sourceId);
    if (!source || !source.epgUrl) return null;

    const cache = Store.get(this._cacheKey(sourceId), {});
    const cacheKey = tvgId || channelName;
    const now = Date.now();

    // 缓存有效期内直接返回
    if (cache[cacheKey] && cache[cacheKey].expiry > now) {
      return cache[cacheKey].programs;
    }

    try {
      const url = source.epgUrl.replace('{channel}', encodeURIComponent(channelName))
                               .replace('{tvgid}', encodeURIComponent(tvgId || ''));
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) return null;

      let programs = [];
      const contentType = resp.headers.get('content-type') || '';
      const text = await resp.text();

      if (contentType.includes('xml') || text.includes('<?xml') || text.includes('<tv>')) {
        programs = this._parseXMLTV(text, channelName, tvgId);
      } else {
        programs = this._parseJSONEPG(text, channelName);
      }

      // 存入缓存（5分钟有效）
      cache[cacheKey] = { programs, expiry: now + 5 * 60 * 1000 };
      Store.set(this._cacheKey(sourceId), cache);

      return programs;
    } catch (e) {
      console.warn('EPG 获取失败:', e);
      return null;
    }
  },

  /**
   * 解析 XMLTV 格式 EPG
   */
  _parseXMLTV(xmlText, channelName, tvgId) {
    const programs = [];
    try {
      // 简单正则解析（避免 DOMParser 兼容性问题）
      const programmeRe = /<programme\s+start="([^"]+)"\s+stop="([^"]+)"[^>]*>[\s\S]*?<title[^>]*>([^<]+)<\/title>/gi;
      let match;
      while ((match = programmeRe.exec(xmlText)) !== null) {
        const startTime = this._parseXMLTVTime(match[1]);
        const endTime = this._parseXMLTVTime(match[2]);
        programs.push({
          start: startTime,
          end: endTime,
          title: match[3],
          isNow: Date.now() >= startTime && Date.now() < endTime
        });
      }
    } catch (e) { /* ignore */ }
    return programs.sort((a, b) => a.start - b.start);
  },

  _parseXMLTVTime(timeStr) {
    // 格式: 20240606120000 +0800
    const match = timeStr.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (match) {
      return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`).getTime();
    }
    return 0;
  },

  _parseJSONEPG(jsonText, channelName) {
    try {
      const data = JSON.parse(jsonText);
      const items = data.epg || data.programs || data.data || [];
      return items.map(p => ({
        start: p.start || p.startTime || 0,
        end: p.end || p.endTime || 0,
        title: p.title || p.name || '',
        isNow: p.isNow || false
      }));
    } catch (e) { return []; }
  },

  /**
   * 获取当前正在播放的节目名
   */
  getCurrentProgram(programs) {
    if (!programs || !programs.length) return '';
    const now = Date.now();
    const current = programs.find(p => now >= p.start && now < p.end);
    return current ? current.title : (programs[0] ? programs[0].title : '');
  }
};

// ============ 直播状态管理 ============
const LiveState = {
  sources: [],
  currentSourceId: null,
  channels: [],
  groups: {},
  groupNames: [],
  currentGroup: '全部',
  currentChannel: null,
  currentPrograms: null,   // 当前频道 EPG 数据
  hlsPlayer: null,
  favorites: [],            // 收藏频道 [{id, name, url, group}]
  watchHistory: [],         // 观看历史
  channelIndexMap: {},     // num -> channel 快速索引
  _channelNumBuffer: '',   // 频道号输入缓冲
  _channelNumTimer: null,
};

// ============ 加载直播频道（带缓存）============
async function loadLiveChannels(sourceId) {
  const source = LiveSourceManager.getById(sourceId);
  if (!source) return [];

  // 查缓存（30分钟有效）
  const cacheKey = 'tvbox_live_channels_' + sourceId;
  const cached = Store.get(cacheKey, null);
  if (cached && cached.expiry > Date.now()) {
    return cached.channels;
  }

  try {
    showToast('正在加载直播频道...', 'info', 2000);
    const channels = await LiveParser.parse(source);

    // 建立频道号索引
    const indexMap = {};
    channels.forEach(ch => {
      if (ch.num) indexMap[ch.num] = ch;
    });
    LiveState.channelIndexMap = indexMap;

    // 写入缓存（30分钟）
    Store.set(cacheKey, {
      channels,
      expiry: Date.now() + 30 * 60 * 1000
    });

    // 更新频道数
    LiveSourceManager.update(sourceId, { channelCount: channels.length });

    showToast(`已加载 ${channels.length} 个频道`, 'success');
    return channels;
  } catch (e) {
    console.error('加载直播源失败:', e);
    showToast('加载失败: ' + e.message, 'error');
    return [];
  }
}

// ============ HLS/M3U8 播放器 ============
function initLivePlayer(videoEl, url) {
  // 销毁旧实例
  if (LiveState.hlsPlayer) {
    LiveState.hlsPlayer.destroy();
    LiveState.hlsPlayer = null;
  }

  const isHLS = url.includes('.m3u8') || url.includes('application/x-mpegurl');

  // Safari / iOS 原生 HLS
  if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    videoEl.src = url;
    videoEl.load();
    videoEl.play().catch(() => {});
    return;
  }

  // HLS.js
  if (isHLS && window.Hls && Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 30,
      fragLoadPolicy: { default: { maxLoadTimeMs: 10000 } }
    });
    hls.loadSource(url);
    hls.attachMedia(videoEl);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      videoEl.play().catch(() => {});
      hideLiveLoading();
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.error('HLS Fatal Error:', data.type, data.details);
        onLivePlayError();
      }
    });
    LiveState.hlsPlayer = hls;
    return;
  }

  // 降级：直接设置 src
  videoEl.src = url;
  videoEl.load();
  videoEl.play().catch(() => {});
}

function hideLiveLoading() {
  const el = document.getElementById('live-loading');
  if (el) el.style.display = 'none';
}

function onLivePlayError() {
  const loading = document.getElementById('live-loading');
  const error = document.getElementById('live-error');
  if (loading) loading.style.display = 'none';
  if (error) error.style.display = 'flex';
}

// ============ 直播频道列表页渲染 (v2.0) ============
async function renderLive() {
  const page = document.getElementById('page-live');
  if (!page) return;

  const sources = LiveSourceManager.getAll();

  if (!sources.length) {
    page.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="font-size:72px;">📡</div>
        <h3>还没有添加直播源</h3>
        <p>支持 M3U / JSON / TXT 格式直播源，兼容大多数 IPTV 源</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
          <button class="btn-primary" data-focusable onclick="showAddLiveSourceModal()">
            + 添加直播源
          </button>
          <button class="btn-secondary" data-focusable onclick="addDemoLiveSource()">
            使用演示数据
          </button>
        </div>
      </div>
    `;
    return;
  }

  // 已选择源 -> 显示频道列表
  if (!LiveState.currentSourceId || !sources.find(s => s.id === LiveState.currentSourceId)) {
    LiveState.currentSourceId = sources[0].id;
  }

  const src = LiveSourceManager.getById(LiveState.currentSourceId);

  page.innerHTML = `
    <div class="live-layout">
      <!-- 左侧分组面板 -->
      <div class="live-groups" id="live-groups-panel">
        <div class="live-groups-header">
          <span>频道分组</span>
          <span class="live-channel-count" id="live-total-count">-</span>
        </div>
        <div id="live-groups-list">
          <div class="loading-spinner" style="padding:20px 0;">
            <div class="spinner" style="width:20px;height:20px;border-width:2px;"></div>
          </div>
        </div>
      </div>

      <!-- 右侧频道列表 -->
      <div class="live-channels">
        <!-- 源管理栏 -->
        <div class="live-source-bar">
          <select class="input-field" id="live-source-select"
                  onchange="onLiveSourceChange(this.value)"
                  style="flex:1;min-width:120px;max-width:220px;">
            ${sources.map(s =>
              `<option value="${s.id}" ${s.id === LiveState.currentSourceId ? 'selected' : ''}>${s.name}${s.channelCount ? ' (' + s.channelCount + ')' : ''}</option>`
            ).join('')}
          </select>
          <div class="topbar-search" style="flex:1;min-width:120px;max-width:260px;">
            <span style="color:var(--text-muted);font-size:13px;">🔍</span>
            <input type="text" id="live-ch-search" placeholder="搜索频道..."
                   oninput="filterLiveChannels(this.value)">
          </div>
          <button class="topbar-btn" data-focusable onclick="showAddLiveSourceModal()">+ 添加</button>
          <button class="topbar-btn" data-focusable onclick="showManageLiveSourcesModal()">管理</button>
        </div>

        <div id="live-channel-list">
          <div class="loading-spinner">
            <div class="spinner"></div>
            <span>加载频道中...</span>
          </div>
        </div>
      </div>
    </div>
  `;

  await loadAndRenderChannels(LiveState.currentSourceId);
}

async function onLiveSourceChange(sourceId) {
  LiveState.currentSourceId = sourceId;
  LiveState.currentGroup = '全部';
  const listEl = document.getElementById('live-channel-list');
  if (listEl) listEl.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>加载频道中...</span></div>';
  await loadAndRenderChannels(sourceId);
}

async function loadAndRenderChannels(sourceId) {
  const channels = await loadLiveChannels(sourceId);
  LiveState.channels = channels;
  LiveState.groups = LiveParser.groupChannels(channels);
  LiveState.groupNames = LiveParser.getGroupNames(LiveState.groups);

  // 渲染分组按钮
  renderLiveGroups();

  // 渲染当前分组频道
  const currentList = LiveState.currentGroup === '全部'
    ? channels
    : (LiveState.groups[LiveState.currentGroup] || []);
  renderChannelList(currentList);

  // 更新频道总数
  const countEl = document.getElementById('live-total-count');
  if (countEl) countEl.textContent = channels.length;

  // 更新下拉框数量
  const opt = document.querySelector(`#live-source-select option[value="${sourceId}"]`);
  if (opt) {
    const src = LiveSourceManager.getById(sourceId);
    if (src) opt.textContent = `${src.name} (${channels.length})`;
  }
}

function renderLiveGroups() {
  const container = document.getElementById('live-groups-list');
  if (!container) return;

  container.innerHTML = LiveState.groupNames.map(g => `
    <button class="live-group-btn ${g === LiveState.currentGroup ? 'active' : ''}" data-focusable
            onclick="switchLiveGroup('${g.replace(/'/g, "\\'")}')">
      ${g === '全部' ? '📺 全部' : g}
      <span class="live-group-count">${
        g === '全部' ? LiveState.channels.length
                     : (LiveState.groups[g] || []).length
      }</span>
    </button>
  `).join('');
}

function switchLiveGroup(group) {
  LiveState.currentGroup = group;
  renderLiveGroups();

  const list = LiveState.currentGroup === '全部'
    ? LiveState.channels
    : (LiveState.groups[LiveState.currentGroup] || []);
  renderChannelList(list);

  // 清空搜索
  const search = document.getElementById('live-ch-search');
  if (search) search.value = '';
}

function filterLiveChannels(keyword) {
  const baseList = LiveState.currentGroup === '全部'
    ? LiveState.channels
    : (LiveState.groups[LiveState.currentGroup] || []);

  if (!keyword.trim()) {
    renderChannelList(baseList);
    return;
  }
  const kw = keyword.toLowerCase();
  const filtered = baseList.filter(ch =>
    ch.name.toLowerCase().includes(kw) ||
    (ch.group && ch.group.toLowerCase().includes(kw))
  );
  renderChannelList(filtered, keyword);
}

function renderChannelList(channels, keyword = '') {
  const listEl = document.getElementById('live-channel-list');
  if (!listEl) return;

  if (!channels.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">📡</div>
        <p>${keyword ? `未找到"${keyword}"相关频道` : '该分组暂无频道'}</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = channels.map((ch, idx) => {
    const isActive = LiveState.currentChannel && LiveState.currentChannel.id === ch.id;
    const isFav = LiveState.favorites.some(f => f.id === ch.id);
    return `
      <div class="channel-item ${isActive ? 'active' : ''}"
           data-focusable data-ch-id="${ch.id}"
           onclick="playLiveChannel(${JSON.stringify(ch).replace(/"/g, '&quot;')})">
        <div class="channel-num">${ch.num || idx + 1}</div>
        <div class="channel-logo">
          ${ch.logo
            ? `<img src="${ch.logo}" alt="${ch.name}" onerror="this.parentElement.innerHTML='📺'">`
            : '📺'}
        </div>
        <div class="channel-info">
          <div class="channel-name">${highlightKeyword(ch.name, keyword)}</div>
          <div class="channel-epg" id="epg-${ch.id}">${ch.group || ''}</div>
        </div>
        <div class="channel-actions">
          <div class="channel-live-dot"></div>
          <button class="channel-fav-btn ${isFav ? 'active' : ''}" data-focusable
                  onclick="event.stopPropagation();toggleFavoriteChannel(${JSON.stringify(ch).replace(/"/g, '&quot;')})">
            ${isFav ? '★' : '☆'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// 关键字高亮
function highlightKeyword(text, keyword) {
  if (!keyword) return text;
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark style="background:var(--accent);color:#fff;border-radius:2px;padding:0 2px;">$1</mark>');
}

// ============ 直播播放 ============
function playLiveChannel(channel) {
  LiveState.currentChannel = channel;
  // 写入观看历史
  addLiveHistory(channel);
  navigateTo('live-player', { channel });
}

// ============ 直播播放页渲染 (v2.0) ============
function renderLivePlayer(args) {
  const page = document.getElementById('page-live-player');
  if (!page) return;

  const channel = args && args.channel ? args.channel : LiveState.currentChannel;
  if (!channel) {
    navigateTo('live');
    return;
  }

  // 获取同组频道用于侧边栏
  const sideChannels = LiveState.currentGroup === '全部'
    ? LiveState.channels
    : (LiveState.groups[LiveState.currentGroup] || LiveState.channels);

  const isHls = channel.url && (channel.url.includes('.m3u8'));

  page.innerHTML = `
    <div class="live-player-layout">
      <!-- 主播放区 -->
      <div class="live-player-main" id="live-player-main">
        <div class="live-video-wrap" id="live-video-wrap">
          <video id="live-video" autoplay muted playsinline
                 crossorigin="anonymous"
                 style="width:100%;height:100%;object-fit:contain;background:#000;"
                 onerror="onLivePlayError()">
          </video>

          <!-- 加载遮罩 -->
          <div id="live-loading" class="live-loading-overlay">
            <div class="spinner" style="width:48px;height:48px;border-width:4px;"></div>
            <span style="font-size:14px;color:var(--text-secondary);margin-top:8px;">正在连接直播流...</span>
          </div>

          <!-- 错误遮罩 -->
          <div id="live-error" class="live-error-overlay">
            <div style="font-size:56px;opacity:0.5;">⚠️</div>
            <div style="font-size:18px;font-weight:600;margin:8px 0;">直播源连接失败</div>
            <div style="font-size:13px;color:var(--text-muted);text-align:center;max-width:360px;">
              该频道暂时无法播放，请尝试其他频道或检查网络连接
            </div>
            <div style="display:flex;gap:12px;margin-top:16px;">
              <button class="btn-primary" data-focusable onclick="retryLivePlay()">🔄 重试</button>
              <button class="btn-secondary" data-focusable onclick="navigateTo('live')">← 频道列表</button>
            </div>
          </div>

          <!-- 信息覆盖层（鼠标悬停/按键显示） -->
          <div class="live-overlay" id="live-overlay">
            <div class="live-overlay-top">
              <div class="live-channel-title">${channel.name}</div>
              <div class="live-current-epg" id="live-epg-text">${channel.group || '直播'} · 直播中</div>
            </div>
            <div class="live-overlay-bottom">
              <button class="btn-secondary" data-focusable onclick="navigateTo('live')">📺 频道列表</button>
              <button class="btn-secondary" data-focusable onclick="toggleLiveMute()" id="live-mute-btn">🔇 取消静音</button>
              <button class="btn-secondary" data-focusable onclick="toggleFullscreen()">⛶ 全屏</button>
              <button class="btn-secondary" data-focusable onclick="showEPGPanel()">📅 节目单</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧频道面板 -->
      <div class="live-side-panel" id="live-side-panel">
        <div class="live-side-header">
          <span>📡 ${LiveState.currentGroup === '全部' ? '全部频道' : LiveState.currentGroup}</span>
          <button class="topbar-btn" data-focusable onclick="navigateTo('live')">返回</button>
        </div>
        <div class="live-side-channels" id="live-side-channel-list">
          ${sideChannels.map(ch => `
            <div class="live-side-channel-item ${ch.id === channel.id ? 'active' : ''}"
                 data-focusable data-ch-id="${ch.id}"
                 onclick="switchLiveChannel(${JSON.stringify(ch).replace(/"/g, '&quot;')})">
              <div class="live-side-ch-num">${ch.num || ''}</div>
              <div class="live-side-ch-logo">
                ${ch.logo
                  ? `<img src="${ch.logo}" alt="" onerror="this.parentElement.innerHTML='📺'" style="width:100%;height:100%;object-fit:contain;">`
                  : '📺'}
              </div>
              <div class="live-side-ch-name">${ch.name}</div>
              ${ch.id === channel.id ? '<div class="channel-live-dot"></div>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- EPG 节目单弹窗 -->
    <div class="epg-panel" id="epg-panel" style="display:none;">
      <div class="epg-header">
        <span id="epg-panel-title">📅 ${channel.name} · 节目单</span>
        <button class="topbar-btn" onclick="hideEPGPanel()">✕</button>
      </div>
      <div class="epg-list" id="epg-list"></div>
    </div>
  `;

  // 开始播放
  window._currentLiveChannel = channel;
  startLivePlay(channel);

  // 尝试加载 EPG
  loadEPGForCurrentChannel();

  // 覆盖层显示/隐藏逻辑
  setupLiveOverlay(page);
}

function startLivePlay(channel) {
  const video = document.getElementById('live-video');
  if (!video) return;

  const loading = document.getElementById('live-loading');
  const error = document.getElementById('live-error');
  if (loading) loading.style.display = 'flex';
  if (error) error.style.display = 'none';

  initLivePlayer(video, channel.url);

  video.oncanplay = () => {
    if (loading) loading.style.display = 'none';
    video.muted = false;
    const btn = document.getElementById('live-mute-btn');
    if (btn) btn.textContent = '🔊 静音';
  };
  video.onerror = () => onLivePlayError();
}

function retryLivePlay() {
  if (window._currentLiveChannel) {
    startLivePlay(window._currentLiveChannel);
  }
}

function toggleLiveMute() {
  const video = document.getElementById('live-video');
  const btn = document.getElementById('live-mute-btn');
  if (!video) return;
  video.muted = !video.muted;
  if (btn) btn.textContent = video.muted ? '🔇 取消静音' : '🔊 静音';
}

function switchLiveChannel(channel) {
  LiveState.currentChannel = channel;
  window._currentLiveChannel = channel;
  addLiveHistory(channel);

  // 更新侧边高亮
  document.querySelectorAll('.live-side-channel-item').forEach(el => {
    el.classList.toggle('active', el.dataset.chId === channel.id);
  });

  // 更新标题
  const titleEl = document.querySelector('.live-channel-title');
  if (titleEl) titleEl.textContent = channel.name;

  // 切换播放
  startLivePlay(channel);

  // 重新加载 EPG
  loadEPGForCurrentChannel();

  // 滚动到当前频道
  const activeEl = document.querySelector(`.live-side-channel-item[data-ch-id="${channel.id}"]`);
  if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============ 覆盖层显示/隐藏 ============
function setupLiveOverlay(pageEl) {
  const overlay = pageEl.querySelector('#live-overlay');
  if (!overlay) return;

  let hideTimer = null;

  function show() {
    overlay.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => overlay.classList.remove('show'), 5000);
  }

  // 鼠标
  pageEl.querySelector('#live-video-wrap')?.addEventListener('mousemove', show);
  pageEl.querySelector('#live-video-wrap')?.addEventListener('mouseleave', () => {
    clearTimeout(hideTimer);
    overlay.classList.remove('show');
  });

  // 按键（方向键/确认键显示覆盖层）
  const onKey = (e) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.key)) {
      show();
    }
  };
  document.addEventListener('keydown', onKey);

  // 初始显示 3 秒
  show();
}

// ============ EPG 节目单 ============
async function loadEPGForCurrentChannel() {
  const channel = LiveState.currentChannel;
  if (!channel) return;

  const source = LiveSourceManager.getById(LiveState.currentSourceId);
  if (!source || !source.epgUrl) return;

  const programs = await EPGManager.fetchEPG(LiveState.currentSourceId, channel.name, channel.tvgId);
  LiveState.currentPrograms = programs;

  // 更新覆盖层 EPG 文字
  const epgText = document.getElementById('live-epg-text');
  if (epgText && programs) {
    const current = EPGManager.getCurrentProgram(programs);
    epgText.textContent = current || (channel.group || '直播') + ' · 直播中';
  }

  // 渲染 EPG 面板
  renderEPGPanel(programs);
}

function renderEPGPanel(programs) {
  const list = document.getElementById('epg-list');
  if (!list) return;
  if (!programs || !programs.length) {
    list.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center;">暂无节目单数据</div>';
    return;
  }

  const now = Date.now();
  list.innerHTML = programs.map(p => {
    const isNow = now >= p.start && now < p.end;
    const startStr = new Date(p.start).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const endStr = new Date(p.end).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="epg-item ${isNow ? 'active' : ''}">
        <span class="epg-time">${startStr} - ${endStr}</span>
        <span class="epg-title">${p.title}</span>
        ${isNow ? '<span class="epg-now-badge">正在播放</span>' : ''}
      </div>
    `;
  }).join('');
}

function showEPGPanel() {
  const panel = document.getElementById('epg-panel');
  if (panel) panel.style.display = 'flex';
}

function hideEPGPanel() {
  const panel = document.getElementById('epg-panel');
  if (panel) panel.style.display = 'none';
}

// ============ 频道号快速切换 ============
// 监听数字键输入（在 focus.js 中调用）
function onLiveChannelNumberInput(numStr) {
  const ch = LiveState.channelIndexMap[parseInt(numStr)];
  if (ch) {
    switchLiveChannel(ch);
    showToast(`切换到频道 ${numStr}: ${ch.name}`, 'info', 1500);
  } else {
    showToast(`频道 ${numStr} 不存在`, 'error', 1500);
  }
}

// 暴露给 focus.js 的接口
window.onLiveChannelNumberInput = onLiveChannelNumberInput;

// ============ 频道收藏 ============
function toggleFavoriteChannel(channel) {
  const idx = LiveState.favorites.findIndex(f => f.id === channel.id);
  if (idx >= 0) {
    LiveState.favorites.splice(idx, 1);
    showToast(`已取消收藏: ${channel.name}`, 'info');
  } else {
    LiveState.favorites.push({ id: channel.id, name: channel.name, url: channel.url, group: channel.group });
    showToast(`已收藏: ${channel.name}`, 'success');
  }
  Store.set('tvbox_live_favorites', LiveState.favorites);

  // 刷新列表中的收藏按钮
  const btn = document.querySelector(`.channel-fav-btn[onclick*="${channel.id}"]`);
  if (btn) {
    const isFav = LiveState.favorites.some(f => f.id === channel.id);
    btn.textContent = isFav ? '★' : '☆';
    btn.classList.toggle('active', isFav);
  }
}

function loadLiveFavorites() {
  LiveState.favorites = Store.get('tvbox_live_favorites', []);
}

// ============ 直播观看历史 ============
function addLiveHistory(channel) {
  let history = Store.get('tvbox_live_history', []);
  // 去重
  history = history.filter(h => h.id !== channel.id);
  history.unshift({
    id: channel.id,
    name: channel.name,
    url: channel.url,
    group: channel.group,
    logo: channel.logo,
    watchedAt: Date.now()
  });
  // 最多保留 50 条
  if (history.length > 50) history = history.slice(0, 50);
  Store.set('tvbox_live_history', history);
}

// ============ 添加直播源弹窗 (v2.0) ============
function showAddLiveSourceModal() {
  const existing = document.getElementById('modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">📡 添加直播源</div>
      <div class="form-group">
        <div class="form-label">源名称</div>
        <input type="text" class="input-field" id="modal-live-name" placeholder="例如：IPTV 综合频道">
      </div>
      <div class="form-group">
        <div class="form-label">直播源地址</div>
        <input type="text" class="input-field" id="modal-live-url"
               placeholder="http://... （支持 M3U / JSON / TXT 格式）">
      </div>
      <div class="form-group">
        <div class="form-label">EPG 节目单地址（可选）</div>
        <input type="text" class="input-field" id="modal-live-epg"
               placeholder="http://.../epg.xml（支持 XMLTV 格式，留空则不使用）">
      </div>
      <div style="background:rgba(229,9,20,0.08);border:1px solid rgba(229,9,20,0.2);border-radius:8px;padding:12px;font-size:12px;color:var(--text-secondary);margin-bottom:16px;">
        💡 支持标准 M3U、JSON、TXT 格式直播源。<br>
        TXT 格式每行: <code>频道名,http://url</code> 或 <code>频道名#分组#http://url</code><br>
        推荐搜索 "IPTV M3U 订阅" 获取公开直播源。
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('modal-overlay').remove()">取消</button>
        <button class="btn-primary" onclick="confirmAddLiveSource()">添加</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  setTimeout(() => document.getElementById('modal-live-name')?.focus(), 50);
}

async function confirmAddLiveSource() {
  const name = document.getElementById('modal-live-name')?.value?.trim();
  const url = document.getElementById('modal-live-url')?.value?.trim();
  const epgUrl = document.getElementById('modal-live-epg')?.value?.trim();

  if (!name || !url) { showToast('请填写源名称和地址', 'error'); return; }
  if (!url.startsWith('http')) { showToast('请输入有效的 http(s) 地址', 'error'); return; }

  document.getElementById('modal-overlay')?.remove();

  const id = LiveSourceManager.add(name, url);
  if (epgUrl) {
    LiveSourceManager.update(id, { epgUrl });
  }
  LiveState.currentSourceId = id;
  showToast(`已添加"${name}"，正在加载...`, 'success');
  navigateTo('live');
}

// ============ 管理直播源弹窗 ============
function showManageLiveSourcesModal() {
  const existing = document.getElementById('modal-overlay');
  if (existing) existing.remove();

  const sources = LiveSourceManager.getAll();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:540px;max-width:95vw;">
      <div class="modal-title">📡 管理直播源</div>
      <div style="max-height:340px;overflow-y:auto;padding:0 4px;">
        ${sources.length === 0
          ? '<div style="text-align:center;padding:32px;color:var(--text-muted);">暂无直播源</div>'
          : sources.map(s => `
            <div class="source-card">
              <div>
                <div class="source-card-name">${s.name}</div>
                <div class="source-card-url">${s.url}</div>
                <div class="source-card-meta">
                  ${s.channelCount ? s.channelCount + ' 个频道 · ' : ''}
                  ${s.format || 'm3u'} 格式
                  ${s.epgUrl ? ' · 有 EPG' : ''}
                </div>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="topbar-btn" data-focusable
                  onclick="LiveState.currentSourceId='${s.id}';document.getElementById('modal-overlay').remove();navigateTo('live')">
                  使用
                </button>
                <button class="topbar-btn" data-focusable
                  onclick="removeLiveSource('${s.id}')"
                  style="color:var(--accent);border-color:var(--accent);">
                  删除
                </button>
              </div>
            </div>
          `).join('')
        }
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('modal-overlay').remove()">关闭</button>
        <button class="btn-primary" onclick="document.getElementById('modal-overlay').remove();showAddLiveSourceModal()">+ 添加源</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function removeLiveSource(id) {
  LiveSourceManager.remove(id);
  showToast('已删除直播源', 'info');
  const remaining = LiveSourceManager.getAll();
  if (LiveState.currentSourceId === id) {
    LiveState.currentSourceId = remaining.length ? remaining[0].id : null;
  }
  document.getElementById('modal-overlay')?.remove();
  showManageLiveSourcesModal();
}

// ============ 演示直播数据 ============
function addDemoLiveSource() {
  const demoId = 'live_demo_v2';
  const existing = LiveSourceManager.getAll().find(s => s.id === demoId);
  if (!existing) {
    LiveSourceManager.add('演示频道', 'demo://live');
    LiveSourceManager.update(demoId, { channelCount: DEMO_CHANNELS.length });
    // 写入演示频道缓存
    Store.set('tvbox_live_channels_' + demoId, {
      channels: DEMO_CHANNELS,
      expiry: Date.now() + 24 * 60 * 60 * 1000
    });
  }
  LiveState.currentSourceId = demoId;
  showToast('已加载演示频道', 'success');
  navigateTo('live');
}

// 演示频道数据 (M3U 格式字符串，供解析器使用)
const DEMO_CHANNELS_M3U = `#EXTM3U
#EXTINF:-1 tvg-name="CCTV-1" tvg-logo="" group-title="央视",CCTV-1 综合
https://example.com/cctv1.m3u8
#EXTINF:-1 tvg-name="CCTV-2" tvg-logo="" group-title="央视",CCTV-2 财经
https://example.com/cctv2.m3u8
#EXTINF:-1 tvg-name="CCTV-3" tvg-logo="" group-title="央视",CCTV-3 综艺
https://example.com/cctv3.m3u8
#EXTINF:-1 tvg-name="CCTV-4" tvg-logo="" group-title="央视",CCTV-4 中文国际
https://example.com/cctv4.m3u8
#EXTINF:-1 tvg-name="CCTV-5" tvg-logo="" group-title="央视",CCTV-5 体育
https://example.com/cctv5.m3u8
#EXTINF:-1 tvg-name="CCTV-6" tvg-logo="" group-title="央视",CCTV-6 电影
https://example.com/cctv6.m3u8
#EXTINF:-1 tvg-name="CCTV-8" tvg-logo="" group-title="央视",CCTV-8 电视剧
https://example.com/cctv8.m3u8
#EXTINF:-1 tvg-name="CCTV-9" tvg-logo="" group-title="央视",CCTV-9 纪录
https://example.com/cctv9.m3u8
#EXTINF:-1 tvg-name="CCTV-13" tvg-logo="" group-title="央视",CCTV-13 新闻
https://example.com/cctv13.m3u8
#EXTINF:-1 tvg-name="湖南卫视" tvg-logo="" group-title="卫视",湖南卫视
https://example.com/hunan.m3u8
#EXTINF:-1 tvg-name="浙江卫视" tvg-logo="" group-title="卫视",浙江卫视
https://example.com/zhejiang.m3u8
#EXTINF:-1 tvg-name="江苏卫视" tvg-logo="" group-title="卫视",江苏卫视
https://example.com/jiangsu.m3u8
#EXTINF:-1 tvg-name="东方卫视" tvg-logo="" group-title="卫视",东方卫视
https://example.com/dongfang.m3u8
#EXTINF:-1 tvg-name="北京卫视" tvg-logo="" group-title="卫视",北京卫视
https://example.com/beijing.m3u8
#EXTINF:-1 tvg-name="深圳卫视" tvg-logo="" group-title="卫视",深圳卫视
https://example.com/shenzhen.m3u8
#EXTINF:-1 tvg-name="安徽卫视" tvg-logo="" group-title="卫视",安徽卫视
https://example.com/anhui.m3u8
#EXTINF:-1 tvg-name="广东卫视" tvg-logo="" group-title="卫视",广东卫视
https://example.com/guangdong.m3u8
#EXTINF:-1 tvg-name="翡翠台TVB" tvg-logo="" group-title="港台",翡翠台 TVB
https://example.com/tvb.m3u8
#EXTINF:-1 tvg-name="凤凰资讯" tvg-logo="" group-title="港台",凤凰资讯台
https://example.com/phoenix.m3u8
#EXTINF:-1 tvg-name="ESPN体育" tvg-logo="" group-title="体育",ESPN体育
https://example.com/espn.m3u8
`;

// 演示频道对象数组（用于 UI 渲染）
const DEMO_CHANNELS = [
  { id:'dch1', name:'CCTV-1 综合', group:'央视', logo:'', url:'demo://cctv1', tvgId:'cctv1', epg:'', num:1 },
  { id:'dch2', name:'CCTV-2 财经', group:'央视', logo:'', url:'demo://cctv2', tvgId:'cctv2', epg:'', num:2 },
  { id:'dch3', name:'CCTV-3 综艺', group:'央视', logo:'', url:'demo://cctv3', tvgId:'cctv3', epg:'', num:3 },
  { id:'dch4', name:'CCTV-4 中文国际', group:'央视', logo:'', url:'demo://cctv4', tvgId:'cctv4', epg:'', num:4 },
  { id:'dch5', name:'CCTV-5 体育', group:'央视', logo:'', url:'demo://cctv5', tvgId:'cctv5', epg:'', num:5 },
  { id:'dch6', name:'CCTV-6 电影', group:'央视', logo:'', url:'demo://cctv6', tvgId:'cctv6', epg:'', num:6 },
  { id:'dch7', name:'CCTV-8 电视剧', group:'央视', logo:'', url:'demo://cctv8', tvgId:'cctv8', epg:'', num:8 },
  { id:'dch8', name:'CCTV-9 纪录', group:'央视', logo:'', url:'demo://cctv9', tvgId:'cctv9', epg:'', num:9 },
  { id:'dch9', name:'CCTV-13 新闻', group:'央视', logo:'', url:'demo://cctv13', tvgId:'cctv13', epg:'', num:13 },
  { id:'dch10', name:'湖南卫视', group:'卫视', logo:'', url:'demo://hunan', tvgId:'hunan', epg:'', num:10 },
  { id:'dch11', name:'浙江卫视', group:'卫视', logo:'', url:'demo://zhejiang', tvgId:'zhejiang', epg:'', num:11 },
  { id:'dch12', name:'江苏卫视', group:'卫视', logo:'', url:'demo://jiangsu', tvgId:'jiangsu', epg:'', num:12 },
  { id:'dch13', name:'东方卫视', group:'卫视', logo:'', url:'demo://dongfang', tvgId:'dongfang', epg:'', num:13 },
  { id:'dch14', name:'北京卫视', group:'卫视', logo:'', url:'demo://beijing', tvgId:'beijing', epg:'', num:14 },
  { id:'dch15', name:'深圳卫视', group:'卫视', logo:'', url:'demo://shenzhen', tvgId:'shenzhen', epg:'', num:15 },
  { id:'dch16', name:'安徽卫视', group:'卫视', logo:'', url:'demo://anhui', tvgId:'anhui', epg:'', num:16 },
  { id:'dch17', name:'广东卫视', group:'卫视', logo:'', url:'demo://guangdong', tvgId:'guangdong', epg:'', num:17 },
  { id:'dch18', name:'翡翠台 TVB', group:'港台', logo:'', url:'demo://tvb', tvgId:'tvb', epg:'', num:18 },
  { id:'dch19', name:'凤凰资讯台', group:'港台', logo:'', url:'demo://phoenix', tvgId:'phoenix', epg:'', num:19 },
  { id:'dch20', name:'ESPN体育', group:'体育', logo:'', url:'demo://espn', tvgId:'espn', epg:'', num:20 },
];

// ============ 供设置页使用的函数 ============
function removeLiveSourceFromSettings(id) {
  LiveSourceManager.remove(id);
  showToast('已删除直播源', 'info');
  const remaining = LiveSourceManager.getAll();
  if (LiveState.currentSourceId === id) {
    LiveState.currentSourceId = remaining.length ? remaining[0].id : null;
  }
  // 通知设置页刷新
  if (typeof renderSettings === 'function') renderSettings();
}
function initLiveModule() {
  loadLiveFavorites();

  // 监听焦点引擎发出的频道号输入事件
  window.addEventListener('channelNumberInput', (e) => {
    const chNum = e.detail;
    if (chNum && LiveState.channelIndexMap[chNum]) {
      const ch = LiveState.channelIndexMap[chNum];
      switchLiveChannel(ch);
      showToast(`切换到频道 ${chNum}: ${ch.name}`, 'info', 1500);
    } else if (chNum) {
      showToast(`频道 ${chNum} 不存在`, 'error', 1500);
    }
  });
}

// initLiveModule 由 index.html 中的 DOMContentLoaded 调用，不在此处重复绑定
