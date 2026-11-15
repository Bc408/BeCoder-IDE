# 洛谷界面对齐与验证码 P0 排查

用户在干净stage报告：正确输入图片验证码后又出现新验证码；随后指出题面信息区落到按钮下方。用户要求构建前引入子agent，核对上游4.20.0实现和效果，再修改。

## 界面修正与复查

已移除本地自行加入的600px纵向header规则，恢复上游左右排布与420px窄屏阈值。独立源码审查继续发现提交组额外wrap／宽度限制、标签点击state、固定26px标题偏差，已撤回并复用上游提交组flex、标签hover三层结构／透明度过渡／模糊浮层，增加键盘focus支持。保留缺字段隐藏、跨站语义和不加入题解的既定边界。

多题面语言控件保留：网站确有多种题面时显示下拉，仅一种时不显示；不能把单语言截图复现当作删除多语言的理由。独立probe使用单语言B2001和长C++语言名，正式render同时保留双语言切换测试。上游样例来自problem.samples，不随正文locale切换。

最终独立对照实际载入上游app.css与submissionControls.css并匹配#app，相同DOM／字号／长语言名下532与596 CSS像素的header、标题区、元数据、提交／语言控件坐标与本地新版相同。532时提交文字折两行、596时单行为相同上游模型行为，未继续增加自定义窄屏补丁。证据为tmp/oj-connect-audit/fidelity-render-full-upstream与fidelity-render-final；DPR2仅为设备像素比例，不假称页面缩放。多语言链路另经源码审查及正式render验证保留。

记录页Luogu顶层状态改用上游完整名称，测试点保留短码，其他站原始状态保留；复用三段分数配色、语言先于代码长度的行序，中文记录详情／评测分数／编译信息／说明/提示文案，以及协议已有自适应时间、内存格式函数。整题Markdown复制、附件、记录题目信息和插件内回跳等此前缺口不伪称已全部移植。

## 验证码结论边界

已逐段读取上游api.ts getCaptcha/submitCode、workspaceUtils askForCaptcha与请求拦截器。当前图片与POST固定端点、captcha原样字段、同一Session及图片base64显示未见确定丢参。旧fixture固定答案不能证明真实图片挑战绑定。

独立审查确认并修正另一个确定竞态：正常回答后主进程也广播cancel，可能延迟关闭下一轮相同任务的提示。现done幂等，仅真正取消时广播；正常回答由自身面板finally释放，沿用上游语义。真实问题表现为反复服务端拒绝，该竞态不能单独认定为用户P0根因，尚未声称修复。

新增最小诊断：主进程日志仅记录阶段、任务ID、HTTP状态、响应类别、图片摘要／字节数、输入存在性／长度、会话代际及凭据是否变化。不记录验证码、源码或Cookie值。需在本次诊断stage中由用户完成一次真实输入；再次拒绝就取消，保留窗口供读取日志。

## 证据与交付

源码agent分别负责UI、提交生命周期；渲染agent使用隔离Chromium，主代理另查源码与最终截图。精确日志位于tmp/oj-connect-audit/shared-workflow：fidelity-ui-*（含RED/渲染/类型/lint）、fidelity-record-units-*、captcha-round-*（连续两轮取消竞态RED→GREEN）、fidelity-native-*、fidelity-final-*。

第一次captcha-p0-stage构建因用户要求先审查而主动停止，不能算通过。Portable已恢复，记录captcha-p0-stage-interrupted.json。最终构建用fidelity-stage，用户数据保留／恢复使用独立preserve-portable-fidelity.ps1，避免覆盖前轮暂存。仅stage，无Setup、Git操作或自动真实提交，真实P0结论须后续响应证据。

## 后续真实诊断与直连候选

用户确认同一台电脑、同一网络下原版洛谷插件能输入验证码并成功提交。最新诊断连续三次 HTTP403：验证码答案字段存在且长度为4，会话代际与凭据保持不变，每轮仅一次图片请求；没有正常输入后重复取图的证据。匿名真实 GET 也证实 Session.fetch 并非普遍不发送 Cookie，不能据此宣称“验证码丢参”或“Cookie 未发送”。日志不记录源码、答案与 Cookie 值。

已核实上游 Axios 使用 `proxy:false`，而当前浏览器会话的图片与提交地址均解析为 PROXY。候选改为固定洛谷 HTTP 操作的 Node HTTPS 直连（`agent:false`）；验证码图片与提交同时切换，继续逐次读取同一浏览器会话凭据。保持浏览器 User-Agent 不变，以隔离传输差异。退出登录仍走原 Session.fetch，保留浏览器 Cookie 清理；不加入失败回退或未知回执重发。代理差异目前是待真实提交验证的假设，尚未证明为 P0 根因。

Electron43.7.3 真实只读验证使用原有专用协议测试 profile：账号 signed-in（587ms）、P1001 一组样例和16种语言（787ms）、既有记录 AC（316ms），没有创建浏览器窗口或发送 POST，见 `direct-readonly-electron`。该专用 profile 不导入 stage。传输测试覆盖精确 JSON／UTF-8 字节长度、最新会话 Cookie、UA、直连选项、重定向不重放、取消、超时、响应流错误、压缩体上限与账号变化拒绝；宿主 fixture 的网络 seam 为合成端口，不能替代真实传输证据。

首次 `direct-client-typecheck` 因测试 Buffer 泛型推断过窄而失败，修正显式 Buffer 类型后重新验证。首次 `luogu-direct-green1` 实际失败：测试在发送前取消却断言请求已销毁，属于测试时序问题；已改为等待明确的请求发出信号，后续8项通过。没有把这些失败计作通过证据。最终 source／stage 结果以 `direct-*` ledger 为准；P0 仍须负责人一次真实验证码成功提交后确认。

独立审查另发现压缩响应取消时未销毁解压流，已先用真实 gzip decoder 复现 RED，再修正统一失败收尾，最终传输测试9/9通过；复查无新增阻断项。最终客户端类型检查、零 warning scoped lint、宿主 Electron 合成用例与再次真实只读请求均通过；OJ Connect 70项测试通过。stage 继续以干净数据生成，不恢复任何旧账号 profile。没有运行真实提交、Setup、Git 或自动启动 stage。
