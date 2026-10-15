# Beacon 工作区、聊天与能力档位交互重组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将 Beacon 重组为以工作区为一级容器的主页与聊天详情页，并让 Blackout、Spot、Flood 与工作区选择产生一致、受宿主约束的状态迁移。

**Architecture:** 原生 `BeaconCoordinator` 成为选择根、有效根、模式和活动会话的唯一状态权威；扩展只在宿主确认的上下文快照上绑定历史。Webview 以“主页/详情页”派生视图状态渲染，动画只反映已确认的状态变化，不能扩大权限或伪造切换成功。

**Tech Stack:** Code-OSS 1.140 TypeScript、VS Code IPC、React 19 Webview、现有 Node tests、Playwright 渲染测试、CSS 动画。

**Spec:** [2026-10-15-beacon-workspace-conversation-mode-design.md](../specs/2026-10-15-beacon-workspace-conversation-mode-design.md)

## Global Constraints

- 工作区按窗口选择，最近根跨窗口共享；聊天固定归属工作区，单窗口租约保持有效。
- 三档入口固定在输入框左下角；三档都可读当前窗口已打开页面，但不得由此扩大本地文件或记录读取权。
- Blackout 不消费工作区历史、记忆、运行材料或本地持久化；Spot/Flood 才能消费当前可用根资产。
- 无根时 Spot/Flood 可见但禁用；首次选根自动 Spot；根间切换保留当前模式；取消根自动 Blackout。
- 已有聊天详情页不渲染也不接受工作区切换；主动或被动降为 Blackout 时退出详情页到主页。
- 不引入依赖、账号、授权账本、全局聊天列表、跨根聊天迁移或兼容旧开发快照的冗余路径。
- 保留现有敏感文件过滤、页面读取、Notebook 写入限制、模型连接、会话租约与持久化原子性。
- 当前工作树已有其他 Beacon 改动；只修改本计划拥有的路径，不重置、清理或提交任何既有工作。Git 提交与推送不在本计划授权范围内。

## Review Focus

- 失效根必须降为 Blackout 并退出详情页，绝不能继续显示或写入该根历史；由任务 1、3 覆盖。
- Blackout 保留 `selectedRoot` 时，页面、文件和运行记录以外的工作区资产不可进入新请求；由任务 1、3 覆盖。
- 当前根的 `×` 只能更新最近列表，不能删除 `.beaconWork` 或聊天；由任务 1、4 覆盖。
- 旧 Webview 延迟发送的切换消息不能在聊天详情页或状态已变化后切根；由任务 3 覆盖。
- 减少动态效果、小宽度和长 Windows 绝对路径不能造成横向溢出或隐藏关键恢复入口；由任务 4 覆盖。

---

## File structure

| 路径 | 责任 |
| --- | --- |
| `src/vs/platform/beacon/common/beaconContextTypes.ts` | 扩展窗口选择与上下文 DTO，区分选中根、实际可用根、模式和降级原因。 |
| `src/vs/platform/beacon/node/beaconCoordinator.ts` | 原生状态转换、根选择/取消/最近项维护、Blackout 降级和活动会话释放。 |
| `src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts` | 原生状态与租约回归。 |
| `extensions/becoder.beacon/src/context.ts` | 验证并暴露新上下文 DTO，派生文件权限与读取根。 |
| `extensions/becoder.beacon/src/extension.ts` | 主页/详情页的历史绑定、宿主消息守卫、详情页降级退出与快照发布。 |
| `extensions/becoder.beacon/src/history.ts` | 首次发送才创建持久化实体所需的最小历史接口调整。 |
| `extensions/becoder.beacon/test/context.test.ts` | 扩展侧绑定、临时会话、过期消息和模式转换测试。 |
| `extensions/becoder.beacon/webview/App.tsx` | 两种页面、主页工作区选择器和稳定的 Webview 消息。 |
| `extensions/becoder.beacon/webview/Workspace.tsx` | 替换为单一主页工作区控件及最近根列表交互。 |
| `extensions/becoder.beacon/webview/Permissions.tsx` | 永远呈现三档并正确禁用/说明。 |
| `extensions/becoder.beacon/webview/beacon.css` | 路径展开、当前根移入最近列表、列表切换、降级状态和减少动态效果。 |
| `extensions/becoder.beacon/test/render.mjs` | 生产 bundle 的主页/详情页、动画终态、可访问性与窄屏验证。 |
| `docs/beacon/{README.md,prd.md,architecture.md,implementation-status.md}` | 用最终已实现语义更新基线与实现状态，去除已被本设计替换的档位资格描述。 |

### Task 1: 原生工作区与模式状态机

**Files:**
- Modify: `src/vs/platform/beacon/common/beaconContextTypes.ts`
- Modify: `src/vs/platform/beacon/node/beaconCoordinator.ts`
- Test: `src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts`

**Interfaces:**
- Produces: 能表达 `selectedRoot`、`usable`、`mode`、降级原因和最近根的 `IBeaconContext`。
- Produces: `selectWorkspace(id, root)`、`clearWorkspace(id)`、`removeRecentWorkspace(id, root)` 与可在保留根时设为 `blackout` 的 `setMode(id, mode)`。
- Consumed by: 扩展 `BeaconContextClient`、历史绑定与 Webview 快照。

- [x] **Step 1: 写原生状态转换失败测试**

在 `beaconInfrastructure.test.ts` 增加：无根仅 Blackout；首次选根自动 Spot；Spot/Flood 根间切换保持模式；保留根时切 Blackout；Blackout 重新选根仍保持 Blackout；取消当前根将其去重移至最近列表首项；失效根返回 Blackout 与故障状态；详情租约在 Blackout 前释放。

- [x] **Step 2: 运行原生测试，确认新增断言失败**

Run: `npm run test-node -- --run src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts`  
Expected: FAIL，原因是当前 DTO 和协调器不支持上述转换。

- [x] **Step 3: 扩展 DTO 与协调器状态机**

在 `beaconContextTypes.ts` 让 `IBeaconWindowSelection.mode` 接受三档，并在 `IBeaconContext` 中增加稳定的根状态字段。`BeaconCoordinator` 实现上述三个工作区操作；`snapshot()` 根据“根可用性 + 当前模式”派生可消费资产。进入 Blackout、取消根或根失效时释放活动会话租约并递增 epoch；不删除任何资产。`setMode()` 只接受当前资格允许的转换。

- [x] **Step 4: 运行原生测试，确认通过**

Run: `npm run test-node -- --run src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts`  
Expected: PASS。

### Task 2: 扩展历史绑定与请求边界

**Files:**
- Modify: `extensions/becoder.beacon/src/context.ts`
- Modify: `extensions/becoder.beacon/src/history.ts`
- Modify: `extensions/becoder.beacon/src/extension.ts`
- Test: `extensions/becoder.beacon/test/context.test.ts`
- Test: `extensions/becoder.beacon/test/session.test.ts`

**Interfaces:**
- Consumes: 任务 1 的新 `IBeaconContext` 与工作区命令。
- Produces: 仅 Spot/Flood 绑定工作区历史；Blackout 使用临时内存历史；主页/详情页的可信快照状态。
- Produces: `clearWorkspace`、`removeRecentWorkspace`、`exitConversation` 等受当前页面和上下文版本校验的扩展消息处理。

- [x] **Step 1: 写扩展侧失败测试**

覆盖：主页首次发送才持久化；Blackout 首次发送不落盘；详情页切 Blackout 释放/清空活动聊天并进入临时主页；取消根与历史项移除不触碰资产；根切换只在主页允许；迟到的旧 `selectWorkspace` 消息被拒绝；Spot/Flood 下已有会话的租约、保存失败和上下文变更保护不回退。

- [x] **Step 2: 运行 Beacon owning tests，确认失败**

Run: `npm --prefix extensions/becoder.beacon run build; npm --prefix extensions/becoder.beacon test`  
Expected: 新增用例失败，现有用例可作为回归基线。

- [x] **Step 3: 实现历史替换与宿主消息守卫**

`context.ts` 验证新 DTO，并只在可消费根下暴露根与非 Blackout 文件权限。`extension.ts` 用显式 `screen: 'home' | 'conversation'` 或等价宿主拥有状态决定历史绑定和允许的消息；收到有效 Blackout/根失效快照时先释放聊天、清空草稿，再绑定临时历史和发布主页。保持 `ChatHistory.capture()` 的“首条消息后创建”语义；不要为了主页状态创建空聊天。

- [x] **Step 4: 运行 owning tests，确认通过**

Run: `npm --prefix extensions/becoder.beacon run typecheck; npm --prefix extensions/becoder.beacon run build; npm --prefix extensions/becoder.beacon test`  
Expected: PASS，所有现有 Beacon 测试与新增状态测试通过。

### Task 3: Webview 页面结构与三档菜单

**Files:**
- Modify: `extensions/becoder.beacon/webview/App.tsx`
- Modify: `extensions/becoder.beacon/webview/Workspace.tsx`
- Modify: `extensions/becoder.beacon/webview/Permissions.tsx`
- Modify: `extensions/becoder.beacon/webview/beacon.css`
- Test: `extensions/becoder.beacon/test/render.mjs`

**Interfaces:**
- Consumes: 任务 2 发布的 `screen`、根状态、模式、最近根、活动聊天和忙碌状态。
- Produces: 主页唯一工作区控件、详情页无工作区入口、三档常驻选择器及受控 Webview 消息。

- [x] **Step 1: 写生产 Webview 渲染失败测试**

在 `render.mjs` 固定测试中文和英文：主页显示“选择工作区”或文件夹名；详情页不存在工作区控件；Spot/Flood 根、主动 Blackout 隐身图标、失效根红色图标的 tooltip；三档始终存在而不合资格档位禁用；当前根 `×` 与历史根 `×` 发送不同消息；长路径、360px 宽度和 `prefers-reduced-motion` 无横向溢出。

- [x] **Step 2: 运行渲染测试，确认失败**

Run: `npm --prefix extensions/becoder.beacon run build; npm --prefix extensions/becoder.beacon run test-render`  
Expected: FAIL，当前 UI 仍在所有页面渲染工作区卡片且隐藏 Blackout/Spot/Flood 选项。

- [x] **Step 3: 实现主页与详情页渲染**

以宿主 `screen` 为唯一依据在 `App.tsx` 切换页面。将 `Workspace.tsx` 改造成顶部单一弹出控件：当前根短名展开为绝对路径，最近项保持绝对路径，当前根/最近根 `×` 分别发送取消/移除消息。`Permissions.tsx` 不过滤档位，而是按资格禁用并显示解释。CSS 使用现有主题变量、焦点样式和减少动态效果媒体查询实现路径展开、列表淡入淡出及当前根移入最近列表的布局动画；不增加动画库。

- [x] **Step 4: 运行渲染测试，确认通过**

Run: `npm --prefix extensions/becoder.beacon run build; npm --prefix extensions/becoder.beacon run test-render`  
Expected: PASS，并保存测试截屏供最终视觉检查。

### Task 4: 文档同步、专项回归与构建

**Files:**
- Modify: `docs/beacon/README.md`
- Modify: `docs/beacon/prd.md`
- Modify: `docs/beacon/architecture.md`
- Modify: `docs/beacon/implementation-status.md`
- Modify: `extensions/becoder.beacon/README.md`
- Test: 任务 1 至 3 所列测试与仓库标准构建

**Interfaces:**
- Consumes: 已验证的实际状态机和 Webview 行为。
- Produces: 与源码一致的正式需求、架构和实现状态说明。

- [x] **Step 1: 在最终源码行为已稳定后同步正式文档**

将旧“有效根只能 Spot/Flood”的描述替换为“保留根时可主动 Blackout，但不消费工作区资产”；写明主页/详情页、取消根、失效根、三档入口与聊天退出规则。实现状态只陈述已验证的行为，未做 GUI 验收的部分保持未验收标记。

- [x] **Step 2: 写或更新文档结构检查和行为回归**

确认新增/更新的原生、扩展和渲染测试覆盖 Review Focus 五项；不为旧快照迁移添加兼容分支。

- [x] **Step 3: 预检并冻结验证矩阵**

确认脚本、Node 模块、Playwright 浏览器、文档校验脚本和所有测试文件存在。记录命令、工作目录、输入、超时和失败停止条件到任务验证账本。

- [x] **Step 4: 运行最终验证矩阵**

Run, in order:

1. `npm run test-node -- --run src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts`
2. `npm --prefix extensions/becoder.beacon run typecheck`
3. `npm --prefix extensions/becoder.beacon run build`
4. `npm --prefix extensions/becoder.beacon test`
5. `npm --prefix extensions/becoder.beacon run lint`
6. `npm --prefix extensions/becoder.beacon run test-render`
7. `./.agents/skills/develop-becoder/scripts/validate-project-docs.ps1`
8. `git diff --check`
9. `npm run typecheck-client`
10. `npm run compile-oi-extensions`
11. `npm run gulp vscode-win32-x64-min`

Expected: 每一步退出码为 0。任何非零或超时记录原始证据，按仓库规则定位并修正；受影响的最小检查通过后，在最终工作树上重跑完整矩阵。

- [x] **Step 5: 进行项目负责人运行验收准备**

交付 staged Windows 应用目录、验证账本和需手动检查的路径：首次选择根、根间切换、取消根动画、主动 Blackout、根失效、恢复 Spot/Flood、详情页不可切根、单聊天跨窗口占用及窄侧栏布局。无需 Setup、Git 提交或推送。

## Plan self-review

- **Spec coverage:** 工作区状态、主页/详情页、三档、根控件、动画、Blackout 降级、宿主约束和验收均分别归入任务 1 至 4。
- **Step scan:** 每项代码动作均有明确文件、接口和验证命令；没有未定义的实现空项。
- **Type consistency:** 任务 1 的 `IBeaconContext` 扩展由任务 2 与 3 消费；根操作均由协调器定义、扩展转发、Webview 发送。
- **Review Focus:** 五项高风险输入都已落到原生、扩展或渲染测试任务。
- **Proportion:** 计划保留接口和断言层面的决定，不预写具体实现体。

## 实施及验证记录（2026-10-15）

工作区/历史主页、聊天详情页、Blackout 保留根、三档恢复、路径大小写去重和文档规则均已实现。渲染测试先新增“有效根下可以从手动 Blackout 恢复 Spot/Flood”的断言，按预期失败后修正资格传递并通过；随后发现共享最近列表被其他窗口移除当前根时会失去当前窗口的取消入口，新增断言复现后通过当前根兜底展示修复。这些回归区分了“当前为 Blackout”和“工作区不可用”，并覆盖窗口间最近列表变化。

| 检查 | 结果 |
| --- | --- |
| `npm run transpile-client` | 通过 |
| `npm run test-node -- --run src/vs/platform/beacon/test/node/beaconInfrastructure.test.ts` | 35 项通过 |
| `npm --prefix extensions/becoder.beacon run typecheck` | 通过 |
| `npm --prefix extensions/becoder.beacon run build` | 通过 |
| `npm --prefix extensions/becoder.beacon test` | 133 项通过，无跳过 |
| `npm --prefix extensions/becoder.beacon run lint` | 通过，零警告 |
| `npm --prefix extensions/becoder.beacon run test-render` | 通过；生产渲染截图已查看 |
| 文档结构校验、`git diff --check` | 通过 |
| `npm run typecheck-client` | 通过 |
| `npm run compile-oi-extensions` | 通过 |
| `npm run gulp vscode-win32-x64-min` | 通过，最终 staged 应用目录已更新 |
| `verify-becoder-package.ps1 -IncludeCompiler $true` | 通过；未构建 Setup、未启动桌面 GUI |

最终 staged 目录：`C:\Users\Bc\Desktop\BeCoder\VSCode-win32-x64`。模型与账号均未操作。构建器内 Electron 获取曾遇到两次 `ECONNRESET`，其自带重试后成功；最终构建退出码为 0。

验证期间，组合 PowerShell 命令中的 `npm --prefix extensions/becoder.beacon test` 被 npm 解析成不存在的 `extensions.becoder.beacon\package.json`，测试目标未启动；改在扩展目录执行 `npm test` 后 133 项全通过。该命令编排失败没有被计作测试结果。
