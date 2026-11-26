# Beacon 工具与事实表达清洗：能力与交付报告

日期：2026-11-26（Asia/Shanghai）。源码起点Beacon_Next@950befec加未提交run容量修复；当前仍为未提交工作树。负责人已授权设计、计划、实现、stage及未启动访谈环境。未进行Git提交、推送、Setup或Release。

[设计](../../superpowers/specs/2026-11-26-beacon-tool-information-design.md) · [计划](../../superpowers/plans/2026-11-26-beacon-tool-information.md) · [模型原答](2026-11-26-tool-information-samples.md) · [英文提示与中文审阅](../review/2026-11-26-tool-information-prompt-review.md)

## 1. 交付结论

九工具合同已实施：三个记录工具支持latest和文件筛选；编译信息固定投影、开始时间到秒、运行毫秒取整；完整代码指纹、Notebook全cells坐标和五站具名明细接通。readPage版本由harness取得，文本统一码点续读；readMaterial及专用正文副本链退出。可信度由OJ产品处理，mismatch页面／通知／拒收，不要求其他三态必须matched。

定向模型最终10/10回合完成、26/26工具无错误并取得预标必要事实，未泄漏待隐藏字段；仍观察到状态／check混说、来源错称、机制臆测及无关读取。工具接通和整体教学质量分开，未宣称全面稳定。原先失败与夹具问题没有被最终成功抹去。

标准 `npm run gulp vscode-win32-x64-min` 退出0，167.32秒；结束约2026-11-26 01:24:12（Asia/Shanghai）。产物：`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`。

离线环境：`D:\BeaconLab\20261126-tool-information`；干净生产副本`app/`，独立访谈副本`app-interview/`已离线构建并核验。全新profile、练习根`beacon/practice`、Beacon根`beacon`、校准根`calibration`；7823个应用文件及3546个工具链文件已逐一核对。没有旧聊天／队列／Cookie，密钥未复制；仅准备本机配置在未来运行时接入。操作说明：`D:\BeaconLab\20261126-tool-information\README.md`。两份应用均未启动。

## 2. 具体变化

| 范围 | 最终行为 |
| --- | --- |
| 查询 | 三记录共同支持目录、指定ID、latest和filePath；先筛文件再按真实入队顺序选择，保真实ID，不固定讨论对象 |
| run投影 | 不返回编译耗时、原命令参数、编译器／编译目录、endedAt；返回实际standard／optimization、整数运行耗时和startedAt |
| codeHash | 完整真实源码只统一CRLF后SHA256；截断前计算；旧完整稿读取可补算，旧前缀不冒充完整哈希；严格verdict去重不变 |
| 文件／页面 | 四操作及绝对／相对路径保留；OS错误细分，Unicode码点续读；readPage只传id，内部版本检查，不缓存旧正文 |
| Notebook | 程序和input都按整个笔记1-based坐标，正文附cellNumber；旧ordinal不伪换算，位置缺失可正常入队 |
| verdict | 五站按真实列映为具名行，保字符串单位；工程核验字段不交模型；mismatch通知与拒收且不替换旧项 |
| 知识 | 七主题统一英文，删除模型配置教程，补队列容量／失败、debugger.h、gch及产品边界；宏严格使用负责人原稿 |
| 历史 | 普通工具交换、附件、摘要、分支保留；不新写／恢复／分流复制专用页面副本，不自动擦旧数据 |

run8192／4096／1024码点和包含ID的32768 UTF-8字节规则保留；实际编译执行、CPH check、输出上限及取消退休不被证据投影污染。Blackout仍采集而不消费持久记录，无根不采集不补采。

## 3. 源码验证与复审

| 拥有者 | 最终回归 |
| --- | ---: |
| 原生Beacon记录／基础设施 | 56通过 |
| Runner | 133通过 |
| Beacon完整套件 | 305通过 |
| Notebook | 40通过 |
| OJ Connect | 177通过，另含原解析／策略检查及SSR渲染 |
| CPH | 87通过、1项缺用户生成PCH缓存而跳过 |
| 合计 | 798通过、1跳过；不重复计算切片／定向重跑 |

客户端类型、OI统一编译、分层、Beacon严格lint、变更核心lint、文档结构／链接／JSON及diff检查分别留证。OJ扩展使用根严格lint遇到既有版权头／import规则冲突：10项header和9项import诊断均在原未改动行；排除这两个既有规则后，其余十份变更文件0错误0警告。不能称整仓或OJ完整根lint已通过。

复审发现并修复四项明确问题：Notebook坐标可选却被校验强制要求；长文件search未读完却标完整；最后异步检查期间取消仍可能发布成功；CPH采集的runtime cwd误用源码目录。均保红绿回归和复核。CPH目录回归实际执行GCC程序输出current_path，不以静态断言冒充实际路径。

正式台账：`.superpowers/sdd/2026-11-26-beacon-tool-information/checks.jsonl`、runner/oj/file/test-migration独立台账及对应日志。中间旧断言失败、TDD预期失败、一次文档锚点错误及脚本编排／编码错误都保留，修正后按影响重跑；不作为最终源码失败隐藏，也不以旧绿测代替新修改。

## 4. 有限模型数据

生产Provider／SDK／ChatHistory／ContextTools／FileTools与真实磁盘Store，合成程序和结果；编辑器、页面拥有者及Notebook读取边界模拟，Notebook正文投影用真实实现。固定DeepSeek Flash，不改导师核心、不偷偷换模型。未启动BeCoder，未请求五站网站或提交代码。

| 指标 | 最终固定批次 |
| --- | ---: |
| 场景／回合 | 8场景，10次尝试，10次完成 |
| 预标必要事实取得 | 10/10 |
| 工具执行无错误 | 26/26 |
| 隐藏字段检查 | 10/10清洁 |
| HTTP | 25次，其中24次聊天＋1次模型发现 |

这些分母仅属于本批夹具，不是生产成功概率，也不是10/10答案完全正确。最新同文件选择、切文件、完整hash／截断前缀、CPH正常退出而答案错误、编译失败未运行、Notebook坐标与正文、中文emoji续读、五站具名行和id-only页面路径均有观察。

模型仍出现的薄弱点：

- 编译失败的主要判断正确，附加解释却将passed／wrong-answer说成runs.status；实际它们属于check。
- Notebook正文引文正确，但后续将Notebook结果错称Runner。
- 五站字段读取正确，却把不同合成题目／输入的RE和WA差异归因于评测端机制，依据不足。
- CPH案例解释了expected6／stdout5和正常退出，却额外猜测检查规则及“遇首个失败停止”的策略。
- Unicode两段读取正确，中间仍多列一次目录并附无关建议；CPH还被泛称为对拍。
- 用户只要求核对事实时，仍展开哈希／记录ID／字段名、额外运行小结；编译语法问题还附加了与原要求无关的完整输入输出代码。表达克制尚未达标。

不为以上错误继续堆提示员工手册；它们进入下次真实访谈与评测，不能以工程成功声称消失。

## 5. 首批失败与夹具边界

首批也实际付费执行：10次尝试中序列化8回合完成，另1回合答案从原SSE只读恢复、1回合输出上限导致未完成；Notebook后续评分器自身出错与模型失败分开。首批30次HTTP、33次工具；最终25次HTTP、26次工具。两批合计20次回合尝试、55次HTTP（53聊天＋2发现）、59次工具，不汇总为“20/20成功”。

随后校准合成代码与输出一致性、O2及信号文字并提高本地测试输出额度，形成独立最终版本，没有覆盖首批或更改产品提示。最终仍有Runner夹具operation/run与文件模式、input文件名未完全符合实际producer的问题，已注明，不当作产品缺陷。真实adapter发出的形态由拥有者回归验证，本批不能代替原生业务验收。没有为修这项夹具偏差再刷一批成功数据。

原始最终目录：`C:\Users\Bc\Desktop\BeCoder\BeCoder_maintenance\tmp\beacon-tool-information\2026-11-25T17-15-11.183Z-56e4f2d1-d9bc-4912-a5d1-0b64955bd944`。完整审阅与首批路径见review.json；样本原文见本文链接。窗口、账号、网站、GUI、真实Notebook造大数据及长历史压缩不由本批验收。

## 6. 访谈环境与下一步

环境只离线准备：干净生产app和独立app-interview分开，测试桥只可出现在后者；原stage及生产副本不得注入测试入口。所有内置扩展、编译器、clangd和helper随完整stage保留。未来启动需显式授权，驱动保原生Provider和工具能力，不以空适配器／合成成功替代。

首次启动后仍需原生选择指定Beacon根、接入本机模型配置到SecretStorage，并由负责人登录OJ／处理验证码。未启动时无法诚实宣称这些运行态设置已验证；本轮没有预登录、运行学生程序、实际提交或开始正式访谈。

环境manifest、完整文件树／SHA256、最终构建凭据和启动指引均放在隔离目录及本轮台账。后续适合以新环境进行真实失败案例和连续学习工作，再访谈Beacon对新工具的切身体会。

最终构建与离线环境用同一份预先冻结清单核对217份源码／合同／构建输入和748份拥有者输出：747份输出字节完全一致；OJ Connect的`dist/dependencies.json`按既有打包流程压缩JSON，10,242→8,224字节，核对冻结源hash、实际stage hash、JSON值和精确压缩字节均通过，未排除任何文件。这是验证器对真实打包规则的适配，不是修改或重建stage。完整stage和生产app无测试桥；只有独立app-interview的Beacon bundle被替换，并核验其余文件一致，替换清单保存在`evidence/interview-copy.json`。
