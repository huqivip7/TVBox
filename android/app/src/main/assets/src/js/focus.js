/* ============================================================
   TVBox Pro - 焦点导航引擎
   遥控器方向键 / 鼠标 / 数字键频道切换
   ============================================================ */

const FE = {
  _current: null,
  _focusables: [],
  _gridMaps: {},   // 区域网格映射
  _pageHistory: [],
  _navHistory: [],
  _heroIdx: 0,
  _heroAutoTimer: null,

  init() {
    document.addEventListener('keydown', (e) => this._handleKey(e));
    // 鼠标点击聚焦
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-focusable]');
      if (el) this.focus(el);
    });
  },

  // 获取当前页面所有可聚焦元素
  _getFocusables() {
    const page = document.querySelector('.page.active');
    if (!page) return [];
    return Array.from(page.querySelectorAll('[data-focusable]')).filter(el => {
      // 过滤不可见元素
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(el).display !== 'none';
    });
  },

  // 聚焦到指定元素
  focus(el) {
    if (!el || !el.dataset?.focusable) return;
    // 移除旧焦点
    if (this._current && this._current !== el) {
      this._current.classList.remove('focused');
    }
    this._current = el;
    el.classList.add('focused');
    // 滚动到可见区域
    this._scrollIntoView(el);
  },

  // 滚动元素到可见区域
  _scrollIntoView(el) {
    const page = el.closest('.page');
    if (!page) return;
    // 检查是否在滚动容器中
    const scroller = el.closest('.card-row, .live-channels, .episode-grid, .live-side-channels');
    if (scroller) {
      const sRect = scroller.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const sLeft = scroller.scrollLeft;
      const target = eRect.left - sRect.left + sLeft - (sRect.width / 2 - eRect.width / 2);
      scroller.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
    // 垂直滚动
    const pRect = page.getBoundingClientRect();
    const eRect2 = el.getBoundingClientRect();
    if (eRect2.top < pRect.top + 60 || eRect2.bottom > pRect.bottom - 40) {
      const scrollTop = page.scrollTop;
      const target = scrollTop + eRect2.top - pRect.top - 120;
      page.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  },

  // 键盘事件处理
  _handleKey(e) {
    const key = e.key;

    // 数字键 - 频道号输入
    if (/^[0-9]$/.test(key) && (AppState.currentPage === 'live' || AppState.currentPage === 'live-player')) {
      this._handleChannelNumber(key);
      e.preventDefault();
      return;
    }

    switch (key) {
      case 'ArrowUp':
        e.preventDefault();
        this._moveNav('up');
        break;
      case 'ArrowDown':
        e.preventDefault();
        this._moveNav('down');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this._moveNav('left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        this._moveNav('right');
        break;
      case 'Enter':
        e.preventDefault();
        if (this._current) {
          this._current.click();
          this._current.classList.add('focused');
        }
        break;
      case 'Backspace':
      case 'Escape':
        e.preventDefault();
        this._goBack();
        break;
      case 'Tab':
        e.preventDefault();
        this._focusNext();
        break;
      case ' ':
        e.preventDefault();
        if (this._current) {
          this._current.click();
        }
        break;
    }
  },

  // 方向移动
  _moveNav(direction) {
    const focusables = this._getFocusables();
    if (!focusables.length) return;

    if (!this._current || !focusables.includes(this._current)) {
      this.focus(focusables[0]);
      return;
    }

    const current = this._current;
    const cRect = current.getBoundingClientRect();
    const page = current.closest('.page');
    const pageRect = page?.getBoundingClientRect() || { left: 0, top: 0 };

    // 归一化坐标（相对于页面）
    const cx = cRect.left + cRect.width / 2 - pageRect.left;
    const cy = cRect.top + cRect.height / 2 - pageRect.top;

    let best = null;
    let bestDist = Infinity;

    for (const el of focusables) {
      if (el === current) continue;
      const eRect = el.getBoundingClientRect();
      const ex = eRect.left + eRect.width / 2 - pageRect.left;
      const ey = eRect.top + eRect.height / 2 - pageRect.top;

      const dx = ex - cx;
      const dy = ey - cy;

      let valid = false;
      let dist = Infinity;

      switch (direction) {
        case 'up':
          valid = dy < -10 && Math.abs(dy) >= Math.abs(dx) * 0.3;
          dist = Math.abs(dy) + Math.abs(dx) * 2;
          break;
        case 'down':
          valid = dy > 10 && Math.abs(dy) >= Math.abs(dx) * 0.3;
          dist = Math.abs(dy) + Math.abs(dx) * 2;
          break;
        case 'left':
          valid = dx < -10 && Math.abs(dx) >= Math.abs(dy) * 0.3;
          dist = Math.abs(dx) + Math.abs(dy) * 2;
          break;
        case 'right':
          valid = dx > 10 && Math.abs(dx) >= Math.abs(dy) * 0.3;
          dist = Math.abs(dx) + Math.abs(dy) * 2;
          break;
      }

      if (valid && dist < bestDist) {
        bestDist = dist;
        best = el;
      }
    }

    if (best) {
      this.focus(best);
    }
  },

  // Tab 式聚焦切换
  _focusNext() {
    const focusables = this._getFocusables();
    if (!focusables.length) return;
    const idx = focusables.indexOf(this._current);
    const next = focusables[(idx + 1) % focusables.length];
    this.focus(next);
  },

  // 返回操作
  _goBack() {
    if (this._navHistory.length > 0) {
      const prev = this._navHistory.pop();
      navigateTo(prev.page, prev.data);
    } else if (AppState.currentPage !== 'home') {
      navigateTo('home');
    }
  },

  // 频道号输入
  _channelBuffer: '',
  _channelTimer: null,

  _handleChannelNumber(num) {
    this._channelBuffer += num;
    if (this._channelBuffer.length > 3) this._channelBuffer = this._channelBuffer.slice(-3);

    clearTimeout(this._channelTimer);
    this._channelTimer = setTimeout(() => {
      const chNum = parseInt(this._channelBuffer);
      this._channelBuffer = '';
      if (!isNaN(chNum) && chNum > 0) {
        // 发射频道号事件
        window.dispatchEvent(new CustomEvent('channelNumberInput', { detail: chNum }));
      }
    }, 1500);

    // 显示频道号指示器
    showChannelIndicator(this._channelBuffer);
  },

  // 重新扫描当前页面焦点
  refresh() {
    if (this._current && document.body.contains(this._current)) {
      this._current.classList.add('focused');
    } else {
      const focusables = this._getFocusables();
      if (focusables.length) this.focus(focusables[0]);
    }
  },

  // Hero Banner 轮播控制
  startHeroAuto(items, onSwitch) {
    this.stopHeroAuto();
    this._heroAutoTimer = setInterval(() => {
      this._heroIdx = (this._heroIdx + 1) % items.length;
      onSwitch(this._heroIdx);
    }, 6000);
  },

  stopHeroAuto() {
    if (this._heroAutoTimer) { clearInterval(this._heroAutoTimer); this._heroAutoTimer = null; }
  },

  heroNavigate(dir, total, onSwitch) {
    this._heroIdx = (this._heroIdx + dir + total) % total;
    onSwitch(this._heroIdx);
    this.stopHeroAuto();
  }
};

// ========= 频道号指示器 =========
function showChannelIndicator(num) {
  let el = document.querySelector('.channel-indicator');
  if (!el) {
    el = document.createElement('div');
    el.className = 'channel-indicator';
    el.innerHTML = '<div class="channel-number"></div><div class="channel-name"></div>';
    document.body.appendChild(el);
  }
  el.querySelector('.channel-number').textContent = num;
  el.querySelector('.channel-name').textContent = '切换频道';
  el.classList.add('show');
  clearTimeout(showChannelIndicator._t);
  showChannelIndicator._t = setTimeout(() => el.classList.remove('show'), 2000);
}
showChannelIndicator._t = null;

// ========= 应用状态 =========
const AppState = {
  currentPage: 'home',
  currentData: {},
  searchHistory: Store.get('search_history', []),
};
