# 可切换料理台、可变厚酱料与验收调参 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前汉堡料理台重构为左侧面包区、后排四个可切换配料槽、右侧可切换酱料区，并交付连续变厚、可堆积和可溢出的酱料，以及可在游戏内实时验收全部食材与酱料参数的面板。

**Architecture:** 用稳定的物理 `slotId` 与可变的 `contentId` 分离台面位置和材料类型；料理状态以槽位来源补货，切换槽位只改变工作台装载，不重写已经装盘的汉堡。酱料笔划保留归一化点列并增加逐点流量，渲染端把同层笔划累计到小型高度场，再生成一张连续的软质带状网格和边缘滴落。验收参数使用版本化本地配置，驱动材料模型、接触压缩和酱料几何实时更新。

**Tech Stack:** 原生 ES modules、Three.js、DOM/CSS、Node `node:test`、Python `pytest`、GitHub Pages。

---

## Task 1：稳定槽位与装载配置模型

**Files:**
- Create: `app/static/workbench-loadout.mjs`
- Create: `tests/workbench-loadout.test.mjs`

- [x] **Step 1: 写失败测试，定义固定槽位和默认装载**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKBENCH_SLOTS,
  createDefaultWorkbenchLoadout,
} from "../app/static/workbench-loadout.mjs";

test("默认装载是左侧三面包、后排四配料、右侧三酱料", () => {
  const loadout = createDefaultWorkbenchLoadout();
  assert.deepEqual(WORKBENCH_SLOTS.map(({ slotId, region }) => [slotId, region]), [
    ["bread-left-1", "bread"], ["bread-left-2", "bread"], ["bread-left-3", "bread"],
    ["filling-back-1", "filling"], ["filling-back-2", "filling"],
    ["filling-back-3", "filling"], ["filling-back-4", "filling"],
    ["sauce-right-1", "sauce"], ["sauce-right-2", "sauce"],
    ["sauce-right-3", "sauce"],
  ]);
  assert.equal(loadout["bread-left-1"], "bottom-bun");
  assert.equal(loadout["filling-back-1"], "patty");
  assert.equal(loadout["sauce-right-1"], "ketchup");
});
```

- [x] **Step 2: 运行并确认失败**

Run:
`& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/workbench-loadout.test.mjs`

Expected: FAIL，模块尚不存在。

- [x] **Step 3: 实现槽位目录、区域候选项与验证**

导出以下 API：

```js
export const WORKBENCH_SLOTS;
export const WORKBENCH_REGION_OPTIONS;
export function createDefaultWorkbenchLoadout();
export function normalizeWorkbenchLoadout(value);
export function setWorkbenchSlotContent(loadout, slotId, contentId);
export function getWorkbenchSlot(slotId);
```

规则：面包候选仅 `bottom-bun`、`middle-bun`、`top-bun`；配料候选为 `patty`、`cheese`、`tomato`、`lettuce`、`pickle`、`onion`；酱料候选为 `ketchup`、`mustard`、`house-sauce`。允许多个槽位选择相同材料，返回值全部冻结；无效或旧配置回退到该槽默认值。

- [x] **Step 4: 补充失败测试并实现本地持久化**

再测试重复选择、非法跨区域选择、部分旧配置迁移以及存储异常不影响开局。导出：

```js
export const WORKBENCH_LOADOUT_STORAGE_KEY;
export function loadWorkbenchLoadout(storage = globalThis.localStorage);
export function saveWorkbenchLoadout(loadout, storage = globalThis.localStorage);
export function resetWorkbenchLoadout(storage = globalThis.localStorage);
```

- [x] **Step 5: 运行测试并提交**

Run:
`& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/workbench-loadout.test.mjs`

Expected: PASS。

Commit: `feat: add switchable workbench loadout model`

## Task 2：料理台按左、后、右区域布置稳定物理槽

**Files:**
- Modify: `app/static/cooking-workbench-3d.mjs`
- Modify: `tests/cooking-workbench-3d.test.mjs`

- [x] **Step 1: 写失败测试，固定物理位置与查询 API**

用 `slotDescriptors` 创建料理台，断言面包槽的 X 为负、四个配料槽位于后排、酱料槽的 X 为正，并断言重复 `contentId` 不被拒绝：

```js
const workbench = createCookingWorkbench3D(THREE, { slotDescriptors });
assert.equal(workbench.getStationBySlot("filling-back-2").contentId, "patty");
assert.equal(workbench.getStationsByContent("ingredient", "patty").length, 2);
```

- [x] **Step 2: 运行并确认失败**

Run:
`& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/cooking-workbench-3d.test.mjs`

- [x] **Step 3: 重构站点描述符**

`createCookingWorkbench3D` 新增 `slotDescriptors`，每站保存：

```js
{
  slotId: "filling-back-1",
  contentId: "patty",
  kind: "ingredient",
  region: "filling",
  index: 0,
}
```

保留旧 `ingredientIds/toolIds` 入参兼容现有测试。新增 `getStationBySlot(slotId)`、`getStationsByContent(kind, contentId)`、`setStationContent(slotId, contentId)`、`setSlotHighlighted(slotId, highlighted)`；原 `getStation(kind,id)` 返回同内容的第一站。重复内容的高亮和切换必须按槽位独立；移除“材料 ID 必须唯一”的物理布局限制，但槽位 ID 必须唯一。

- [x] **Step 4: 添加每个槽位的可点击折合牌**

每站创建独立 `selector` mesh，写入：

```js
selector.userData.cookingSelectable = Object.freeze({
  kind: "station-selector",
  slotId,
  region,
});
```

选择牌在 3D 中贴近槽边，不遮挡材料；高亮只影响本槽。

- [x] **Step 5: 验证并提交**

Run:
`& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/cooking-workbench-3d.test.mjs`

Commit: `feat: arrange switchable workbench regions`

## Task 3：单人料理状态支持同类多槽、按来源补货和不停局切换

**Files:**
- Modify: `app/static/cooking-solo-state.mjs`
- Modify: `tests/cooking-solo-state.test.mjs`

- [ ] **Step 1: 写失败测试覆盖同类多槽**

创建两个牛肉饼槽，断言两个来源实例 ID 不同但 `instances[id]` 都是 `patty`。从第二槽装盘后只补回第二槽，库存只减一。

- [ ] **Step 2: 写失败测试覆盖切换不改已装盘内容与历史**

```js
const changed = setSoloStationContent(state, "filling-back-2", "cheese");
assert.deepEqual(changed.layerOrder, state.layerOrder);
assert.deepEqual(changed.history, state.history);
assert.equal(changed.stationContents["filling-back-2"], "cheese");
```

已装盘材料返回任意同区域槽时，该槽接纳返回材料并安全替换原预备源，不能丢失实例。

再执行“切换槽位 → 装盘 → 撤销 → 重做 → 重置料理”，断言 `stationContents` 始终保持最新装载。`stationContents/stationSources/instanceHomes` 不进入烹饪用 `bareSnapshot`，撤销栈只记录装盘、移动、酱料等料理动作；重置料理清空作品但保留当前装载。

- [ ] **Step 3: 实现权威槽位来源状态**

新增并冻结：

```js
state.stationContents;
state.stationSources;
state.instanceHomes;
```

`locations` 的预备区位置改为 `{ kind: "bin", slotId }`，仍接受旧 `{kind:"bin",index}` 快照并按默认槽迁移。`binSources` 继续派生“每种材料的第一来源”以兼容旧调用，不再作为权威来源。

装载配置是与烹饪撤销历史正交的会话状态：`snapshot/undo/redo/reset` 在恢复作品字段后，必须重新合并当前装载并为缺失的物理槽补齐来源实例，绝不能从旧快照回滚槽位选择。

- [ ] **Step 4: 实现装载切换和按槽补货**

导出：

```js
export function createSoloCookingState({ loadout } = {});
export function setSoloStationContent(state, slotId, contentId);
```

切换只替换还在预备槽中的源实例，不触碰 `layerOrder`、`strokes`、`history`、`future`。`placeSoloLayer` 记录原 `slotId` 并从同槽补货；`returnSoloLayer` 优先回原槽，拖到其他同区域槽时让该槽采用返回材料。

- [ ] **Step 5: 全量状态测试并提交**

Run:
`& "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/cooking-solo-state.test.mjs`

Commit: `feat: support duplicate switchable ingredient sources`

## Task 4：3D 舞台、酱料工具和选择面板接通装载切换

**Files:**
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `app/static/cooking-interaction-controller.mjs`
- Modify: `app/static/condiment-tools-3d.mjs`
- Modify: `app/static/cooking-solo-app.mjs`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking.css`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `tests/cooking-interaction-controller.test.mjs`
- Modify: `tests/condiment-tools-3d.test.mjs`
- Modify: `tests/cooking-page.test.mjs`

- [ ] **Step 1: 先写舞台失败测试**

断言舞台从持久化 loadout 创建十个物理槽、同类材料各自有独立模型；`stage.setSlotContent(slotId, contentId)` 立即替换预备区模型，装盘模型和相机不跳动。

- [ ] **Step 2: 写选择器点击失败测试**

点击 `station-selector` 时控制器调用：

```js
onStationSelector({ slotId, region });
```

不能开始材料拖拽，也不能改变镜头。

- [ ] **Step 3: 接通舞台槽位来源**

舞台查找预备站一律使用 `getStationBySlot(location.slotId)`；创建材料克隆时实例 ID 与材料类型分离。`condiment-tools-3d` 按酱料物理槽创建瓶子，允许多个槽选择相同酱料，并提供 `setToolContent(slotId, sauceId)`。

酱料工具的权威索引必须从内容 `sauceId` 改为物理 `slotId`：`getTool/setTilt/resetTilt/getDock` 都接收 `slotId`，每个工具对象同时保存 `{slotId, sauceId}`。控制器拖动时保留 `activeToolSlotId`，取瓶子姿态和归位都用 `slotId`；真正写入 stroke 时才写当前槽的 `sauceId`。测试两个槽都选 `ketchup` 时，两瓶可独立拿起、倾斜和归位。

- [ ] **Step 4: 添加手机友好的底部选择面板**

`cooking.html` 新增单一 `dialog`/bottom sheet：标题显示当前槽位；候选按钮含材料名称和当前选中标记；按钮触控高度至少 44px；含“恢复默认”与关闭。用事件委托避免每次打开重复绑定。

`cooking-solo-app.mjs` 收到舞台选择器事件后打开面板；选中后调用 loadout 保存、状态切换与舞台替换，并在面板内即时反映。关闭方式包括按钮、遮罩和 Escape。

- [ ] **Step 5: 页面、交互和舞台测试**

Run:
`$tests = @('tests/cooking-solo-stage.test.mjs','tests/cooking-interaction-controller.test.mjs','tests/condiment-tools-3d.test.mjs','tests/cooking-page.test.mjs'); & "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests`

Expected: PASS。

Commit: `feat: add in-game workbench slot picker`

## Task 5：验收调参 v2 覆盖全部材料尺寸和接触压缩

**Files:**
- Modify: `app/static/burger-tuning.mjs`
- Modify: `app/static/cooking-tuning-panel.mjs`
- Modify: `app/static/cooking-solo-stage.mjs`
- Modify: `app/static/cooking.html`
- Modify: `app/static/cooking.css`
- Modify: `tests/burger-tuning.test.mjs`
- Modify: `tests/cooking-tuning-panel.test.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Modify: `tests/cooking-page.test.mjs`

- [ ] **Step 1: 写失败测试，定义 v2 配置和 v1 迁移**

每个 `SOLO_BURGER_INGREDIENT_IDS` 都必须有：

```js
{
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  lockDiameter: false,
  contactCompression: 0,
  sinkY: 0,
}
```

读取旧 v1 时保留 X/Y/Z/sinkY 并补默认字段；无效数值钳制。顶部按钮文案改为“验收调参”。

- [ ] **Step 2: 实现直径联动与真实接触压缩**

开启“锁定直径”时修改 X 同步 Z，修改 Z 同步 X。装盘实例的可见厚度按 `scaleY * (1 - contactCompression)` 计算，接触高度也使用压缩后边界；预备区材料保持未受压形态。测试底层面包、肉饼、芝士及 20 层堆叠均无额外空气层。

- [ ] **Step 3: 调整 DOM 参数面板**

九个食材 tab 都显示宽 X、厚 Y、深 Z、锁定直径、接触压缩、接触压入。保留复制 JSON、恢复默认、本地自动保存与键盘可访问性。

- [ ] **Step 4: 测试并提交**

Run:
`$tests = @('tests/burger-tuning.test.mjs','tests/cooking-tuning-panel.test.mjs','tests/cooking-solo-stage.test.mjs','tests/cooking-page.test.mjs'); & "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests`

Commit: `feat: expand live burger acceptance tuning`

## Task 6：酱料笔划升级为连续逐点流量

**Files:**
- Modify: `app/static/cooking-solo-state.mjs`
- Modify: `app/static/cooking-state.mjs`
- Modify: `app/static/cooking-interaction-controller.mjs`
- Modify: `app/static/burger-model-3d.mjs`
- Modify: `tests/cooking-solo-state.test.mjs`
- Modify: `tests/cooking-state.test.mjs`
- Modify: `tests/cooking-interaction-controller.test.mjs`
- Modify: `tests/burger-model-3d.test.mjs`

- [ ] **Step 1: 写失败测试，定义向后兼容笔划结构**

新笔划：

```js
{
  sauce: "ketchup",
  layerId: "patty#3",
  amount: 0.5,
  points: [[0, 0], [0.2, 0.1]],
  flows: [0.25, 0.8],
}
```

旧笔划缺少 `flows` 时，读取后用 `amount` 填满；点和流量必须等长、冻结、钳制。归一化坐标范围扩大至 `[-1.25, 1.25]`，允许记录越过食材边缘的动作。

- [ ] **Step 2: 连续分段测试**

一次长拖动超过 24 点时，控制器自动结束当前段并以末点作为下一段首点；视觉连续且每段仍不超过 24 点。离开表面但仍在食材投影附近时继续记录溢出点，而不是立即断线。

- [ ] **Step 3: 流量、速度和停留测试**

逐点流量由指针压力、喷嘴倾斜、移动速度和停留时间组合：快速移动变薄，慢速/停留变厚；按住不动以 25Hz 左右继续沉积。桌面与手机无 pressure 时使用稳定默认压力。

- [ ] **Step 4: 实现并验证**

控制器只在点距达到阈值或停留沉积时追加点；动态预览更新现有对象而不是每帧新增对象。释放、取消、切工具都会完整结束最后一段。

同一提交先给 `burger-model-3d.mjs` 加数据兼容：校验器接受可选 `flows`，旧带状几何在 Task 7 完成前使用 `amount` 或逐点流量平均值渲染，不能拒绝新笔划，也不能改变旧笔划快照。增加“新 flows 笔划可立即更新舞台且无异常”的集成测试；Task 7 再替换成真正逐点变厚的高度场几何。

Run:
`$tests = @('tests/cooking-solo-state.test.mjs','tests/cooking-state.test.mjs','tests/cooking-interaction-controller.test.mjs','tests/burger-model-3d.test.mjs'); & "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests`

Commit: `feat: record continuous variable-flow sauce strokes`

## Task 7：高度场酱料、厚薄堆积和边缘滴落

**Files:**
- Modify: `app/static/burger-model-3d.mjs`
- Modify: `app/static/burger-tuning.mjs`
- Modify: `app/static/cooking-tuning-panel.mjs`
- Modify: `app/static/cooking.html`
- Modify: `tests/burger-model-3d.test.mjs`
- Modify: `tests/burger-tuning.test.mjs`
- Modify: `tests/cooking-tuning-panel.test.mjs`

- [ ] **Step 1: 写几何失败测试**

断言：同一条线的高流量顶点高度大于低流量；重复涂抹同一区域继续增高；跨边缘点产生垂直滴落顶点；酱料底面始终取目标食材表面高度，不穿入面包、肉饼或芝士；旧笔划仍可渲染。

- [ ] **Step 2: 实现每层 32×32 累计高度场**

把该层全部笔划按流量与圆形笔刷累计到 `Float32Array(32 * 32)`。每次重建仅处理该层笔划，限制最大高度并对相邻格做一次轻量平滑；高度场是派生缓存，不写入存档。

- [ ] **Step 3: 生成可变截面软质带状网格**

沿笔划切线生成左右边，宽度和高度由逐点流量及高度场决定；顶面、侧面和端盖属于同一几何体。相邻段共享缝点，重复笔划以累计高度抬升，避免 z-fighting。越过材料轮廓的网格从边缘沿 Y 方向下垂，形成连续溢出/滴落，不额外插入固定位置的酱料环。

- [ ] **Step 4: 把酱料参数加入“验收调参”**

v2 配置新增：

```js
sauce: {
  baseWidth: 1,
  heightMultiplier: 1,
  depositRate: 1,
  dripSensitivity: 1,
}
```

面板提供实时滑杆、复制和重置。调整后现有酱料立即重建。

- [ ] **Step 5: 性能与几何测试**

在 20 层、64 条笔划上断言无 NaN、mesh 数不会随指针移动无限增长、三角形和对象数量不超过既有移动端预算。

Run:
`$tests = @('tests/burger-model-3d.test.mjs','tests/burger-tuning.test.mjs','tests/cooking-tuning-panel.test.mjs'); & "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $tests`

Commit: `feat: render layered variable-thickness sauce`

## Task 8：整体验收、移动端浏览器回归和原链接部署

**Files:**
- Modify if required: `README.md`
- Modify if required: `docs/handoff/witch-fries-prototype.md`

- [ ] **Step 1: 运行全部 Node 测试**

Run:
`$testFiles = Get-ChildItem -LiteralPath tests -Filter *.test.mjs | ForEach-Object { $_.FullName }; & "C:\Users\KID\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test $testFiles`

Expected: 全部 PASS，无跳过的新测试。

- [ ] **Step 2: 运行 Python 测试与差异检查**

Run:
`.\.venv\Scripts\python.exe -m pytest -q`

Run:
`git diff --check`

Expected: PASS 且无空白错误。

- [ ] **Step 3: 用真实浏览器验收桌面和手机视口**

依次验证：左侧三面包、后排四配料、右侧三酱料；每槽独立切换且允许重复；切换不改已装盘汉堡；20 层跟随相机；快速/慢速/停留酱料有明显薄厚区别；同处重复涂抹会增厚；边缘会自然滴落；验收调参即时生效；反馈上传仍工作。

记录 390×844 和 1440×900 截图到临时验收目录，不加入仓库。

- [ ] **Step 4: 更新公网发布克隆并推送**

仅复制受跟踪的发布文件到：
`C:\Users\KID\AppData\Local\Temp\threejs_burger_deploy_20260720_175442`

在发布克隆再次运行测试，提交并推送 `main`。不得复制工作树的 `output/`。

- [ ] **Step 5: 验证原链接内容已更新**

打开：
`https://kidcadillac.github.io/threejs_burger/`

确认原链接不变、版本资源已刷新，手机端强制刷新后可见新料理台。

- [ ] **Step 6: 最终提交与交付说明**

Commit（若有文档变更）：`docs: update switchable workbench handoff`

交付说明列出：完成项、测试数字、公开链接、调参入口、尚未进入本轮的寿司地图与主页范围。
