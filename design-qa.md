# 餐车卡片 Design QA

最后检查：2026-07-27

## 比较目标

- Source visual truth：`output/burger-truck-implementation/source-option2.png`
- 实现截图：`output/burger-truck-implementation/03-focus.png`
- 全屏并排比较：`output/burger-truck-implementation/qa-comparison-full.png`
- 出餐区并排比较：`output/burger-truck-implementation/qa-comparison-focus.png`
- 入场关键帧：`output/burger-truck-implementation/01-arrival.png`
- 停稳关键帧：`output/burger-truck-implementation/02-brake.png`
- 最终聚焦关键帧：`output/burger-truck-implementation/03-focus.png`

## 归一化信息

- Source 原图：852 × 1847 px。
- Source 归一化副本：520 × 1125 px。
- 实现截图：520 × 1125 px。
- CSS 验证视口：390 × 844。
- Codex 内置浏览器截图表面会返回 3 × 3 重复画面；QA 从浏览器原始截图左上角提取单一 520 × 1125 画面，并与同尺寸 Source 比较。
- 主要状态：餐车完成驶入、停车回弹和镜头推进，菜单灯箱进入循环翻面，出餐窗口与营业按钮可交互。

## Findings

当前没有未解决的 P0、P1 或 P2 问题。

- 字体与排版：保留项目现有 `Inter / PingFang SC / Microsoft YaHei` 字体栈；标题、玩法标签、营业状态和底部导航层级清楚。实现标题比概念图略小，这是保留现有首页 HUD 和轮播结构的约束，归为 P3。
- 间距与布局：整车停稳时完整可见；最终镜头裁掉轮胎并收紧到菜单灯箱、厨师双手、汉堡和出餐台。底部导航与左右地图按钮均保持可见，没有持续控件被裁掉。
- 颜色与视觉令牌：实现保持番茄红、芥末黄、暖奶油色、暖白灯光和蓝绿色背景；没有使用品牌 Logo 或麦当劳拱门。
- 图片质量与资产：餐车使用 941 × 1672 的独立栅格原画，不再使用 CSS 圆形零件拼餐车；菜单翻面使用两个 458 × 160 栅格面。窗口内没有黑色圆盘、轮胎、锅或无语义遮挡物。
- 文案与内容：`汉堡小馆`、`自由练习`、`重播进场`、`点击开门营业`、`点击关门打烊`均与当前产品语义一致。
- 状态与交互：重播不会再穿透进入料理台；重播期间两个控件会隐藏，动画结束后恢复。开门和打烊状态、文字、`aria-pressed` 与 toast 同步。
- 无障碍：按钮保留可访问名称和焦点样式；`prefers-reduced-motion` 会把长动画压缩到立即完成；装饰图片使用空 `alt`。
- 响应式：390 × 844 主视口通过；320 × 700 窄屏覆盖测试中 `scrollWidth === clientWidth`，餐车卡片和营业按钮没有横向溢出。

## Comparison history

### Iteration 1

- [P1] 重播按钮点击穿透，页面会误进料理台。
- 修复：为新控件恢复 `pointer-events: auto`，并在地图点击委托中优先处理 `data-truck-replay`。
- 复测：点击重播后 URL 仍停留在首页。

### Iteration 2

- [P2] 第一版营业 CTA 过高，会盖住出餐台上的主汉堡；镜头仍偏向整车。
- 修复：CTA 压缩为单行窄条；镜头原点下移；最终缩放从 2.08 提高到 2.32。
- 复测：最终截图中主汉堡完整可见，轮胎退出画面，菜单灯箱、厨师双手和出餐台成为主层级。

### Iteration 3

- [P2] 重播期间控件依赖透明度过渡，浏览器节流时可能提前露出。
- 修复：重播开始时给两个控件设置 `hidden`，仅在餐车动画 `animationend` 后恢复。
- 复测：入场截图中控件不可见，最终截图中控件恢复；重播和营业切换均通过。

## 浏览器验证

- 本地 URL：`http://127.0.0.1:4173/`
- 主视口：390 × 844。
- 窄屏覆盖：320 × 700。
- 已测试：签到弹窗关闭、餐车重播、重播期间控件隐藏、动画结束控件恢复、开门、打烊、页面不误跳转。
- 控制台页面错误：0。
- JavaScript 语法：通过绑定 Node.js 的 `--check`。

## Follow-up polish

- [P3] 最终近景比概念图更少显示屋顶汉堡招牌上缘；这是为了优先突出出餐窗口，可在下一轮按偏好微调缩放到 2.25–2.32。
- [P3] 主餐车 PNG 约 1.78 MB；确认画质后可转为 WebP/AVIF，减少移动端首屏流量。
- [P3] 车轮、刹停和灯箱翻页声音尚未加入。

final result: passed
