# AI Translator
极致轻量（零框架）本地运行的多模型翻译应用。

## 状态概览 (截至 v0.4 开发快照)
已具备：
- OpenAI Responses / Chat Completions 双模式（显式选择 & 自动回退）
- Claude Messages 非流式 + 流式
- 流式渲染（SSE 解析 + rAF 批量写入）与取消(Esc / 再次点击)
- 失败自动重试与流式失败回退非流式
- previous_response_id 占位链路 (storeResponses 开关)
- 外部 `default.prompt` 动态加载（Prompt 现保持“原样”传递，无截断/裁剪）
- API Key & 主密码本地 PBKDF2(150k)+AES-GCM 加密存储（启用主密码后二次混合）
- 普通导出 / 安全导出（去除密文）；导出包含加密元数据便于跨设备恢复
- 支持通过文件或 URL 导入配置
- 设置模态化、掩码显示、基础校验
- 构建时注入版本号 + 构建时间（UTC+8 计算后输出，不含 “UTC+8” 文本，避免多余字符）
- CSP 无 inline 脚本（所有脚本均外部文件；移除临时 build-info 内联/外链脚本）
- PWA 支持（manifest + service worker 缓存）

待办（v0.5+）：responses 列表与清理、Threat Model 文档、主密码 session-only 选项与强度提示、测试与体积守护脚本。

## 快速开始
1. 克隆或下载本仓库，使用任何静态服务器访问 `index.html`（避免 file:// 造成的跨域限制）。
2. 打开右上角“设置”模态：
	- Base URL：对应 OpenAI / Claude 兼容地址（默认 `https://api.openai.com/v1`）。
	- API 类型：`openai-responses` / `openai-chat` / `claude`。若选 responses 且出现不支持错误会回退 chat。
	- 模型：例如 `gpt-4o-mini` / Claude 对应模型。
	- （可选）主密码：启用后本地存储的 API Key 需要此密码解锁。
3. 保存后在主界面左侧输入文本，按 Ctrl+Enter 或点击“翻译”开始；流式中再次点击或 Esc 取消。
4. 结果区域可手动复制；“清空”仅清除当前输入/输出，不影响配置。
5. 通过设置中的“导出配置”或“安全导出”备份，导入时可选择文件或 URL，需输入主密码完成验证。

## 安全设计摘要
- API Key 永不明文落地：未设主密码时使用内置混淆基底派生；设主密码时混合用户输入。
- 加密格式：`{v:1,key,chk}` + AES-GCM(随机 salt/nonce)，`chk` 为 SHA-256 前缀校验位。
- 主密码自身单独 AES-GCM 混淆加密存储（未来可选仅会话保留）。
- 导出：默认含密文；安全导出清空 `apiKeyEnc` 但仍携带 salt/nonce 元数据，便于导入后直接解密。
- Prompt 不再裁剪或重写，避免因模板更改导致语义损失。
- CSP：`script-src 'self'`，无 inline；使用 `textContent` 写 DOM，避免 XSS 注入点。

## 构建与打包
使用 `esbuild` 零插件脚本：`scripts/build.mjs`。

### 安装
```
npm install
```

### 构建
```
npm run build
```
输出位于 `dist/`，包含：HTML / css / assets / default.prompt / 打包产物 js。构建脚本会写入版本号与构建时间（用于页眉显示）。

### 开发（监听）
```
npm run watch
```

### 本地预览
```
npm run preview
```
默认端口 5173，可通过 `PORT=8080` 环境变量修改。

### 清理
```
npm run clean
```
支持 Windows 可能的 EPERM 重试与 `--no-clean` 选项（保留上次构建）。

### 调整入口
新增入口脚本请修改 `scripts/build.mjs` 中 `entryPoints`；如需产物加 hash，可调整 `entryNames` 并同步 HTML 引用（当前保持短路径以减小字节数）。

## Roadmap 摘要
- v0.4 安全基础（已完成核心）
- v0.5 responses 管理 / Threat Model / session-only 主密码
- v0.6 移动适配
- v0.7 测试与性能基线

详细任务进度及 Changelog 参见 `INIT.md`。

## 部署
项目配置了 GitHub Actions 自动部署到 GitHub Pages。当代码推送到 `main` 分支时，会自动执行以下步骤：
1. 安装依赖 (`npm ci`)
2. 构建项目 (`npm run build`)
3. 将 `dist/` 目录部署到 GitHub Pages

部署后的应用可通过 `https://<username>.github.io/AI_Transtor` 访问。

## 许可
（未指定，可按需要添加 LICENSE 文件）

## 贡献
当前单人迭代；欢迎提出 Issue / 建议（体积与安全优先）。

---
若关注体积/安全建议：1) 定期统计打包大小；2) 避免引入第三方库；3) 严格限制 DOM 注入路径。
