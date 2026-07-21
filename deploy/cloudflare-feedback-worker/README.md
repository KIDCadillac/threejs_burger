# GitHub 自动反馈中转

这个 Worker 接收游戏生成的回放视频、PNG 截图和 JSON 诊断，在专用 GitHub 私有仓库中为每条报告创建一个目录和一个 commit。测试手机不再请求 Google。

## 安全边界

- `GITHUB_TOKEN` 只能存为 Cloudflare secret，绝不能放进 HTML、JavaScript、仓库、聊天消息或截图。
- token 使用 fine-grained personal access token，只选择专用反馈仓库，只授予 `Contents: Read and write`，并设置到期时间。
- 推荐仓库名 `KIDCadillac/burger-feedback`，保持 Private。不要把附件写入 `threejs_burger`。
- Worker 最多接受 15MB JSON 请求（包含 base64 膨胀）；原始回放 8MB、截图 2MB、说明 2,000 字。只允许 WebM、MP4、GIF 和 PNG。

GitHub 的 Git database 写接口需要仓库 Contents 写权限；Worker 用 blob → tree → commit → ref 的顺序把一条反馈原子写成一个 commit。

## 一次性准备

1. 在 GitHub 新建私有空仓库 `burger-feedback`。
2. 建立 `feedback` 分支；可先在网页创建一个 `README.md`，再从 `main` 新建该分支。
3. 创建 fine-grained token：Repository access 只选 `burger-feedback`，Repository permissions 只把 Contents 设为 Read and write。
4. 安装依赖并登录 Cloudflare：

```powershell
cd deploy\cloudflare-feedback-worker
npm install
npx wrangler login
```

5. 通过交互式命令写入 secret；命令会隐藏输入，不要把 token 写在命令参数中：

```powershell
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put UPLOAD_KEY
```

6. 检查 `wrangler.jsonc` 中的仓库名、分支和允许来源，部署：

```powershell
npm run check
npm run deploy
```

部署完成后复制 `https://...workers.dev` 地址，填入游戏的反馈 endpoint 配置。

## 可选每日计数

生产环境建议新建 Workers KV，并绑定为 `FEEDBACK_COUNTERS`。Worker 没有该 binding 时仍会进行体积、格式、来源和 upload key 校验，但不会跨请求累计每日数量。

```powershell
npx wrangler kv namespace create FEEDBACK_COUNTERS
```

把命令返回的 ID 加到 `wrangler.jsonc`：

```jsonc
"kv_namespaces": [
  { "binding": "FEEDBACK_COUNTERS", "id": "这里填真实 ID" }
]
```

KV 计数用于测试期的近似限流；如果未来对公众开放，应改用 Cloudflare 原生 Rate Limiting 或 Durable Object 做原子计数，并加入 Turnstile。

## 本地检查

```powershell
npm test
npm run check
```

测试使用假的 GitHub API，不需要真实 token，不会写入任何仓库。

## 轮换与停用

- 修改 token：重新运行 `npx wrangler secret put GITHUB_TOKEN`，无需重建游戏页面。
- 紧急停用：在 GitHub 删除 token，或删除/停用 Worker route。
- 修改允许来源后重新部署 Worker。
- 不要在排错截图中展示 Cloudflare secrets、GitHub token 或完整授权页面。
