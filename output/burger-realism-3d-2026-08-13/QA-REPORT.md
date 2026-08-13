# 汉堡料理：程序化 3D 手与真实落料 QA

日期：2026-08-13

本地入口：`http://127.0.0.1:4173/cooking.html?recipe=classic-beef&debug=1`

桌面实测视口：2560 × 1440 CSS px

移动覆盖视口：390 × 844（浏览器内部按 DPR 映射为 780 × 1688 CSS px）

## 完成线

从空订单 `0/6` 到 `6/6`，每个食材由程序化 3D 手套从正确侧完成 `reach → grip → carry → release`；松手后食材从真实释放点按重力下落，首次接触后只发生一次材料相关压缩/回弹，堆叠无瞬移、悬空或穿插；游戏运行时不加载截图或图片。

左右手验收追加要求：左侧面包、肉饼和酸黄瓜使用左手；右侧洋葱与调料瓶使用右手。两手拇指均朝餐台中心；手部由食品手套、白厨师袖和红色防污袖口构成，不出现木杆前臂。面包、肉饼、酸黄瓜、洋葱和酱瓶分别使用 `cradle / clamp / precision-pinch / scoop-pinch / bottle-wrap` 五种姿势，并且 `isAboveObject === true`。

## 玩家路径结果

通过页面自己的“重做订单”清空旧存档后，在同一真实浏览器会话中用指针完成：

1. 下层面包：`0/6 → 1/6`
2. 牛肉饼：`1/6 → 2/6`
3. 右侧番茄酱瓶拖到牛肉饼：`2/6 → 3/6`
4. 酸黄瓜：`3/6 → 4/6`
5. 洋葱碎：`4/6 → 5/6`
6. 上层面包：`5/6 → 6/6`

最终运行记录：

- 堆叠顺序：`bottom-bun, patty, pickle, onion, top-bun`
- 酱料：`ketchup`，目标层：`patty`
- 每个普通食材轨迹：`reach → grip → carry × 3 → end(pointer-up)`
- 手部系统：`procedural-3d`，左右手数量：2
- 运行时 `<img>` 数量：0
- 浏览器控制台日志：`[]`

## 确定性门

- Node 全量测试：`85/85` PASS。
- skill repo check：测试、`git diff --check` 和缓存链全部 PASS。
- 入口缓存链：`20260813-hands34` 全链一致。
- 料理运行文件图片引用扫描：无命中。
- 390 × 844 视口覆盖：无横向溢出，完成状态保持 `6/6`。

## 证据文件

- `32-live-left-reach-sequence.png`：真实指针拖动下，左手从起始、伸手、接触到握持的连续 WebGL 帧。
- `33-soft-bun-release-contact-rebound-settle.png`：软面包从真实释放点下落，到首次接触、最大压缩、一次回弹和稳定的七段 3D 帧。
- `34-right-hand-onion-grip.png`：独立右手骨架抓取后排洋葱，验证不是镜像图片或左手复用。
- `35-hard-onion-release-contact-rebound-settle.png`：硬配料洋葱的七段 3D 对照；最大压缩约 2%，显著低于面包约 10%。
- `36-complete-6-of-6-webgl.png`：同一局从 `0/6` 完成后的原始 WebGL 成品帧。
- `37-left-right-distinct-chef-grips.png`：相同相机和餐台下，左手托面包、左手夹肉饼、左手捏黄瓜、右手兜捏洋葱、右手环握挤酱的五格对照。
- `38-hands34-complete-6-of-6.png`：缓存链 `20260813-hands34` 下真实指针从 `0/6` 完成到 `6/6` 后的 WebGL 帧。
- 早期 `01`、`07`、`10`—`29` 文件仅记录开发迭代或浏览器截图问题，不作为最终结论。

## 复验路径

1. 打开上方调试入口，展开“细调”，点击“重做订单”，确认 `0/6`。
2. 从左侧第一格将下层面包拖到餐盘；确认手先伸入并闭指，再允许食材移动。
3. 依次放牛肉饼；将右侧第一瓶番茄酱拖到肉饼；再放酸黄瓜、洋葱碎和上层面包。
4. 确认每个食材松手后从当前释放点落下，只在首次接触时发生一次符合材质的压缩/回弹。
5. 确认最终 `6/6`、番茄酱在肉饼层，且控制台无错误、DOM 中无运行时图片。

## 发布状态

玩法提交：`f0e5823`（`feat: differentiate procedural chef hand grips`），已推送到 `main`。

GitHub Pages 复验入口：`https://kidcadillac.github.io/threejs_burger/cooking.html?recipe=classic-beef&debug=1&deploy=f0e5823`

线上页面、入口模块和手部模块均返回 200，并确认实际加载缓存链 `20260813-hands34`；手部源码含 `chef-sleeve`、`cradle`、`precision-pinch`、`bottle-wrap` 和挤压力度，不含 `wooden-forearm`。本地运行态标识为 `procedural-3d`、左右手实例数为 2、`document.images.length === 0`、控制台错误为 0；完整 `0/6 → 6/6` 玩家路径在真实浏览器中通过。
