# 悬吊出餐档口 Design QA

日期：2026-07-30

## 本轮视觉结论

首页汉堡场景不再表达“车辆开进来”，而是一个可移动的木偶戏布景：

- 只保留银色出餐窗口、菜单灯箱、厨师、卷帘和档口招牌。
- 车头、车身下半部、轮眉和前后轮全部取消。
- 一根木质操偶横杆和两根承重绳从舞台上方悬吊整块档口。
- 档口作为一个刚性整体下落、轻微过冲、递减摆动，停稳后卷帘打开。
- 横向换店仍由整排卡片负责；档口自身不再模拟车辆横向行驶。

这条结论覆盖仓库里早期“必须保留完整餐车”的旧方案。

## 同屏对比

- 旧版参考：`output/marionette-truck/final-mobile.png`
- 新版浏览器终态：`output/suspended-booth/final-mobile.png`
- 同屏验收图：`output/suspended-booth/reference-vs-suspended-booth.png`

对比图已经人工检查：新版移除了驾驶室和两只车轮，窗口宽度增加，厨师和出餐台成为唯一视觉中心；两根提线直接接到银色边框上沿，没有悬空。

## 结构检查

- 页面中的驾驶室/车身节点：`0`
- 页面中的车轮节点：`0`
- 悬吊档口可编辑层：`8`
  - `burger.camera`
  - `burger.truck`
  - `burger.frame`
  - `burger.service`
  - `burger.menu`
  - `burger.window`
  - `burger.shutter`
  - `burger.sign`
- 新边框素材：`art/home/layered-truck/silver-service-booth-frame.png`
- 提线素材：`art/home/layered-truck/marionette-rig.png`
- 浏览器破损图片：`0`

## 动画检查

- 初始高度：`cameraStartY = -165`
- 档口吊降与停摆：`bodyDuration = 2200ms`
- 总镜头阶段：`cameraDuration = 3150ms`
- 卷帘延迟：`2200ms`
- 卷帘打开：`620ms`
- 三块菜单灯箱仍按错峰循环翻面。
- 从左侧和右侧返回汉堡页都会重新触发吊降；完成后 `is-arriving` 与 `is-truck-replaying` 都会清除。
- 车轮与招牌独立弹跳参数已经从 v4 文件格式移除。

## 旧调整文件迁移

- 布局格式升级为 v4，浏览器存储键为 `burger.home.layout.v4`。
- 仍会读取 v1、v2、v3 文件。
- 导入旧文件时会主动丢弃 `burger.body`、`burger.wheel-front`、`burger.wheel-rear`，避免台式机把旧整车布局带回来。
- 其他 UI 调整和 Theatre 时间轴状态继续保留。

## 自动化验证

- Node 测试：`30/30` 通过。
- 普通首页：编辑工具不显示。
- 编辑模式：默认只显示悬吊档口相关图层。
- 左右方向键与数字小键盘 `2 / 4 / 6 / 8` 的微调能力保留。

## 后续边界

下一阶段如果做“提线木偶人物装汉堡”，只拆厨师的头、躯干、上臂、前臂和手；汉堡食材继续沿用现在的装配逻辑，不把汉堡本体做成木偶。
