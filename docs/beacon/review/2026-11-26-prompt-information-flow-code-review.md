# Beacon 信息流实现复审与修复

日期：2026-11-26—27（Asia/Shanghai）。范围为`Beacon_Next@eb48d147`之上的信息流提示词`.4`改动；负责人要求作code review、处理已知问题并构建新stage。原接入及验证基线见[接入记录](2026-11-26-prompt-information-flow-installed.md)。

## 审查范围

核对原始业务事实、模型结果短释义、安全失败、SDK参数与出站／协议一致性、摘要固定记录、停止竞态和媒体回流。主agent检查结果／错误与构建条件，独立只读reviewer检查Provider／会话／摘要链路。修复只针对可复现缺陷，不扩展工具能力、队列或存储机制。

## 已复现及修复

| 优先级 | 触发与影响 | 修复和回归 |
| --- | --- | --- |
| P1 | inspectFile的schema没有运行时validator；缺operation／path、path为数字等调用仍执行并可能写入raw toolResults，JSON保存后readHistory拒绝该聊天 | 为既有schema接入输入形状校验，拒绝调用走现有SDK invalid_arguments路径、execute为0、不产生raw FileResult。null／缺字段／错误path类型覆盖模型反馈、UI分类及持久历史roundtrip；[源码](../../../extensions/becoder.beacon/src/provider.ts)、[回归](../../../extensions/becoder.beacon/test/prompts.test.ts) |
| P2 | 文件读取前或读取后，宿主上下文校验因IPC失败而抛错；guardRead将任何异常都说成“工作区或权限已变化”，错误地提供了确定原因 | 只有确切beacon-context-changed才报告变化；其余返回安全read_failed，不暴露未验证正文。读取前／后失败及真实变化均覆盖，先失败再通过；[源码](../../../extensions/becoder.beacon/src/context.ts)、[回归](../../../extensions/becoder.beacon/test/context.test.ts) |

P1由独立reviewer使用当前源码离线复现三例，主agent补入四例实际SDK回归；修复前失败、修复后87项prompts／files／session回归通过。原工具schema文字和合法操作保持，授权／路径规则及按操作校验仍由FileTools执行。不迁移旧聊天或补造过去工具结果。

## 验证与交付边界

两项修复后，Beacon类型检查、扩展build、87项prompts／files／session定向回归、367项完整回归及严格lint均退出0，无fail／cancelled／skipped；客户端类型检查退出0。独立reviewer对当前修复作定点复检并运行4项离线测试，未发现确切遗漏。OI统一编译退出0，用时55.87秒；stage接着按下述标准命令构建，实际结果以本轮stage日志和最终交付说明为准。

最终stage于2026-11-27 00:04:18完成，完整标准`npm run gulp vscode-win32-x64-min`重试退出0，用时160.982秒；目标为`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。首次下载失败仍保留，下述本地归档恢复不更改源码或持久环境。未启动该实例，未作Setup、真实网站、模型或GUI验收。

正式stage使用仓库标准顺序：`npm run typecheck-client`、`npm run compile-oi-extensions`、`npm run gulp vscode-win32-x64-min`；类型／扩展编译外部上限120秒，stage上限300秒。精确命令、失败与最终退出码保留在忽略目录`.superpowers/sdd/2026-11-26-beacon-information-flow-review-stage/validation.jsonl`及对应日志。stage结果另按最后实际退出码交付，不用扩展bundle代替stage。目标入口为`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。构建开始后该应用目录由标准Gulp任务生成；本记录在stage开始前冻结，最终退出码与耗时见本轮validation.jsonl及stage.log。

不执行Setup、独立package verifier、模型API、真实站点或GUI验收，不启动新实例；不提交或推送，不清理依赖／缓存／用户资产。工作区采集与模式消费、三队列和已批准提示词语义继续保持。60%摘要目标未传入生成器的既有差距不在本轮宣称解决。

构建首尝试：标准stage在package-win32-x64阶段146.72秒后以fetch failed退出1，属于外部Electron下载失败；源码编译已完成但该次不能交付。恢复前按当前build/checksums/electron.txt核验本机Electron43.7.3 win32-x64普通归档，SHA-256为`b11a1bf50c1fc4eb8b9ca99cfbb557daab284d739b20f45c1b3b6ce9f673cb32`。沿build/lib/electron.ts已支持的BECODER_ELECTRON_ARCHIVE，仅给重试构建子进程提供该路径，不改持久环境或依赖；重跑同一完整标准任务，仍限300秒。重试结果以stage-retry日志及最后交付为准。
