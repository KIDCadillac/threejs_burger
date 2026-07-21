# 无需 Google 的 GitHub 自动反馈设计

## 决策

反馈主线路径改为：

`游戏页面 → Cloudflare Worker → 独立的 GitHub 私有反馈仓库`

Google Drive 上传保留为可选兼容适配器，不再作为国内测试的默认路径。

不能让网页直接调用 GitHub 写接口。GitHub 写入需要具备仓库 Contents 权限的令牌；如果把令牌放在 GitHub Pages 的 JavaScript、HTML 或 meta 标签中，任何访问者都能复制并写入仓库。令牌必须只存在于服务端 secret 中。

## 为什么采用中转 Worker

- 测试手机只请求 Cloudflare endpoint，不需要登录 Google，也不需要把 GitHub token 发给手机。
- Worker 的 secret 保存一个只授权到“专用反馈仓库”的 fine-grained token，主游戏代码仓库不授予写权限。
- 一条反馈用 GitHub Git Database API 创建多个 blob、一个 tree、一个 commit，再原子更新 feedback 分支，避免每个附件产生一次独立提交。
- 用户只需在 GitHub 仓库中查看按日期/编号整理的目录；视频、截图、JSON 诊断和文字说明在一起。

## 仓库结构

建议新建私有仓库 `KIDCadillac/burger-feedback`，不要把视频提交到 `threejs_burger`，否则 Pages 代码仓库会快速膨胀。

```text
reports/
  2026-07-21/
    RPT-20260721-120001-ab12/
      report.json
      screenshot.png
      replay.webm
      README.md
```

`README.md` 显示问题说明、设备、页面版本、层数和附件链接；`report.json` 保留完整机器可读数据。

## 安全与限额

- GitHub token 只赋予专用仓库 `Contents: write`，设置到期日，并存为 Worker 加密 secret。
- Worker 允许的来源默认只有正式 GitHub Pages 域名和本地开发域名。
- 限制请求体 10MB；回放 8MB、截图 2MB、说明 2,000 字；仅接受 WebM、MP4、GIF 和 PNG 白名单。
- 每设备每日限制 20 条，并使用随机报告 ID 防止覆盖。
- 前端 upload key 只能用于区分版本和减少误调用，不能视为真正秘密；服务端仍要做格式、体积、来源和频率校验。
- 并发提交遇到 branch ref 冲突时重新读取 head 并最多重试一次；不能盲目无限重试，避免重复报告。

## 失败语义

- Worker 成功更新 GitHub ref 后才返回 `ok: true`、报告编号和仓库查看 URL。
- GitHub 写入失败时返回明确 5xx；前端缓存已经生成的视频，允许用户直接重试而不重新编码。
- 超时不能宣称“GitHub 已保存”；只显示“提交超时，附件已保留，可重试”。
- Google 适配器和 GitHub 适配器实现相同 uploader 接口，可通过页面配置切换；正式默认 GitHub。

## 部署边界

代码可以先完整实现并本地验证，但真正联通需要一次性完成：

1. 新建专用私有反馈仓库；
2. 创建只访问该仓库、仅 Contents 写权限的 fine-grained GitHub token；
3. 登录 Cloudflare，部署 Worker 并用 secret 命令写入 token；
4. 把 Worker URL 填入游戏页面配置。

这些属于账号授权，无法安全地硬编码或替用户猜测；其余实现与自动测试不依赖真实 token。

## 验收

1. 手机不访问 Google endpoint，也能提交 WebM/MP4、PNG、JSON 和 README。
2. token 不出现在构建产物、网络响应、Git 历史或浏览器存储中。
3. 一条反馈只产生一个 GitHub commit，目录与报告编号一致。
4. 错误 MIME、超限大小、非法来源、超频和错误 upload key 均被拒绝。
5. GitHub API 冲突只重试一次；网络失败后前端复用同一视频 Blob。
6. 用户在 GitHub 私有反馈仓库中可直接找到并查看每条报告。
