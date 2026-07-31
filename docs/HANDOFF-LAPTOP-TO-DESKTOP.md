# 笔记本 → 台式机交接：双绳摆坠档口 v6 + 入场门控

更新：2026-08-01

仓库：`KIDCadillac/threejs_burger`

目标分支：`main`

## 当前美术方向

首页不再使用完整餐车。不要恢复车头、车门、车轮、轮眉或道路行驶动画。

当前主体是一块完整的银色出餐档口：它由两根绳从舞台上方吊下，像提线木偶布景一样快速坠落、左右摆动、短暂回摆，然后打开卷帘。

重要边界：

- “提线木偶”针对厨师人物的动作方式。
- 汉堡和食材继续使用当前装配逻辑，不做木偶化。
- 下一轮只拆人物关节，不重做档口和汉堡。

## 本轮笔记本完成内容

### 0. 修正“签到弹窗后动画已经播完”

- 根因 1：`index.html` 原来直接写了 `is-arriving`，CSS 一加载就开始计时，不等 JavaScript，也不等签到弹窗关闭。
- 根因 2：每日签到在首页加载后自动弹出，完整遮住了档口动画。
- 根因 3：没有营业记录时，旧逻辑默认返回“已打烊”，因此最后卷帘也不会打开。
- 现在 HTML 初始状态为 `is-entry-pending`，不会自动播放。
- 正常首页严格按以下顺序运行：
  1. 首页完成首轮渲染并加载图片。
  2. 如果需要每日签到，先显示签到弹窗。
  3. 弹窗关闭并完成退场。
  4. 档口才从顶部下坠。
  5. 档口接近停稳时打开卷帘。
  6. 最终显示“营业中 / 点击关门打烊”。
- 切到后台时不会偷播；页面重新可见后才会继续尝试首次进场。
- `?layout=1` 编辑器不自动播放，直接显示稳定档口，避免干扰编辑。

### 1. 双绳摆坠动画

- 两根绳由同一透明素材分成左右两个实例，各自拥有固定顶部锚点。
- 绳索使用 `scaleY` 随主体下落放长，不会提前垂到档口下面。
- 档口主体时长由 `1380ms` 缩短为 `1080ms`，镜头总时长由 `1850ms` 缩短为 `1440ms`。
- 档口从左偏进入，在第一次落点向右冲摆，再向左回摆并快速收稳。
- 当前关键幅度：
  - 起始 X：`-5.4%`
  - 第一次冲摆 X：`+5.2%`
  - 回摆 X：`-3.35%`
  - 最大旋转：约 `±3°`
- 卷帘延迟 `930ms`，时长 `360ms`。

### 2. 左右卡片切换

- 邻卡距离由 `88%` 改为 `104%`，稳定时不会在中间卡片两侧露边。
- 轮播层级改由 `--map-carousel-z` 单独管理，不再与布局编辑器的 `z-index` 互相覆盖。
- 当前卡 / 目标卡：`z=30`。
- 邻卡 / 离场卡：`z=18`。
- 外层缓存卡：`z=6`，并保持不可见。
- 左右返回汉堡卡片都会重新播放档口入场。

### 3. 编辑器数据升级

- 布局版本：`v6`
- 工作台文件版本：`v6`
- 浏览器存储键：`burger.home.layout.v6`
- 继续读取：v1、v2、v3、v4、v5
- 导入 v5 时保留布局和样式调整，但采用 v6 的摆坠时间轴。
- 旧车辆图层仍会被过滤：
  - `burger.body`
  - `burger.wheel-front`
  - `burger.wheel-rear`

### 4. 缓存版本

页面代码资源版本统一为：

`20260731-entrygate1`

银色档口与绳索图片本身没有改像素，仍使用已有 `weight2` 素材版本。

## 关键文件

- `index.html`
  - 双绳 DOM
  - 首屏 `is-entry-pending`
  - `entrygate1` 页面资源版本
- `home.css`
  - 双绳锚点
  - 档口摆坠、回摆、停稳与卷帘动画
  - `--map-carousel-z` 层级入口
- `home-map-carousel-state.mjs`
  - `104%` 邻卡位置
  - 卡片透明度与层级计算
- `home-lobby-app.mjs`
  - 签到弹窗与首次入场的门控顺序
  - 页面可见性和图片加载门槛
  - 首次进场结束为营业状态
  - 轮播层级写入
  - 返回汉堡时重播动画
- `home-mode-switch-state.mjs`
  - 空营业记录默认按“营业”处理
- `home-layout-editor-state.mjs`
  - v6 数据格式和默认时间轴
- `home-layout-editor.mjs`
  - v6 浏览器存储与 v5 迁移
- `home-layout-editor.css`
  - 编辑器专注视图中停止绳索动画，便于选中和对齐
- `tests/`
  - v6、双绳、摆坠节奏和轮播间距测试

## 视觉验收证据

- 最终摆坠四阶段：`output/ui-pendulum-qa/07-final-swing-contact-sheet.png`
- 最终稳定画面：`output/ui-pendulum-qa/10-final-stable.png`
- 修改前后同屏：`output/ui-pendulum-qa/11-before-after-comparison.png`
- 签到弹窗等待：`output/ui-entry-gate-qa/01-daily-sheet-holds-entry-accepted.png`
- 关闭签到后开始下坠：`output/ui-entry-gate-qa/02-entry-started-accepted.png`
- 落稳并开门：`output/ui-entry-gate-qa/03-entry-finished-door-open-accepted.png`
- 详细报告：`design-qa.md`

## 台式机接手步骤

先保护台式机本地未提交内容：

```bash
git status
```

如果工作区干净，再执行：

```bash
git checkout main
git pull origin main
git log -1 --oneline
```

打开：

- 普通首页：`https://kidcadillac.github.io/threejs_burger/`
- UI 编辑器：`https://kidcadillac.github.io/threejs_burger/?layout=1`

如果 GitHub Pages 仍显示旧版：

1. 等待 Pages 部署完成。
2. 强制刷新页面。
3. 检查 `index.html` 的资源版本是否为 `20260731-entrygate1`。
4. 不要用 `git reset --hard` 覆盖台式机未提交工作。

## 本轮验证结果

- Node 测试：`32/32` 通过。
- `git diff --check`：通过。
- 浏览器控制台：`0` 条 error / warning。
- 稳定状态左右邻卡进入主视口：`0px`。
- 签到弹窗打开期间：档口保持 `is-entry-pending`，不会提前播放。
- 签到关闭后的最终状态：卷帘打开，显示“营业中”。

## 下一步只做一件事

制作一个最小人物木偶样片：只拆厨师躯干、上臂、前臂和双手，完成一次“手伸向汉堡 → 放置一层食材 → 双手回位”。不要修改汉堡和食材的现有装配方式。
