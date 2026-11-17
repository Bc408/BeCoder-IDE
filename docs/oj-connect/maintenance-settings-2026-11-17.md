# OJ Connect 维护与设置实施记录

[开发入口](README.md) · [架构](architecture.md) · [前次审查](review-2026-11-17-cleanup-settings.md)

日期：2026-11-17。负责人已确认方案并允许实施。本轮修复前次审查发现、公开必要设置，保护已获认可的 AtCoder 提交链路；不重新设计认证或发送路径，不新增其他 OJ。

## 当前实现

- AtCoder 记录面板不再用固定 2 秒覆盖官网 Interval；官网未提供有效间隔时仍沿用控制器缺省策略。洛谷继续使用推送等待。
- 洛谷已有编译器偏好失效或格式无效时，打开题面保持未选择，不静默改存首项。没有偏好时仍沿用原默认行为；提交前校验本站真实可用目录。
- 正文代码、样例和编译输出的复制控件可直接通过 Tab 聚焦、Enter 复制，保留既有图标外观。
- 原生 HTML 保留清洗后的作者 ID；内部链接与目标一同加命名空间。一个题面的 HTML 内容块共享范围，Markdown 各次挂载仍独立。跨块链接、中文／百分号、输入格式及公式目标均有回归；缓存树不因挂载而修改，未知目标不能落到宿主控件。
- 洛谷会话释放风险已用真实工作台夹具复现：读取等待期间切换浏览器存储范围，旧实现会向新会话释放推送。现记录／未确认任务绑定原会话，关闭向原会话释放，跨范围读取拒绝继续，迟到结果不更新已停止记录。

本轮未增加注册表、提交策略、后台队列或跨任务预热。移除编译器内存 Map 与继续保留旧 Memento 为权威的做法；真实站点语言目录、权限和会话身份仍由原所有者提供。

## 设置与数据权威

原生设置页搜索 `OJ Connect`。以下四键分别保存上次选择的本站原始语言 ID，不在站点间转换或混用：

| 完整设置键 | 内容 |
| --- | --- |
| `becoder.ojConnect.luogu.cCompiler` | 洛谷 C 语言 ID |
| `becoder.ojConnect.luogu.cppCompiler` | 洛谷 C++ 语言 ID，可含本站 `:o2` 后缀 |
| `becoder.ojConnect.atcoder.cCompiler` | AtCoder C 数字语言 ID |
| `becoder.ojConnect.atcoder.cppCompiler` | AtCoder C++ 数字语言 ID |

四项均为 application 范围，默认空字符串。题面／提交选择写入对应用户设置；快捷键读取同一键，不另存第二份偏好。跨项目复用的是某一站点、某一语言族的个人选择，不是跨站共享一个版本。有效语法不等于版本仍受本站支持，提交始终核对实际目录。

`becoder.ojConnect.atcoder.statementLanguage` 为个人设置，默认 `en`，可选 `ja`；页面切换写回此键。缺失所选语言时只对当前题目回退，不重写偏好。`becoder.ojConnect.panelLocation` 为共同面板位置，支持 `auto/active/beside/one/two/three`；只影响新建面板，默认保留复用源码右侧组、否则并排的行为。

旧 AtCoder Memento 的 `atcoder.language.c`、`atcoder.language.cpp`、`atcoder.statementLocale` 在激活时迁入对应设置，不覆盖已有显式值（包括空值）。成功写入后删除旧键；写入失败保留未迁移值、提示重试，仍注册扩展功能。旧洛谷窗口内存无持久值可迁移。没有迁移标记、账号设置或任务恢复系统。

## 验证与限制

命令清单：忽略目录 `tmp/oj-connect-audit/fixes-settings-20261117/validation-plan.json`。每次精确命令、退出码、耗时与失败类型记录在 `tmp/oj-connect-audit/shared-workflow/fixes17-*.json` 及同名日志。

已执行 83 项扩展 Node 测试及共享内容／缓存／安全策略回归，23 项工作台 Electron 测试，扩展生产构建、双站 Chromium 页面测试、Beacon 实时公式与代码回归、客户端类型检查、OI 扩展编译、scoped ESLint、层级检查和文档检查。页面回归包含键盘复制、实际跨块锚点点击、公式、高亮、窄栏和评测动画；以最终成功日志为通过证据。先前 RED 和中间夹具定位失败均保留，不能充作通过结果。

CSS 检查器退出 0，但对既有 Webview 专用 `--vscode-font-size`、`--vscode-editor-font-family` 输出变量名提示，并建议替换既有圆角值；本轮只修改复制控件焦点可达性，不扩展改动共享样式检查器或既有视觉基线。独立只读复核发现的激活失败、无效设置与锚点边界已补修和复核。

新 stage 使用标准 Windows Gulp 任务，退出 0、耗时 161.42 秒；旧 stage 单独保留，新目标不导入旧 `data`。干净目录检查退出 0，`data` 仅含工具链和两项初始化标记，最终产物未启动。未作真实网站新提交，不把合成回归等同于负责人真实验收；未构建 Setup，未 commit／push。本轮不承诺固定提交耗时或长时稳定率。

后续轻量复查、真实 hook 和云端分支准备结果见[发布准备记录](publication-preparation-2026-11-17.md)。
