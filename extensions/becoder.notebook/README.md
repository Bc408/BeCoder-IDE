# BeCoder NoteBook

独立的 `.bcnb` 学习笔记扩展，复用 Code - OSS 原生 Notebook 编辑器。本文说明当前实现；完整产品规则见[正式设计](../../docs/beacon/notebook.md)，剩余工作和验证边界见[实现状态](../../docs/beacon/implementation-status.md)。

## 创建与编辑

先打开文件夹，再从“新建文件…”列表或“创建：新建 BeCoder Notebook”命令新建。资源管理器中新建的空 `.bcnb` 可直接打开为空白笔记；已有 `.bcnb` 与 `.bcnb-backup` 可独立打开。文件使用 version 2 单文件格式，不迁移开发期旧格式。

单元格支持 C、C++、Markdown 和独立 input（`becoder-input`）。Markdown 复用随包 KaTeX、字体与 Mermaid；图片在 Markdown 编辑态粘贴为附件，短 `attachment:` 引用和图片数据随同一次原生编辑进入撤销与保存。顶部“…”中的“设置”打开“.bcnb 支持”，可关闭图片附件粘贴；布局复用原生 Notebook 设置。其他语言可用 Markdown 围栏展示，普通编辑器及 ipynb 的语言支持不受此限制。

C/C++ 编辑器右上角提供关联笔记入口，按打开根的 `.notebook/<源码相对路径及完整文件名>.bcnb` 定位。首次创建复制当前代码，之后双方内容独立；源码改名、移动或删除不带动笔记或备份。

## 用户运行 input

在程序块下添加 input，点击 input 的运行按钮，捕获其上方最近 C/C++ 程序块与 input 的最新内容，包含未保存修改。程序块之间不共享状态，不拼接；运行不保存整本笔记，不改写原始 C/C++ 文件。每份 input 各自保留最近一次尝试的真实结果、编译时间与运行时间，重跑时替换本份旧结果。

编译复用 [Runner API 与配置](../danielpinto8zz6.c-cpp-compile-run/docs/COMPILER_SETUP.md)，每次使用独立临时目录和短相对源码名“笔记名-code序号.c/cpp”；序号只计算程序块。程序工作目录为已保存笔记所在目录，未保存笔记使用选定的打开文件夹。读取和编辑不要求 Runner，用户运行需要可用的 Runner 和工作区信任。

stdout/stderr 合并成普通连续输出，保留 ANSI 颜色，不按流染色。状态标题保持英文，控制文案跟随界面语言；程序运行上限为 2 秒、保留输出上限为 256 KiB，触限停止并如实显示结果。模型没有执行 API。已保存笔记位于当前窗口可用的 Beacon 根内时，用户运行还会形成该区的独立证据，不占 Runner/CPH 近期队列。

## Beacon 辅助与实现边界

代码或笔记选区可通过“询问 Beacon”加入可查看、可移除的草稿，由用户发送。模型仅在用户明确请求、目标明确且符合档位范围时创建或修改笔记。

已有目标空闲时，宿主暂时保护该笔记，先将最新完整编辑稿（含未保存内容、附件及真实输出）保存为同目录最近一份 `.bcnb-backup`，再通过原生编辑应用正文修改。实际输出仍由宿主维护；失败不额外回滚，反馈实际保存及未保存状态，结束后释放目标。新目标通过原生文件创建一次写入完整单元格，不先建空白占位、不创建首次备份，也不覆盖已有文件；源码关联只使用编辑器打开根，父目录冲突只返回建议。

四平台 OJ 到笔记的完整旅程、模型效果和完整首版验收仍未完成。源码与 fixture 检查不代表 GUI、安装包、模型或账号验收；图片性能与交互效果需要实际应用验证。

## 开发与许可

在本扩展目录执行 `npm run typecheck`、`npm run build`、`npm test`，复用仓库工具；测试需先构建 `dist-test`，不单独安装扩展依赖。项目验证流程见[开发指南](../../docs/development.md)。

扩展按 GPL-3.0-or-later 分发。Markdown 附件复用 MIT ipynb 渲染器，输出适配器复用 Microsoft MIT ANSI 解析和主题映射；原始版权头保留，打包包含 `dist/THIRD_PARTY_NOTICES.txt` 与 `dist/renderer.js.LEGAL.txt`，源码和测试输出不进入扩展包。
