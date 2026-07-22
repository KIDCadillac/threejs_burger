# 360° Workbench Slot Control Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把料理台十个固定材料槽的微小 3D 箭头替换成始终朝向屏幕、手机上容易发现和点击的 DOM 槽位控件；短按循环材料、长按打开完整选择器，并在任意镜头角度保持清晰、无重叠且不破坏现有 60 层料理、存档、撤销、酱料和回放功能。

**Architecture:** Three.js 场景只提供每个槽位的稳定世界坐标锚点；纯函数布局层负责投影、三条区域轨道、碰撞消解和离屏降级；DOM 控制层负责按钮、引导线、手势、键盘、区域折叠入口和新手提示。`cooking-solo-app.mjs` 作为唯一编排层，把短按和原有选择器都汇入同一个 `applyWorkbenchContent()`，确保 3D 模型、状态、持久化和两个 UI 永远同步。

**Tech Stack:** 原生 ES modules、Three.js、HTML/CSS、Node.js `node:test`、现有 GitHub Pages 静态发布流程。

---

## Scope Guardrails

- 本计划只实现设计文档第一阶段的 360° 槽位控件，不实现双人复刻对决、WebSocket 后端、计时和评分。
- 继续复用十个既有 `slotId`，不创建第二套槽位状态。
- 现有 `solo-cooking-workbench-loadout:v1` 数据格式不变；新增的新手提示只写入 `workbench-slot-controls-onboarded:v1`。
- 现有 60 层限制、汉堡自动存档、撤销/重做、验收调参、反馈视频和高光回放必须保持回归通过。
- 所有测试和浏览器验收通过后，才更新原试玩链接 `https://kidcadillac.github.io/threejs_burger/`。

## Task 1: 为槽位循环切换补齐权威元数据

**Files:**
- Modify: `app/static/workbench-loadout.mjs`
- Modify: `tests/workbench-loadout.test.mjs`

- [ ] **Step 1: 写失败测试，固定显示名称、图标和槽位名称**

在 `tests/workbench-loadout.test.mjs` 中断言以下公开常量存在、递归冻结且覆盖全部候选材料和十个槽位：

```js
export const WORKBENCH_CONTENT_PRESENTATION;
export const WORKBENCH_SLOT_PRESENTATION;
```

必须至少包含：

```js
WORKBENCH_CONTENT_PRESENTATION.patty === Object.freeze({ label: "牛肉饼", icon: "🥩" });
WORKBENCH_SLOT_PRESENTATION["filling-back-1"] === Object.freeze({ label: "后排配料 1" });
```

- [ ] **Step 2: 写失败测试，定义顺向和反向循环的唯一规则**

新增并测试：

```js
export function getNextWorkbenchSlotContent(loadout, slotId, direction = 1);
export function cycleWorkbenchSlotContent(loadout, slotId, direction = 1);
```

断言：

```js
const loadout = createDefaultWorkbenchLoadout();
assert.equal(getNextWorkbenchSlotContent(loadout, "filling-back-1"), "cheese");
assert.equal(getNextWorkbenchSlotContent(loadout, "filling-back-1", -1), "onion");
assert.equal(cycleWorkbenchSlotContent(loadout, "filling-back-1")["filling-back-1"], "cheese");
assert.equal(loadout["filling-back-1"], "patty");
```

无效 `slotId` 抛 `RangeError`；`direction` 只按正负号解释，`0` 视为顺向；返回的新 loadout 继续完全冻结。

- [ ] **Step 3: 运行测试并确认按预期失败**

Run:

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/workbench-loadout.test.mjs
```

Expected: FAIL，缺少上述导出。

- [ ] **Step 4: 实现元数据和循环函数**

循环函数必须读取 `WORKBENCH_REGION_OPTIONS[slot.region]`，不能复制候选数组；先调用 `normalizeWorkbenchLoadout`，再通过现有 `setWorkbenchSlotContent` 生成结果，保证存储格式与选择器一致。

- [ ] **Step 5: 重跑测试并提交**

Expected: PASS。

Commit:

```powershell
git add -- app/static/workbench-loadout.mjs tests/workbench-loadout.test.mjs
git commit -m "feat: add workbench slot cycling metadata"
```

## Task 2: 建立可穷举验证的投影与轨道布局引擎

**Files:**
- Create: `app/static/workbench-slot-control-layout.mjs`
- Create: `tests/workbench-slot-control-layout.test.mjs`

- [ ] **Step 1: 写失败测试，固定布局 API 和安全常量**

公开接口：

```js
export const SLOT_CONTROL_HIT_SIZE = 52;
export const SLOT_CONTROL_GAP = 8;
export const SLOT_CONTROL_MAX_ANCHOR_DISTANCE = 96;
export const SLOT_CONTROL_COMPACT_WIDTH = 360;

export function layoutWorkbenchSlotControls({
  viewport,
  anchors,
  safeInset = 8,
});
```

输入锚点结构固定为：

```js
{
  slotId: "filling-back-1",
  region: "filling",
  x: 195,
  y: 122,
  visible: true,
}
```

返回值固定为递归冻结对象：

```js
{
  individual: [{ slotId, region, x, y, anchorX, anchorY }],
  regionFallbacks: [{ region, slotIds, x, y }],
}
```

- [ ] **Step 2: 写失败测试，覆盖三条区域轨道和确定性排序**

断言面包控制放左轨、配料放上轨、酱料放右轨；相同输入始终生成相同顺序。每个按钮矩形必须完全落入 `safeInset`，任意两个 52×52 命中框之间至少 8px，独立按钮中心与其锚点距离不超过 96px。

- [ ] **Step 3: 写 24 个镜头组合的表驱动失败测试**

用 8 个 yaw × 3 个 pitch 的预计算屏幕锚点运行布局，逐个断言：

```js
assertNoOverlap(result.individual, 52, 8);
assertWithinViewport(result, viewport, 8);
assertWithinAnchorDistance(result.individual, 96);
assertAllSlotsAccountedFor(result, WORKBENCH_SLOTS);
```

“accounted for”表示每个槽位恰好出现在 `individual` 或对应 `regionFallbacks[].slotIds` 一次，不能消失或重复。

- [ ] **Step 4: 写失败测试，固定离屏和窄屏降级**

- `visible:false` 的槽位进入本区域聚合按钮。
- 若某区域轨道无法同时满足间距和 96px 距离，该区域全部转为一个聚合按钮，避免半数按钮难以理解。
- `viewport.width < 360` 时只返回“面包 / 配料 / 酱料”三个区域按钮，`individual` 为空。

- [ ] **Step 5: 运行测试并确认失败**

Run:

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/workbench-slot-control-layout.test.mjs
```

Expected: FAIL，模块不存在。

- [ ] **Step 6: 实现纯函数布局**

实现顺序：规范化输入 → 按区域和投影坐标排序 → 尝试区域轨道 → 逐轴夹紧 → 检查碰撞和距离 → 不合格区域降级。禁止读取 DOM、Three.js、`window` 或存储，使布局测试无需浏览器即可完全覆盖。

- [ ] **Step 7: 重跑测试并提交**

Expected: PASS。

Commit:

```powershell
git add -- app/static/workbench-slot-control-layout.mjs tests/workbench-slot-control-layout.test.mjs
git commit -m "feat: lay out screen-facing workbench controls"
```

## Task 3: 实现 DOM 槽位控件、手势和无障碍操作

**Files:**
- Create: `app/static/workbench-slot-controls.mjs`
- Create: `tests/workbench-slot-controls.test.mjs`

- [ ] **Step 1: 建立可控时钟和最小 DOM 测试夹具**

工厂接口固定为：

```js
export function createWorkbenchSlotControls({
  root,
  canvas,
  slots = WORKBENCH_SLOTS,
  initialLoadout,
  getProjectedAnchors,
  subscribeAfterFrame,
  onCycle,
  onPreview,
  onOpenPicker,
  onHighlight,
  storage = globalThis.localStorage,
  timers = globalThis,
  matchMedia = globalThis.matchMedia,
});
```

测试夹具传入同步可推进的 `timers.setTimeout/clearTimeout`，不允许真实等待 350ms。

- [ ] **Step 2: 写失败测试，固定每帧渲染和可读标签**

第一次 `refresh()` 和每次 `subscribeAfterFrame` 回调都要：投影十个锚点、调用 Task 2 布局、更新按钮与 SVG 引导线。每个独立按钮必须包含：

```text
aria-label="后排配料 1，当前牛肉饼，轻触切换为芝士，长按选择全部材料"
```

同时用 `data-slot-id`、`data-region` 和 CSS 变量 `--slot-x/--slot-y` 表达位置，不能靠内联矩阵字符串让测试无法理解。

- [ ] **Step 3: 写失败测试，固定短按、长按和误触阈值**

测试以下完整手势：

- 单指按下并在 350ms 前释放：只调用一次 `onCycle({slotId, contentId})`。
- 按住满 350ms：只调用一次 `onOpenPicker({slotId, region})`，释放后不得再触发循环。
- 移动距离 `> 8px`：取消长按和短按，把后续拖动留给镜头。
- 第二根手指落下：取消当前按钮手势，避免与双指缩放冲突。
- `pointerdown` 后使用 pointer capture；`pointercancel/lostpointercapture/dispose` 都清理计时器和高亮。

按下时先调用 `onPreview({slotId, contentId: nextContentId})` 显示半透明候选；确认循环、进入长按选择器、取消手势或 dispose 时都必须调用 `onPreview(null)` 清除，不能把预览写入 loadout、料理状态或撤销历史。

- [ ] **Step 4: 写失败测试，固定视觉反馈和键盘操作**

按住时调用 `onHighlight(slotId, true)` 并给按钮加 `data-active="true"`；结束时恢复。`Enter`/`Space` 循环下一项，`ArrowDown` 打开完整选择器，`Escape` 关闭区域菜单。所有实际按钮都必须 `type="button"` 且可聚焦。

- [ ] **Step 5: 写失败测试，固定区域折叠入口**

布局返回 `regionFallbacks` 时显示区域按钮，例如“配料 4”；点击后展开该区域的槽位列表。列表中的每个槽位仍使用相同的短按循环和长按选择语义；关闭菜单后焦点回到区域按钮。宽度恢复后，菜单关闭并重新显示独立按钮。

- [ ] **Step 6: 写失败测试，固定引导、焦点模式和降级**

- 首次进入且 `workbench-slot-controls-onboarded:v1` 不存在时，三个代表按钮最多脉冲 3 次并显示一次“轻触切换，长按选择全部材料”。
- 写入存储后刷新不再强制展示。
- `setHidden(true)` 隐藏按钮、线条、菜单和提示；恢复后重新投影。
- 投影函数抛错或没有可用锚点时，只显示三个区域入口，不能让材料切换完全失效。
- `prefers-reduced-motion: reduce` 时不添加脉冲 class。

- [ ] **Step 7: 运行失败测试、实现并重跑**

Run:

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/workbench-slot-controls.test.mjs
```

Expected before implementation: FAIL。Expected after implementation: PASS。

- [ ] **Step 8: 提交**

```powershell
git add -- app/static/workbench-slot-controls.mjs tests/workbench-slot-controls.test.mjs
git commit -m "feat: add accessible workbench slot controls"
```

## Task 4: 用稳定 3D 锚点替换可见的小箭头模型

**Files:**
- Modify: `app/static/cooking-workbench-3d.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `app/static/condiment-tools-3d.mjs`
- Modify: `tests/cooking-workbench-3d.test.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `tests/condiment-tools-3d.test.mjs`

- [ ] **Step 1: 改写失败测试，明确每个槽位只提供锚点**

每个 station 新增稳定的 `THREE.Object3D`：

```js
station.controlAnchor;
station.controlAnchor.userData.workbenchSlotControl === Object.freeze({
  slotId: station.slotId,
  region: station.region,
});
```

断言十个锚点彼此独立、父节点是对应 `bin`/`dock`、内容切换前后对象身份和世界位置规则不变。

- [ ] **Step 2: 写失败测试，公开槽位锚点查询**

`createCookingWorkbench3D()` 新增：

```js
getSlotControlAnchors();
```

返回冻结数组，每项为 `{slotId, region, anchor}`，按 `WORKBENCH_SLOTS` 顺序排列。`createSoloCookingStage()` 透传同名方法，并保留 `stage.host.camera` 与 `stage.host.onAfterFrame` 给编排层使用。

- [ ] **Step 3: 写失败测试，旧箭头不再可见或抢触摸**

真实 workbench 的 `selectableSurfaces` 不再包含 `station-selector`；场景中不再创建其可见 mesh、材质和几何资源。`cooking-interaction-controller.mjs` 对人工构造的旧 `station-selector` 仍可兼容，避免一次删除无关协议，但正常料理台不会再触发该路径。

- [ ] **Step 4: 写失败测试，固定半透明候选预览**

新增舞台 API：

```js
stage.previewSlotContent(slotId, contentId);
stage.clearSlotContentPreview();
```

面包和配料预览由 workbench 在对应槽位上方创建透明度约 0.32、`depthWrite:false` 的候选模型；酱料预览由 `condiment-tools-3d.mjs` 在对应 dock 旁显示同样材质语义的候选瓶。预览不得替换当前实体、不得改变 `station.contentId`、stage state、loadout、层数或历史；同一时刻最多一个预览对象，切槽和清除必须复用/销毁旧对象而不泄漏资源。

- [ ] **Step 5: 写投影测试，验证锚点而不是箭头顶点**

替换现有“selector vertices 在屏幕内”断言：在两个手机视口与 8×3 镜头组合中，取十个锚点世界坐标投影，验证每个结果是有限值；离屏状态允许出现，由 Task 2 负责区域降级。

- [ ] **Step 6: 运行测试并确认失败**

Run:

```powershell
$tests = @('tests/cooking-workbench-3d.test.mjs','tests/cooking-solo-stage.test.mjs','tests/condiment-tools-3d.test.mjs')
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests
```

- [ ] **Step 7: 实现锚点、候选预览并删除旧可见选择牌资源**

面包锚点朝工作台左外侧偏移、配料锚点朝后外侧偏移、酱料锚点朝右外侧偏移。锚点 Y 必须基于 station 根节点而不是当前材料包围盒，防止切换材料时按钮跳动。

- [ ] **Step 8: 重跑测试并提交**

Expected: PASS。

Commit:

```powershell
git add -- app/static/cooking-workbench-3d.mjs app/static/cooking-solo-stage.mjs app/static/condiment-tools-3d.mjs tests/cooking-workbench-3d.test.mjs tests/cooking-solo-stage.test.mjs tests/condiment-tools-3d.test.mjs
git commit -m "refactor: expose stable workbench control anchors"
```

## Task 5: 完善完整材料选择器的键盘行为

**Files:**
- Modify: `app/static/cooking-workbench-picker.mjs`
- Modify: `tests/cooking-workbench-picker.test.mjs`

- [ ] **Step 1: 写失败测试，固定 roving tabindex**

选择器打开时，当前材料按钮 `tabIndex=0` 并获得焦点，其余可见候选 `tabIndex=-1`；若当前项无效则聚焦第一个可见候选。

- [ ] **Step 2: 写失败测试，固定方向键、确认和关闭**

`ArrowLeft/ArrowUp` 移到上一项，`ArrowRight/ArrowDown` 移到下一项，首尾循环；`Home/End` 到首尾；`Enter/Space` 选择聚焦项；`Escape` 关闭并把焦点返回画布或打开它的槽位按钮。

- [ ] **Step 3: 实现、验证并提交**

Run:

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/cooking-workbench-picker.test.mjs
```

Expected: PASS。

Commit:

```powershell
git add -- app/static/cooking-workbench-picker.mjs tests/cooking-workbench-picker.test.mjs
git commit -m "feat: add keyboard navigation to slot picker"
```

## Task 6: 接入单人料理应用、HTML 和响应式样式

**Files:**
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking.css`
- Modify: `tests/cooking-solo-app.test.mjs`
- Modify: `tests/cooking-solo-page.test.mjs`
- Modify: `tests/mobile-layout-css.test.mjs`

- [ ] **Step 1: 写页面结构失败测试**

在 `.cooking-stage` 内、`canvas` 之后加入：

```html
<div class="workbench-slot-controls" id="workbench-slot-controls" aria-label="料理台材料切换">
  <svg class="workbench-slot-controls__lines" data-slot-lines aria-hidden="true"></svg>
  <div class="workbench-slot-controls__buttons" data-slot-buttons></div>
  <div class="workbench-slot-controls__regions" data-slot-regions></div>
  <div class="workbench-slot-controls__region-menu" data-slot-region-menu hidden></div>
  <p class="workbench-slot-controls__hint" data-slot-hint hidden>轻触切换，长按选择全部材料</p>
</div>
```

根层 `pointer-events:none`，只有按钮和菜单 `pointer-events:auto`，保证其余空白仍能旋转镜头。

- [ ] **Step 2: 写 CSS 失败测试，固定手机命中区和桌面外观**

断言：

- 手机按钮最小命中区 `52px × 52px`，视觉圆盘可缩到 44px。
- 桌面视觉圆盘 40px，但伪元素或外层仍保持 52px 命中区。
- 使用 `env(safe-area-inset-*)`，按钮不会贴住刘海或底部手势条。
- `[hidden]` 和 `.is-focus-mode` 必须完全隐藏控件。
- `@media (prefers-reduced-motion: reduce)` 关闭脉冲、弹跳和引导线过渡。
- 引导线层不接收指针事件，层级低于按钮但高于 canvas。

- [ ] **Step 3: 写应用编排失败测试，固定单一更新入口**

`createSoloCookingApp()` 新增可注入参数：

```js
slotControlsFactory = createWorkbenchSlotControls
```

内部新增唯一函数：

```js
function applyWorkbenchContent(slotId, contentId) {
  stage.setSlotContent(slotId, contentId);
  loadout = saveWorkbenchLoadout(
    setWorkbenchSlotContent(loadout, slotId, contentId),
    pageStorage,
  );
  slotControls.setLoadout(loadout);
  workbenchPicker.setLoadout(loadout);
  return loadout;
}
```

短按循环和 picker 选择都必须调用它。测试一次循环后断言：3D stage、localStorage、控件和 picker 四处内容相同；既有已装盘层、历史和摄像机数据不变化。

- [ ] **Step 4: 写应用行为失败测试**

- `getProjectedAnchors()` 使用 `station.controlAnchor.getWorldPosition()`、`Vector3.project(stage.host.camera)` 和 canvas rect，输出 Task 2 所需结构；NDC 深度不在 `[-1,1]` 或屏幕外安全范围时标记 `visible:false`。
- `subscribeAfterFrame` 绑定 `stage.host.onAfterFrame` 并在 dispose 时退订。
- 槽位按下时调用 `stage.workbench.setSlotHighlighted(slotId, true)`；结束恢复。
- 槽位按下时调用 `stage.previewSlotContent(slotId, nextContentId)`；确认、取消或打开 picker 时调用 `stage.clearSlotContentPreview()`。
- 长按打开 picker 时暂停 3D 交互；关闭后恢复。
- `stage.isBurgerFocused()` 为真时 `slotControls.setHidden(true)`，退出聚焦后恢复。
- WebGL 错误或 stage 暂停时保留区域降级按钮，只有明确进入聚焦模式才全部隐藏。

- [ ] **Step 5: 运行测试并确认失败**

Run:

```powershell
$tests = @('tests/cooking-solo-app.test.mjs','tests/cooking-solo-page.test.mjs','tests/mobile-layout-css.test.mjs')
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests
```

- [ ] **Step 6: 实现应用、页面和样式接线**

不得在槽位控件里直接写存储或改 Three.js；所有变更都通过 `applyWorkbenchContent()`。保留原 `onStationSelector` 回调作为兼容入口，但真实场景已由 DOM 控件接管。

- [ ] **Step 7: 重跑测试并提交**

Expected: PASS。

Commit:

```powershell
git add -- app/static/cooking-solo-app.mjs app/static/cooking.html app/static/cooking.css tests/cooking-solo-app.test.mjs tests/cooking-solo-page.test.mjs tests/mobile-layout-css.test.mjs
git commit -m "feat: integrate 360 workbench slot controls"
```

## Task 7: 全量回归、真实浏览器验收和原链接发布

**Files:**
- Modify if required: `README.md`
- Modify if required: `docs/handoff/witch-fries-prototype.md`

- [ ] **Step 1: 运行全部 Node 测试**

Run:

```powershell
$testFiles = Get-ChildItem -LiteralPath tests -Filter *.test.mjs | ForEach-Object { $_.FullName }
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $testFiles
```

Expected: 全部 PASS，不能跳过本计划新增测试。

- [ ] **Step 2: 运行 Python 测试和静态检查**

Run:

```powershell
& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m pytest -q
git diff --check
```

Expected: PASS，且无空白错误。

- [ ] **Step 3: 用真实浏览器验收桌面视口**

启动本地服务后在 1440×900 验证：

1. 正面、左右侧、背面、俯视和低角度都能看清当前可见槽位的按钮。
2. 空白拖动仍可自由旋转；按钮轻触只切换材料，不旋转镜头。
3. 长按 350ms 打开完整 picker；轻微移动不误触，明显拖动继续旋转。
4. 切换预备材料不会改变已装盘汉堡、层数、撤销历史或镜头。
5. 聚焦汉堡时所有槽位控件消失，退出后恢复。

- [ ] **Step 4: 用真实浏览器验收手机视口和降级**

在 390×844、360×800、320×568 依次验证：

1. 390/360 宽下按钮命中区不小于 52px、互不重叠、与锚点连线清楚。
2. 320 宽下只显示三个区域折叠入口，仍能切换全部十个槽位。
3. 旋转到槽位离屏时，该槽位进入区域入口；旋转回来后恢复独立按钮。
4. 双指缩放、单指镜头旋转和槽位按钮互不抢手势。
5. 开启系统“减少动态效果”后没有脉冲和弹跳。

- [ ] **Step 5: 回归关键现有玩法**

实际完成一次 20 层以上汉堡，验证 60 层上限、自动存档、刷新恢复、撤销/重做、酱料连续轨迹、验收调参、反馈附件和高光回放。任何一项异常都必须先补回归测试再修复。

- [ ] **Step 6: 发布克隆验证**

只复制 Git 跟踪文件到现有发布克隆，不复制 `output/`、`server-selfplay*.log` 或反馈附件。发布克隆中重跑全量 Node 测试，提交并推送 `main`。

- [ ] **Step 7: 验证公开链接未变化**

打开：

```text
https://kidcadillac.github.io/threejs_burger/
```

强制刷新后确认新控件已上线、资源无 404、控制台无异常、桌面和手机都能进入料理台。

- [ ] **Step 8: 最终文档提交**

若 handoff/README 因新操作方式发生变化：

```powershell
git add -- README.md docs/handoff/witch-fries-prototype.md
git commit -m "docs: document 360 workbench controls"
```

交付说明必须列出：实际测试数字、桌面和手机验收结果、公开试玩链接、短按/长按说明，以及本轮未实现的双人复刻对决范围。

## Final Consistency Review

- [ ] 运行空缺标记扫描并确认零命中，所有步骤都含明确文件、接口、命令和预期结果。
- [ ] 对照 `docs/superpowers/specs/2026-07-22-burger-replica-duel-and-slot-controls-design.md` 的“360° 材料切换控件”逐条核对，不把对战阶段误混入本实施分支。
- [ ] 确认所有文件中的命名一致：`controlAnchor`、`getSlotControlAnchors`、`createWorkbenchSlotControls`、`applyWorkbenchContent`、`regionFallbacks`。
- [ ] 确认 `slotId`、loadout 存储键和十个槽位顺序没有发生迁移。
- [ ] 确认每个新增行为先有失败测试，再有实现和通过证据。
