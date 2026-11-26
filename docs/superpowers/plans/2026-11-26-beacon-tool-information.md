# Beacon 工具与事实表达清洗实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 交付九工具的精简事实合同、新 stage 和未启动的隔离访谈环境。

**Architecture:** 保现有三队列和原生业务 owner，在模型出口使用固定允许字段投影；采集时增加完整代码哈希及真实 Notebook cell 坐标。独立删除页面材料副本系统，不改变普通历史与附件。

**Tech Stack:** TypeScript、Node.js、现有 AI SDK、Electron/Code - OSS、仓库 npm/Gulp、PowerShell/Python 验证台账。

**Spec:** [正式设计](../specs/2026-11-26-beacon-tool-information-design.md)。负责人已授权设计落盘后直接计划与实施，不另等审批。无 Git 提交／推送／Setup，禁止启动 BeCoder。

## Global Constraints

- 保留现有 dirty 工作树；使用当前维护 checkout 和现有依赖，不新建缺少未提交修复的 worktree，不清缓存。
- problem13／run30／verdict20；run8192／4096／1024码点、包含ID的32768 UTF-8字节拒收；不污染执行原文。
- 相同代码哈希只统一CRLF→LF，SHA256小写64位；verdict严格原文去重不变。
- 新 Notebook codeCellNumber/inputCellNumber 从完整全部cells的1-based位置获取，旧 ordinal 不伪换算。
- 业务可信度由产品处理，mismatch通知＋页内提示＋拒收；其余三态不强制matched。
- 工具与七主题英文，附中文审阅；宏严格采用 `#ifndef DEBUG`／`#define debug`／`#endif`。
- 不运行桌面应用，不登录、不提交；本机模型配置仅供已授权测试读取，秘密不打印／不入文档。

## Review Focus

1. 旧截断代码不生成假完整哈希，新增字段仍参与32KB拒收，失败不淘汰旧项。
2. latest＋filePath按同一已提交队列快照选择；过期ID、旧大记录及mismatch不暗换目标。
3. 中文／emoji磁盘与dirty稿续读使用一致码点，范围与权限失败不泄漏秘密。
4. readMaterial退出不破坏历史、附件、分支或摘要，旧私有正文不变成新材料。
5. 五站列位差异不混用，mismatch无根时仍提示且轮询不反复通知。

## Task 1: 原生合同与模型投影（主代理）

Files: `src/typings/becoder-beacon.d.ts`、`src/vs/platform/beacon/common/beaconRecords.ts`、`extensions/becoder.beacon/src/recordProjection.ts`、`contextToolContract.ts`、`contextTools.ts`及原生／Beacon tests。

- [x] 添加失败回归：完整哈希／旧截断／具名五站行／隐藏字段、query组合与空集、latest和同版固定事实、旧大记录／mismatch／压缩限制。
- [x] 类型允许 codeHash、codeCellNumber 并兼容旧字段；原生再拦 mismatch；模型投影不展开原DTO。
- [x] 实现记录查询、固定字段、时间舍入、实际标准／O2提取；未知不补默认。
- [x] 删除 readMaterial 及 ContextSnapshot 生产链、更新 readPage 当前版读取与统一码点；历史被动兼容。
- [x] 执行聚焦回归并审核原始工具协议／权限。

## Task 2: OJ 可信度（独占 extensions/becoder.oj-connect）

Interface: 保 RecordSnapshot 工程四态；toBeaconVerdictRecord 仅 finished 且非 mismatch 返回，增加完整 submission.codeHash。

- [x] 先写回归：mismatch不发布、不替换、通知一次、无采集根仍通知；其他终态保留。
- [x] 接通采集门与页内 mismatch／右下角通知、本地化及观测去重；不重交。
- [x] 保原生 rows 和 UI，五站模型行映射由主代理 recordProjection 负责。
- [x] OJ拥有者类型／build／test并只读复核。

## Task 3: 文件读取与 Notebook 位置（独占 FileTools 与 Notebook）

Files: `extensions/becoder.beacon/src/fileTools.ts`、对应文件读取 tests、`extensions/becoder.notebook/src/model.ts`／`extension.ts`及tests。

Interface: 文本offset／limit／nextOffset按Unicode码点；新增offsetUnit明确文本／二进制；Notebook plan新增 codeCellNumber 并传递 Runner，不改变旧codeNumber内部用途；正文每cell附cellNumber。

- [x] 红测：UTF8磁盘／dirty／emoji续读、OS code分类、操作参数有效性、原安全边界；全cells坐标／选区／旧序号不误用。
- [x] 有界流式文本解码和参数／错误处理，保图片及二进制能力；不额外开文件。
- [x] 计划与内容编号统一，执行行为和原用户资产不改。
- [x] 聚焦 FileTools／Notebook 回归及拥有者编译。

## Task 4: Runner 采集（独占 Runner 源码与tests）

Interface: `runNotebookProgramGroup`／内部观察元数据增加可选 codeCellNumber；BeaconEvidence在normalize之前对实际完整程序作SHA256，持久 program.codeHash和可得codeCellNumber。

- [x] 红测完整码哈希与截断、CRLF相等／空白不同、Notebook新坐标传递。
- [x] 最小改动采集与transport，保执行编译／终端／CPH／Notebook时限、输出、退休行为。
- [x] Runner测试、实际编译helper回归；不运行 BeCoder GUI。

## Task 5: 提示／产品知识／文档与集成（主代理）

- [x] 用设计英文原文更新工具描述、schema参数、host包装和七产品主题；保宏原稿与gch实际入口。
- [x] 更新 Beacon现行合同／PRD／架构／底层／压缩／状态／用户说明；历史访谈和原报告不改。
- [x] 三实现切片逐项只读review，修具体问题；最终另派只读review覆盖集成边界。
- [x] 预检并冻结最终命令，持续记 `checks.jsonl`；聚焦测试→拥有者类型→client types→OI→layers/lint/docs/diff。
- [x] DeepSeek Flash生产装配定向测试latest、筛选、五站投影、哈希、Notebook读取、失败记录；保完整回答与失败，不借GUI执行。

## Task 6: stage 与未启动访谈环境

- [x] 预检 stage入口及缓存，运行 `npm run gulp vscode-win32-x64-min`，外部300秒超时，退出0才交付。
- [x] 在全新隔离目录复制最终完整stage及工具链，独立data／practice／beacon／driver／evidence；不复制旧聊天／队列／浏览器登录态。
- [x] 准备受控驱动和本机私有配置接入，生成manifest／启动说明；只静态检查，不启动实例或触发任何站点行为。
- [x] 写能力报告、定向问答、验证边界与环境状态；交付绝对路径，区分源码、模型观察、stage、首次启动／登录待完成项。

## 验证执行合同

精确命令从当前 package.json 与既有可执行入口确认后冻结在 `.superpowers/sdd/2026-11-26-beacon-tool-information/check.py`，逐次日志和退出码落 checks.jsonl。类型／OI各120秒，stage300秒，其他检查按拥有者规模设限。已有测试失败与工具编排失败分别记录，修复后最小重跑；模型HTTP成功不等于语义通过。

本计划不要求自动提交。所有代理不覆盖他人写入，不编辑生成物；并行切片不共享写范围，最终主代理集成。设计稿语义冲突由已确认产品决定裁决，确定性工程细节记录进本轮台账。
