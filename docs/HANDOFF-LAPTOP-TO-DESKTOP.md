# 汉堡游戏：笔记本 → 台式机交接

最后更新：2026-07-27

仓库：`https://github.com/KIDCadillac/threejs_burger`

工作分支：`codex/burger-art-redesign`

## 先看结论

第一版餐车实现已被用户正确否决：它只有一张 `burger-truck-master.png`，动画只是整图位移和缩放，属于“会动的海报”，与页面割裂。该版本保留在 Git 历史提交 `19294c2`，当前分支已经换成真正的分层实现。

现在的餐车由独立车身、两只独立车轮、出餐窗口、卷帘、顶部汉堡招牌、三联菜单机械框和三张食物卡组成。车轮旋转、车身刹停、卷帘打开、镜头推进和菜单翻转分别运动。

## 台式机接手命令

```powershell
git fetch origin
git switch codex/burger-art-redesign
git pull --ff-only
```

不要直接覆盖台式机上的未提交文件。先执行：

```powershell
git status --short --branch
```

如果台式机有本地修改，先记录文件列表并保存，再切换分支。

## 当前美术资产

正式网页资产都在：

`art/home/layered-truck/`

- `truck-body.webp`：无轮餐车车身和空出餐口。
- `truck-wheel.webp`：单独车轮，前后轮复用。
- `service-window.webp`：厨房、厨师双手和主汉堡。
- `service-shutter.webp`：独立滚动卷帘。
- `burger-marquee.webp`：顶部发光汉堡招牌。
- `menu-frame.webp`：带三个透明开口的菜单机械框。
- `menu-burger.webp`
- `menu-fries.webp`
- `menu-drink.webp`

这些资产统一使用奶油白、番茄红、芥末黄、深棕和暖白灯光，属于同一套软质黏土 3D 风格，没有品牌 Logo。

旧的单图文件 `burger-truck-master.png`、`burger-menu-front.png` 和 `burger-menu-back.png` 已从当前版本删除；需要追溯时查看提交 `19294c2`。

## 代码改动

### `index.html`

- 删除单张整车截图和镜像菜单裁图。
- 改为 13 个实际图片节点：
  - 2 个车轮节点；
  - 1 个车身；
  - 1 个出餐窗口；
  - 1 个卷帘；
  - 6 个菜单正反面；
  - 1 个菜单机械框；
  - 1 个顶部招牌。
- 首页 CSS 和 JS 缓存版本更新为 `20260727-burgertruck2`。

### `home.css`

- `.burger-truck-rig`：整车舞台。
- `.burger-truck-shell`：车身、窗口、灯箱和招牌组合层。
- `.burger-truck-wheel--front / --rear`：独立车轮。
- `.burger-service-window`：出餐窗口裁切区域。
- `.burger-service-window__shutter`：卷帘。
- `.burger-menu-machine`：菜单框。
- `.burger-menu-panel__rotor`：三块错峰翻转面板。
- `.burger-truck-marquee`：顶部汉堡灯牌。

关键动画：

1. `burger-truck-camera-arrive`：整车从右侧驶入，停稳后把镜头推进到出餐窗口。
2. `burger-truck-wheel-roll`：车轮独立旋转。
3. `burger-truck-brake-bounce`：车身刹停回弹。
4. `burger-service-shutter-open`：卷帘上升。
5. `burger-menu-panel-rotate`：菜单面板错峰翻页。

最终镜头缩放为 2.1，焦点位于菜单灯箱和出餐窗口。轮胎会退出最终画面，符合“最后只显示局部出餐位置”的要求。

### `home-lobby-app.mjs`

- 沿用已有重播逻辑。
- 重播期间隐藏 `重播进场` 和营业按钮。
- `burger-truck-camera-arrive` 结束后恢复控件。
- 重播按钮点击不会穿透进入料理台。
- 营业按钮继续同步 `aria-pressed`、文字与 toast。

## 动画时间线

1. 餐车从卡片右侧驶入；车轮旋转。
2. 整车完整进入卡片并刹停；车身轻微回弹。
3. 出餐卷帘上升，厨房和主汉堡出现。
4. 镜头从 1 倍推进到 2.1 倍，聚焦菜单灯箱和出餐窗口。
5. 三块菜单面板持续错峰翻转，轮换汉堡、薯条和饮料。
6. 动画结束后恢复重播和营业控件。

## QA 证据

根目录报告：

- `design-qa.md`
- 最终结果：`passed`

关键证据：

- `output/burger-truck-layered/browser-final-phone.png`：最终带交互近景。
- `output/burger-truck-layered/browser-final-full.png`：浏览器完整截图。
- `output/burger-truck-layered/reference-vs-layered-final.png`：选定概念图与最终实现同屏比较。
- `output/burger-truck-layered/layer-assets-contact-sheet.png`：九类独立资产总览。

已验证：

- 13 个餐车图片节点全部加载成功。
- 车轮、车身、卷帘、镜头和菜单不是同一个动画。
- 重播按钮工作，不会误进料理台。
- 开门/打烊状态按 `false → true → false` 正常切换。
- 页面控制台错误为 0。
- 装饰图为空 `alt`，按钮保留可访问名称和焦点样式。
- `prefers-reduced-motion` 沿用项目原有全局降级。

## 本地运行

在仓库根目录：

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

检查：

- 首页：`http://127.0.0.1:4173/`
- 料理台：`http://127.0.0.1:4173/cooking.html`
- 双人模式：`http://127.0.0.1:4173/replica-duel.html`

## 生成与压缩工具

- `scripts/optimize-layered-truck-assets.py`：透明边缘裁切、尺寸限制和 WebP 输出。
- `scripts/extract-browser-snapshot.mjs`：从 Codex 浏览器会话元数据提取最新 QA 截图。
- `scripts/build-burger-truck-qa-evidence.py`：生成参考图对比和分层资产总览。

正式网页只引用压缩后的 WebP。原始生成 PNG 不提交到仓库，避免继续膨胀仓库。

## 下一轮工作

### P0：料理台里的 3D 汉堡

首页餐车已经修好，但料理台 Three.js 汉堡模型仍是旧版本。下一轮重点：

- 面包、肉饼、芝士、番茄和生菜每层都要有明确轮廓。
- 芝士扩大并自然下垂。
- 肉饼改为暖棕色，增加不规则边缘。
- 番茄改为可辨认切片，生菜改为多层褶皱。
- 成品镜头改为偏低的三分之四视角，放大成品。
- 让首页汉堡和料理台汉堡共享同一色板、材质和比例。

预计涉及：

- `burger-model-3d.mjs`
- `burger-tuning.mjs`
- `cooking-solo-stage.mjs`

### P1：音效与触觉节奏

- 轮胎滚动。
- 刹车停稳。
- 卷帘上升。
- 菜单翻页。
- 出餐提示。

### P2：菜单扩展

- 增加套餐卡作为第四种内容。
- 将三块面板的轮播顺序和营业状态关联。
- 为低性能设备提供更轻量的翻页周期。

## 不要再做

- 不要回退到一张整车截图。
- 不要用 CSS 圆形、CSS 汉堡、div 画车轮或假菜单。
- 不要把同一张菜单裁图镜像后当成另一面。
- 不要在没有浏览器截图和同屏比较的情况下写 `passed`。
