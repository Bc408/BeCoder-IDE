# Beacon Frontend Review Implementation Plan

> **For agentic workers:** Use systematic-debugging and test-driven-development. The owner directly requested implementation and frontend-wide review; proceed in the current checkout. Read-only review agents investigate separate areas, while the primary agent owns edits and validation. No Git publication or application packaging is authorized by this request.

**Goal:** 修复 Beacon 网页点击绕过宿主确认，同时审查现有前端，修复可复现缺陷并移除确认无消费者的代码。

**Architecture:** 链接由原生 Webview 与宿主 opener 处理，Beacon 不再维护第二套直开消息。其他前端修复留在各自组件与直接消息消费者中；不重写聊天、配置或权限架构。

**Tech Stack:** TypeScript、React、现有共享渲染管线、esbuild、Node tests、Playwright 生产 bundle。

**Spec:** 2026-11-27负责人本次要求：点击 Beacon 列出的网页应出现 BeCoder 外部浏览器确认，不得同时直接打开；扩展为 Beacon 前端整体 code review，处理已知问题、死代码与冗余。当前 PRD、architecture、foundation-design、implementation-status 为现行依据。基线 Beacon_Persona@a8d1dd9f，工作树干净。

## Global Constraints

- 在当前已发布功能分支开发，不自动提交、推送、新建分支、构建 stage／Setup、启动 BeCoder、读取真实密钥或请求模型。
- 保留人格、九工具、采集与权限、模型协议、压缩和历史数据；前端及直接宿主接线之外仅修复确证依赖问题。
- 保留既有视觉与中英文行为；仓库根 DESIGN.md 当前不存在，不恢复旧设计文档或凭历史记忆重设计。
- 不增加操作队列、自动重发、自动导航或网站交互；取消与迟到结果不得影响另一视图或草稿。
- 删除代码前跟踪实际消费者，不按名称猜测死代码；缓存、依赖、用户资产及生成产物不直接编辑或清理。
- 单元／headless浏览器检查不等于原生弹窗、模型效果或负责人真实体验验收。

## Review Focus

1. 搜索来源、Markdown链接、嵌套文字与键盘激活只产生一次宿主链接请求；页内锚点不发外部请求。
2. 聊天快照、导航、输入法、编辑旧问题和迟到确认不丢草稿，不误发新请求。
3. 设置、密钥与发现弹窗在取消、失败、换供应商和关闭后保有正确归属。
4. 附件预览、剪贴板、流式文本／代码和滚动监听在换消息或卸载后正确退役。
5. 可见控件、消息分支和CSS消费者一致；只清除确认不可达或冗余路径。

## Task 1: 外链单一路径

Files: `extensions/becoder.beacon/webview/App.tsx`、`src/extension.ts`、`test/render.mjs`、`test/attachments.test.ts`（后三项仍相对Beacon扩展）。

Interfaces: 真实 Webview `handleInnerClick → did-click-link → MainThreadWebviews → opener` 保持。移除 Beacon 的 `{type:'link',url}` 生产者和消费者。

- [x] 在生产bundle渲染测试接入当前原生handleInnerClick，覆盖来源链接、Markdown嵌套文字、Enter、页内锚点，并断言无第二条Beacon link消息。
- [x] 对真实扩展接收器发送旧link消息，断言不调用env.openExternal；先在旧源码确认两个回归失败。
- [x] 删除App点击拦截与扩展直开case／独占字段；不修改全局Webview或可信域规则。
- [x] 重跑上述测试，确认外链仅转宿主、内部锚点正常、旧消息不直开。

## Task 2: 全前端审查与修复

Files: `extensions/becoder.beacon/webview/*`、直接依赖的`src/extension.ts`与`test/*`；按实际证据冻结具体清单。

Interfaces: 现有组件props、宿主快照与消息归属；不增加公共协议或模型能力。

- [x] 主代理检查App及消息桥；两个只读代理分别审设置／工作区与渲染／附件，回报触发、根因和消费者。
- [x] 对每项确认缺陷先运行失败回归，再作最小修复，复测取消／失败／换视图等相关分支。
- [x] 移除确认无用的分支、字段或样式；不扩大为架构或审美重构。
- [x] 记录最终发现、处理和证据边界，进行独立只读最终复核。

## Task 3: 最终验证与交付

- [x] 预检真实命令、依赖与输入，冻结命令并记录每次失败及重跑。
- [x] Beacon typecheck、生产build、完整Node suite、strict lint。
- [x] 生产Webview渲染、内容及附件回归；相关共享检查按实际变更增加。
- [x] 文档结构与diff检查；更新当前状态及审查报告，不把headless结果写成原生验收。
- [x] 交付源码和检查结果，列明原生弹窗体验待负责人验证；不自动打包或Git发布。

## Task 4: 负责人追加的工具栏修复

负责人在执行中追加：Get Problem悬停保持图标颜色，并移除按钮悬停说明中的“BeCoder”“BeCoder IDE”前缀。仅涉及原生问题工具栏及Runner／Setup命令标题；不修改运行、拿题或快捷键行为。

- [x] 以当前源CSS和问题工具栏实际样式表达式复现浅深色hover／active填色覆盖；只固定蒙版填色，保留split父级及下拉箭头的原生反馈。
- [x] Runner／Setup中英文命令标题移除品牌前缀，品牌留在category，保留命令面板分类。补清单／双语边界回归。
- [x] 最终复核补查自动检测：密钥保存／首次模型确认期间开始运行时，依据最新busy状态跳过检测、清楚告知并由用户空闲后主动测试，不排队。
- [x] 客户端类型检查、工具栏浅深／按下态真实浏览器回归、OI清单边界、变更lint与最终Beacon检查；仍不构建stage／Setup。

## Task 5: 历史入口裁剪及指定悬停文案复核

负责人追加：移除浏览器历史按钮及重复能力，使用上方搜索栏；重点核对Explorer眼睛及Runner两个按钮的悬停效果。

- [x] 删除浏览器ShowHistory命令／快捷键／工具栏组、独立管理picker及文件／日期分组／清理／异步服务，移除为该入口保留的responsive minItems。
- [x] 保留Ctrl+P／AnythingQuickAccess编辑器最近记录、地址栏recents/history建议及其单条删除、共享历史存储／IPC／容量设置；不清用户历史。
- [x] 替换失效picker测试，覆盖建议筛选、去重、打开／删除、attach／detach与命令消失；源边界先失败再通过。
- [x] 用真实MenuEntryActionViewItem核对中英文原生managed-hover传值与无障碍名：显示所有文件／隐藏配置和可执行文件，运行(F6)／使用输入文件运行(Shift+F6)，不含品牌前缀。
- [x] 运行客户端类型、仓库转译及隔离Electron组件测试、源边界、相关strict lint和文档检查；更新当前使用指南与专属中文翻译。不构建stage／Setup或Git发布。
