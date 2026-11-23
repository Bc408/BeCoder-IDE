# BeCoder NoteBook

独立的 `.bcnb` 学习笔记扩展，复用 Code - OSS 原生 Notebook 编辑器。本文说明当前实现。

## 创建与编辑

无需打开文件夹，即可从首页、“新建文件…”列表或“创建：新建 BeCoder Notebook”命令新建未保存笔记，直接编辑，保存时选择文件名与位置。资源管理器中新建的空 `.bcnb` 可直接打开为空白笔记；已有 `.bcnb` 与 `.bcnb-backup` 可独立打开。文件使用 version 2 单文件格式，不迁移开发期旧格式。

单元格支持 C、C++、Markdown 和独立 input（`becoder-input`）。Markdown 复用随包 KaTeX、字体与 Mermaid；图片在 Markdown 编辑态粘贴为附件，短 `attachment:` 引用和图片数据随同一次原生编辑进入撤销与保存。顶部“…”中的“设置”打开“.bcnb 支持”，可关闭图片附件粘贴；布局复用原生 Notebook 设置。其他语言可用 Markdown 围栏展示，普通编辑器及 ipynb 的语言支持不受此限制。

C/C++ 编辑器右上角提供关联笔记入口，按打开根的 `.notebook/<源码相对路径及完整文件名>.bcnb` 定位。首次创建复制当前代码，之后双方内容独立；源码改名、移动或删除不带动笔记或备份。

## 用户运行 input

在程序块下添加 input，点击 input 的运行按钮，捕获其上方最近 C/C++ 程序块与 input 的最新内容，包含未保存修改。程序块之间不共享状态，不拼接；运行不保存整本笔记，不改写原始 C/C++ 文件。每份 input 各自保留最近一次尝试的真实结果、编译时间与运行时间，重跑时替换本份旧结果。

编译复用 [Runner API 与配置](../danielpinto8zz6.c-cpp-compile-run/docs/COMPILER_SETUP.md)，每次使用独立临时目录和短相对源码名“笔记名-code序号.c/cpp”；序号只计算程序块。程序工作目录为已保存笔记所在目录，未保存笔记在运行时确定所用的打开文件夹。读取和编辑不要求 Runner，用户运行需要可用的 Runner 和工作区信任。

stdout/stderr 合并成普通连续输出，保留 ANSI 颜色，不按流染色。状态标题保持英文，控制文案跟随界面语言；程序运行上限为 2 秒、保留输出上限为 256 KiB，触限停止并如实显示结果。

## Beacon 协作

Notebook可独立使用，不依赖Beacon、模型或`.beaconWork`。代码／笔记选区通过“询问 Beacon”进入可查看、可移除的草稿，由用户发送；模型在用户明确请求、目标和权限合法时才创建或改写笔记。改写空闲目标前备份最新完整稿，保真实输出，沿原生编辑／保存反馈实际状态；模型没有程序执行API。

已保存笔记在正常所选Beacon根内时，用户input运行持续产生独立近期凭证，Blackout不停止软件采集，但Beacon禁读这些持久记录。Notebook输出／备份与近期凭证各守生命周期；模型自动取材只获得正文内容投影，不从功能页、资产工具或文件JSON中的outputs／attempt／executionSummary旁读执行事实。宿主完整备份、用户编辑和真实输出保存继续保留。见[完整能力](../../docs/beacon/prd.md)的NB／NBA条目与[实施状态](../../docs/beacon/implementation-status.md)。

## 开发与许可

在本扩展目录执行 `npm run typecheck`、`npm run build`、`npm test`，复用仓库工具；测试需先构建 `dist-test`，不单独安装扩展依赖。项目验证流程见[开发指南](../../docs/development.md)。

扩展按 GPL-3.0-or-later 分发。Markdown 附件复用 MIT ipynb 渲染器，输出适配器复用 Microsoft MIT ANSI 解析和主题映射；原始版权头保留，打包包含 `dist/THIRD_PARTY_NOTICES.txt` 与 `dist/renderer.js.LEGAL.txt`，源码和测试输出不进入扩展包。
