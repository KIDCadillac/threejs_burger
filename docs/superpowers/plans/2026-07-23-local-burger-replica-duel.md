# 本地汉堡复刻对决实现计划

> **执行方式：** 当前任务内逐项 TDD 实现；不启用子代理，不生成截图。每个任务通过对应小测试后提交一次。

**目标：** 在现有 GitHub Pages 试玩链接中增加诚实标注为“本地双视角练习”的两轮汉堡复刻对决。一个玩家制作时另一个视角实时观察，随后隐藏原作并复刻，最后按结构、顺序、酱料、摆位和速度给出确定性评分。

**范围：** 本计划只实现同一浏览器双标签页原型。在线匹配、好友房公网后端、重连、体力、淘汰赛和找不同不在本里程碑内。

**架构：** 发起者标签页持有内存中的本地权威状态；两个玩家视角通过 `BroadcastChannel` 交换结构化动作和按角色裁剪后的视图。对局状态、原作和复刻均不写入自由料理存档。料理操作复用现有 3D 舞台，但通过专用适配器启用只读观察、阶段重置和公开快照重建。

**技术栈：** 原生 ES modules、Three.js、BroadcastChannel、Node `node:test`、FastAPI 静态资源测试、GitHub Pages。

---

## Task 1：实现确定性评分器

**Files:**
- Create: `app/static/replica-duel-score.mjs`
- Create: `tests/replica-duel-score.test.mjs`

1. 先写黄金样例测试：完全一致且 15 秒完成为 `100.0`；完全一致且 45 秒完成为 `90.0`。
2. 增加相邻两层交换、漏一层、增加重复层、空复刻的精确断言。
3. 增加酱料分组、用量比例、6×6 覆盖网格 IoU 的断言。
4. 增加 X/Z 距离与偏航角评分、确定性编辑距离回溯配对的断言。
5. 运行 `node --test tests/replica-duel-score.test.mjs`，确认先失败。
6. 实现纯函数：
   - `alignReplicaLayers(target, replica)`
   - `scoreSauceSimilarity(targetStrokes, replicaStrokes)`
   - `scoreReplicaDuelRound({ target, replica, elapsedMs, placementRadii })`
7. 保留双精度原始分，另返回四舍五入到 0.1 的展示值与五项明细。
8. 重跑测试并提交：`feat: add deterministic replica duel scoring`。

## Task 2：实现出题规则与比赛快照清洗

**Files:**
- Create: `app/static/replica-duel-rules.mjs`
- Create: `tests/replica-duel-rules.test.mjs`

1. 写测试覆盖合格原作：恰好 8 个实体层、首层下层面包、末层上层面包、中间至少 3 种夹料、至少一条酱料。
2. 写测试覆盖每种不合格原因与稳定中文提示。
3. 写测试确认竞赛快照只保留层序、X/Z/偏航、酱料轨迹摘要和锁定模型参数版本，不含撤销历史、槽位标签、教程、自由料理存档键。
4. 实现：
   - `validateReplicaOriginal(snapshot)`
   - `createReplicaCompetitionSnapshot(soloState)`
   - `createReplicaPublicSummary(snapshot)`
5. 运行 `node --test tests/replica-duel-rules.test.mjs` 并提交：`feat: validate replica duel originals`。

## Task 3：实现两轮本地权威状态机

**Files:**
- Create: `app/static/replica-duel-state.mjs`
- Create: `tests/replica-duel-state.test.mjs`

1. 写测试覆盖：
   - `lobby → creating → memorize → replicating → scoring → reveal`
   - 第一轮揭晓后交换角色进入第二轮
   - 第二轮揭晓后进入 `finished`
   - 制作者超时不合格时对手得 100 并跳过复刻
   - 主动完成与截止同时发生只结算一次
   - 重复转移保持幂等
2. 实现冻结的 `ReplicaDuelState`，含 `matchId`、A/B 玩家、轮次、角色、阶段、`phaseRevision`、开始/截止时间、两份结果和胜负。
3. 计时器只依赖注入的 `now()`，便于测试；制作和复刻 45 秒，记忆 3 秒，揭晓 8 秒。
4. 实现 `applyReplicaDuelCommand(state, command, context)`；本地 authority 也使用命令边界，不直接修改字段。
5. 实现未四舍五入得分、出题失败、复刻毫秒用时的胜负排序。
6. 运行 `node --test tests/replica-duel-state.test.mjs` 并提交：`feat: add two-round replica duel state machine`。

## Task 4：实现动作信封、幂等和按角色裁剪

**Files:**
- Create: `app/static/replica-duel-protocol.mjs`
- Create: `tests/replica-duel-protocol.test.mjs`

1. 写测试确认动作信封固定包含 `matchId`、`round`、`phaseRevision`、`actorId`、`clientActionId`、`clientSeq`、`baseServerRevision`、`kind`、`payload`。
2. 写测试覆盖重复 `clientActionId`、旧阶段、错误角色、跳号和非当前操作者动作均被拒绝且不改状态。
3. 写测试确认：
   - `creating` 时观察者只收到公开动作/公开快照，不收到答案文字。
   - `replicating` 时复刻者视图不含原作快照、原作事件、回放 URL 或自由料理存档内容。
   - `reveal` 后双方才收到可公开比较的原作和复刻快照。
4. 实现：
   - `createReplicaActionEnvelope(...)`
   - `acceptReplicaAction(authority, envelope)`
   - `projectReplicaView(authorityState, playerId)`
5. 运行 `node --test tests/replica-duel-protocol.test.mjs` 并提交：`feat: isolate replica duel player views`。

## Task 5：给现有 3D 料理舞台增加比赛适配边界

**Files:**
- Modify: `app/static/cooking-solo-stage.mjs`
- Create: `app/static/replica-duel-stage-adapter.mjs`
- Modify: `tests/cooking-solo-stage.test.mjs`
- Create: `tests/replica-duel-stage-adapter.test.mjs`

1. 先写回归测试：自由料理原 API、自动存档、撤销、聚焦编辑保持不变。
2. 写适配器测试：
   - 观察模式暂停拖放、槽位切换、参数、反馈和高光操作，但仍能转动公开观察镜头。
   - 应用公开比赛快照只重建当前可见汉堡，不触发单人存档。
   - 阶段重置会销毁上一阶段模型、选中层、酱料预览和临时 Object URL 引用。
3. 在 stage 增加最小公共能力：`setCompetitionReadOnly`、`replaceCompetitionState`、`clearCompetitionScene`；不把对局状态塞入 solo state。
4. 适配器将 stage 的确认后状态差分成结构化动作：放层、移层、换序、移动、旋转、酱料提交、完成请求。
5. 运行 `node --test tests/cooking-solo-stage.test.mjs tests/replica-duel-stage-adapter.test.mjs` 并提交：`feat: bridge cooking stage into replica duel`。

## Task 6：实现同浏览器双标签页本地 authority

**Files:**
- Create: `app/static/replica-duel-local-channel.mjs`
- Create: `tests/replica-duel-local-channel.test.mjs`

1. 用可注入的 fake channel 写测试：创建练习、加入 A/B 视角、准备、动作 ACK、视图广播、阶段 tick、主持页关闭。
2. 写测试确认参与者永远只收到 `projectReplicaView` 的结果；频道消息中不携带自由料理 localStorage 数据。
3. 实现发起者内存 authority：
   - 生成短 `matchId` 和随机 channel token。
   - `BroadcastChannel` 名称只包含随机 token。
   - 主持页每 100ms 检查阶段截止并广播裁剪视图。
   - 参与者发送动作，主持页校验并 ACK。
   - 主持页关闭后双方显示“本地练习已结束”，不伪造重连。
4. 不使用 `localStorage`、`sessionStorage` 或 IndexedDB 保存原作；页面刷新即结束本次本地练习。
5. 运行 `node --test tests/replica-duel-local-channel.test.mjs` 并提交：`feat: add local two-view duel authority`。

## Task 7：制作手机优先的对决页面与阶段 UI

**Files:**
- Create: `app/static/replica-duel.html`
- Create: `app/static/replica-duel.css`
- Create: `app/static/replica-duel-app.mjs`
- Create: `tests/replica-duel-page.test.mjs`
- Create: `tests/replica-duel-app.test.mjs`

1. 写页面结构测试，要求：
   - 明示“本地双视角练习”，没有“在线人数”“匹配成功”文案。
   - 有玩家 A/B、当前角色、阶段、45 秒倒计时、准备/完成、打开另一视角和退出按钮。
   - 390×844 下主要按钮至少 52×52，尊重安全区。
   - 制作/观察/记忆/复刻/揭晓五阶段分别有独立状态容器。
2. 写 app 测试覆盖：URL 角色参数、创建/加入、角色锁定、阶段显示、完成按钮规则、超时自动推进和错误降级。
3. 页面复用现有厨房色彩、圆角、文字层级与真实 3D 料理台，不另造无关视觉主题。
4. 手机默认只显示当前玩家完整视角；“打开另一个视角”新开同 match token 的第二标签页。桌面允许两个窗口并排观察。
5. 观察阶段隐藏材料名称、配方、参数、反馈、高光和存档入口；记忆结束后销毁原作舞台，再创建空的复刻舞台。
6. 运行 `node --test tests/replica-duel-page.test.mjs tests/replica-duel-app.test.mjs` 并提交：`feat: add local replica duel page`。

## Task 8：实现揭晓对比、分项得分和回合交换

**Files:**
- Create: `app/static/replica-duel-reveal.mjs`
- Modify: `app/static/replica-duel-app.mjs`
- Modify: `app/static/replica-duel.html`
- Modify: `app/static/replica-duel.css`
- Create: `tests/replica-duel-reveal.test.mjs`

1. 写测试确认揭晓页同时接收原作和复刻快照、同步相机角度、显示五项分数与总分，并标出漏层/多层/错序。
2. 实现一个共享旋转状态驱动两份只读 3D 舞台；不使用截图像素比较。
3. 第一轮揭晓 3 秒后允许双方继续，8 秒自动交换角色；第二轮显示最终胜负与两轮原始分。
4. 暂不把高光视频重新接回比赛阶段；揭晓页只预留“回放稍后开放”且不显示假按钮。
5. 运行 `node --test tests/replica-duel-reveal.test.mjs tests/replica-duel-app.test.mjs` 并提交：`feat: reveal replica duel comparison`。

## Task 9：接入主页、静态路由和公开部署包

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/home.css`
- Modify: `tests/cooking-solo-page.test.mjs`
- Modify: `tests/test_app.py`
- Modify: public deploy worktree files matching the source static bundle

1. 先写失败测试：主页汉堡地图增加“复刻对决（本地练习）”入口；FastAPI 和根静态路径都能访问页面与全部新模块。
2. 主页入口明确标注本地练习，不写匹配人数或在线承诺；自由料理入口保持首要且不受影响。
3. 确认 `replica-duel.html` 的所有资源使用相对路径，GitHub Pages 子路径可直接加载。
4. 运行：
   - `node --test tests/replica-duel-*.test.mjs tests/cooking-solo-*.test.mjs tests/burger-*.test.mjs`
   - `pytest -q tests/test_app.py`
5. 提交：`feat: publish local replica duel entry`。

## Task 10：全量回归、文本验收与发布

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-22-burger-replica-duel-and-slot-controls-design.md`（只更新实现状态）

1. 运行全部 Node 测试与 Python 测试，记录通过数量；不粘贴完整日志。
2. 用纯 DOM/模块测试验收两个隔离视角能完成两轮，不调用 screenshot、view_image 或浏览器截图。
3. 运行静态检查：新页面没有线上匹配假文案，复刻阶段投影视图没有 `originalSnapshot`、`originalEvents`、回放 URL 或单人存档键。
4. 验证 source worktree 只含预期改动，保留用户已有 `output/` 与 server log 文件。
5. 同步 deploy worktree，提交并通过现有 GitHub API 发布路径更新 `main`；等待 GitHub Pages workflow 成功。
6. 在手机可访问的原试玩域名下交付：
   - `https://kidcadillac.github.io/threejs_burger/`
   - `https://kidcadillac.github.io/threejs_burger/replica-duel.html`
7. 最终说明：这是本地双视角原型，好友房在线版本尚未实现；不要把本地标签页练习描述成在线匹配。

---

## 计划自检

- 与批准规格一致：先本地双视角，再单独做在线好友房。
- 不覆盖自由料理存档，不把原作写进持久化存储。
- 评分公式、两轮角色交换和信息隐藏均有纯函数测试。
- 手机页面复用现有 3D 料理台与设计语言，没有新增无关地图或主题。
- 公开链接上不会出现虚假在线人数、虚假匹配成功或未实现的高光按钮。
- 本计划不触碰用户保留的 `output/`、`server-selfplay.log`、`server-selfplay-error.log`。
