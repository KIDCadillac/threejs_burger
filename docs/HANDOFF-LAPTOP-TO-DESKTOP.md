# 笔记本 → 台式机交接：旋转料理主页 + 第一人称汉堡闭环

## 2026-08-22 最新接手状态：Antigravity「舞台聚光」主页已落地

本轮严格按 Antigravity 定稿与 `design_handoff.md` 重做主页，没有继续自创卡片或餐车方案。主页现在是全屏主题舞台：深色顶栏、中央大标题、持续旋转的真实 3D 汉堡/寿司、奶油色地台、上一/当前/下一三层玩法轨道、胶囊主按钮与主题指示点。

交互语法没有改变：左右滑动或左右方向键只切汉堡/寿司；上下滑动或上下方向键只切自由练习、复刻对决、双人制作。寿司仍是预览，点击会提示筹备中，不会误进汉堡。当前模式卡本身与“开始游戏”按钮都可进入当前汉堡玩法。

### 本轮关键文件

- `index.html`：新顶栏标题、全屏舞台结构、3D 地台、边缘主题入口、三层模式轨道与主题指示点。
- `home-focus.css`：Antigravity 汉堡/寿司色板、1920×1080 与移动首屏响应式规格、厚描边/硬投影和交互状态。
- `home-lobby-app.mjs`：同步顶栏/主标题/主题色，更新三层模式文案、边缘主题按钮和当前模式卡入口。
- `home-food-orbit-3d.mjs`：宽高比自适应模型比例；左右边缘使用真实低透明 3D 对侧食物，不加载图片。
- `home-map-carousel-state.mjs`：主题副标题按定稿更新。
- `tests/home-layout-editor-wiring.test.mjs`：锁定新缓存版本与舞台结构。
- `design-qa.md`：本轮最终 QA，结尾为 `final result: passed`。

### 验证结果

- 全仓 Node：85/85。
- Gauntlet repo check：PASS。
- 浏览器 1920×1080：顶栏 72px、当前模式卡 520×80、CTA 320×64，页面无滚动。
- 浏览器移动 480×844：当前模式卡 300×60、CTA 260×52，首屏无滚动；390px 使用同一 `<600px` 规则。
- 汉堡/寿司横向切换、三种模式纵向切换、寿司筹备提示、主题颜色与标题同步均已实测。
- 控制台 error/warn：`[]`。
- 主页缓存版本：`20260822-stage2`。
- 证据：`output/home-stage-spotlight-2026-08-22/`。

### 台式机接手顺序

1. 先运行 `git status`，不要覆盖台式机未提交修改。
2. 工作区干净时运行 `git pull origin main`。
3. 本地启动 `python -m http.server 4173 --bind 127.0.0.1`。
4. 打开 `http://127.0.0.1:4173/`，先验收汉堡主页，再左右切寿司、上下切三种玩法。
5. 完整检查：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.codex\skills\build-burger-game-gauntlet\scripts\run_repo_checks.ps1 -RepoPath . -NodePath node
```

当前剩余项：寿司制作玩法尚未开发；Antigravity 稿中的装饰涂鸦没有用位图补齐，以遵守“不在游戏里放截图和图片”的约束；旧 UI 编辑器仍保留餐车时代分组名称，但正常主页不显示。

## 2026-08-13 最新接手状态：左右手分工、厨师袖与五种抓握

这一轮只完成汉堡料理内容，没有继续改主页。料理页已经彻底停用手部 PNG 和反馈截图预览：玩家看到的手、食材、酱料瓶和料理台均为运行时 Three.js 几何体，不依赖截图、照片或纹理图片。

玩家现在可以从空订单 `0/6` 依次完成：下层面包、牛肉饼、牛肉饼上的番茄酱、酸黄瓜、洋葱碎、上层面包。真实料位决定出手侧：左侧面包、肉饼和酸黄瓜由左手拿；右侧洋葱和调料瓶由右手拿。两套骨架的拇指都朝餐台中心，避免“人在左边、却还是一只右手”的假镜像。普通食材按“从正确侧伸手、闭指握住、随物体搬运、松手下落、接触压缩、手退场”执行；右侧调料瓶仍保留“左拖拿瓶挤酱、右滑快切、长按上滑轮盘”的既定操作。

手臂外观已经取消木杆与木质前臂，改为奶油白食品手套、短白厨师袖和红色防污袖口。拿不同物品使用不同关节姿势：面包托握、肉饼夹持、酸黄瓜精细捏取、洋葱兜捏、酱瓶环握并随压力收紧。手掌和袖口的深度偏移保持在物品视觉上层，但仍保留 3D 深度测试，因此手指可以包住物品而不是平面贴片。

### 这次改了哪些文件

- `cooking-first-person-hands.mjs`：左右两套程序化 3D 厨师手；修正拇指朝向，删除木杆前臂，加入白厨师袖、红防污袖口和五种物品抓握。
- `cooking-interaction-controller.mjs`：增加真实 `reach / grip / carry / end` 生命周期，握住前不移动食材，并把真实释放姿态交给落料动画。
- `cooking-insertion-animation.mjs`：改为重力下落、首次接触、一次回弹，并按食材材质提供不同压缩参数。
- `cooking-solo-stage.mjs`：接入 3D 手、堆叠支撑链受力和拖拽期间的镜头稳定处理。
- `cooking-loader.mjs`、`cooking-solo-app.mjs`：更新接线、调试轨迹和缓存链。
- `cooking-feedback.mjs`、`cooking.html`、`cooking.css`：移除手部 `<img>`、反馈截图预览及相关样式。
- `tests/cooking-first-person-hands.test.mjs`、`tests/cooking-interaction-controller.test.mjs`、`tests/cooking-insertion-animation.test.mjs`、`tests/cooking-puppet-wiring.test.mjs`：锁定关节、左右手、握住前静止、真实释放、重力与材料差异。
- `.codex/skills/build-burger-game-gauntlet/scripts/run_repo_checks.ps1`：同步当前料理入口依赖链。

### 已完成验证

- 真实浏览器通过页面自己的“重做订单”回到 `0/6`，同一局使用真实指针完整做到 `6/6`。
- 最终堆叠：`bottom-bun, patty, pickle, onion, top-bun`；番茄酱记录在 `patty`。
- 运行时图片数为 `0`；浏览器控制台日志为 `[]`。
- Node 全套测试：`85/85`。
- skill repo check：测试、空白检查和缓存链全部 PASS。
- 390 × 844 视口覆盖测试无横向溢出。
- 当前缓存链：`20260813-hands34`。
- 玩法提交：`f0e5823`（`feat: differentiate procedural chef hand grips`），已推送 `main` 并由 GitHub Pages 加载。
- 线上复验：`https://kidcadillac.github.io/threejs_burger/cooking.html?recipe=classic-beef&debug=1&deploy=f0e5823`；入口与手部模块均返回 200，实际缓存链为 `20260813-hands34`。线上源码含 `chef-sleeve` 和五种抓握，不含 `wooden-forearm`；本地真实浏览器运行时 `procedural-3d`、双手实例数 2、图片数 0、控制台错误 0。

### 证据与复验

- QA 报告：`output/burger-realism-3d-2026-08-13/QA-REPORT.md`
- 左手真实拖动连续帧：`output/burger-realism-3d-2026-08-13/32-live-left-reach-sequence.png`
- 软面包下落/接触/回弹：`output/burger-realism-3d-2026-08-13/33-soft-bun-release-contact-rebound-settle.png`
- 右手抓洋葱：`output/burger-realism-3d-2026-08-13/34-right-hand-onion-grip.png`
- 硬洋葱下落/接触/回弹：`output/burger-realism-3d-2026-08-13/35-hard-onion-release-contact-rebound-settle.png`
- 同局完整成品 WebGL 帧：`output/burger-realism-3d-2026-08-13/36-complete-6-of-6-webgl.png`
- 左右手与五种抓握同视角对照：`output/burger-realism-3d-2026-08-13/37-left-right-distinct-chef-grips.png`
- 本轮 `hands34` 实机完成帧：`output/burger-realism-3d-2026-08-13/38-hands34-complete-6-of-6.png`

最终独立盲审：`PASS`。所有硬门为 `2/2`，质量项 `22/24`，平均 `1.83`。非阻断建议仅剩小屏下进一步拉开夹肉饼/捏黄瓜的指尖轮廓、让结算提示等手完全退场后再出现、给白袖内侧增加一档暖灰层次；这些不影响当前左右手与六步玩法验收。

注意：本文下方 2026-08-02 及更早段落中的 PNG 手、镜像手和截图证据均为历史实现；当前版本已彻底移除这些运行时图片，以上方 2026-08-13 段落为准。

台式机复验命令（若 PowerShell 禁止脚本，必须保留 `ExecutionPolicy Bypass`）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.codex\skills\build-burger-game-gauntlet\scripts\run_repo_checks.ps1 -RepoPath . -NodePath node
```

本地入口：`http://127.0.0.1:4173/cooking.html?recipe=classic-beef&debug=1`。接手时先 `git pull origin main`，再查看本文顶部的最新提交信息；不要使用 `git reset --hard` 覆盖台式机未提交内容。

更新日期：2026-08-02

仓库：`KIDCadillac/threejs_burger`

开发分支：`main`

发布目标：`main`（GitHub Pages）

当前玩法发布提交：`68d2daf`（`feat: remap condiment rack gestures`）

## 先看结论

这轮已经放弃“餐车卡片主页”和“整条厨师手臂挡住汉堡”的方向：主页改成一个持续旋转的料理主体；料理页改成固定六步、固定镜头的第一人称操作台。木偶感只保留在短暂出现的小手上。调料为右侧三只常驻实体瓶，并统一成三种互不打架的手势：向左拖直接拿起当前瓶并继续拖到汉堡挤酱；向右滑只快速切换当前槽；静止长按弹出竖向胶囊轮盘，保持按住向上拨动，松手停在哪里就选择哪种酱。底部全局调料胶囊已经退出当前页面。

## 主页改了什么

1. 删除玩家首屏中的餐车卡片、相邻卡片、门头和卷帘进场。
2. 首页中央只保留一个真实 WebGL 旋转料理：汉堡或寿司。
3. 左右滑动只负责切换料理主题：`汉堡 ↔ 寿司`。
4. 上下滑动只负责切换玩法：`自由练习 ↔ 复刻对决 ↔ 双人制作`。
5. 键盘方向键与触摸手势保持同一映射；汉堡/寿司文字切换器可直接点击。
6. 寿司目前只有旋转预览，点击主按钮会明确提示“玩法筹备中”，不会跳到错误页面。
7. 每日签到不再启动后自动弹出，避免主页动画在弹窗背后提前播放；红点仍保留，玩家主动点击再打开。
8. 主页主要文件：
   - `index.html`
   - `home-focus.css`
   - `home-lobby-app.mjs`
   - `home-food-orbit-3d.mjs`

## 汉堡玩法改了什么

经典牛肉堡固定为六步，不再是自由堆叠演示：

1. 下层面包
2. 牛肉饼
3. 在牛肉饼上挤番茄酱
4. 酸黄瓜
5. 洋葱碎
6. 上层面包

补充规则：

- 放错食材会立即退回料盒，并给出明确提示。
- 食材重叠时优先选中当前料盒食材，避免被盘中汉堡抢点击。
- 新食材会正确落到堆叠顶层，不再插到旧层下面。
- 重做订单会恢复适合全台视角，镜头不会停在放大的局部。
- 第一人称模式锁定镜头，不允许误操作把料理台转走。
- 单指空白拖动不能旋转镜头，双指也不能缩放；堆叠只做必要的自动构图适配。
- 评分从 100 分开始，每次纠错扣 8 分，最低 60 分。
- 结算奖励为 120 / 90 / 60 金币，并防止同一订单重复入账。

关键文件：

- `classic-burger-experience.mjs`
- `cooking-interaction-controller.mjs`
- `cooking-solo-app.mjs`
- `cooking-solo-stage.mjs`
- `cooking-workbench-3d.mjs`
- `cooking.html`
- `cooking.css`

## “手”这次怎么改

旧版问题是把完整厨师前臂从画面底部顶到中央，既挡汉堡，又像贴上去的插画。

现在使用：

- 新素材：`art/cooking/first-person-puppet-hand.png`
- 只包含手套、短红袖口和一个木偶腕关节；没有前臂、肘部和人物身体。
- 选择食材时从对应料盒一侧出现。
- 搬运时只移动到餐盘边缘，短暂辅助“拿住食材”的感觉。
- 食材放下后立即退场，不会常驻遮挡汉堡。
- 从右侧实体调料瓶向左拖后右手出现；瓶子移动、倾斜和挤酱期间，手按瓶身的 3D 投影坐标逐帧跟随；松手后退场目标切到同一瓶子的原槽投影，避免瓶子已归位、手却残留在汉堡上方。
- 普通食材现在也有独立的 `start / move / end` 手势生命周期；手的位置逐帧使用正在拖动食材的 3D 投影坐标，不再只切换“拿取 / 搬运 / 放置”三个固定姿势。
- `selection` 决定正确左右手后，拖动期间的 `drop-intent` 与 `drop-layer` 不会抢先把手切走；最终释放后约 220 ms 退场。
- 左右手共用同一透明 PNG，左手由代码镜像，减少两套素材不一致的问题。
- 素材原图是右手：左侧出手必须先在素材自身坐标中镜像成左手，再旋转朝向餐盘；右侧保留原始右手。相关回归断言在 `tests/cooking-puppet-wiring.test.mjs`。

素材由 ImageGen 按现有奶油白、快餐红、深棕描边生成；先输出绿色纯色底，再转成透明 PNG。绿色中间文件没有纳入仓库。

相关文件：

- `cooking-first-person-hands.mjs`
- `cooking-interaction-controller.mjs`
- `cooking-solo-stage.mjs`
- `cooking-solo-app.mjs`
- `cooking-loader.mjs`
- `art/cooking/first-person-puppet-hand.png`
- `cooking.html`
- `cooking.css`

## 右侧调料架怎么操作

右侧三只瓶子一直可见，每一只瓶子都是独立槽位；允许两只甚至三只瓶子装同一种酱。

1. 从某只瓶身向左拖至少 20 px，且横向位移占优：立即拿起这个槽位的真实三维瓶子；指针保持按下，可继续把瓶子拖到汉堡上，松手直接挤入。
2. 在某只瓶身向右滑至少 18 px：只把这一槽快速切到下一种酱，另外两槽保持原样。
3. 在某只瓶身静止长按约 360 ms，且漂移不超过 10 px：在瓶子旁展开竖向胶囊轮盘；手指保持按下，每向上移动约 44 px 转过一格，松手停在哪格就把该槽切成对应酱料。
4. 漂移超过 10 px 会取消长按资格，避免斜向拖动误弹轮盘；在汉堡外松手、按 Esc、切后台、暂停或丢失指针会取消取瓶并归还原槽，不误提交。
5. 轻点瓶子不会换酱或拿瓶，只显示“左拖拿瓶 · 右滑快切 · 长按上滑轮盘”的操作提示；三只瓶均使用同一套规则。

关键实现：

- `cooking-condiment-rack.mjs`：槽位级手势状态机，区分向左取瓶、向右快切和静止长按上滑轮盘，并处理 10 px 长按容差、44 px 轮盘分档与键盘路径。
- `cooking-interaction-controller.mjs`：新增 `beginCondimentSlotGesture(slotId, event)`，按槽位而不是按酱料名拿瓶，解决重复酱料拿错瓶的问题。
- `condiment-tools-3d.mjs`：三只实体瓶常驻，可独立切换内容并保持各自归位姿态。
- `cooking-solo-stage.mjs`：锁定视角/缩放，投影三只瓶身作为透明命中代理，并暴露槽位级开始接口。
- `cooking-solo-app.mjs`：保存每只瓶的映射，把调料架、三维工具、第一人称手和暂停生命周期接在一起。
- `cooking-sauce-capsule.mjs`：旧底部胶囊实现仍留作历史兼容，但当前 `cooking.html` 和 `cooking-solo-app.mjs` 不再加载它。

## 台式机接手步骤

先确认台式机有没有未提交内容：

```bash
git status
```

如果工作区干净：

```bash
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline
```

如果要继续开发分支：

```bash
git fetch origin
git checkout codex/burger-gameplay-loop
git pull origin codex/burger-gameplay-loop
```

不要使用 `git reset --hard` 覆盖台式机本地未提交内容。

## 本地打开与测试

```bash
python -m http.server 4173 --bind 127.0.0.1
```

- 新主页：`http://127.0.0.1:4173/index.html`
- 经典汉堡：`http://127.0.0.1:4173/cooking.html?recipe=classic-beef`
- 料理调试坐标：`http://127.0.0.1:4173/cooking.html?recipe=classic-beef&debug=1`
- 主页 UI 编辑器：`http://127.0.0.1:4173/index.html?layout=1`
- 线上主页：`https://kidcadillac.github.io/threejs_burger/`
- 线上料理：`https://kidcadillac.github.io/threejs_burger/cooking.html?recipe=classic-beef`

自动测试：

```bash
node --test tests/*.test.mjs
```

当前结果：84/84 通过；缓存入口链统一为 `20260802-gameplay31`。玩法提交 `68d2daf` 已推送到 `main`，并在 GitHub Pages 用真实指针完成“第二槽右滑、第一槽长按上滑轮盘、第一槽右滑复位、第一槽向左拖到汉堡挤酱”的连续复验，订单从 2/6 正确进入 3/6；页面控制台错误为 `[]`。独立盲审首次发现“长按缺少漂移容差”阻断项，修复并补回归测试后复审 PASS。

## 视觉验收证据

- 旋转汉堡主页：`output/burger-gameplay-qa-2026-08-01/01-home-burger.png`
- 旋转寿司主页：`output/burger-gameplay-qa-2026-08-01/02-home-sushi.png`
- 主页改造前后：`output/burger-gameplay-qa-2026-08-01/03-home-before-after.png`
- 小手放置牛肉饼：`output/burger-gameplay-qa-2026-08-01/04-cooking-hand.png`
- 巨型长臂与新小手对比：`output/burger-gameplay-qa-2026-08-01/05-hand-before-after.png`
- 完整订单结算：`output/burger-gameplay-qa-2026-08-01/06-cooking-finish.png`
- 左右手方向验收：`output/handedness-fix-2026-08-01/04-left-right-validation.png`
- 普通食材修复前：`output/burger-gauntlet-ingredient-hand-2026-08-01/01-baseline-pickle-drop.png`
- 右手放置洋葱：`output/burger-gauntlet-ingredient-hand-2026-08-01/03-after-onion-release.png`
- 左手接触上层面包：`output/burger-gauntlet-ingredient-hand-2026-08-01/05-top-bun-contact.png`
- 左手完成 6/6：`output/burger-gauntlet-ingredient-hand-2026-08-01/07-top-bun-release-complete.png`
- 订单按铃结算：`output/burger-gauntlet-ingredient-hand-2026-08-01/08-order-settlement.png`
- 移动订单层遮挡修复前：`output/burger-gauntlet-ingredient-hand-2026-08-01/09-mobile-480-start.png`
- 移动布局修复后：`output/burger-gauntlet-ingredient-hand-2026-08-01/09-mobile-layout-fixed.png`
- 移动窄屏左手放下层面包：`output/burger-gauntlet-ingredient-hand-2026-08-01/11-mobile-bottom-bun-clean.png`
以下 `12` 至 `20` 是被当前实体调料架取代的历史胶囊方案，只用于追溯，不是现行界面：

- 番茄酱居中的胶囊轨道：`output/burger-gauntlet-ingredient-hand-2026-08-01/12-condiment-capsule-ketchup.png`
- 左滑后芥末酱居中：`output/burger-gauntlet-ingredient-hand-2026-08-01/13-condiment-capsule-swipe-mustard.png`
- 长按进入可上拨状态：`output/burger-gauntlet-ingredient-hand-2026-08-01/14-condiment-capsule-armed.png`
- 取消后的回弹状态：`output/burger-gauntlet-ingredient-hand-2026-08-01/15-condiment-capsule-returning.png`
- 480×844 窄屏胶囊布局：`output/burger-gauntlet-ingredient-hand-2026-08-01/16-condiment-capsule-mobile-480.png`
- 右手抓住真实番茄酱瓶：`output/burger-gauntlet-ingredient-hand-2026-08-01/17-sauce-pickup-hand-bottle.png`
- 手瓶移动到牛肉饼并实时出酱：`output/burger-gauntlet-ingredient-hand-2026-08-01/18-sauce-carry-to-patty.png`
- 松手提交并进入 3/6：`output/burger-gauntlet-ingredient-hand-2026-08-01/19-sauce-release-commit.png`
- 手瓶归位、酱线保留：`output/burger-gauntlet-ingredient-hand-2026-08-01/20-sauce-settled.png`
- 旧版同视口空调料托盘：`output/condiment-rack-remap-2026-08-01/01-before-empty-docks-1280.png`
- 三只实体瓶恢复：`output/condiment-rack-remap-2026-08-01/02-after-three-bottles.png`
- 只滑第二槽后的结果：`output/condiment-rack-remap-2026-08-01/03-after-slot2-swipe.png`
- 长按后的三图标指定面板：`output/condiment-rack-remap-2026-08-01/04-after-long-press-picker.png`
- 选择芥末图标后只改第一槽：`output/condiment-rack-remap-2026-08-01/04b-after-icon-assign.png`
- 第一槽番茄酱接触前：`output/condiment-rack-remap-2026-08-01/06-pickup-contact.png`
- 右手与真实瓶子一起离架：`output/condiment-rack-remap-2026-08-01/07-carry-to-patty.png`
- 手瓶保持接触并向牛肉饼挤酱：`output/condiment-rack-remap-2026-08-01/08-release-contact.png`
- 松手后手朝第一槽退场：`output/condiment-rack-remap-2026-08-01/09-released.png`
- 三瓶归架、酱线保留并进入 3/6：`output/condiment-rack-remap-2026-08-01/10-settled.png`
- GitHub Pages 最终 3/6 画面：`output/condiment-rack-remap-2026-08-01/11-pages-gameplay30.png`
- 线上 URL、缓存链、操作路径、最终槽位与控制台记录：`output/condiment-rack-remap-2026-08-01/browser-verification.json`
- 独立盲审结论与非阻断改进：`output/condiment-rack-remap-2026-08-01/blind-review.md`
- 本轮改动前的实体调料架：`output/condiment-gesture-remap-2026-08-02/01-before-focus.png`
- 第二槽向右快切、其它槽不变：`output/condiment-gesture-remap-2026-08-02/02-right-swipe-focus.png`
- 第一槽长按并保持上滑到特调：`output/condiment-gesture-remap-2026-08-02/03-hold-up-roulette-house-focus.png`
- 第一槽向左拿瓶并挤酱后进入 3/6：`output/condiment-gesture-remap-2026-08-02/05-left-drag-committed-focus.png`
- 移动窄屏竖向轮盘完整落在料理画布内：`output/condiment-gesture-remap-2026-08-02/06-mobile-roulette.png`
- GitHub Pages 最终 3/6 全页画面：`output/condiment-gesture-remap-2026-08-02/08-pages-full-gameplay31.png`
- 本轮线上状态与控制台记录：`output/condiment-gesture-remap-2026-08-02/browser-verification.json`
- 本轮独立盲审与修复复审：`output/condiment-gesture-remap-2026-08-02/blind-review.md`

## 仍没做完

1. 寿司只有主页 3D 预览，还没有寿司制作玩法。
2. 当前手是 2D 透明素材绑定 3D 投影中心，不是骨骼 IK；下一轮应针对面包、小配料和右侧实体调料瓶分别校准“握住点”。
3. 主页 UI 编辑器仍保留旧餐车时代的若干专用分组和时间轴命名；正常主页不受影响，但后续应把编辑器分类改成“旋转料理 / 主题切换 / 玩法区”。
4. 旧木偶厨师与餐车素材仍在 `art/` 里供历史恢复，但新主页和第一人称料理页不再加载它们。

## 推荐下一步

下一步在移动窄屏从 1/6 完整重做一遍订单，重点补齐取瓶时“手指接触瓶身 → 瓶子离架 → 倾斜挤酱”的连续关键帧，并校准酸黄瓜、洋葱碎和实体调料瓶的握住点，再补错误食材的“拒绝并退回”动作。不要恢复底部全局胶囊，也不要再加人物身体或长手臂。

## 2026-08-01 Gauntlet 技能与普通食材跟随更新

- 参考技能：`achimala/TheLongSilence/.claude/skills/blender-hardsurface`。原技能面向 Blender 飞船建模；本项目只迁移纵向切片、真实渲染、自动探针和严格审查方法。
- 仓库内技能：`.codex/skills/build-burger-game-gauntlet/`，包含项目契约、盲审量表和一键仓库检查脚本。
- 本机全局技能：`%USERPROFILE%\.codex\skills\build-burger-game-gauntlet`；原始 `blender-hardsurface` 技能也已安装，重启/新任务后可发现。
- 本轮玩家结果：普通食材被正确侧的手从料盒抓起、持续跟随到餐盘、释放后退场；经典订单已在浏览器实测到 6/6。
- 调试证据：`body[data-debug-ingredient-trace]` 保存最多 24 个 `start / move / end` 投影采样，方便台式机复验动画而不是只看结束截图。
- 移动窄屏曾继承旧全屏编辑布局，订单步骤层会压住面包点击点；现已把目标卡和订单条恢复为正常文档流，料理台不再被覆盖。
- 入口缓存版本链已升级为 `20260802-gameplay31`。
- 完整方法与剩余里程碑见 `docs/BURGER-GAUNTLET-PLAN.md`。
# 2026-08-13：汉堡料理“纯 3D 手 + 重量感”交接

## 玩家现在能看到什么

- 料理页运行时不再加载手部 PNG、截图预览或任何 `<img>`；手、食材、餐盘和调料瓶都由 Three.js 几何体实时绘制。
- 左侧食材由真正的程序化左手抓，右侧食材/调料由右手抓；不是把一张右手图左右镜像。
- 手套由手掌、拇指、四根双节手指、红袖口、木质腕关节与短前臂组成，抓取期间和食材共用 Three.js 世界坐标与遮挡关系。
- 玩家松手后保留真实释放点，食材先下落，再发生一次接触压缩和一次小回弹；不会先瞬移到餐盘再做 UI 放大。
- 新食材撞到堆叠时，下方已有食材也会短暂承重压缩，并按累计高度保持接触链闭合，避免悬空或穿插。
- 反馈弹窗不再生成或显示游戏截图；只保留玩家主动录制的实时 3D 操作片段。

## 本轮关键文件

- `cooking-first-person-hands.mjs`：新程序化 3D 木偶手与抓握生命周期。
- `cooking-interaction-controller.mjs`：输出真实世界坐标，并在松手时保留 `releasePose`，不提前吸附。
- `cooking-insertion-animation.mjs`：下落、首次接触、压缩、回弹的确定性时间曲线。
- `cooking-solo-stage.mjs`：手和真实对象绑定、下层受力、接触链重排。
- `cooking-feedback.mjs`、`cooking.html`、`cooking.css`：移除截图/图片式运行时界面。
- `tests/cooking-first-person-hands.test.mjs`、`tests/cooking-interaction-controller.test.mjs`、`tests/cooking-insertion-animation.test.mjs`、`tests/cooking-puppet-wiring.test.mjs`：回归门。
- `.codex/skills/build-burger-game-gauntlet/scripts/run_repo_checks.ps1`：同步检查完整料理入口缓存链。

## 已完成验证

- Gauntlet 仓库检查：`80/80` 测试通过、`git diff --check` 通过、七段料理缓存链统一为 `20260813-gameplay32n`。
- 浏览器运行时：`document.querySelectorAll("img").length === 0`，程序化手标记为 `procedural-3d`，WebGL 错误层隐藏，控制台无新增 error。
- 窄屏真实指针：480 CSS px 宽视口，从左侧面包槽拖到餐盘，轨迹为 `start -> move -> end(pointer-up)`，订单正确进入 `1/6`。
- 本轮证据目录：`output/burger-realism-3d-2026-08-13/`。

## 台式机接手

```powershell
git status
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline
```

不要用 `git reset --hard` 覆盖台式机未提交内容。若台式机工作区不干净，先提交或另存自己的修改。

本地运行：

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

- 料理页：`http://127.0.0.1:4173/cooking.html?recipe=classic-beef`
- 调试轨迹：`http://127.0.0.1:4173/cooking.html?recipe=classic-beef&debug=1`

完整检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .codex\skills\build-burger-game-gauntlet\scripts\run_repo_checks.ps1 -RepoPath . -NodePath node
```

## 仍未纳入本切片

- 寿司仍只有主页 3D 预览，没有独立制作玩法。
- 旧餐车/木偶 PNG 仍留在 `art/` 作为历史恢复资产，但当前汉堡料理页不加载它们。
- 主页属于另一条切片；本轮只完成第一人称汉堡制作真实性，不重新设计主页。
