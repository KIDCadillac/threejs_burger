# 笔记本 → 台式机交接：旋转料理主页 + 第一人称汉堡闭环

更新日期：2026-08-01

仓库：`KIDCadillac/threejs_burger`

开发分支：`codex/burger-gameplay-loop`

发布目标：`main`（GitHub Pages）

## 先看结论

这轮已经放弃“餐车卡片主页”和“整条厨师手臂挡住汉堡”的方向：主页改成一个持续旋转的料理主体；料理页改成固定六步、第一人称操作台。木偶感只保留在短暂出现的小手上，不再出现长前臂、厨师身体、车头、轮子和卷帘档口。

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
- 放下或挤酱后立即退场，不会常驻遮挡汉堡。
- 左右手共用同一透明 PNG，右手由代码镜像，减少两套素材不一致的问题。

素材由 ImageGen 按现有奶油白、快餐红、深棕描边生成；先输出绿色纯色底，再转成透明 PNG。绿色中间文件没有纳入仓库。

相关文件：

- `cooking-first-person-hands.mjs`
- `art/cooking/first-person-puppet-hand.png`
- `cooking.html`
- `cooking.css`

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

当前结果：48/48 通过。

## 视觉验收证据

- 旋转汉堡主页：`output/burger-gameplay-qa-2026-08-01/01-home-burger.png`
- 旋转寿司主页：`output/burger-gameplay-qa-2026-08-01/02-home-sushi.png`
- 主页改造前后：`output/burger-gameplay-qa-2026-08-01/03-home-before-after.png`
- 小手放置牛肉饼：`output/burger-gameplay-qa-2026-08-01/04-cooking-hand.png`
- 巨型长臂与新小手对比：`output/burger-gameplay-qa-2026-08-01/05-hand-before-after.png`
- 完整订单结算：`output/burger-gameplay-qa-2026-08-01/06-cooking-finish.png`

## 仍没做完

1. 寿司只有主页 3D 预览，还没有寿司制作玩法。
2. 新小手现在按“拿取 / 搬运 / 放置 / 挤酱”事件切姿态，还不是逐帧绑定到 3D 食材的手腕 IK。
3. 主页 UI 编辑器仍保留旧餐车时代的若干专用分组和时间轴命名；正常主页不受影响，但后续应把编辑器分类改成“旋转料理 / 主题切换 / 玩法区”。
4. 旧木偶厨师与餐车素材仍在 `art/` 里供历史恢复，但新主页和第一人称料理页不再加载它们。

## 推荐下一步

先只做一件事：把小手从“事件位置”升级为跟随当前 3D 食材投影坐标的短程轨迹，仍保持现在的小尺寸和快速退场。不要再加人物身体或长手臂。
