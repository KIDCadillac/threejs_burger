# 汉堡游戏：笔记本 → 台式机交接

最后更新：2026-07-27

仓库：`https://github.com/KIDCadillac/threejs_burger`

工作分支：`codex/burger-art-redesign`

## 本轮结论

首页汉堡餐车已经从“整张 AI 图做缩放”改成扁平游戏结构与受控 AI 插画结合的版本：

- 车身、车轮、车窗、雨棚、卷帘、招牌和菜单机械结构使用统一的粗描边、低渐变、有限色板。
- AI 图片不再负责整台车，只保留在出餐窗口和三张菜单卡这些明确槽位内。
- 动画仍是完整整车驶入，停稳后开卷帘，最后镜头推到出餐口；不是截图放大。
- 之前挡住出餐口的黑色圆坨已经不存在。
- 原来偏写实、油亮、软陶 3D 的五个大图资产已从当前版本删除，仍可从提交 `51ceeac` 恢复。

## 台式机接手

先检查台式机是否有未提交修改：

```powershell
git status --short --branch
```

确认不会覆盖本地工作后：

```powershell
git fetch origin
git switch codex/burger-art-redesign
git pull --ff-only
```

不要直接合并到 `main`。先在本地查看餐车动画和料理台，再决定是否合并。

## 当前美术方向

权威参考图：

`docs/art-direction/reference-flat-burger-game.png`

规则文档：

`docs/art-direction/BURGER-ART-DIRECTION.md`

核心规则：

1. 保留原游戏的粗深棕描边、奶油黄底、番茄红、芥末黄和蓝绿色。
2. 轮廓整齐，形状概括，尽量不使用写实材质、塑料高光和大面积柔光渐变。
3. AI 只生成有明确尺寸与用途的插画槽位，不能重新决定整页风格。
4. 每次生成都必须携带原风格参考图，并在浏览器中与原图同屏比较。
5. 先保证整体像同一款游戏，再讨论局部是否“更精致”。

## 本轮改动文件

### `index.html`

- 重建餐车 DOM 层级，保留现有地图卡片和按钮逻辑。
- 菜单三块面板各自拥有正反面，可独立翻转。
- 出餐窗口使用单独插画，不再把整车作为一张大图。
- 样式缓存版本更新为 `20260727-burgertruck3`。

### `home.css`

- 新增扁平餐车结构、粗描边车身、车轮、车窗、雨棚、菜单框、招牌和卷帘。
- 整车最终镜头为 `translate3d(-4%,-12%,0) scale(1.72)`。
- 动画顺序：
  1. 整车从右侧驶入。
  2. 两只车轮独立滚动。
  3. 车身刹停回弹。
  4. 卷帘向上打开。
  5. 招牌出现，三块菜单错峰翻转。
  6. 镜头推进到菜单和出餐窗口。
- `prefers-reduced-motion` 沿用项目已有降级规则。

### `art/home/layered-truck/`

当前网页只使用四个压缩后的栅格素材：

- `service-window.webp`：平涂厨师递汉堡插画，1300 × 751。
- `menu-burger.webp`：扁平汉堡菜单图，520 × 520。
- `menu-fries.webp`：扁平薯条菜单图，520 × 520。
- `menu-drink.webp`：扁平饮料菜单图，520 × 520。

已删除的旧 AI 重资产：

- `truck-body.webp`
- `truck-wheel.webp`
- `burger-marquee.webp`
- `menu-frame.webp`
- `service-shutter.webp`

它们当前没有页面引用，删除后可显著减小分支体积；如需对照，从 Git 提交 `51ceeac` 恢复。

### 工具与报告

- `scripts/optimize-layered-truck-assets.py`：只压缩当前四个受控插画槽位。
- `scripts/build-burger-truck-qa-evidence.py`：生成原风格、整车入场、最终近景的三联比较图。
- `design-qa.md`：本轮视觉与交互验收。

## QA 证据

- `output/burger-truck-hybrid/browser-arrival-phone.png`：整车已进入卡片、卷帘尚未打开。
- `output/burger-truck-hybrid/browser-final-phone.png`：镜头聚焦出餐口后的最终画面。
- `output/burger-truck-hybrid/reference-vs-hybrid.png`：原风格、整车入场、最终近景同屏比较。
- `output/burger-truck-hybrid/hybrid-raster-assets.png`：四个 AI 插画槽位总览。

已验证：

- 活动餐车卡片的 7 个图片节点全部成功加载。
- 营业状态按 `false → true → false` 正常切换。
- 重播开始时两个控件隐藏，动画结束后恢复。
- 页面控制台错误为 0。
- 整车阶段和出餐近景均没有黑色遮挡物。

## 本地运行

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

- 首页：`http://127.0.0.1:4173/`
- 料理台：`http://127.0.0.1:4173/cooking.html`
- 双人模式：`http://127.0.0.1:4173/replica-duel.html`

## 台式机下一步

### P0：料理台里的 3D 汉堡

首页方向已经确定，下一优先级仍是料理台 Three.js 汉堡本体：

- 面包、肉饼、芝士、番茄和生菜要有与首页一致的色板和比例。
- 避免光滑球体、规则圆柱和塑料高光。
- 芝士扩大并自然下垂，肉饼边缘更不规则。
- 成品镜头使用略低的三分之四角度，突出层次和食欲。

预计文件：

- `burger-model-3d.mjs`
- `burger-tuning.mjs`
- `cooking-solo-stage.mjs`

### P1：动画声音

- 轮胎滚动。
- 刹车停稳。
- 卷帘上升。
- 菜单翻页。
- 出餐提示。

## 禁止回退

- 不要再把一张整车 AI 图直接缩放当动画。
- 不要使用写实轮胎、金属反射、霓虹塑料高光或摄影景深。
- 不要让 AI 图决定整页的构图、色板和描边。
- 不要在没有同屏比较和浏览器交互测试的情况下写 `passed`。
