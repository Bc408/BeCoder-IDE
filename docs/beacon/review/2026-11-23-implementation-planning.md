# Beacon 实施筹划核对记录

日期：2026-11-23。起点为干净的`Beacon_Next@c54e9e4970c59fb1553b38581dc951fc3fb9d8fa`。负责人已通过现行方案并授权实施筹划与落盘；本轮改[执行计划](../../superpowers/plans/2026-11-22-beacon-foundation-implementation.md)、统一入口、实现状态和本记录，并将其新确认的图片预算准入同步到需求LONG04和压缩规范。产品源码、构建、模型请求、真实账号与Git提交未进入本轮。

## 筹划结果与来源

保留九项任务，在原候选计划中补齐具体接口、阶段交付门、真实测试断言及命令；不新增并行规范或重开已定产品规则。主代理阅读已通过的需求／架构／阶段／代码／压缩合同及当前源码；两位只读代理分别核对Tasks1–3的原生生产链、Tasks6–8的SDK与会话链，主代理自行核对Tasks4–5及writing-plans五项自查。

| 原候选计划的缺口 | 当前落点 |
| --- | --- |
| 跨扩展.ts import会影响OJ rootDir／emit | 新增纯声明becoder-beacon.d.ts、native重导出、OJ两个tsconfig显式include，保持三来源执行producer类型 |
| 运行写入可能重新取得当前根 | 显式beginActivity scope、活动内固定根身份／代数，含Runner准备后路径、CPH judgeView及Notebook；不按模式或聊天失效 |
| 旧Notebook30条与活动超额未定算法 | v1读取不改盘；下一真实写原子v2；最新20条并集同根全窗口真实活动，损坏不当空覆盖 |
| Get／Import参数与完整题面来源不一致 | 保留原参数顺序并追加acquisition；scope显式undefined不重捕获；CPH样例不伪装完整题面 |
| 展示sending／preparing会被误当提交事实 | 使用原生prepared handle／requestId，独立观察回调与预览finish分离，正式记录更新同一真实尝试 |
| 代码对象／分页与旧位置参数含糊 | targetSelection区分跟随／指定、读同次观测、ContextToolOptions及严格未保存续页，队列与分支边界不变 |
| Notebook自动读取可能产生编辑副作用或回退原文 | 原生只读内容API、FileTools授权与readRepresentation、先投影再分页／搜索；不加编辑锁、备份或保存 |
| 下一prepareStep可能领先会话checkpoint | 累计raw seal＋request／watermark、完成工具sink与直接await的prepare；新raw与summary可同一次确认保存 |
| SDK observer抛错不能阻断、适配后输入可能增加 | prepareStep＋middleware＋最终fetch三关卡；固定实际O，真实adapter body检查，observer错误锁存 |
| 摘要隔离clone会被旧whole-conversation merge吞掉 | 显式确认writer、原生expectedScope发布前核对、保本地草稿并rebasing pending、失败候选不补存 |

定向复核另指出七处工程歧义，已修正：v1事件sequence与队列顺序分离；去重键与每次新插入id分离，防旧精确引用命中新正文；OJ显式活动保护／收尾；ProblemResolution跨扩展声明与family规范化；stopped保已接收正文而error仅保完成工具；工具完成去重含逻辑step身份；完整工具description进入计量和usage锚指纹。对应回归均在各自Task中列出，不增加产品存储层或新功能范围。

SDK核对针对本地已安装`ai@7.0.111`及锁定的adapter，不宣称线上最新。关键证据为SDK的prepare-step-call-settings、stream-text／execute-tools-from-stream、util/notify及provider middleware声明；未修改或运行依赖源码。既有参考项目研究仍按原固定提交身份解释。

## 实施边界

本轮没有执行新计划中的TDD、API评估或staged构建；计划中断言样例不是通过记录。产品数值与材料职责继续沿已通过方案：Get13、四执行来源各20、对话代码10／256KiB、同步摘要90%／60%、软件采集与模型消费分开。

图片token无法可靠估计的准入已得到负责人明确选择：保留图片、标记未知覆盖并允许请求，服务端拒绝后仍至多一次合法恢复，不丢图、不填0、OCR或换模型。决定已同步到需求LONG04、压缩规范和[计划§5.2](../../superpowers/plans/2026-11-22-beacon-foundation-implementation.md#52-已确认的图片预算边界)。其余源码接线属于工程修订，没有剩余必须重开配额、Blackout或题目绑定规则的产品问题。

## 复核与下一步

主代理自查覆盖spec到任务映射、每步可检查结果、类型／参数一致、Review Focus与真实测试落点、计划与规范比例。定向只读复核围绕原发现闭合，不把源码调研当编译／运行通过。文档机械检查另核现存链接／锚点、141稳定ID、源码／命令入口；四份已通过规范保持字节原状，需求仅改LONG04、压缩规范仅新增已确认媒体准入段，本轮限六份文档。

推荐Native方式由主代理按依赖连续整合，最后独立只读审阅，减少Store／ContextTools／history的共享文件交接；逐任务子代理与审阅也可选择。待计划审阅及执行方式确定后，再进入隔离工作区准备与实际开发。本次本地备份保持不变，不自动追加提交或推送。

## 本轮结论

两位只读源码审阅者对其原发现的最终定向复核均无剩余阻塞；该结论限已列接口与生命周期闭合，不能代表完整产品代码review或运行验收。主代理另完成writing-plans五项自查，并保留待负责人审阅执行稿的状态。

机械校验已通过：项目文档结构、13份现行文档的113个本地链接／锚点、141稳定需求ID、九项任务、68处源码路径、六个命令owner与八段TypeScript代码块语法。四份已通过规范原样保留，另外两份仅承接明确图片准入决定；本轮六文档之外无改动，HEAD与索引仍为备份状态。语法检查不做产品类型解析，候选新增文件不存在属于正常计划状态。

本轮尚未运行任何产品测试、构建或模型请求，未生成新staged应用，未提交／推送。执行稿已具备供负责人审阅与选择方式的条件；后续实施按真实红灯、绿灯、源码审查、强模型观察和负责人验收分别取证。
