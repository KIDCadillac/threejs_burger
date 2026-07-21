# 自动游戏反馈上传到 Google Drive

这个 Apps Script Web App 接收游戏自动生成的 GIF 回放、PNG 截图和 JSON 诊断信息，并在指定 Google Drive 文件夹中按反馈编号建立子文件夹。

管理员只需配置一次：

1. 在 Google Drive 新建“3D 汉堡测试反馈”文件夹并复制文件夹 ID。
2. 打开 `script.google.com` 新建项目，把 `Code.gs` 粘贴进去。
3. 在“项目设置 → 脚本属性”设置：
   - `FEEDBACK_FOLDER_ID`：目标文件夹 ID。
   - `FEEDBACK_UPLOAD_KEY`：自定义一串随机字符（只能降低误提交，不能替代服务端限流）。
4. 部署为 Web App，执行身份选“我”，访问权限选“任何人”。
5. 把部署 URL 和同一串上传标识分别填入 `cooking.html` 的 `feedback-endpoint`、`feedback-upload-key` meta 标签。

普通玩家之后只需在游戏内填写问题并点一次“自动上传反馈”。每条反馈会自动包含：

- `replay.gif`：最近约 6 秒的操作回放；
- `screenshot.png`：打开反馈时的游戏画面；
- `report.json`：问题说明、层数、原料库存、酱料轨迹数和设备信息。

脚本限制单个 GIF 4MB、截图 2MB，并按设备特征限制每天 20 条。公开 Web App 仍可能被恶意调用；正式大规模上线时应迁移到带验证码和 IP 限流的服务端。
