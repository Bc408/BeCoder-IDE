# 蓝桥执行路径补证

2026-11-20，Asia/Shanghai。基线 `OJ_connect@ce98c93aceeee40bbf09220fd0a1a327dd8f5409`。负责人选择按单次人工卡片补证，在真实产品隔离窗口手动提交一次 C++，反馈通过。代理没有发送 source/report，没有重复提交或恢复旧 Edge／Node inspector 路线。

## 隔离与动作

复用此前已核验的研究 Global BrowserSession，真实开发入口与14份关键源码／现有输出逐字节绑定；实际 appPath、portable/userData/sessionData/Global Session 路径均核验。Electron 43.7.3、Chromium150，未改 UA/TLS/代理/证书/sandbox。先 GET basic 与254详情，再打开官网编辑器；当前题型 contest_oj、in_contest false、contest_id/vm_config null，C/C++ 均为1s/256MB。页面就绪后才启用只读观察器，借用产品已有 debugger 的根连接；没有记录认证过程或 Cookie。

实际源码171 UTF-8字节，仅规范CRLF→LF后的SHA-256：`42f7450a8c905d96ebd98249b01ad921d86460f439d097c848c9b6479f2ed275`。观察到一次source POST、一次官网自然report POST。report正文没有读取，以避免接触隐藏测试I/O；query/header/Cookie和原始响应没有落盘。

## 实际执行与正式记录

- 当前页面实际资源记录包含两次同一执行GET：`https://opcenter.lanqiao.cn/api/v1/evaluation/questions/43756/submissions/6aff1ff717e87398a15a4abf/?is_submit=true&judge_client=2`。
- 同一页面Session的固定GET核对题目详情 `id:254, question_id:43756`，本人列表含同ID/cpp，正式详情 `submission_id:6aff1ff717e87398a15a4abf, problem_id:254, language:cpp, status:AC, pass_sample:5 / 5`。
- 详情源码171字节，归一化哈希与实际发送稿一致。耗时27ms、内存1672官网kb；不推断kb换算基数。
- 原生basic前后均200、同进程随机盐HMAC一致。正式详情没有owner，不宣称逐字段核对记录owner。

这证明本次官网自然执行地址的结构与本次正式记录关联，不代表OJ Connect原生发送已实现；C、异常判词及服务端report作用／幂等性仍未实证。

## 观察器错误与恢复边界

source请求已成功记录次数、token与源码哈希，但响应投影失败：研究器只允许字母路径段，真实执行路径的数字question_id被拒。其通用错误投影也未单独保留HTTP码，因此不能补写本次source/report HTTP200或执行status。

随后只读连接本次已启动产品自身的Chromium调试端点，核验PID/exe/研究目录/loopback与精确题目URL，再投影当前页面resource timing。第一次过窄过滤得到空结果；第二次只输出未知段形状，明确数字question段；第三次允许公开数字question_id后取得上述安全完整路径。没有页面输入、网站请求或Node inspector操作。随后三个固定GET核对题目／本人列表／同ID详情；前后身份另由原生basic核对。没有为恢复证据再次POST或读取report正文。

这是一项采证编排失败及其只读恢复，不是官网或产品提交失败。原始失败保留在本地忽略SDD工作区。源码未改，研究窗口正常关闭，profile保留。

## 任务0契约结论

执行地址只接受本次核实的 `https://opcenter.lanqiao.cn/api/v1/evaluation/questions/{questionId}/submissions/{submissionId}/?is_submit=true&judge_client=2`；questionId必须与当前题目详情的question_id一致，submissionId必须与本次source回执一致。仅此操作白名单，不放行整个opcenter API。生产采用已观察的opcenter直连；官网 `/opcenter` 改写只是静态证据，不新增自动备用路线。24位小写hex仍是本站当前观测形状，变化即明确不支持。

[运行契约](lanqiao-runtime-contract.md)汇总当前目录、题型与其余固定请求。任务0必要来源现已补齐，产品实施授权已取得；真实产品原生POST及最终验收仍分别验证。
