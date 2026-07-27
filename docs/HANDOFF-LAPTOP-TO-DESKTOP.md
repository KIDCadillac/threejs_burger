# 汉堡游戏：笔记本 → 台式机交接

最后更新：2026-07-27

仓库：`https://github.com/KIDCadillac/threejs_burger`

工作分支：`codex/burger-art-redesign`

## 本轮结果

首页汉堡卡片已经换成连贯的银色餐车：

- 第一阶段是一整台银色餐车从右侧开进卡片，驾驶室、车身、车轮和出餐口属于同一套视觉。
- 停稳后银色卷帘打开，三块菜单灯箱依次翻转。
- 镜头随后推进到车厢中部，招牌、正面厨师和汉堡处于同一条中心轴。
- 旧版“只有两只手”“镜头偏在窗口上沿”“黄色车头拼奶油车厢”的问题已移除。
- 从汉堡页左右滑走再滑回来，会自动重新播放整套入场动画。
- 黑色大轮胎遮挡出餐口的旧方案没有回归。

## 台式机接手

先在台式机仓库检查是否有未提交内容：

```powershell
git status --short --branch
```

确认不会覆盖台式机本地工作后：

```powershell
git fetch origin
git switch codex/burger-art-redesign
git pull --ff-only
```

先在本地验收首页餐车与料理台，再决定是否合并 `main`。不要直接在有未提交修改的工作区强行切分支。

## 本轮代码改动

### `index.html`

- 餐车 DOM 改成以完整银色车身图片为主体。
- 两个车轮、卷帘、服务窗口、招牌和三块菜单保持独立层，继续支持各自动画。
- 页面缓存版本更新为 `20260727-burgertruck10`。

### `home.css`

- 删除黄色 CSS 拼装车的主要视觉。
- 接入完整银色餐车比例，整车入场时显示驾驶室和两个车轮。
- 最终镜头使用 `translate3d(-12%,-28%,0) scale(1.76)`，视觉焦点落在厨师与汉堡中心。
- 厨师窗口按横向出餐口裁切，避免只剩手臂或把人物推到边缘。
- 保留车轮滚动、刹车回弹、卷帘打开、菜单翻页、招牌出现与镜头推进。

### `home-lobby-app.mjs`

- `replayTruckArrival(control, { announce })` 支持静默回播。
- 新增 `replayActiveTruckArrival()`，只重播当前活动汉堡卡片。
- 轮播返回汉堡页并完成缓冲卡片复位后，在下一绘制帧自动触发回播。
- 手动重播仍显示提示；轮播自动回播不重复弹提示。

## 当前美术素材

目录：`art/home/layered-truck/`

- `silver-truck-body.webp`：完整银色车身，1539 × 638。
- `silver-truck-wheel.webp`：匹配车轮，560 × 572。
- `silver-truck-shutter.webp`：银色卷帘，1280 × 450。
- `service-window-centered.webp`：居中厨师出餐窗口，1300 × 349。
- `menu-burger.webp`：汉堡菜单卡，520 × 520。
- `menu-fries.webp`：薯条菜单卡，520 × 520。
- `menu-drink.webp`：饮料菜单卡，520 × 520。

本轮素材通过内置 Imagegen 生成，提示词固定为：参考原游戏的扁平粗描边风格、暖灰银色餐车、有限色板、低渐变、无品牌、无摄影金属反射。车身、车轮和卷帘先使用纯洋红色键背景生成，再通过本地脚本移除色键；厨师窗口额外做了横向中心裁切。

原始 PNG 和临时色键文件不提交，只保留压缩 WebP。旧的黄色拼装车实现可从提交 `9147789` 恢复。

## 工具与文档

- `scripts/optimize-layered-truck-assets.py`：按固定尺寸压缩当前七个餐车素材。
- `scripts/build-burger-truck-qa-evidence.py`：用两张用户旧截图与两张浏览器新截图生成四宫格和素材接触表。
- `docs/art-direction/BURGER-ART-DIRECTION.md`：银色餐车美术规则与禁止回退项。
- `design-qa.md`：本轮视觉和交互验收结果。

## QA 证据

- `output/burger-truck-silver/before-arrival.png`：用户指出的黄色拼装车。
- `output/burger-truck-silver/before-final.png`：用户指出的偏位、仅手臂近景。
- `output/burger-truck-silver/browser-arrival-phone.png`：新版完整银色餐车已进入卡片。
- `output/burger-truck-silver/browser-final-phone.png`：新版厨师与汉堡居中近景。
- `output/burger-truck-silver/before-vs-silver.png`：旧版与新版四宫格同屏比较。
- `output/burger-truck-silver/silver-assets.png`：当前七个栅格素材总览。

已验证：

- 活动汉堡卡片 12 个图片节点全部加载成功。
- 从汉堡页滑到寿司页，再滑回汉堡页，自动入场动画成功触发。
- 自动回播在汉堡页激活后约 450 ms 开始。
- 动画结束后左右箭头和营业控件恢复。
- 营业状态 `false → true → false` 正常切换。
- 页面控制台错误为 0。

## 本地运行

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

- 首页：`http://127.0.0.1:4173/`
- 料理台：`http://127.0.0.1:4173/cooking.html`
- 双人模式：`http://127.0.0.1:4173/replica-duel.html`

## 台式机下一步

### P0：料理台里的 Three.js 汉堡

首页餐车方向已经明确，下一优先级仍是料理台汉堡本体：

- 面包、肉饼、芝士、番茄和生菜使用首页同一套色板和轮廓比例。
- 避免光滑球体、规则圆柱、塑料高光和黑色坨状阴影。
- 芝士需要扩大并自然下垂；肉饼边缘更不规则。
- 成品镜头使用略低的三分之四角度，突出层次和食欲。

预计涉及：

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

- 不要再用黄色车头和奶油车厢拼车。
- 不要再让近景只剩两只手；人物必须在中心。
- 不要把一张整车截图直接缩放当完整动画。
- 不要让大轮胎、黑色圆形或按钮遮挡出餐口。
- 不要使用摄影金属反射、霓虹塑料高光或软陶 3D 风格。
- 不要在没有同屏对比和浏览器交互回归时写 `passed`。
