# 主页与汉堡料理台第二轮升级实施计划

> 对应设计：`docs/superpowers/specs/2026-07-20-home-burger-polish-design.md`

## 目标

在不破坏现有自由叠放、插层、撤销和实时挤酱能力的前提下，增加料理地图主页，改善加载、镜头、聚焦展示、酱料表面贴合与汉堡模型细节，并发布到原 GitHub Pages 地址。

## 实施原则

- 每个行为先写或修改自动化测试，确认失败后再实现。
- 主页不依赖运行时脚本，避免入口页产生额外等待。
- 聚焦模式只改视图，不修改料理状态。
- 酱料预览与最终提交共用同一几何生成逻辑。
- 所有装饰模型不参与射线命中，并保持移动端几何预算。

## 任务 1：料理地图主页

文件：

- 修改：`app/static/index.html`
- 新增：`app/static/home.css`
- 修改：`tests/cooking-solo-page.test.mjs`

步骤：

1. 增加失败断言：根页面必须包含原创品牌区、可进入的汉堡卡、不可误触的寿司预告卡和响应式视口。
2. 将旧匹配入口替换为静态料理地图主页。
3. 使用 CSS 构建原创暖色料理卡片和简化的汉堡/寿司视觉，不使用第三方素材。
4. 在 `cooking.html` 加返回主页链接，并验证手机宽度下按钮可点击。

## 任务 2：加载反馈去计时

文件：

- 修改：`app/static/cooking.html`
- 修改：`app/static/cooking-loader.mjs`
- 修改：`tests/cooking-loader.test.mjs`
- 修改：`tests/cooking-solo-page.test.mjs`

步骤：

1. 把“必须存在 elapsed 元素”的测试改为“页面不显示等待秒数”。
2. 运行相关测试确认失败。
3. 移除 DOM 计时元素与逐帧秒数写入，保留内部慢网阈值。
4. 验证阶段、进度、百分比、慢网提示和错误重试仍工作。

## 任务 3：扩大镜头俯仰并加入聚焦模式

文件：

- 修改：`app/static/cooking-interaction-controller.mjs`
- 修改：`app/static/cooking-solo-stage.mjs`
- 修改：`app/static/cooking-solo-app.mjs`
- 修改：`app/static/cooking.html`
- 修改：`app/static/cooking.css`
- 修改：`tests/cooking-interaction-controller.test.mjs`
- 修改：`tests/cooking-solo-stage.test.mjs`
- 修改：`tests/cooking-solo-app.test.mjs`
- 修改：`tests/cooking-solo-page.test.mjs`

步骤：

1. 测试新镜头范围接近 1°–89°，并验证控制器仍正确限制距离。
2. 为控制器增加可恢复的镜头姿态 API，测试保存、聚焦、恢复和重复调用。
3. 为 stage 增加 `setBurgerFocus`/`toggleBurgerFocus`，测试聚焦时只保留汉堡，返回时工作台和工具完整恢复。
4. 给页面增加“聚焦汉堡/返回料理台”切换按钮，并接入 app action。
5. 切换模式时取消临时交互、隐藏落点和选中反馈，保留料理数据。

## 任务 4：表面贴合的半圆酱料

文件：

- 修改：`app/static/burger-model-3d.mjs`
- 修改：`tests/burger-model-3d.test.mjs`
- 修改：`tests/cooking-solo-stage.test.mjs`

步骤：

1. 新增失败测试：酱料几何记录其表面采样数据，最低顶点不低于对应食材表面安全间隙。
2. 新增失败测试：预览和最终提交共用同类几何，预览提升为正式酱料时不闪烁重建。
3. 将圆管替换为沿局部表面法线生成的半圆/扁圆挤酱带。
4. 提高截面平滑度和材质光泽；保持射线穿透、咬痕与释放资源行为。
5. 运行完整汉堡模型和 stage 测试，修复所有回归。

## 任务 5：汉堡模型细节与移动端预算

文件：

- 修改：`app/static/burger-model-3d.mjs`
- 修改：`tests/burger-model-3d.test.mjs`

步骤：

1. 新增失败测试：主要食材采用平滑材质，且存在面包烘烤、肉饼烤纹、番茄/酸黄瓜/生菜细节。
2. 提高主要几何分段，调整轮廓和材质参数。
3. 用实例化或复用几何增加芝麻、烤纹、籽和叶脉，统一禁用射线。
4. 运行移动端三角形、材质、几何和绘制调用预算测试；若超预算，优先复用和实例化，不删除关键细节。

## 任务 6：集成、浏览器验收与部署

文件：

- 修改：`README.md`（仅在入口或操作说明过时时）
- 同步发布文件到 GitHub Pages 部署仓库

步骤：

1. 运行全部 Node 测试和 Python 测试。
2. 启动本地服务器，在桌面视口与 390×844 手机视口验收：主页、汉堡入口、加载、自由镜头、聚焦、返回、实时挤酱和成品展示。
3. 检查浏览器控制台无错误，截取验收图。
4. 提交源代码改动。
5. 机械同步发布文件到 `threejs_burger` 的 `main` 分支，提交并推送。
6. 等待 GitHub Pages 更新，打开原公开链接验证主页和料理页；链接保持不变。

## 完成定义

- 设计验收标准全部满足。
- Node 与 Python 全量测试通过。
- 本地和线上手机尺寸验收通过，控制台无报错。
- 源工作树与部署工作树均无遗漏的未提交改动。
