# React 全程空间放映一次性重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有原生 HTML/CSS/JS 作品集一次性替换为 React 全程空间放映网站，同时保留全部真实作品、内容 API、播放器、联系方式、GitHub Pages 与 Cloudflare 媒体能力。

**Architecture:** 使用 Vite + React 构建单页静态网站，GSAP + ScrollTrigger 负责章节编排，React Bits `RippleDistortion` 的 OGL 位移算法负责全站唯一的 WebGL 场景层。开发和验收在独立工作区完成，旧站在切换前保持不动；所有测试通过后用一个切换提交替换旧前台。

**Tech Stack:** React、Vite、GSAP、ScrollTrigger、OGL、Vitest、Testing Library、Playwright、Lighthouse CI、原生 CSS。

**Spec:** `docs/superpowers/specs/2026-08-18-react-spatial-cinema-design.md`

## Global Constraints

- 基线提交为 `ace4213`，它同时承担完整回滚点；不复制或长期维护第二套旧前台。
- 本轮只验证桌面端；公开发布、Cloudflare 配置和线上媒体修改不在实施授权内。
- 正式前台一次性切换；不安排新旧版并行路由、功能旗标或分章节上线。
- 主路径静音；只有用户主动打开完整作品播放器后恢复原片声音。
- 全站最多一个 WebGL 上下文、一个活动章节视频和一个完整作品播放器。
- `Portfolio`、`About`、`Contact` 锚点与 `#work`、`#about`、`#contact` 保持可访问。
- 首屏必须静态显示陈智宇身份和职业定位，即使 JavaScript、视频或 WebGL 失败也能读到。
- 首屏 Poster 是 LCP 候选；目标 LCP < 2.5s、INP < 200ms、CLS < 0.1。
- 主题锁定为冷调近黑；钴蓝只用于交互状态，不给作品画面统一染色。
- 不使用自定义鼠标、装饰性对焦环、`CHAPTER 01`、`MOVE ACROSS`、版本式英雄标签或滚动提示。
- `prefers-reduced-motion` 下取消 Ripple、pin、scrub、parallax 和横向滚动接管，恢复普通纵向内容流。
- 玻璃只用于导航、播放器和状态控件；`prefers-reduced-transparency` 下使用不透明表面。
- 发布候选版本为 `V0.25`，构建产物必须包含 `CNAME` 和现有 `/admin`。
- 删除旧前台文件时必须使用 `/usr/bin/trash`；失败立即停止并询问用户。
- 本机执行前先将 Codex bundled Node 与 pnpm 加入当前 shell 的 `PATH`；安装依赖需要网络权限时按执行环境正常申请授权。

## File Map

```text
prototype/
├── index.html                       Vite HTML、SEO、静态身份降级
├── package.json                     依赖和构建命令
├── vite.config.js                   Vite、Vitest 配置
├── playwright.config.js             桌面端浏览器测试
├── lighthouserc.json                Chromium 性能门槛
├── scripts/
│   ├── extract-legacy-content.mjs   从 ace4213 提取 30 个 TVC
│   └── prepare-dist.mjs             复制 CNAME 和 admin 到 dist
├── src/
│   ├── main.jsx
│   ├── app/PortfolioApp.jsx
│   ├── content/
│   │   ├── fallback-content.json
│   │   └── loadPortfolioContent.js
│   ├── media/
│   │   ├── LoadingGate.jsx
│   │   └── mediaDirector.js
│   ├── ripple/
│   │   ├── RippleStage.jsx
│   │   ├── rippleEngine.js
│   │   └── RippleStage.css
│   ├── chapters/
│   │   ├── CinematicWorlds.jsx
│   │   ├── EasternNarratives.jsx
│   │   ├── BrandFilms.jsx
│   │   └── LivestreamWorlds.jsx
│   ├── archive/
│   │   ├── ArchiveGallery.jsx
│   │   └── WorkPlayer.jsx
│   ├── credits/
│   │   ├── AboutCredits.jsx
│   │   └── ContactCredits.jsx
│   ├── navigation/SiteNavigation.jsx
│   ├── styles/tokens.css
│   ├── styles/global.css
│   └── test/setup.js
└── tests/e2e/portfolio.spec.js
```

---

### Task 1: 建立隔离工作区和 React 构建骨架

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `src/main.jsx`
- Create: `src/app/PortfolioApp.jsx`
- Create: `src/test/setup.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `PortfolioApp()`，供后续章节统一挂载。

- [ ] **Step 1: 使用 `superpowers:using-git-worktrees` 从 `ace4213` 创建 `codex/react-spatial-cinema` 独立工作区**

- [ ] **Step 2: 创建 package scripts 并安装最小依赖**

先在当前 shell 准备本机已有的 bundled runtime：

```bash
export PATH="/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
node --version
pnpm --version
```

```json
{
  "name": "joekuni-spatial-cinema",
  "private": true,
  "version": "0.25.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build && node scripts/prepare-dist.mjs",
    "preview": "vite preview",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "test:perf": "lhci autorun --config=./lighthouserc.json"
  }
}
```

Run:

```bash
pnpm add react react-dom gsap ogl
pnpm add -D vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test @lhci/cli
```

- [ ] **Step 3: 写失败的 App smoke test**

```jsx
render(<PortfolioApp />);
expect(screen.getByRole('main')).toBeInTheDocument();
expect(screen.getByRole('heading', { name: /陈智宇/ })).toBeInTheDocument();
```

- [ ] **Step 4: 运行测试并确认因 `PortfolioApp` 尚未实现而失败**

Run: `pnpm test -- src/app/PortfolioApp.test.jsx`

- [ ] **Step 5: 实现最小 React 入口和静态身份层，使 smoke test 通过**

- [ ] **Step 6: 运行 `pnpm test` 和 `pnpm build`**

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.js index.html src
git commit -m "build: establish React portfolio shell"
```

### Task 2: 机械迁移真实作品数据

**Files:**
- Create: `scripts/extract-legacy-content.mjs`
- Create: `src/content/fallback-content.json`
- Test: `src/content/fallback-content.test.js`

**Interfaces:**
- Produces: `{ tvc: Work[], livestream: LivestreamProject[] }`。
- `Work`: `{ id, brand, category, title, poster, posterMobile, video }`。

- [ ] **Step 1: 写失败测试，锁定 30 个 TVC、8 个直播项目和首项顺序**

```js
expect(content.tvc).toHaveLength(30);
expect(content.livestream).toHaveLength(8);
expect(content.tvc[0].id).toBe('naraka-nbpl-2024');
expect(content.tvc[1].id).toBe('naraka-last-one-standing-2023');
```

- [ ] **Step 2: 编写提取脚本，从 `git show ace4213:index.html` 读取旧卡片，不手工重录标题**

```js
const html = execFileSync('git', ['show', 'ace4213:index.html'], { encoding: 'utf8' });
const dom = new JSDOM(html);
const tvc = [...dom.window.document.querySelectorAll('.work-card[data-work]')].map(card => ({
  id: card.dataset.work,
  brand: card.querySelector('.work-meta-line span:first-child').textContent.trim(),
  category: card.querySelector('.work-meta-line span:last-child').textContent.trim(),
  title: card.querySelector('h3').textContent.trim(),
  poster: card.querySelector('img').getAttribute('src'),
  posterMobile: card.querySelector('source')?.getAttribute('srcset') || '',
  video: `https://media.kjoe.top/media-v0.21/works/${card.dataset.work}.mp4?v=0.21`
}));
```

- [ ] **Step 3: 合并现有 `assets/data/livestream-projects.json`，生成静态快照**

- [ ] **Step 4: 运行提取脚本和测试，人工比对首项、末项及数量**

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-legacy-content.mjs src/content
git commit -m "data: preserve portfolio content for React rebuild"
```

### Task 3: 接入公开 API 与明确降级路径

**Files:**
- Create: `src/content/loadPortfolioContent.js`
- Test: `src/content/loadPortfolioContent.test.js`

**Interfaces:**
- Produces: `loadPortfolioContent({ fetchImpl, fallback, apiUrl }) -> Promise<PortfolioContent>`。
- API 成功时使用 API 全量结果；失败或无效时完整返回静态快照，不合并两套数据。

- [ ] **Step 1: 写 API 成功、HTTP 失败、非法媒体域三个失败测试**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 移植 `assets/data/works-api.js` 的规范化规则，只允许 `https://media.kjoe.top`**
- [ ] **Step 4: 为请求加入 3.5 秒超时，不加入重试链**
- [ ] **Step 5: 运行测试并确认通过**
- [ ] **Step 6: Commit**

### Task 4: 建立语义页面、视觉 Token 与导航

**Files:**
- Create: `src/navigation/SiteNavigation.jsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Modify: `src/app/PortfolioApp.jsx`
- Modify: `index.html`
- Test: `src/app/PortfolioApp.test.jsx`

**Interfaces:**
- Produces anchors: `#work`、`#eastern`、`#brand`、`#livestream`、`#archive`、`#about`、`#contact`。

- [ ] **Step 1: 写语义测试，要求唯一 H1、跳到主要内容、单行导航和三个旧锚点**
- [ ] **Step 2: 在 `index.html` 保留静态身份文本，并加入 description、canonical、Open Graph 与 Twitter metadata**
- [ ] **Step 3: 建立冷调近黑、钛灰、雾白、钴蓝的 CSS variables**

```css
:root {
  color-scheme: dark;
  --bg: #08090a;
  --surface: #121416;
  --text: #e8eaec;
  --muted: #9299a1;
  --accent: #5877c8;
  --glass-radius: 22px;
  --control-radius: 999px;
}
```

- [ ] **Step 4: 实现小面积玻璃导航；取消蓝色装饰点、章节编号和滚动提示**
- [ ] **Step 5: 加入 `prefers-reduced-transparency` 实色降级和 WCAG AA focus 样式**
- [ ] **Step 6: 运行单元测试和构建**
- [ ] **Step 7: Commit**

### Task 5: 实现真实首屏加载与媒体调度

**Files:**
- Create: `src/media/mediaDirector.js`
- Create: `src/media/LoadingGate.jsx`
- Test: `src/media/mediaDirector.test.js`
- Test: `src/media/LoadingGate.test.jsx`

**Interfaces:**
- Produces: `prepareFirstReel({ posterUrl, videoUrl, timeoutMs })`。
- 返回 `{ posterReady, videoReady, timedOut }`，加载层只展示真实状态。

- [ ] **Step 1: 写 Poster 成功、视频 canplay、4.5 秒超时的测试**
- [ ] **Step 2: 实现 Poster 优先显示，视频仅作为增强，不让黑场等待视频**
- [ ] **Step 3: 首屏固定展示“陈智宇 / 影视美术指导与视觉创作者”**
- [ ] **Step 4: 后续章节在接近视口时只预取下一章媒体**
- [ ] **Step 5: 页面隐藏时暂停章节视频；同一时间只保留一个活动视频**
- [ ] **Step 6: 测试、构建并 Commit**

### Task 6: 改造 React Bits RippleDistortion 为全站唯一场景层

**Files:**
- Create: `src/ripple/rippleEngine.js`
- Create: `src/ripple/RippleStage.jsx`
- Create: `src/ripple/RippleStage.css`
- Test: `src/ripple/RippleStage.test.jsx`

**Interfaces:**
- `RippleStage({ source, sourceType, enabled, intensity })`。
- `sourceType` 为 `image` 或 `video`；DOM 导航和文字永远位于 Canvas 之上。

- [ ] **Step 1: 从用户提供的 React Bits 源码复制 Shader、波纹池和 OGL 清理逻辑，保留来源说明**
- [ ] **Step 2: 写测试，确保组件挂载一个 Canvas、卸载后移除监听器、reduced-motion 不产生波纹**
- [ ] **Step 3: 把图片纹理扩展为活动视频纹理；仅在视频可见且 `readyState >= 2` 时更新**
- [ ] **Step 4: 将默认值锁定为 `strength=0.045`、`swirl=0.35`、`rings=2.6`、`fade=1`、`tintAmount=0`**
- [ ] **Step 5: 限制 displacement buffer 为低分辨率，DPR 上限 1.5，波纹数量上限 48**
- [ ] **Step 6: WebGL 或 CORS 失败时隐藏 Canvas 并显示原始媒体，不阻断页面**
- [ ] **Step 7: 测试、构建并 Commit**

### Task 7: 实现前三章不同的空间语法

**Files:**
- Create: `src/chapters/CinematicWorlds.jsx`
- Create: `src/chapters/EasternNarratives.jsx`
- Create: `src/chapters/BrandFilms.jsx`
- Create: `src/chapters/chapters.css`
- Test: `src/chapters/chapters.test.jsx`

**Interfaces:**
- 每章接收 `content` 和 `setSceneSource(source)`。

- [ ] **Step 1: 写测试锁定项目选择和顺序**

```js
expect(screen.getByText(/NBPL 2024/)).toBeInTheDocument();
expect(screen.getByText(/兰亭/)).toBeInTheDocument();
expect(screen.getByText(/BEATBOT/)).toBeInTheDocument();
```

- [ ] **Step 2: Cinematic Worlds 使用全屏影像、景别推进和暗场接管**
- [ ] **Step 3: Eastern Narratives 使用 62/38 错位双画幅、留白和低强度空气折射**
- [ ] **Step 4: Brand Films 使用三段精确切割、材质匹配和较短转场，不重复 pinned 全屏结构**
- [ ] **Step 5: GSAP 只动画 transform 与 opacity，所有 ScrollTrigger 用 `gsap.context()` 清理**
- [ ] **Step 6: reduced-motion 下取消 pin/scrub，三章恢复普通纵向静态 Poster**
- [ ] **Step 7: 测试、构建并 Commit**

### Task 8: 实现直播空间横向照片墙

**Files:**
- Create: `src/chapters/LivestreamWorlds.jsx`
- Test: `src/chapters/LivestreamWorlds.test.jsx`

**Interfaces:**
- Consumes: 8 个项目和现有图片顺序。

- [ ] **Step 1: 写测试，要求 8 个项目、55 张图片且 DOM 中保留可访问名称**
- [ ] **Step 2: 使用 `start: "top top"`、`pin: true`、`scrub: 1` 将纵向滚动映射为横向轨道**
- [ ] **Step 3: 画面闲置时不显示项目文字；键盘 focus 或当前项目激活时提供精简 caption**
- [ ] **Step 4: 图片保持原始长宽比，禁止统一卡片裁切**
- [ ] **Step 5: reduced-motion 下改为普通纵向图片流**
- [ ] **Step 6: 测试、构建并 Commit**

### Task 9: 实现 Archive 与单一完整播放器

**Files:**
- Create: `src/archive/ArchiveGallery.jsx`
- Create: `src/archive/WorkPlayer.jsx`
- Create: `src/archive/archive.css`
- Test: `src/archive/WorkPlayer.test.jsx`

**Interfaces:**
- `WorkPlayer({ work, open, onClose })`。
- 打开播放器时暂停章节媒体并停用 Ripple；关闭时卸载 `src` 并恢复焦点。

- [ ] **Step 1: 写测试：未点击不设置视频 src，点击后有声音播放，Esc 关闭并卸载**
- [ ] **Step 2: 用确定性的 12 列跨栏节奏呈现全部 30 个作品，不使用三列等宽网格**
- [ ] **Step 3: hover 只做轻微 scale 和局部折射；播放器内完全关闭 Ripple**
- [ ] **Step 4: 保留系统 controls、失败提示、重试和 focus restore**
- [ ] **Step 5: 测试、构建并 Commit**

### Task 10: 迁移 About、Contact 与版本记录

**Files:**
- Create: `src/credits/AboutCredits.jsx`
- Create: `src/credits/ContactCredits.jsx`
- Test: `src/credits/ContactCredits.test.jsx`

**Interfaces:**
- 保留现有已确认简介、履历、教育、合作品牌、电话和微信复制功能。

- [ ] **Step 1: 从 `ace4213:index.html` 迁移现有文案，不添加新经历或私人信息**
- [ ] **Step 2: 将 About 和 Contact 设计为放映片尾，仍保持同一暗色主题**
- [ ] **Step 3: 写 Clipboard 成功与失败反馈测试**
- [ ] **Step 4: 以克制的站点信息形式显示 `V0.25`，不在 Hero 放版本标签**
- [ ] **Step 5: 测试、构建并 Commit**

### Task 11: 桌面端整体验收与性能门槛

**Files:**
- Create: `playwright.config.js`
- Create: `lighthouserc.json`
- Create: `tests/e2e/portfolio.spec.js`

**Interfaces:**
- Desktop projects: Chromium 1440×900、WebKit 1440×900。

- [ ] **Step 1: 写 E2E 测试，覆盖加载结束、章节导航、完整作品、直播墙、About、Contact**
- [ ] **Step 2: 安装计划内桌面测试浏览器**

```bash
pnpm exec playwright install chromium webkit
```

- [ ] **Step 3: 断言全站只有一个 Canvas、一个完整播放器、一个活动章节视频**
- [ ] **Step 4: 模拟 reduced-motion，确认没有 pinned scroll、Ripple 和横向劫持**
- [ ] **Step 5: 验证 API 失败、WebGL 不可用、媒体 CORS 失败时内容仍可访问**
- [ ] **Step 6: 配置 Lighthouse CI，在 Chromium 桌面模式跑 3 次，门槛设为 LCP ≤ 2500ms、CLS ≤ 0.1；以 Playwright PerformanceObserver 记录交互事件并验证 INP ≤ 200ms**

`lighthouserc.json` 的核心配置：

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "pnpm preview --host 127.0.0.1",
      "url": ["http://127.0.0.1:4173/"],
      "numberOfRuns": 3,
      "settings": { "preset": "desktop" }
    },
    "assert": {
      "assertions": {
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }]
      }
    }
  }
}
```

```bash
pnpm test:perf
pnpm test:e2e
```

- [ ] **Step 7: 在 Chrome 与 Safari 实机检查视觉、视频声音、键盘和玻璃降级**
- [ ] **Step 8: Commit**

### Task 12: 构建发布候选并执行一次性切换

**Files:**
- Create: `scripts/prepare-dist.mjs`
- Modify: `README.md`
- Remove after verification: `styles.css`、`script.js`

**Interfaces:**
- Produces: `dist/index.html`、带指纹静态资源、`dist/CNAME`、`dist/admin/`。

- [ ] **Step 1: 编写发布资源复制脚本**

```js
await copyFile('CNAME', 'dist/CNAME');
await cp('admin', 'dist/admin', { recursive: true });
```

- [ ] **Step 2: 运行完整门禁**

```bash
pnpm test
pnpm build
pnpm test:e2e
pnpm test:perf
```

- [ ] **Step 3: 从 `dist` 启动静态服务器，再完成一次浏览器视觉检查**
- [ ] **Step 4: 确认 Git diff 只包含新 React 前台、计划内构建配置和必要文档**
- [ ] **Step 5: 使用 `/usr/bin/trash styles.css script.js` 移入废纸篓；若失败立即停止**
- [ ] **Step 6: 更新 README 为 V0.25，并记录 `ace4213` 回滚点**
- [ ] **Step 7: 创建一次性切换提交**

```bash
git add -A
git commit -m "feat: replace portfolio with React spatial cinema"
```

- [ ] **Step 8: 使用 `superpowers:requesting-code-review` 完成正确性与设计双重审查**
- [ ] **Step 9: 使用 `superpowers:verification-before-completion` 重跑门禁并记录证据**
- [ ] **Step 10: 停在本地发布候选；未获用户明确批准不得 push、部署或修改 Cloudflare**

## Definition of Done

- React 新站从加载到 Contact 构成完整连续空间放映。
- 四章使用不同布局家族，Archive 明显降速并适合快速浏览。
- React Bits 水波作用于当前主场景，播放器、导航和重要文字保持清晰。
- 30 个 TVC、8 个直播项目及图片顺序与旧站一致。
- 主路径静音，完整播放器保留原片声音。
- API、WebGL 或媒体失败时仍能访问作品和联系信息。
- 单元测试、构建、Chromium/WebKit E2E 与桌面视觉验收全部通过。
- `dist` 包含 `CNAME` 和 `/admin`，版本号为 V0.25。
- 线上旧站保持不变，直到用户明确批准发布候选。
