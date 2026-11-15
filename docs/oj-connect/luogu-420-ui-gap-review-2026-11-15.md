# 洛谷 4.20.0 题面与评测界面对齐

日期：2026-11-15。基准为本地完整上游 `v4.20.0` / `987ca974b5419230a07b59a195ec44026e16f6f4`。这是源码对照与隔离渲染验证，不代表本轮 stage 已完成真实交题验收。

## 本轮已批准修改

- 题面信息按洛谷的两列排列时间／内存限制、难度和标签。复用九级难度文字及颜色、标签类别颜色和时间／内存单位格式；缺字段不显示。其他站点可提供自己的文字、rating和颜色，不强行换算洛谷级别。当前仅洛谷供应难度／标签，AtCoder没有虚构数据。
- 操作区显示“传送至 CPH”和关联文件名的提交按钮，补齐CPH图标与纸飞机图案。CPH图标直接迁入上游 `cphIcon.tsx`；纸飞机为本地简单矢量，不增加图标运行库。提交语言、源码快照和发送流程不改。
- 复用上游 `Spinner` 与已有 `common.css` 转圈样式：正在跟踪的 Judging 测试点显示蓝底白圈，已完成点显示真实结果，终态／停止跟踪后停止动画；系统减少动画设置时保留静态状态。
- 两份洛谷协议迁入 `record/data.ts` 的 `processTestcaseData` 规则：仅按官网 `testcaseGroup/testCaseGroup` 生成正在评测的点，按ID合并已有结果；无分组不伪造数量，隐藏结果不泄露卡片。
- 标签使用上游固定 `/_lfe/tags/zh-CN`，仅有标签的题目需要读取，缓存并去重；读取失败不阻断题面。CPH解析同步兼容紧邻单位，避免显示格式变更丢失实际时间／内存限制。

## 已有功能边界内的剩余差距

| 项目 | 上游证据 | 当前差距 | 本轮处理 |
| --- | --- | --- | --- |
| 整题复制 Markdown | `webview/views/viewProblem/app.tsx`、`src/features/viewProblem/webview.ts`、`src/features/viewProblem/problemMarkdown.ts` | 当前只提供代码块和样例复制，没有整题复制动作 | 记录缺口，未新增 |
| 题目附件 | `viewProblem/app.tsx` 的 `ProblemAttachments` | DTO、协议和题面未传递附件列表 | 记录缺口，下载交互尚待确定 |
| 记录中的所属题目 | `views/record/app.tsx` 的 `ProblemNameWithDifficulty` 和 `luogu.searchProblem` | 当前仅题号与原题URL，缺标题、难度配色及返回插件题面的动作 | 记录缺口，未改已有跳转 |
| 记录数值格式、分数颜色 | `views/record/app.tsx`、`src/utils/stringUtils.ts`、`shared.ts` 的 `getScoreColor` | 当前记录固定B／ms／KiB，分数配色仅按80阈值 | 记录显示差距；本轮仅对齐题面限制 |
| 最近记录入口 | `src/features/record.ts` 的 `lastRecord` | 当前recent Map和内部viewRecord动作没有公开入口 | 入口待对齐，不加入账号侧栏 |
| 默认提交语言设置 | 上游 `luogu.defaultLanguageVersion` | 当前语言偏好仅本窗口内存，重启不保留 | 持久设置待对齐 |
| 失败测试点下载 | 上游 `views/record/app.tsx`、`src/features/record.ts` | 当前没有查询／下载及落盘链路 | 候选能力；不是本轮隐含下载授权 |

建议后续优先复用整题Markdown组装、记录题目信息与格式函数；附件／失败测试点涉及下载路径和本地测试衔接，先明确操作再实施。最近记录入口继续服从“账号侧栏只管理登录”的要求。

## 已迁入与明确裁剪

已有：上游Markdown渲染、公式、代码高亮、代码块／样例复制、多语言题面、题意翻译、源码快照、O2语言项、图片验证码／留空刷新／取消、正式rid记录页、编译结果、测试点详情、源码查看、推送和终态补取。本次审查不据此推断所有网站运行状态均已验收。

明确排除：题解、比赛导航／监控、题库筛选、随机题、题单和社交。只支持C/C++、站点目录猜题、显式同源码CPH、共享浏览器Session属于已确认适配，不计为漏移植。CF的rating显示仅为共同模型支持，尚未接入CF数据源。

## 验证边界与账本

`tmp/oj-connect-audit/shared-workflow/ui-align-*` 保存精确命令和结果。扩展回归覆盖可选元数据、颜色验证、官网分组合并和CPH单位；真实Chromium渲染覆盖双站明暗主题、360／460／1000宽度、标签开合、图标、旋转中间帧、减少动画和终态停止。原生Electron私有拦截Session验证标签请求去重和推送中的真实分组，不访问真实账号或交题。

保留失败：初次渲染RED发现缺少图标；首次新增减少动画断言失败，发现重复Spinner样式，删除重复声明并复用原有样式后通过。CJS夹具直接lint命中仓库禁止新增JavaScript规则，后续以同类独立Electron夹具的显式规则兼容命令复跑，不改仓库lint配置。CSS检查报告迁入样式已有自定义字体变量不在宿主白名单中、以及设计token建议，命令退出0；不将其描述为无告警。

标准交付先client类型检查、OI扩展编译，再Windows stage构建；构建结果以 `ui-align-stage.json` 为准，Portable数据保留／恢复使用本轮独立路径及 `ui-align-portable-*.log`。不制作Setup、启动产品、提交Git或自动真实交题。

最终构建前证据：扩展70项通过、双站16张渲染截图及动画状态断言通过、原生Electron夹具通过；扩展／核心类型检查、定向ESLint、CJS兼容lint、OI扩展编译通过。独立只读审查与主代理代码／截图复核未发现本轮阻塞问题。没有新增跨层依赖，前轮已通过的分层检查不冒充本轮重新执行。
