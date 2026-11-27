# Beacon 前端审查与外链修复

日期：2026-11-27（Asia/Shanghai）。负责人报告点击 Beacon 搜索列出的网页时，同时出现 BeCoder 外部网站确认和 Edge 直接打开，并授权扩展为前端整体审查、修复已知问题及清理死代码。实施基线为 `Beacon_Persona@a8d1dd9f`，应用版本保持2.2.0；[本轮计划](../../superpowers/plans/2026-11-27-beacon-frontend-review.md)记录范围。

## 审查范围与边界

主代理检查 App、扩展消息桥及原生 Webview 链路；两个只读代理分别检查设置／弹窗／密钥／工作区／权限／通知，以及 Markdown／流式内容／代码／附件／剪贴板／图标／样式及直接共享依赖。另由独立只读代理完成集成复核。删除按实际消费者确认，不按功能名称推断。

人格、九工具、模式权限、采集与三队列、Provider协议、摘要和历史格式保持。未请求模型、读取真实密钥、启动 BeCoder 或构建 stage／Setup；负责人随后授权本地提交，未要求云端推送。原生弹窗和负责人实际体验另行验收。

## 已复现及修复

| 优先级 | 触发、根因与影响 | 修复与回归 |
| --- | --- | --- |
| P1 | 网页点击在 App 冒泡时发送自定义 `link`，扩展直接调用 `env.openExternal`；同时原生 Webview 的 window 监听器仍发送 `did-click-link`。`preventDefault()` 不会阻止该监听器，形成确认与直开两条路径 | 删除 App 的链接拦截、扩展 `link` 接收分支及独占 URL 字段。统一沿原生 Webview→MainThreadWebviews→opener；真实原生 `handleInnerClick` 接入生产bundle回归，覆盖正文／来源、嵌套span、鼠标／Enter和页内锚点。真实扩展旧消息回归确认不再调用直开API |
| P2 | 不同附件ID包含相同图片内容，a→b→a切换时，尺寸被重置为1；缓存使dataURL相同，复用img不再触发load，预览永久缩成1px | 图片节点按附件ID重建，重新取得自然尺寸；生产附件回归反复切换同内容附件并核验显示宽高 |
| P2 | 密钥复制／编辑／删除按钮使用 `visibility:hidden`，不在Tab序列，仅鼠标悬停可达，与既定键盘访问合同冲突 | 用透明度和指针控制保留鼠标隐藏，`:has(:focus-visible)`在键盘焦点进入时显示。覆盖Tab／Shift+Tab／空格复制，并保留鼠标点击后移出隐藏规则 |
| P2 | 纯文本暂停回答继续时已有旧text；新请求首次输出前重连，活动组件因已有text提前返回，隐藏重连反馈 | 提前返回排除当前retry；回归确认保留旧正文时显示重连，恢复追加后清除提示 |
| P3 | 设置页忽略宿主 `context.runtimeBusy`，用户程序运行时测试按钮仍可用，点击后才被宿主拒绝 | 将runtimeBusy并入现有测试忙碌状态；中英文生产界面验证测试禁用、普通地址与模型编辑可用、结束后测试恢复 |
| P2 | 最终复核发现，更换密钥／首次确认模型仍会自动发起检测；程序在保存等待期间开始运行时，旧回调也可能使用过期busy，保存成功后却进入宿主拒绝 | 自动检测读取最新busy引用，忙时结束设置流程、提示已保存及稍后主动检测；覆盖更换密钥、首次模型确认及保存期间状态改变，空闲后不重放 |

每项新增缺陷回归均先在未修实现上观察到预期失败，再由最终实现通过。外链回归直接使用仓库当前原生处理函数，不把普通浏览器默认导航当作宿主行为。保留原生可信域及工作区信任配置语义，不另造全局确认规则；本轮消除的是 Beacon 的确认旁路。

## 已确认的清理

- 删除不再需要的 `link` 生产者、消费者和URL字段。
- 删除没有图标消费者的 `attach`、`wrap`；重复的 `codeCopy`统一为已有同形 `copy`。
- 删除无消费者的 `.markdown .inline-code`、旧 `.model-parameters`、`.parameter-field`、`.parameter-toggle`、`.parameter-input`、`.parameter-fixed`、`.settings-link`及其从属规则。
- `.parameter-heading`仍有当前参数面板消费者，`notebook-edit`仍用于合法历史活动展示，`.message-status`仍用于暂停状态，均保留。
- 独立工作区渲染测试原缺SVG loader，无法装入现有眼睛图标；测试入口对齐生产的dataurl loader后通过，不修改工作区产品行为。

## 负责人追加的工具栏修复

执行中负责人追加两项界面修复，范围扩至原生问题工具栏和Runner／Setup命令显示：

- **Get Problem悬停变暗。** 图标使用label的background-color填充SVG蒙版；全局workbench的hover选择器优先级更高，将填色覆盖为悬停底色，浅色 `#424242→#e8e8e8`、深色 `#cccccc→#383838`。只对该图标填色加 `!important`，保留split父容器及下拉箭头的原生悬停反馈。新增 `npm run test-toolbar-hover` 加载当前源CSS、实际图标和贡献的真实样式表达式，在Chromium中覆盖鼠标hover／按下态及浅深色；先失败再通过。
- **悬停品牌前缀。** Runner／Setup命令将“BeCoder:”／“BeCoder IDE:”直接写在中英文title中，扩展菜单系统把title用作tooltip。移除操作title中的前缀，移入command.category，保持命令面板分类、命令ID、快捷键和操作。OI边界回归覆盖两种语言、每项命令与分类，先失败再通过。没有全局替换产品、笔记或扩展名称。

## 验证

| 检查 | 本轮结果 |
| --- | --- |
| Beacon typecheck、生产build、strict lint | 退出0；strict lint无警告 |
| 完整Node套件 | 404项，22 suites，零失败／跳过／取消 |
| 生产Webview与内容回归 | `test-render`退出0；中英文、浅深色、宽窄布局、模型配置、历史／草稿／编辑、滚动、流式代码／公式等，以及新增链接／密钥／运行门禁回归通过 |
| 附件与重连回归 | `test-attachments-render`退出0；预览、缩放拖动、同内容缓存切换、旧正文继续重连及恢复反馈通过 |
| 独立工作区回归 | 修正测试入口后退出0；展开／恢复中间帧、锚点、窄栏和reduced-motion检查通过 |
| Scoped stylelint | 退出0，但不是零诊断：当前216处未知变量诊断（基线219处）及264条设计token建议；同一变量检查器比较未新增未知变量，未借此重写既有视觉 |
| 原生源码类型与lint | 客户端typecheck退出0；修改的原生组件、边界测试、新增TypeScript测试脚本及lint配置定向strict lint退出0 |
| 工具栏与清单 | 源CSS的真实Chromium hover／pressed检查退出0；追加历史裁剪前33项OI扩展边界通过，追加后的34项最终结果见下节 |

## 后续追加：移除重复历史入口与指定悬停文案

负责人指出上方搜索栏已有类似入口，要求删除浏览器工具栏历史按钮及相关冗余能力。删除ShowHistory命令、Ctrl+H／macOS Ctrl+Y绑定、专属工具栏组、独立文件／网页混合管理picker及日期分组／批量删除／最近文件服务接线；导航条不再为历史按钮保留最少内联项。picker专属的12个中文翻译键也删除，完整目录与打包JSON哈希按原算法重算，同步组件清单和包校验器的精确pin，保留上游原始VSIX来源哈希。

共享BrowserHistoryStore、会话范围、地址栏最近访问／历史建议、单条删除、favicon／去重和容量设置保持。上方Ctrl+P继续沿原生AnythingQuickAccess与编辑器HistoryService；它是最近编辑器／文件入口，不承诺包含全部网页访问。当前[使用指南](../../getting-started.md#首页与浏览历史)已同步，历史设计／计划不重写。

截图指定的两个区域另补真实MenuEntryActionViewItem组件检查，直接从中英文贡献清单读取操作标题，核对传给managed-hover的正文及无障碍名：

| 按钮 | 中文悬停正文 | 英文悬停正文 |
| --- | --- | --- |
| 显示文件 | 显示所有文件 | Show All Files |
| 隐藏文件 | 隐藏配置和可执行文件 | Hide Configuration and Executable Files |
| 运行 | 运行 (F6) | Run (F6) |
| 带输入运行 | 使用输入文件运行 (Shift+F6) | Run With Input (Shift+F6) |

均无BeCoder／BeCoder IDE前缀；快捷键由原生keybinding服务追加。测试使用实际菜单项组件和受控hover接收器，不声称已验收安装版气泡位置／截断或用户重映射快捷键。

本轮客户端类型检查、仓库标准转译及完整分层检查退出0；隔离Electron组件测试12项通过（含1项框架状态检查、5项历史建议／命令裁剪、1项双语hover、5项浏览器外观），无失败。34项最终OI边界、404项Beacon回归及改动strict lint通过。Electron组件日志有既有vm提示和file测试页不能加载vscode-file图标的CORS信息；本次图标实际填色／视觉以此前加载真实图标的Chromium测试为证，不把该资源失败算作完整图标渲染验收。

验证初次遇到新测试run参数缺失、Electron测试读源清单的导入约束，以及移除翻译后语言包pin需同步，均已对应修正并重跑。最终独立只读复核确认共享消费者、12项组件日志及34项边界结果，并重新枚举91份语言包文件核对两项完整哈希，未发现源码阻塞问题。负责人随后明确授权将本轮源码及记录作本地commit；未清除用户浏览记录、重建stage／Setup或推送云端。本次源码尚未进入先前2.2.0安装包。

外部证据目录为 `C:/Users/Bc/.codex/visualizations/2026/11/27/01a21b48-48ad-7080-8994-4e11d8e33f3a/beacon-frontend-review`，含冻结命令、`checks.jsonl`、各次日志及stylelint基线比较。完整测试失败与恢复保留：旧link断言残留在首轮完整UI重跑中失败，改由原生链路回归覆盖；独立工作区首次因测试loader缺失失败，属于测试编排问题；日志尾部打印曾遇Windows编码错误，已改用UTF-8，不把这些尝试算作通过。

独立最终复核发现的自动检测遗漏已按上述回归修复；主代理随后对全部最终差异作只读复查，涵盖需求、消费者、权限、失败／取消、双语及验证边界。文档结构与diff检查退出0。新增测试脚本首轮未正确解析模板形式命令ID、通知断言匹配两个合法显示位置，以及JavaScript脚本不符合仓库新增文件规则的失败均保留；修正为精确定位、TypeScript及现行版权规则后重跑通过，不作为产品失败或早期通过证据。

以上headless及源码证据不代表原生弹窗、实际系统浏览器、真实模型或负责人视觉体验通过；现有stage和Setup没有本轮修改。
