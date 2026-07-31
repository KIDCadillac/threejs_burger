# 笔记本 → 台式机交接：B 方案木偶料理台

更新日期：2026-08-01

仓库：`KIDCadillac/threejs_burger`

开发分支：`codex/puppet-cooking-vertical-slice`

发布目标：`main`

## 这次到底改了什么

这轮实现用户选定的 B 方案第一段纵向切片：保留 Three.js 汉堡拖放内核，把料理页改造成与首页同一套视觉语言的木偶小馆。

1. 料理页由暗色调试工作台改为暖黄、奶油白、快餐红与深棕粗描边。
2. 复用首页银色档口、悬挂绳、菜单汉堡和招牌素材。
3. 新增可分段表演的厨师：身体、左臂、右臂与提线架相互独立。
4. 厨师动作接入真实舞台事件：拿取、搬运、放置、退回、失误、挤酱、庆祝。
5. 默认直接进入“小馆经典牛肉堡”，不会先闪一次配方弹窗。
6. 默认界面隐藏参数、高光、反馈等开发工具；`?debug=1` 才显示。
7. 经典牛肉堡所需的牛肉饼、酸黄瓜、洋葱等默认进入新料盒配置。
8. “细调”内新增“重做订单”，可以清空当前汉堡重新开始。
9. 修复 480 × 844 尺寸下目标卡、配方卡压进舞台的问题。

## 新增资产

- `art/cooking/puppet-chef-body.png`
- `art/cooking/puppet-chef-arm-left.png`
- `art/cooking/puppet-chef-arm-right.png`
- `art/cooking/puppet-chef-sprites.png`
- `art/cooking/puppet-chef-sprites-source.png`

资产生成方式：以当前首页厨师为严格参考，使用 ImageGen 生成纯色底的身体与双臂分件图，再移除背景并分别裁切。源图保留，方便台式机后续重新拆件或修边；游戏只加载三个透明分件 PNG。

## 关键代码

- `cooking.html`：木偶档口 DOM、订单头部、真实素材、简化工具栏。
- `cooking.css`：小馆主题、银色舞台、厨师关节姿态、桌面/手机布局。
- `cooking-puppet-performer.mjs`：舞台事件到人物姿态的映射。
- `cooking-loader.mjs`：把舞台状态同时交给木偶表演器。
- `cooking-solo-app.mjs`：经典配方默认入口、5 层进度和出餐按钮状态。
- `workbench-loadout.mjs`：经典配方默认料盒与 v2 缓存。
- `cooking-solo-autosave.mjs`：v3 存档，避免旧工作台状态污染新切片。
- `tests/cooking-puppet-performer.test.mjs`：人物状态与新料盒测试。
- `tests/cooking-puppet-wiring.test.mjs`：素材、默认入口和线路连接测试。

## 台式机接手步骤

先保护台式机本地未提交内容：

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

如果需要查看开发分支：

```bash
git fetch origin
git checkout codex/puppet-cooking-vertical-slice
git pull origin codex/puppet-cooking-vertical-slice
```

不要使用 `git reset --hard` 覆盖台式机未提交内容。

## 打开与测试

本地：

```bash
python -m http.server 4173 --bind 127.0.0.1
```

- 料理页：`http://127.0.0.1:4173/cooking.html?recipe=classic-beef`
- 开发工具：`http://127.0.0.1:4173/cooking.html?recipe=classic-beef&debug=1`
- 线上首页：`https://kidcadillac.github.io/threejs_burger/`
- 线上料理：`https://kidcadillac.github.io/threejs_burger/cooking.html?recipe=classic-beef`

## 已验收证据

- 首页与料理同屏：`output/puppet-cooking-qa/28-final-design-qa-comparison.png`
- 最终桌面首屏：`output/puppet-cooking-qa/27-final-handoff-single.png`
- 第一层面包成功落盘：`output/puppet-cooking-qa/19-final-place-single.png`
- 手机纵向布局：`output/puppet-cooking-qa/24-mobile-final-single.png`
- 完整报告：`design-qa.md`

验证结果：38/38 Node 测试通过，浏览器 0 条 error / warning，`git diff --check` 通过。

## 明确没有做完的部分

1. 番茄酱尚未纳入严格出餐校验，当前按钮按 5 层实体食材判断。
2. 顾客试吃、铃声、金币和结算演出还没有按 B 方向重做。
3. 其他三款配方仍可选择，但本轮只打磨经典牛肉堡。
4. 3D 食材模型与材质仍是原项目版本，本轮没有推翻重建。

## 下一步建议

继续做 B.1，不要立刻扩展 C：先把“番茄酱校验 → 按铃 → 厨师庆祝 → 顾客反应 → 结算”做成完整一次出餐，再决定是否进入经营系统。
