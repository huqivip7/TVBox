# TVBox - 影视聚合播放器

<p align="center">
  <strong>Netflix 活力 + Apple TV 沉浸感 + iOS Liquid Glass 精致质感</strong><br>
  纯 HTML/CSS/JS · TV端 Web 应用 · 方向键导航
</p>

---

## 功能特性

### VOD 点播
- 多源视频聚合（兼容 tvbox / Spider JSON API 格式）
- 多源多线路切换（同一影片支持多个解析源、多条线路）
- 首页 Hero Banner 自动轮播（6 秒间隔，圆点指示器）
- 分类筛选系统（电影 / 电视剧 / 动漫 / 综艺 + 类型标签）
- 全局搜索（支持热搜索排行 + 搜索历史）
- 影片详情页（海报、评分、标签、简介、选集）
- HLS.js 视频播放（支持真实 m3u8 源 + 内置演示模式）
- 历史记录（自动记录播放进度，最多 100 条）
- 我的收藏（收藏影片快速访问）

### IPTV 直播
- 多格式直播源支持：**M3U / M3U8 / JSON / TXT**
- M3U 解析器（#EXTINF, group-title, tvg-logo, tvg-name, tvg-id, tvg-num）
- JSON 格式解析（兼容 iptv-api / tvbox-api 等多种结构）
- TXT 格式解析（支持逗号、#、$ 分隔符）
- EPG 节目单（XMLTV + JSON 格式，5 分钟缓存）
- 频道分组导航 + 频道搜索
- 频道号快速切换（数字键输入 1-3 位，1.5 秒超时）
- 频道收藏功能
- HLS.js 直播流播放（低延迟模式，30 秒缓冲）
- 直播覆盖层控制（鼠标 / 按键触发，5 秒自动隐藏）
- 首页直播快捷入口

### 交互体验
- 方向键焦点导航引擎（空间邻近算法，适配 TV 遥控器）
- Apple TV 风格聚焦效果（scale 1.08 + 辉光阴影 + 非焦点变暗）
- iOS Liquid Glass 毛玻璃材质（backdrop-filter blur 40px + saturate 180%）
- SF Pro 风格字体层级（-apple-system, BlinkMacSystemFont 优先）
- iOS 大圆角设计（14-24px 圆角）
- 弹性动画（Apple spring 曲线 cubic-bezier(0.25, 0.46, 0.45, 0.94)）
- 响应式布局（适配 TV 大屏 / PC / 手机）

---

## 技术架构

| 文件 | 说明 |
|------|------|
| `index.html` | 主入口（侧边栏 + 顶栏 + 12 个页面容器） |
| `src/css/main.css` | 完整样式系统（Liquid Glass + Apple TV Focus） |
| `src/js/core.js` | 核心数据层（Store / SourceManager / VodAPI / OnlineSourceFetcher / HistoryManager / FavoriteManager） |
| `src/js/focus.js` | 焦点导航引擎（空间邻近算法 / 数字键输入 / Hero 轮播） |
| `src/js/live.js` | 直播模块（多格式解析器 / EPG 管理器 / HLS 播放器） |
| `src/js/ui.js` | UI 渲染层（路由系统 / 页面渲染 / 弹窗系统） |

**零构建依赖** — 纯 HTML/CSS/JS，可直接在任何现代浏览器中运行。TV 浏览器、手机浏览器、PC 浏览器均可。

**外部 CDN** — 仅 HLS.js（直播流播放）：
```
https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js
```

---

## 快速开始

1. 克隆仓库
```bash
git clone https://github.com/huqivip7/TVBox.git
cd TVBox
```

2. 启动任意 HTTP 服务器（示例）
```bash
# Node.js
npx serve .

# Python
python -m http.server 8080

# PHP
php -S localhost:8080
```

3. 打开浏览器访问 `http://localhost:8080`

> **TV 端使用**：在 TV 浏览器中输入服务器地址即可。内置演示数据，无需配置即可体验全部功能。

---

## 使用说明

### 添加视频源
1. 进入 **设置** → **VOD 视频源管理**
2. 点击 **添加源**，输入源名称和 JSON API 地址
3. 支持标准 tvbox 格式的 JSON API（如：j4Uq/TVBoxOSC 兼容源）

### 在线获取源（一键更新）
1. 进入 **设置** → **在线获取源**
2. 输入 GitHub 仓库名（如 `gaotianliuyun/gao`）或完整 URL，点击 **获取源**
3. 系统自动识别仓库中的 JSON（点播配置）、TXT（直播源）、M3U（直播源）文件
4. 勾选要导入的源，点击 **导入选中源**
5. 已导入的源可在对应的点播/直播源管理中查看和切换
6. 支持的推荐仓库：
   - `gaotianliuyun/gao` — FongMi 影视 / TVBox 配置合集（点播 + 直播）
   - `q215613905/TVBoxOS` — TVBox OS 版本
   - `takagen99/Box` — Box 衍生版
   - `catvod/CatVodOpen` — 猫影视开源版

### 添加直播源
1. 进入 **设置** → **直播源管理** 或 **直播** 页面 → 添加
2. 输入源名称和地址（支持 M3U / JSON / TXT 格式）
3. 可选填 EPG 节目单地址（XMLTV 或 JSON 格式）
4. 首次使用可点击 **使用演示数据** 快速体验

### 遥控器 / 键盘操作
| 按键 | 功能 |
|------|------|
| ↑ ↓ ← → | 方向导航 |
| Enter | 确认 / 进入 |
| Backspace / Escape | 返回上一页 |
| Tab | 循环焦点 |
| 数字键 0-9 | 直播频道号快速切换 |
| Space | 暂停 / 播放 |

---

## 更新日志

### v2.2 - 2026-06-06

**新增在线源获取功能**
- 新增 "在线获取源" 功能：输入 GitHub 仓库地址或文件 URL，一键获取和导入源
- 支持 GitHub 仓库自动扫描（自动检测 master/main 分支）
- 自动识别 JSON（TVBox 点播配置）、TXT（TVBox 直播格式）、M3U（直播源）文件
- TVBox JSON 配置解析：展开 `sites` 数组，逐个导入点播源
- TVBox TXT 直播格式解析：支持 `组名,#genre#` + `频道名,url` 格式
- 预览功能：可展开 JSON 文件查看所有 sites 并选择导入
- 推荐仓库快捷按钮（gaotianliuyun/gao、TVBoxOS、Box 等）
- 使用 corsproxy.io 解决跨域访问限制
- 核心引擎 `core.js` 新增 `OnlineSourceFetcher` 模块
- UI 渲染层 `ui.js` 新增在线获取交互界面（复选框 + 预览弹窗）
- 修复 `SourceManager.loadAll()` → `SourceManager.init()` 初始化调用错误
- CSS 新增自定义 checkbox 样式（Apple 风格蓝色勾选）
- 版本号更新至 v2.2

### v2.1 - 2026-06-06

**UI 大幅升级：Apple TV + iOS Liquid Glass 风格融合**
- 重写全部 CSS 样式系统，融合 Apple TV 沉浸感 + iOS 26 Liquid Glass 液态玻璃设计语言
- Liquid Glass 材质系统（backdrop-filter blur 40px + saturate 180% + 折射边框）
- Apple TV 风格焦点效果（scale 1.08 弹性缩放 + 辉光阴影 + 非焦点卡片自动变暗至 55% 透明度）
- SF Pro 字体层级（-apple-system, BlinkMacSystemFont 优先，字重 400/500/600/700）
- iOS 大圆角设计（radius 6-24px，胶囊按钮 pill shape）
- Apple spring 弹性动画曲线（cubic-bezier(0.25, 0.46, 0.45, 0.94)）
- Hero Banner 改为 Apple TV Cinematic 风格（径向渐变 + 左侧遮罩 + 胶囊标签 + 半透明播放按钮）
- 焦点环由红色硬边改为蓝色柔和辉光（更符合 tvOS 焦点美学）
- 侧边栏、顶栏、弹窗、Toast 全部升级为 Liquid Glass 材质
- 选集高亮色由红色改为蓝色（与 Apple TV 风格统一）
- 直播频道选中态改为蓝色高亮
- 新增 GitHub README 文档

### v2.0 - 2026-06-06

**基于 GitHub 项目调研的全面重写**
- 调研 15+ 开源项目（my-tv-0 / iptv-api / TVBoxOSC / FongMi/TV 等）
- CSS 重写：Netflix + 影视仓融合深色风格，CSS 变量系统，毛玻璃效果，3D 卡片悬浮
- 核心引擎重写：Store 封装、5 分钟数据缓存、SourceManager、VodAPI 演示数据生成器
- UI 渲染层重写：navigateTo 路由系统、Hero 自动轮播、分类筛选、多源多线路切换
- 焦点导航重写：空间邻近算法方向键导航、数字键频道切换、Hero 轮播控制
- 直播模块重写：M3U / JSON / TXT 多格式解析器、EPG 节目单管理器
- 频道收藏 / 观看历史 / 频道号快速切换 / 覆盖层控制
- 响应式设计（TV / PC / 手机）

### v1.0 - 2026-06-06

**初始版本**
- 影视仓风格深色 UI，大卡片网格布局
- Hero Banner 首页，分类浏览，搜索页
- 影片详情页（海报、评分、选集）
- 播放器页面（支持真实 m3u8，内置演示模式）
- 历史记录、收藏功能（localStorage）
- 遥控器方向键导航引擎（FocusEngine）
- 设置页（视频源管理）

---

## 参考项目

本项目的灵感来源于以下优秀的开源项目：

| 项目 | Stars | 参考点 |
|------|-------|--------|
| [Guovin/iptv-api](https://github.com/Guovin/iptv-api) | 23.9k | IPTV 源管理 |
| [youhunwl/TVAPP](https://github.com/youhunwl/TVAPP) | 17.7k | TV 端 UI |
| [j4Uq/TVBoxOSC](https://github.com/j4Uq/TVBoxOSC) | 16.7k | 视频源格式 |
| [liu673cn/bug](https://github.com/liu673cn/bug) | 10.3k | JSON API |
| [qist/tvbox](https://github.com/qist/tvbox) | 9.6k | 多源聚合 |
| [FongMi/TV](https://github.com/FongMi/TV) | 8.1k | 播放器引擎 |
| [lizongying/my-tv-0](https://github.com/lizongying/my-tv-0) | 4.6k | 直播源 / 频道号 |

## License

MIT
