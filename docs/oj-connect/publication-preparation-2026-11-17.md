# OJ Connect 分支发布准备

日期：2026-11-17。[开发入口](README.md) · [维护与设置](maintenance-settings-2026-11-17.md)

## 范围与状态

本轮只做轻量检查、必要规范修正及发布准备。保护已验收的 AtCoder 提交路径；不增加认证、队列、预热或提交策略，不构建 Setup、不操作 main、标签或 Release。没有执行 commit 或 push，实际 index 保持空。

目标为 `origin/OJ_connect`，仓库 `Bc408/BeCoder-IDE`。实时读取远端分支为 `6bdd83cd39943a1132730ba5e608cb17db3d37c5`；本地 HEAD 为 `ba0d14cc6ead7ae9d4e0d8ad61ee4b7b9b73e4d3`，已有三个待推送提交，另有未提交的本轮开发改动。正式发布前应再次确认远端未变化，并提交最终候选，正常执行 hook 后再推送该分支。

## 检查与规范修正

- 真实 `.git/hooks/pre-commit` 使用独立 `GIT_INDEX_FILE` 检查完整候选，不用空 index 假通过，也不改变实际暂存区。首次退出 1：三处官方日文标签缺少 Unicode 标注、一处工作台测试格式不符合规范。补齐精确标注并使用仓库 formatter 后，重跑退出 0，没有跳过或修改 hook。
- OJ Connect 四项类型检查、83 项 Node 测试及共享内容解析／缓存／安全策略回归重新通过。站点编译器偏好按站点和 C／C++ 分键；原始 ID 不互换。
- 核对提交页生命周期、回执后释放、只读追查和原会话释放边界，未发现新的阻断性问题；本次轻量检查不等于新的长期稳定性或真实网站验收。
- 上游固定 vscode-luogu 4.20.0，MIT 许可与来源对照保留。共享渲染器的 `content/LICENSE.luogu-markdown.txt` 与 `content/LICENSE.lucide.txt` 实际存在，归属已纳入 OJ 的 ThirdPartyNotices.txt，组件登记位于 `resources/oi-defaults/BUNDLED-COMPONENTS.json`。本轮未新增依赖或迁入新上游代码。
- 发布候选排除 `tmp`、依赖、生成目录和浏览器个人数据；测试源码与合成夹具保留为回归覆盖，不作为冗余产物删除。

本轮仅增加注释、测试格式和文档，不改变产品逻辑；未重复构建 stage。前次干净 stage 的构建和检查证据见维护记录，不声称它包含本轮源码注释或文档。

## 冗余产物清理

已识别 `tmp/oj-connect-audit/shared-workflow` 下十个 `portable-created-by-*`／`portable-generated-*` 自动生成目录，顶层只有工具链与初始化标记。递归删除操作被自动审批审查以 `blocked by policy` 拒绝，未执行删除，也未换工具绕过。最新 stage、含个人数据的旧 stage／保全目录、依赖与构建缓存、上游参考和验证日志均保留。清理待完成不影响源码候选的排除规则。

## 本机证据

候选路径与 SHA256、独立 index 和命令计划位于忽略目录 `tmp/oj-connect-audit/publish-prep-20261117/`；各次检查精确命令、退出码和日志为 `tmp/oj-connect-audit/shared-workflow/publish17-*.{json,log}`。独立 index 只用于预检，正式 commit 仍需执行正常 hook；最终发布对象应以实际提交和远端回读结果为准。
