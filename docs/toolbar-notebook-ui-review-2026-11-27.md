# 工具栏与 Notebook 调整

日期：2026-11-27（Asia/Shanghai）。基线 `Beacon_Persona@61b4b5fc`，接续已完成的[设置本地化修复](settings-localization-review-2026-11-27.md)。本批源码均未提交，旧 stage／Setup 不包含这些修改。

## 入口与边界

- Runner 扩展将两个编辑器标题动作合为一个 submenu，桌面贡献通过 `IActionViewItemService` 接入原生 `DropdownWithDefaultActionViewItem`，无自绘控件 CSS。下拉顺序为 Run、Run With Input，主动作始终为 Run；英中文标签和 F6／Shift+F6 沿用原命令。编译、进程、输入输出及忙时拒绝合同未改。
- OJ Connect 的共用 `oj-connect.svg` 改用现有提交按钮 `SubmitIcon` 完全相同的 Font Awesome 纸飞机 path／viewBox。活动栏、Get Problem 和原生题目动作复用该资源；提交按钮本身不改。保留主题 mask、原悬停填色修复、透明背景，以及 Fonticons CC BY 4.0 来源和许可，不增加运行时依赖。
- BeCoder Notebook 的 Markdown 运行图标实际来自 `NotebookRunCellsInSection` 的单元格标题菜单。该菜单现排除 `becoder-notebook`，删除失去消费者的 `executeSectionCondition` 导出；共享 section 命令、Outline／StickyScroll、Markdown 编辑／完成／渲染、input 执行和普通 ipynb／其他 Notebook 仍保留。
- 账户可见性原有默认即为 `false`，活动栏和标题栏共同使用 `isAccountsActionVisible`。检查未发现其他默认开启路径；补真实活动栏与内存 profile 回归，保留用户显式显示选择及原生菜单开关，不迁移或读取真实用户数据。

## 源码验证

最终客户端类型检查、标准转译、相关 strict lint（零 warning）、formatter 与完整分层检查通过。隔离 Electron 共 51 项通过（含框架 guard），覆盖设置切换及 118 项清单 en→zh-cn→en、原生 Run 分体 DOM／菜单顺序／双语／主动作／键盘、Markdown 菜单与真实完成／渲染处理器，以及账户默认隐藏和菜单切换。Node 的 OI 边界、图标与设置资源共 43 项通过。

Runner 生产 bundle、OJ 类型检查通过。实际新 OJ 资源的浅深主题 Get Problem 悬停／按下／下拉填色回归通过；16／24 px 纸飞机与提交图形 alpha 比较及截图保留在证据目录。

最终独立只读源码复核覆盖菜单注册与释放、固定主动作、Notebook 共享能力、图标许可、账户偏好及设置切换边界，未发现阻塞问题。主代理也单独完成最终差异与验证证据检查。

Markdown 回归先复现按钮未隐藏，再通过最小菜单修复转绿。旧 Runner 边界测试仍期待两个标题按钮，已改查 submenu 内的原命令。测试 fixture 类型／参数和一次 Windows `.bat` 路径分隔符调用失败均已在所属层纠正、重跑；原失败日志保留，路径调用属于编排失败。Electron 有既有 vm 提示，不将其描述为零诊断。

证据目录：`C:/Users/Bc/.codex/visualizations/2026/11/27/01a21b48-48ad-7080-8994-4e11d8e33f3a/toolbar-notebook-ui`，包括命令计划、逐次台账、日志和图标截图。组件测试不替代新 stage 的实际菜单外观与产品体验验收。本批未构建 stage／Setup、启动日常产品、访问账号／网站或执行 Git 写操作。
