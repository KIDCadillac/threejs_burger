# 笔记本 → 台式机交接：旋转料理主页 + 第一人称汉堡闭环

更新日期：2026-08-02

仓库：`KIDCadillac/threejs_burger`

开发分支：`main`

发布目标：`main`（GitHub Pages）

当前玩法发布提交：`de577a8`（`feat: restore slot-based condiment rack`）

## 先看结论

这轮已经放弃“餐车卡片主页”和“整条厨师手臂挡住汉堡”的方向：主页改成一个持续旋转的料理主体；料理页改成固定六步、固定镜头的第一人称操作台。木偶感只保留在短暂出现的小手上。调料恢复为右侧三只常驻的实体瓶：在某只瓶上左右滑只换这只瓶的内容，长按打开三图标指定面板，向上拖则拿起这只实体瓶挤酱。底部全局调料胶囊已经退出当前页面。

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
- 从右侧实体调料瓶向上拖后右手出现；瓶子移动、倾斜和挤酱期间，手按瓶身的 3D 投影坐标逐帧跟随；松手后退场目标切到同一瓶子的原槽投影，避免瓶子已归位、手却残留在汉堡上方。
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

1. 在某只瓶身上直接左右滑：只循环切换这只瓶的番茄酱、芥末酱或小馆特调，另外两只不动。
2. 在某只瓶身静止长按约 360 ms：在瓶子左侧展开三个瓶形图标；点击一个图标，就把该槽指定成对应酱料。
3. 从瓶身向上拖至少 20 px：拿起该槽位对应的真实三维瓶子，随后可拖到汉堡上挤酱。
4. 在汉堡外松手、按 Esc、切后台、暂停或丢失指针：取消预览并把同一只瓶子放回原槽，不误提交。
5. 轻点瓶子不会换酱或拿瓶，只显示“左右滑 / 上拖 / 长按”的操作提示。

关键实现：

- `cooking-condiment-rack.mjs`：槽位级手势状态机，区分水平滑动、静止长按和向上取瓶，并提供键盘可访问的图标选择器。
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

当前结果：81/81 通过；缓存入口链统一为 `20260802-gameplay30`。玩法提交 `de577a8` 已推送到 `main`，并在 GitHub Pages 用真实鼠标手势复验到 3/6；页面控制台错误为 `[]`。最终独立盲审为 PASS，全部硬门槛 2/2，无阻断项。

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

## 仍没做完

1. 寿司只有主页 3D 预览，还没有寿司制作玩法。
2. 当前手是 2D 透明素材绑定 3D 投影中心，不是骨骼 IK；下一轮应针对面包、小配料和右侧实体调料瓶分别校准“握住点”。
3. 主页 UI 编辑器仍保留旧餐车时代的若干专用分组和时间轴命名；正常主页不受影响，但后续应把编辑器分类改成“旋转料理 / 主题切换 / 玩法区”。
4. 旧木偶厨师与餐车素材仍在 `art/` 里供历史恢复，但新主页和第一人称料理页不再加载它们。

## 推荐下一步

下一步在移动窄屏从 1/6 完整重做一遍订单，重点校准酸黄瓜、洋葱碎和实体调料瓶的手部接触点，并补错误食材的“拒绝并退回”动作。不要恢复底部全局胶囊，也不要再加人物身体或长手臂。

## 2026-08-01 Gauntlet 技能与普通食材跟随更新

- 参考技能：`achimala/TheLongSilence/.claude/skills/blender-hardsurface`。原技能面向 Blender 飞船建模；本项目只迁移纵向切片、真实渲染、自动探针和严格审查方法。
- 仓库内技能：`.codex/skills/build-burger-game-gauntlet/`，包含项目契约、盲审量表和一键仓库检查脚本。
- 本机全局技能：`%USERPROFILE%\.codex\skills\build-burger-game-gauntlet`；原始 `blender-hardsurface` 技能也已安装，重启/新任务后可发现。
- 本轮玩家结果：普通食材被正确侧的手从料盒抓起、持续跟随到餐盘、释放后退场；经典订单已在浏览器实测到 6/6。
- 调试证据：`body[data-debug-ingredient-trace]` 保存最多 24 个 `start / move / end` 投影采样，方便台式机复验动画而不是只看结束截图。
- 移动窄屏曾继承旧全屏编辑布局，订单步骤层会压住面包点击点；现已把目标卡和订单条恢复为正常文档流，料理台不再被覆盖。
- 入口缓存版本链已升级为 `20260802-gameplay30`。
- 完整方法与剩余里程碑见 `docs/BURGER-GAUNTLET-PLAN.md`。
