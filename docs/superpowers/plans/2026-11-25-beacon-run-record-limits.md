# Beacon run记录容量限制实施计划

> **For agentic workers:** 使用superpowers:executing-plans，在本会话逐项实施，完成后作一次独立只读复核。

**Goal:** 按已批准设计限制run长文本字段，32KB超限拒收，阻止存量超大记录正文进入模型。

**Architecture:** 执行和原生展示不变；采集流只保有限前缀，原生入队入口统一执行字段规范化和最终序列化检查。读取保留旧格式识别，超限错误只针对选中记录。

**Tech Stack:** TypeScript、现有Node/Electron测试、Webpack／esbuild、原生BeaconStore。

**Spec:** [已批准设计](../specs/2026-11-25-beacon-run-record-limits-design.md)。负责人2026-11-25明确授权进入实施；本计划不增加Git或Setup范围。

## Global Constraints

- code 8192码点；input／expected／各编译和程序stream独立4096码点；每个error独立1024码点。
- 完整字符串不改；截断为{text,truncated:true}；不分配共享额度、不保尾部、不加省略号。
- 完整紧凑JSON含ID最多32768 UTF-8字节；超限拒收入队，旧队列不变。
- 旧记录不迁移，目录和新记录仍可用；旧超限正文拒读；当前代码整读不受影响。
- 沿当前checkout执行，保留未提交访谈/设计文档，不切分支、不清缓存、不commit/push。

## Review Focus

- 跨stream的UTF-8字节和emoji／代理对不可截坏或丢前缀，执行器上游省略仍标不完整。
- 截断值不能污染原程序、CPH实际期望值或Notebook输出展示。
- 实际32KB检查必须计入UUID及JSON转义，失败不触发淘汰或磁盘写入。
- 旧巨大记录不能拖垮目录和新增记录，不把容量错误伪装为网络／根损坏。
- 用户可见超限提示只出现一次，所有来源沿统一采集接点报告，不阻塞运行退役。

## Task 1: 字段规则与存储边界

Files: src/typings/becoder-beacon.d.ts；src/vs/platform/beacon/common/beaconRunRecord.ts（新增纯函数）；beaconRecords.ts；node/beaconStore.ts；test/node/beaconRecords.test.ts。

- [x] 增加8192／4096／1024码点及32KB边界、原队列不变、旧超大拒读的失败测试并实际执行。
- [x] 实现truncateRunText及normalizeRunRecord，统一常量和有限截断结构；保旧head/tail格式识别，不放宽其他记录类型。
- [x] appendBeaconRecord在过滤／淘汰前规范化和含ID大小检查；Store.readRecord只对run作大小关卡，list不因旧记录大小失败。
- [x] 运行原生语义记录及基础设施测试。

## Task 2: 有界流采集和可见错误

Files: Runner runRecordAdapter.ts／beaconEvidence.ts及其tests；Runner tsconfig和测试入口（如引入公共规则需要）；CPH／Notebook最小接点。

- [x] 修改旧共享额度／头尾测试，补流分片、恰好上限、上游省略、巨大源码和输入不污染原始对象的失败测试。
- [x] 替换共享分配器为每stream独立4096码点前缀收集，复用公共规则；静态文本在采集副本上截断。
- [x] 在统一createEvidence接点提供本地化超限提示，Runner内部调用沿同一错误格式，原执行结果不报失败。
- [x] 执行Runner及受影响拥有者测试。

## Task 3: 工具语义与当前文档

Files: Beacon contextTools.ts／contextToolContract.ts及context.test.ts；docs/beacon现行合同和产品知识；原生访谈历史报告不改。

- [x] 补单条过大错误映射、正常记录仍可读和巨大输入小结果回归。
- [x] 工具description只补截断值语义，参数不变，不改mentor system。
- [x] 更新当前需求／架构／底层／工具／压缩文档和实现状态，保留旧历史规则的追溯身份。
- [x] 小型DeepSeek固定案例验证实际截断结果可理解且普通后续可继续，保留原始证据。

## Task 4: 复核与交付

- [x] 复核已批准设计覆盖、原生队列、执行不受采集影响及新旧数据边界。
- [x] 请求一次独立只读全改动review，修复明确问题并重跑受影响检查。
- [x] 最终客户端typecheck（120秒）、OI扩展编译（120秒）、相关lint／分层／文档检查通过。
- [ ] 新完整stage构建（300秒），交负责人验收；不作Setup、发布或Git操作。

检查命令、输出和失败类别保存在`.superpowers/sdd/2026-11-25-beacon-run-record-limits/checks.jsonl`。命令由实际package脚本及AGENTS推导，后续改动若使旧证据失效则重跑。

收尾复核发现Notebook同块有效输出与省略事件次序问题，新增回归先红后绿，Runner最终127项通过；独立复核确认无确定阻断。stage实际状态以台账和专项报告为准，构建前不提前勾选交付。
