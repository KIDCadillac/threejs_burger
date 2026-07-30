# 笔记本 → 台式机交接：悬吊汉堡档口

更新：2026-07-30

仓库：`KIDCadillac/threejs_burger`

目标分支：`main`

## 先看这一条

本轮方向已经覆盖早期的“完整银色餐车”方案：

> 首页不再保留车头和轮子，只显示一块银色出餐窗口；它像木偶戏布景一样从舞台上方吊下。

台式机继续开发时，不要根据旧截图、旧 JSON 或旧文档恢复驾驶室、车轮、轮眉和道路行驶动画。

### 2026-07-30 视觉重构补充

第一版“裁切银色车壳 + 木质横杆 + V 形长绳”已被否决，不要恢复。

当前基准改为完整的扁平银色木偶小剧场：

- 新框体：`art/home/layered-truck/silver-puppet-booth-frame.png`
- 新提线：`art/home/layered-truck/puppet-booth-strings.png`
- 缓存版本：`20260730-weight2`
- 本轮前态：`output/ui-reassessment/01-current-ui.png`
- 本轮终态：`output/ui-reassessment/07-final-stable.png`
- 参考对比：`output/ui-reassessment/09-reference-vs-final.png`
- 动画四阶段：`output/ui-reassessment/08-weighted-motion-contact-sheet.png`

新框体有完整顶篷、侧框、透明出餐口和厚底座；两根提线近乎垂直，页面里不再有操偶横杆。

## 笔记本本轮完成内容

### 1. 首页视觉

- 从主页 DOM 中删除旧车身图片和前后轮图片。
- 新增透明银色木偶剧场边框：
  - `art/home/layered-truck/silver-puppet-booth-frame.png`
- 继续复用经过确认的后厨与厨师：
  - `art/home/layered-truck/service-window-centered.webp`
- 保留三块菜单翻牌、银色卷帘和档口招牌。
- 档口宽度占场景 `100%`，人物落在画面中线附近；招牌、菜单和人物随之增大，不再像一张缩小贴图。

### 2. 提线木偶式出场

- 新提线素材：
  - `art/home/layered-truck/puppet-booth-strings.png`
- 操偶结构只使用两根短直提线和档口顶角铜环，不再显示横杆。
- 两根绳已对准档口顶角铜环；缓存版本提升为 `20260730-weight2`。
- 整个窗口作为一个刚性组合运动：
  1. 从上方受重力加速下落。
  2. 约 `0.9s` 到达重落点。
  3. 只做一次小回弹和一次更小的压缩。
  4. `1.38s` 停稳，随后打开卷帘。
  5. 菜单灯箱恢复错峰翻面。
- 车轮滚动、车身刹车、招牌独立弹出全部取消。
- “营业中 / 已打烊”按钮现在会真实控制银色卷帘，不再只换文字。

### 3. 整排店铺切换

- 主页仍保留 `-2 / -1 / 0 / 1 / 2` 五个缓冲卡位。
- 左右切换由完整卡片做水平运动。
- 汉堡卡片回到中间后，再触发独立的垂直吊降。
- 从左边和右边返回都已验证会重播，不会只在一个方向有动画。

### 4. 编辑器

编辑地址仍为：

`https://kidcadillac.github.io/threejs_burger/?layout=1`

默认“档口专注”只列 8 个逻辑图层：

1. `burger.camera` — 档口镜头
2. `burger.truck` — 完整悬吊档口组合
3. `burger.frame` — 银色档口边框
4. `burger.service` — 出餐区域
5. `burger.menu` — 菜单灯箱
6. `burger.window` — 后厨与人物
7. `burger.shutter` — 卷帘
8. `burger.sign` — 汉堡档口招牌

原来的车身、前轮、后轮图层已删除。编辑器仍支持：

- 鼠标拖动、缩放、旋转。
- 方向键每次微调 `1px`，`Shift + 方向键` 每次 `10px`。
- 数字小键盘 `2 / 4 / 6 / 8` 微调。
- 左/中/右、上/中/下对齐。
- 网格和边缘吸附。
- 上一层、下一层、置顶、置底、恢复原层。
- 透明度、透视和 X/Y 旋转。
- 下载与导入调整文件。

### 5. 调整文件升级

- 当前布局版本：v5
- 当前浏览器存储键：`burger.home.layout.v5`
- 仍会读取：v1、v2、v3、v4
- 导入旧文件时会过滤：
  - `burger.body`
  - `burger.wheel-front`
  - `burger.wheel-rear`
- 其他 UI 调整继续保留。
- v5 导出文件不再包含车轮转速、车轮圈数或招牌独立弹跳参数。
- 导入 v4 时会保留布局、对齐与样式，但旧慢速时间轴会迁移到 v5 重落基线。

因此，之前上传的 `汉堡小馆-UI调整-2026-07-29T17-03-58.json` 仍可导入，但其中车轮数据会被主动忽略。

## 关键代码

- `index.html`
  - 悬吊档口 DOM
  - 新素材路径与 `weight2` 缓存版本
- `home.css`
  - 档口构图
  - 垂直吊降、过冲、递减摆动和卷帘动画
- `home-lobby-app.mjs`
  - 回到汉堡卡片时重播进场
- `home-layout-editor-state.mjs`
  - v5 数据格式、重落时间轴与旧车辆图层过滤
- `home-layout-editor.mjs`
  - 8 个档口逻辑图层和编辑器交互
- `home-layout-editor.css`
  - 档口专注视图
- `scripts/build-suspended-service-booth.py`
  - 从已确认的银色源图生成透明档口边框
- `scripts/build-marionette-rig.py`
  - 生成两根透明短提线
- `scripts/build-puppet-theatre-qa.py`
  - 生成终态、前后对比和动画四阶段图

## 视觉验收材料

- 本轮前态：`output/ui-reassessment/01-current-ui.png`
- 新终态：`output/ui-reassessment/07-final-stable.png`
- 扁平参考 / 新档口：`output/ui-reassessment/09-reference-vs-final.png`
- 重落动画四阶段：`output/ui-reassessment/08-weighted-motion-contact-sheet.png`
- 本轮审查记录：`output/ui-reassessment/audit.md`
- 档口专注编辑器：`output/booth-redesign-audit/09-editor-theatre-final.png`
- 重构判断记录：`output/booth-redesign-audit/audit.md`
- 详细检查：`design-qa.md`
- 美术规则：`docs/art-direction/BURGER-ART-DIRECTION.md`
- 编辑器说明：`docs/UI-MOTION-EDITOR.md`

## 台式机接手步骤

在台式机仓库目录执行：

```bash
git checkout main
git pull origin main
git log -1 --oneline
```

然后打开：

- 普通首页：`https://kidcadillac.github.io/threejs_burger/`
- 编辑器：`https://kidcadillac.github.io/threejs_burger/?layout=1`

如果 GitHub Pages 仍显示旧整车：

1. 先确认 `git log -1` 已是本轮提交。
2. 等待 Pages 部署完成。
3. 强制刷新页面。
4. 检查 HTML 中资源版本是否为 `20260730-weight2`。

不要用 `git reset --hard` 覆盖台式机未提交工作；先 `git status`，有本地修改就先提交或暂存。

## 验收基线

当前必须同时满足：

- 看不到车头。
- 看不到任何车轮。
- 只显示完整银色出餐窗口。
- 两根提线直接连接窗口上沿。
- 厨师居中，菜单与卷帘不被裁切。
- 初次进入和左右返回都有吊降动画。
- 停稳后才打开卷帘。
- 营业按钮能真实打开和关闭卷帘。
- 普通首页不显示开发编辑器。
- 编辑器不再出现车身和车轮图层。

自动测试结果：`30/30` 通过。

## 下一步建议

下一步只做一个最小人物动作样片：把厨师拆成躯干、上臂、前臂和双手，完成一次“手从待机位伸向汉堡—放置食材—回位”。汉堡和食材继续沿用当前装配逻辑，不改成木偶。
