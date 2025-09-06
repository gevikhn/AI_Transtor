# AI_Translator INIT

> 目的：快速落地一个 **HTML5 极致轻量翻译应用**（零框架、零打包），基于设计文档 v0.1。此 INIT 文档用于：统一目标、约束、迭代节奏、任务拆分、质量门槛与协作规范。

---
## 1. 项目目标（Mission）
仅做高质量多语文本“翻译”功能，确保：
- 极轻量：体积预算 HTML<10KB / CSS<8KB / JS<25KB（未压缩）
- 零依赖：Vanilla HTML/CSS/ES Modules
- 即开即用：静态托管可运行
- 安全最小：本地配置 + 主密码加密（可留空使用默认密钥），不存储原文
- 流式体验：SSE 快速反馈，可取消

---
## 2. 范围（In / Out）
In：配置管理、OpenAI Responses、Claude Messages、流式解析、主密码加密、会话(previous_response_id)、导入导出、基本 PWA。
Out（首阶段不做）：术语表/不翻译词、批量并发翻译、历史记录数据库、复杂 UI 框架、服务端中转实现。

---
## 3. 基线架构
```
/              # 静态根
  index.html            # 主页面（含设置模态）
  default.prompt        # 外部默认 Prompt 模板
  css/base.css
  js/config.js          # 配置 + 加密 + 自动解锁
  js/prompt.js          # 模板渲染
  js/api.js             # OpenAI/Claude + 流式 + 回退 + 重试
  js/utils.js           # SSE 解析 / token 估算 / 杂项
  js/session.js         # previous_response_id 跟踪
  js/ui-translate.js    # 翻译界面逻辑
  js/ui-settings-modal.js # 设置模态（替代旧 settings 页面）
  (deprecated) js/ui-settings.js # 旧独立设置脚本（待清理）
  INIT.md
  html_5_极致轻量翻译_app｜设计文档_v_0.md
```

---
## 4. 迭代里程碑（Milestones）
| 版本 | 目标 | 验收标准 (DoD) |
| ---- | ---- | -------------- |
| v0.1 | 基础非流式 OpenAI 翻译 | 配置保存；提交文本返回完整译文；错误提示；无控制台报错 |
| v0.2 | 流式 + 取消 + 快捷键 | SSE 增量输出；Esc 取消立即停止；Ctrl+Enter 触发 |
| v0.3 | Claude 适配 | 切 Claude 能流式；事件正确拼接；错误分类 |
| v0.4 | 安全基础强化 | API Key 全量加密（含未启用主密码时默认混淆）；自动解锁；设置模态化；掩码显示；OpenAI Responses/Chat 双模式；完整 Prompt 保留；构建版本+时间注入；CSP 移除 inline |
| v0.5 | 会话与清理 | previous_response_id 稳定链式；（可选）responses 清理占位；UI 列表 |
| v0.6 | PWA & 移动 | manifest+sw；离线加载壳；移动端布局无溢出 |

---
## 5. 任务拆分（Backlog）
### 5.1 基础
- [x] 建立 HTML 骨架 (index/settings)
- [x] base.css 原子化变量 + 暗色/高对比度切换占位
- [x] config.js load/save 验证
- [x] prompt.js 基础模板渲染
- [x] api.js OpenAI 非流式实现
- [x] ui-translate.js MVP 绑定
- [x] 错误分类（网络/鉴权/超时）

### 5.2 流式与性能
- [x] SSE 通用解析（行缓冲 + event/data） (2025-09-04 完成)
- [x] OpenAI Responses 流式适配 (2025-09-04 完成)
- [x] rAF 批量写入 (2025-09-04 完成)
- [x] AbortController + Esc 取消 (2025-09-04 完成)
 - [x] 重试逻辑（幂等） (2025-09-04 完成)

### 5.3 Claude 与回退
- [x] Claude 消息事件解析 (message_start/content_block_delta/stop) (2025-09-04 完成)
 - [x] 流式失败回退非流式 (2025-09-04 完成)
 - [x] Token 粗估 (chars/4) (2025-09-04 完成)

### 5.4 安全与会话
- [x] 主密码设置 UI（初版，掩码显示） (2025-09-04)
- [x] PBKDF2 + AES-GCM 加密/解密封装 (150k 迭代) (2025-09-04)
- [x] API Key 无主密码时仍统一加密（默认混淆密钥） (2025-09-04)
- [x] 自动解锁（getApiKeyAuto）(2025-09-04)
- [x] storeResponses 占位记录 + previous_response_id 写入 (2025-09-04)
- [x] 设置页面模态化 + 掩码显示 ****** (2025-09-04)
- [x] 安全导出（剔除密文） (2025-09-04)
- [ ] 删除会话（远端 DELETE，等待接口策略）
- [ ] responses 本地列表 UI / 清除按钮
- [ ] 主密码仅本会话记忆（sessionStorage 选项）
- [ ] 主密码变更重新加密流程（若缺明文提示重录）
 - [x] 主密码变更重新加密流程（若缺明文提示重录） (2025-09-04 完成)
- [ ] 主密码强度指示与建议
- [ ] Threat Model 文档（攻击面 & 建议）
- [ ] 导入/导出 JSON 版本校验
 - [x] 导出包含加密元数据 (__apiKeyMeta / __masterPasswordMeta) (2025-09-04 完成)

### 5.5 PWA & 优化
- [ ] manifest.json + icons 占位
- [ ] service worker 静态缓存
- [ ] 移动适配（textarea 自适应 + 视口）
- [ ] CSP 说明文档（README 段落）
 - [x] 移除 inline 与临时 build-info.js 引用 (2025-09-04 完成)

### 5.6 QA & 辅助
- [ ] 简易测试页面 /tests (可选)
- [ ] SSE 解析单元测试（mock 文本片段）
- [ ] 加密模块测试
- [ ] 大文本性能手测脚本 (生成 10k+ 字串)

---
## 6. 代码风格与约定
- 命名：camelCase；类型用 JSDoc 注释（保持零构建）
- 模块：每文件单一职责；顶层只暴露必要函数
- 错误对象：`name` 字段分类；message 面向用户友好
- DOM 选择：使用 data-* 选择器，避免复杂层级
- 不使用任何第三方库（除浏览器内置）

---
## 7. 配置键（localStorage）
`AI_TR_CFG_V1` : JSON 序列化 `AppConfig`（包含：apiType, baseUrl, apiKeyEnc, masterPasswordEnc(可选), model, targetLanguage, promptTemplate, stream, temperature, maxTokens, timeoutMs, retries, storeResponses）
`AI_TR_ENC_META_V1` : 加密所需 salt 与 nonce（不含主密码）
`AI_TR_SESSION` : 会话与 response 追踪（previousResponseId, storedResponseIds[]）

---
## 8. 安全策略
- 不持久化源文本与译文（仅 textarea / runtime）(已移除旧的 AI_TR_LAST_INPUT / AI_TR_LAST_OUTPUT 持久化)
- API Key 统一加密存储：未启用主密码时使用默认混淆密钥；启用时混合用户主密码
  - 加密格式固定：JSON {v:1,key,chk} + AES-GCM；不再兼容旧纯文本格式（项目未发布，无迁移需求）
- 主密码采用单独 AES-GCM 混淆加密 (masterPasswordEnc)，不再明文存储（计划：可选仅会话记忆 + 强度提示）
  - 若检测到 legacy 明文 masterPassword（早期调试遗留），会即时迁移为 masterPasswordEnc 并移除明文字段
- 自动解锁：调用前透明解密，无需用户重复输入
- 掩码显示：UI 不回显已保存密钥/主密码真实值
- 导出：普通导出含加密密文；安全导出剔除 apiKeyEnc
- CSP（初版已加）：`default-src 'self'; connect-src 'self' https:; script-src 'self'; style-src 'self' 'unsafe-inline'` （后续移除 inline）
- 防 XSS：仅使用 `textContent` 写入；不插入未信任 HTML
- 密码派生：PBKDF2(SHA-256, 150k) + AES-GCM(256)
- 风险提示：主密码本地存储可能被物理访问窃取（未来改进：session-only / WebAuthn）

---
## 9. 风险矩阵（Top 6）
| 风险 | 等级 | 缓解 |
| ---- | ---- | ---- |
| 主密码本地持久化被窃取 | 中 | 计划新增“仅本会话”/WebAuthn；用户提示 |
| CORS / 企业代理阻断 | 高 | 提示自建反代；错误分类输出具体状态 |
| SSE 事件格式差异 | 中 | 通用解析器 + 针对 OpenAI/Claude 分支测试 |
| 体积失控 | 中 | 定期字节统计；拒绝重复工具函数 |
| 加密性能延迟 | 低 | 150k 迭代基线；可调参数（未来） |
| previous_response_id 逻辑错误 | 中 | 仅在成功完成后记录；失败不前移 |

---
## 10. Definition of Done (DoD)
- 功能点有：主流程成功 / 错误路径验证 / 取消情况验证
- 控制台无未处理异常
- 文件体积检查通过（人工）
- 手册步骤（README）可从零完成配置并获得译文
- 安全：未发现 Key 出现在网络日志之外的请求体

---
## 11. 协作与版本策略
- 单开发：主分支直接推进；里程碑完成后打 tag `v0.x`
- 提交信息：`feat: ...` `fix: ...` `refactor: ...` `docs: ...`
- 变更 INIT 或需求时在顶部添加 Changelog 小节

---
## 12. 下一步立即行动（Sprint 0）
1. (完成) 创建 HTML/CSS/JS 空文件骨架
2. (完成) 实现 config.js load/save + schema 校验
3. (完成) MVP index/settings 结构 & 手动导航测试
4. （进行中规划）进入 v0.2：SSE 流式 + 取消按键 + rAF 渲染优化

---
## 14. 进度更新规范（Continuous Update Protocol）
为保证“每次完成任务更新计划文档”要求，采用以下流程：
1. 任务开始：在本文件对应 Backlog 条目前添加 `(进行中)` 标记或在新增章节记录。
2. 任务完成：勾选复选框 `[x]`，并在 Changelog 添加条目：`YYYY-MM-DD: 完成 <任务名称>`。
3. 范围变更：新增或下调任务时，说明原因（性能/安全/体积/需求变更）。
4. 里程碑发布：在 Changelog 加 `Tag v0.x` 行；必要时锁定 DoD。
5. 废弃任务：在该行末尾添加 `(弃用)` 并移至附录“Deprecated”。

记录示例：
```
- [x] api.js OpenAI 非流式实现  (2025-09-04 完成)
- [ ] OpenAI SSE 流式实现 (进行中)
```

自动化建议（未来可选）：提供一个脚本扫描 `[ ]` -> `[x]` 差异并生成变更摘要。

---
## 13. Changelog
- 2025-09-04: 配置结构升级为多服务（services[] + activeServiceId）；主密码改为全局统一加解密，多服务 API Key 均使用同一 master key；导入/导出兼容旧结构与按服务的加密元数据
- 2025-09-04: 主密码明文迁移为 masterPasswordEnc（AES-GCM 混淆 + 校验位），移除 legacy 明文字段与旧解密分支
- 2025-09-04: INIT 初稿创建
- 2025-09-04: v0.1 基础骨架（HTML/CSS/配置/非流式 OpenAI）
- 2025-09-04: 增加流式：SSE 解析 / OpenAI Responses / rAF 渲染 / 取消(Esc)
- 2025-09-04: 加入重试逻辑（网络/超时非 4xx）
- 2025-09-04: Claude 非流式与流式适配（content_block_delta 解析）
- 2025-09-04: 流式失败自动回退非流式；Token 粗估(chars/4)
- 2025-09-04: 外部 default.prompt 模板加载 + 完整指令渲染
- 2025-09-04: 设置页面模态化（替代独立 settings.html）
- 2025-09-04: 输入/输出内容 localStorage 持久化 (2025-09-04: 后续移除，改为不存储，为符合“安全最小”原则)
- 2025-09-04: 移除输入/输出内容持久化（删除 AI_TR_LAST_INPUT / AI_TR_LAST_OUTPUT 逻辑）
- 2025-09-04: API 请求结构修复（input_text + instructions）；chat 回退兼容老模型
- 2025-09-04: 加密体系：PBKDF2 + AES-GCM；统一加密（含未启用主密码）；默认混淆密钥
- 2025-09-04: 主密码 UI + 掩码显示 ****** + 自动解锁 getApiKeyAuto
- 2025-09-04: 安全导出（剔除 apiKeyEnc）
- 2025-09-04: previous_response_id / storeResponses 本地记录占位
- 2025-09-04: 修复：温度类型、指令截断、语言下拉为空、模态隐藏、流式使用密文 Key、主密码掩码
- 2025-09-04: 加密格式锁定 v1（含校验位），移除旧格式兼容逻辑
 - 2025-09-04: OpenAI Chat Completions 显式支持 + Responses 模式错误回退策略
 - 2025-09-04: apiType 迁移 'openai' -> 'openai-responses' 兼容处理
 - 2025-09-04: Prompt 不再裁剪（移除 sanitize 截断逻辑，保持模板完整）
 - 2025-09-04: 导出配置附带加密元数据 (__apiKeyMeta/__masterPasswordMeta)
 - 2025-09-04: 构建脚本注入版本号与构建时间（UTC+8 计算），移除外部 build-info.js
 - 2025-09-04: 移除所有 inline 脚本以满足 CSP；删除临时 build-info.js 引用

---
（本文件作为执行“索引”，保持更新。）

---
## 15. 当前进度快照（2025-09-04）
已完成（v0.1 - v0.4 范围内所有核心能力）：
- 非流式 & 流式翻译（OpenAI Responses + Claude）
- 流式回退非流式 / 重试策略 / 取消 (Esc)
- Token 粗估 + rAF 批量刷新
- 统一加密体系（API Key + 主密码 masterPasswordEnc）+ 自动解锁
- 设置模态化 + 掩码显示 + 安全导出
- previous_response_id 链接占位逻辑
- 清除输入输出持久化（符合“不存储原文”安全最小原则）

进行中 / 下阶段 (v0.5 聚焦)：
- responses 管理（列表展示与清理交互）
- Threat Model 文档初稿
- 主密码 session-only 选项 & 强度提示

后续 (v0.6+ 展望)：
- PWA（manifest / service worker / 离线壳）
- CSP 内联移除与安全文档
- 加密/流式单元测试 & 性能基准脚本

风险 & 关注：
- 主密码持久化仍是中等风险（待 session-only）
- 未加测试护栏，需后续补齐防回归
