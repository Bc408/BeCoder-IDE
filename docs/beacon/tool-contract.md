# Beacon 工具合同

更新：2026-11-25。本文维护当前九工具的能力、请求、结果与业务字段；需求见[PRD](prd.md)，存储／执行生命周期见[底层设计](foundation-design.md)，真实验证见[实现状态](implementation-status.md)。表内JSON均为合成结构示例，不是执行结果或质量验收。

## 1. 工具分工

Beacon跟随学生当下的学习活动。harness取得并整理真实业务事实，LLM按问题选材、理解和教学；系统不固定讨论对象。新方案包含9项工具能力、3个共享业务队列，没有独立代码存储和模型内容写工具。

| 工具能力 | 确定行为 |
| --- | --- |
| readCurrentCode | 读取调用当下所有可见分屏中的C/C++代码页面，每页完整正文，含dirty、文件名和路径；后台标签不读 |
| readProblemRecord | 无ID列problem目录，有ID读该条完整读题记录 |
| readRunRecord | 无ID列run目录，有ID读一份程序的完整编译与输入运行记录 |
| readVerdictRecord | 无ID列verdict目录，有ID读完整最终评测记录 |
| fetchProblem | 按oj＋problemId只读联网获取五站题面，与聊天搜索开关互不影响 |
| inspectFile | 保留现有文件读取、目录、查找和搜索能力 |
| readPage | 保留其余获准的非C/C++普通页面读取；PDF和复杂提取本轮不展开 |
| readMaterial | 保留当前有效对话内已有授权材料读取 |
| browseWeb | 保留搜索／网页获取，仍由聊天搜索开关控制 |

模型文件工具名为inspectFile，内部复用FileTools。三个记录工具分别注册，模型不填写统一readRecord的type／producer分派参数。

codesnap全部撤回：没有独立正文、保存、队列、目录、历史回读、去重、晋升或淘汰。移除editNotebook，模型输出内容写入后续另行设计；Notebook的独立用户功能保留。

## 2. LLM实际使用的入口

参数均为JSON对象。以下伪TypeScript只用于说明字段；实际schema和执行校验由contextToolContract.ts及文件／网页工具维护。

~~~ts
readCurrentCode({})

readProblemRecord({})             // 目录
readProblemRecord({ id: string }) // 单条正文
readRunRecord({})
readRunRecord({ id: string })
readVerdictRecord({})
readVerdictRecord({ id: string })

fetchProblem({ oj: 'luogu' | 'codeforces' | 'atcoder' | 'nowcoder' | 'lanqiao', problemId: string })
inspectFile({ operation: 'read' | 'list' | 'find' | 'search', path: string, query?: string, offset?: number, limit?: number })
readPage({ id: string, version: string, offset?: number, limit?: number, pageNumber?: number })
readMaterial({ id: string, offset?: number, limit?: number })
browseWeb({ operation: 'search' | 'fetch', query?: string, url?: string })
~~~

三个记录工具各自返回当前队列全部保留条目的简短目录，不读正文。目录包含实际ID、时间、来源、文件信息和结果摘要；题目信息仅属于problem／verdict，run目录不带题目。目录按需获取，不在每次模型请求自动附上三个队列，也不另设目录工具。

指定ID后，默认返回该条完整、已整理的持久记录。模型不再填写producer、revision、part、sampleIndex或stream来拼装事实。内部身份、权限和同版读取由harness负责；列目录不固定讨论对象，不等于读过正文。

打开页面和主动材料保留既有安全元数据入口，不增加统一资源库或工具发现服务。新语义工具拒绝多余字段，ID不接受null或空串。readPage的PDF pageNumber为从1计数的物理页，offset／limit沿原范围语义；不新增OCR或复杂提取能力。

成功返回：当前代码为{files:[{fileName,filePath,isDirty,code}]}，记录为{records:[目录项]}或{record:完整记录}，fetchProblem为{problem,document,retrievedAt}。document包括title、bodies、samples、limits、interactive及可得difficulty／tags。文件／网页保自身结果结构；readPage／readMaterial保ok、contents和范围／来源元数据。

新语义工具错误为{error:{code,message}}，code为invalid_arguments、unavailable、not_found、read_failed、network_error、login_required或parse_error；取消沿AbortSignal。错误不当空记录，message不暴露堆栈或密钥，不自动换根、换条目或重试。

description只述用途，教学与ID不转述等规则由system承接。实际定义见[contextToolContract.ts](../../extensions/becoder.beacon/src/contextToolContract.ts)、[fileTools.ts](../../extensions/becoder.beacon/src/fileTools.ts)和[webTools.ts](../../extensions/becoder.beacon/src/webTools.ts)。

## 3. 工作区、模式与三个队列

“全局”只指当前所选.beaconWork内跨对话共享，不跨工作区。正常所选根才采集；无根／异常不写替代位置，之后不补采。Blackout不停止有效根采集，但禁止Beacon消费持久目录和正文。

| 队列 | 容量 | 保存单位 | 更新规则 |
| --- | --- | --- | --- |
| problem | 13条 | 五站用户Get Problem／Import to CPH读题行为 | 按problem（oj＋problemId）与filePath共同去重；二者完全相同时移除旧项，新ID与新viewedAt入队尾；同题不同文件分别占位 |
| run | 30条总额 | 一份程序的一次编译及其对应的输入运行 | 三来源共用，不作内容去重，结束后入队 |
| verdict | 20条 | 完整取得的最终线上评测结果 | 同站同题内，实际提交代码完全相同则移除旧结果、新结果入队尾；缺可靠代码则跳过去重 |

写入失败保留已发布队列，不先淘汰再尝试保存；观察失败不阻断用户核心操作。普通工具返回按对话历史保存，运行稿／提交稿属于原记录，不再另存一套代码。

## 4. 当前代码

readCurrentCode一次读取所有当前可见分屏中的C/C++代码页面，每页取得整份正文，包括屏幕滚动区域外的代码和未保存修改。它不读后台未显示标签，不因焦点不在代码上而改读某份上轮文件。

返回按页面分别组织代码、文件名和路径；未命名可见C/C++页面也读取，filePath为null，不要求先保存。结果为files数组，每项fileName／filePath／isDirty／code。无可见代码应明确为空，读取错误不冒充无页面。readCurrentCode不需要模型先列代码页、抄pageId或选择版本。没有可读代码时如实表示，无权读取的内容按原敏感过滤处理；页面读取不授backing file、邻近文件或其他会话权限。没有跨调用全文缓存，旧快照文件保留隔离，不自动迁移或删除。

新的调用可取得修改后的代码，当前读取不要求先保存。工具没有代码持久化副作用；发送、继续、重答或协议回放不捕获代码。没有独立代码保存上限；完整结果仍受模型输入容量约束。

## 5. problem和五站题面

problem表达用户在何文件上、何时取得哪道题；题目身份为oj＋problemId，记录去重还比较filePath。只采集洛谷、Codeforces、AtCoder、牛客、蓝桥Get Problem／Import to CPH；不持久保存题面正文，不建立永久题目绑定。最近一次行为无可靠路径时filePath:null；同题且同为null仍按字段相同去重。重看生成新记录ID，旧ID不转指新记录，读取行为不更新viewedAt。

fetchProblem是五站正式题面唯一专用入口。复用OJ Connect Get Problem核心解析，返回实际题面、样例、限制及来源提供的信息。五站ID需要能够唯一识别站内题目，不丢比赛／题集身份；已确认复用OJ Connect规范标识：luogu为P1001或P1001@12345，codeforces为2026/A，atcoder为abc300/abc300_a，nowcoder为problem/12345或contest/12345/A，lanqiao为12345；均为字符串。harness负责转换、校验及可往返适配，不让模型同时重复填写URL、站点和原生ID。

fetchProblem与搜索开关互不影响：关闭或打开聊天搜索不改变取题能力；取题也不改变browseWeb开关。browseWeb默认开启，联网开关和本地文件权限分别判断；免额外搜索密钥是方向，具体服务可用性另验。

模型取题只进入普通上下文，无专门缓存／队列，不更新用户看题时间，不创建源码、不导入CPH、不打开或切换面板、不登录或交题。认证、网络、解析错误按实际来源返回，不回读旧题面冒充新观测。

## 6. run的粒度与内容

### 6.1 一份程序对应一条记录

“程序”和“测试数据”分开计数。一份程序编译一次，对应一个或多个input／测试点，组成一条run记录。

| 用户操作 | 入队条数 | 记录内部 |
| --- | --- | --- |
| Runner Run／Run With Input | 一条 | 一份程序与本次实际输入／输出 |
| CPH运行一个测试点 | 一条 | 一份程序、一份编译信息、该测试点 |
| CPH测试全部 | 一条 | 一份程序、一份编译信息、多组测试数据与结果 |
| CPH仅编译，不运行 | 零条 | 不产生run记录，不占队列位置；编译成功或失败均如此 |
| Notebook同一代码块运行多个input | 一条 | 该代码块、一份编译信息、多组input与结果 |
| Notebook运行全部涉及N个代码块 | 对实际开始编译的代码块分别形成记录 | 每条对应一份代码及其input，不将整个Notebook点击压成一条 |

单点／全部操作等权占位，不按测试点数增加队列元素。Notebook多程序分别成条；独立运行即使代码和输入相同仍分别保留。

对应程序的输入运行结束或该程序尝试失败／取消后才入队，不在持久队列中维护运行中的占位和进度。编译失败仍按此前已确认的失败尝试保留一条，关联input标为未执行；尚未开始编译的后续程序不凭空生成尝试。用户停止后保留已经实际发生的内容。

### 6.2 共同字段与来源差异

每条记录按“一份程序及编译信息＋输入结果列表”组织。harness统一共同概念，来源未提供的项保持缺失；下列业务含义已定，字段见6.3—6.5。

| 内容 | 需要保存的事实 |
| --- | --- |
| 来源与对象 | runner／cph／notebook、实际文件或笔记路径、真实时间；不附加题目身份 |
| 程序 | 实际编译输入的正文，不用当前编辑稿补旧稿，不以mtime／hash猜测重现 |
| 编译 | 实际编译器、参数、诊断、状态和耗时，一次真实编译不伪装成每个input都编译 |
| 输入结果列表 | 每组实际输入、可得期望、实际输出、状态、耗时与退出情况；不保存运行限制配置 |
| 保留范围 | 真实采集缺口、输出保留头尾与省略量，不把未读／未采集当空值 |

CPH保原测试点序号、输入／期望／实际与check结果，不保存检查器类型、配置、路径、正文、命令或诊断；整轮结束不等于全部通过，本地通过不等于线上AC。Runner区分Run／Run With Input，保实际送入程序的输入与实际返回、停止／退出状态；不存按键编辑过程，回显不冒充完整stdin，合流不伪装成分离流。

Notebook保笔记文件与执行时代码块序号：**只数C/C++代码块，从1开始**。其下各input保各自身份和结果；之后调序不改历史序号，不据旧稿推定当前笔记内容。

harness完成事件归并、字节解码、流整理、过滤及最终记录表示；模型不消费原始事件包来重建运行。

### 6.3 run字段基线：三来源统一表达

本节及6.4—6.5维护run字段合同。以下完整示例均为合成数据，不是实际运行、源码验证或模型验收。三类来源共用一份记录结构；不新增统一资源库、事件存储层或引用版本协议。

#### 6.3.1 完整记录外层

| 字段 | 类型／出现条件 | 含义 |
| --- | --- | --- |
| id | string，必有 | 本条真实记录的不可变ID；不让LLM生成别名 |
| source | runner／cph／notebook，必有 | 用户实际使用的执行来源 |
| operation | string，必有 | Runner为run／run-with-input；CPH为test-one／test-all；Notebook统一为run-inputs，输入范围由runs表达，不根据数量猜用户点了哪个原生菜单 |
| startedAt、endedAt | 带时区的ISO 8601字符串，必有 | 本程序组的真实开始、结束时间；运行组结束后才发布入队，不以落盘或工具读取时间替代 |
| status | completed／compile-failed／cancelled／failed，必有 | 本程序组如何结束，具体定义见6.3.5 |
| workingDirectory | string，可得时 | 本次程序执行的实际工作目录；编译目录另在compile内 |
| command | string，仅Runner且入口实际提供时 | 本次用户的BC运行命令；不是Shell授权，不记录clear、help等非编译运行操作 |
| program | object，必有 | 唯一一份实际编译代码及其用户文档位置 |
| compile | object，必有 | 唯一一次真实编译的事实 |
| runs | array，必有 | 本程序对应的input／测试点，按本次实际执行计划顺序组织；通常Runner一项、CPH／Notebook一项或多项 |
| error | string，实际流程错误时 | 简短且经原敏感过滤的流程错误；不填入Python检查器诊断或堆栈 |
| gaps | string[]，实际采集有缺口时 | 简短指出缺失事实及影响，不用模型猜缺字段是否等于空内容 |

run的目录和正文都不带problem、oj、problemId、题目标题、URL或题目候选；不透传CPH原始problem对象，也不从Get Problem、文件名或关联情况补齐。文件名或用户代码自身包含题号属于原始事实，不抹除，也不解释成已绑定题目。

#### 6.3.2 program与compile

| 字段 | 类型／出现条件 | 含义 |
| --- | --- | --- |
| program.filePath | string，必有 | Runner／CPH为本次源码文件；Notebook为实际笔记文件，不能填临时抽取的C++路径来冒充用户文件 |
| program.codeBlockNumber | positive integer，仅Notebook | 执行时仅按C/C++代码块从1计数；后续调序不改历史 |
| program.language | c／cpp，必有 | 执行层实际使用的语言 |
| program.code | string，必有 | 实际编译输入的完整正文，不用当前稿补旧稿，不按输出额度裁剪；不是独立代码快照 |
| compile.status | succeeded／failed／timed-out／output-limit／cancelled／start-failed | 编译阶段真实结束情况，无active状态 |
| compile.compiler | string，可得时 | 本次真实编译器路径 |
| compile.args | string[]，可得时 | 真实参数数组；不持久化环境变量，不用参数字符串再次执行命令 |
| compile.workingDirectory | string，可得时 | 编译器的实际工作目录 |
| compile.durationMs | non-negative number，可得时 | 唯一一次实际编译耗时；不复制到各input并计作多次编译 |
| compile.exitCode、compile.signal | integer／string，可得时 | 真实退出码／终止信号；未取得不填0或伪造信号 |
| compile.output | 输出对象，实际取得时 | 编译诊断的真实可得流；编译层可分别提供stdout／stderr，不按程序输出的显示方式反推 |
| compile.error | string，实际启动／编译流程错误时 | 事实性错误，不以工具调用成功冒充编译成功 |

program.filePath遵循已定采集资格：没有正常根或笔记没有可采集的真实路径时，不为该程序造一个队列记录或备用路径。readCurrentCode可以读取未命名页面并返回filePath:null，这是另一项能力，不自动扩大运行采集范围。

按负责人审阅决定，run不保存本地执行的时限、输出上限等运行限制配置，不提供runtimeLimits，也不改名嵌入其他字段。真实耗时、超时／输出超限等实际结束状态与输出省略事实继续保留。执行器已有运行限制和Beacon的8KiB保存规则各自照常生效。

#### 6.3.3 runs中每个元素

| 字段 | 类型／出现条件 | Runner | CPH | Notebook |
| --- | --- | --- | --- | --- |
| input | object，必有 | 本次文件输入或交互输入 | 本次测试点输入 | 本次input正文 |
| input.mode | interactive／file／text | interactive或file | text | text |
| input.text | string或null，必有 | 可靠正文；无法可靠取得交互正文时null | 已确定的输入正文 | 点击本次运行时确定的输入正文 |
| input.filePath | string，仅file且实际可得 | 实际输入文件路径 | 不造临时输入路径 | 不造临时输入路径 |
| testCaseNumber | positive integer，仅CPH | 省略 | 本次操作前原测试点列表中的序号，从1开始 | 省略 |
| inputCellNumber | positive integer，仅Notebook | 省略 | 省略 | 执行时整个笔记中单元格的位置，从1开始，包含所有类型单元格 |
| inputName | string，仅Notebook且实际存在 | 省略 | 省略 | 用户当时给input的名称，可重复，位置另外表达 |
| expectedOutput | string，仅CPH且实际提供 | 省略 | 该测试点的期望输出，允许真实空字符串 | 省略 |
| status | completed／runtime-error／timed-out／output-limit／cancelled／start-failed／not-run | 实际程序结束情况 | 实际学生程序结束情况 | 实际程序结束情况 |
| durationMs | non-negative number，可得时 | 本次程序耗时 | 本测试点程序耗时 | 本input程序耗时 |
| exitCode、signal | integer／string，可得时 | 真实值 | 学生程序真实值 | 真实值 |
| output | 输出对象，实际取得时 | merged | stdout、stderr | merged |
| check | CPH实际结果字符串，仅产生结果时 | 省略 | 仅本测试点最终check结果 | 省略 |
| skipReason | compile-failed／cancelled／failed，仅not-run | 真实未执行原因 | 同左 | 同左 |
| error | string，实际程序流程错误时 | 事实性错误 | 学生程序事实性错误，不放检查器诊断 | 事实性错误 |

input.text是本次执行输入，不证明程序已读取其中每个字符。not-run项保已确定的输入和身份，但不伪造输出、耗时、退出码或check。空输入为""，未取得为null，不适用的来源专有字段直接省略。null须配gaps说明；编译成功且已确认没有输出时相应流为""，不能用空串掩盖未采集。

Runner交互输入必须来源于执行层能够可靠提供的实际输入正文。源码当前input-forwarded可能包含编辑／控制输入，不能直接拼接为最终stdin。本稿不为填满字段改变终端语义，也不保存按键过程或从回显猜输入；取得可靠正文之前允许text:null并如实说明缺口，这不等于已经交付完整交互输入采集。

Notebook程序输出与辅助进程报错保持来源区别：辅助程序的错误不能放进学生程序的stderr来冒充分流。执行owner实际报告的简短失败原因可以进入error；采集适配器不从终端页面或Notebook已渲染outputs补证，不据此改动原生结果界面。

CPH的check使用现有结果名：passed、wrong-answer、runtime-error、time-limit、cancelled、output-limit。只承接CPH本次实际结果，不由Beacon重判。Python特判同样仅保check值，不保存检查器类型、配置、路径、正文、命令或诊断。没有产生最终check时省略，不编造passed。

check与程序status是不同事实：学生程序正常退出时，CPH仍可能给出wrong-answer；检查过程的time-limit不能据此说学生程序超时。本稿不新增检查器详情。检查器代码沉淀登记为后续开发事项，排期另定；对拍检查器与随机生成器能力继续待设计。

#### 6.3.4 输出与省略表示

完整输出直接用字符串，不为每条正常输出附加重复的计数和完整标记。output对象只使用真实流键：CPH程序为stdout／stderr，Runner和Notebook程序为merged。同一阶段不同时给合流与分流副本，不拆解已有合流。Runner的merged表达终端程序输出，可能含回显，不称纯stdout；终端控制序列由采集适配器按既有规则整理，不混入宿主运行横幅／提示来冒充程序输出。

某一流需要保留头尾时，该流的值改用下面的例外对象。这里是局部形状示例，实际额度按整条记录计算：

~~~json
{
  "merged": {
    "head": "开始\n",
    "tail": "结束\n",
    "omittedBytes": 12000
  }
}
~~~

omittedBytes只计Beacon的8KiB规则从已取得、已解码整理的UTF-8正文中省去的准确字节。若执行层先发生可确认的输出丢失，同一对象另给sourceOmittedBytesAtLeast，表示上游已观察但未取得正文的字节下界；未知数量只在gaps解释，不造0或准确总量。头尾指已取得正文的头尾，不在源头已截断时冒充整个程序全程输出的头尾。

8KiB跨流分配算法：先汇总编译和所有input的实际程序输出流；总量不超8192则原样保存。超出时，在非空流间均分正文额度，短流剩余额度继续分给长流；按采集器固定的通道顺序分配余数，单流超出额度则各取约一半头尾并退回UTF-8字符边界。保留所有input身份／状态和真实省略量，即使某流没有正文额度也不删该项。结构和省略说明不计入8192正文字节；不靠裁掉输入／源码／期望输出满足额度，不在工具读取时再分配模型动态预算。

#### 6.3.5 状态与失败

外层status描述本程序组的执行流程：completed表示本次请求的各输入处理正常走到结束，允许其中有runtime-error或check错误；compile-failed表示编译未成功、输入未执行；cancelled表示用户停止本程序组；failed表示执行设施或流程故障导致未完成。它不表示题目通过，也不在持久队列维护运行中状态。

compile.status只描述编译阶段；runs[].status只描述学生程序，不把Python检查器进程状态套到学生程序上。compile失败时保runs中已确定的输入并标not-run／compile-failed。主动停止时已结束的输入保原结果、当前实际启动的输入标实际取消结果、剩余已计划输入标not-run／cancelled。Notebook未开始编译的其他程序不生成整条记录。

failed、start-failed等只从执行owner的真实结果转换，不能用模型判断填充。取消、采集或落盘失败都不补跑；成功保存原子发布，失败保已发布队列。以上字段不会改变执行owner的停止、清理和并发拒绝规则。

### 6.4 三来源完整记录示例

以下展示持久记录本身，也是readRunRecord带ID返回的record值。为了比较语义，三例使用同一份合成程序：当a>b时误作减法。因此2 3得到5，7 1得到6；Notebook／Runner正常退出不自动得到答案正确结论。编译器路径、临时路径和时间均为合成示例，不是需要新建的固定目录；执行层自身临时编译输入不构成Beacon代码快照。

#### 6.4.1 Runner Run With Input

~~~json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "source": "runner",
  "operation": "run-with-input",
  "startedAt": "2026-11-24T14:00:00+08:00",
  "endedAt": "2026-11-24T14:00:00.200+08:00",
  "status": "completed",
  "workingDirectory": "C:/practice",
  "command": "run \"C:/practice/sum.cpp\" -WithInput",
  "program": {
    "filePath": "C:/practice/sum.cpp",
    "language": "cpp",
    "code": "#include <cstdio>\nint main(){int a,b;if(std::scanf(\"%d%d\",&a,&b)!=2)return 1;std::printf(\"%d\\n\",a>b?a-b:a+b);}\n"
  },
  "compile": {
    "status": "succeeded",
    "compiler": "C:/BeCoder/toolchain/bin/g++.exe",
    "args": [
      "-std=c++17",
      "C:/Temp/becoder-example/runner/source.cpp",
      "-o",
      "C:/Temp/becoder-example/runner/program.exe"
    ],
    "workingDirectory": "C:/practice",
    "durationMs": 140,
    "exitCode": 0,
    "output": {
      "stdout": "",
      "stderr": ""
    }
  },
  "runs": [
    {
      "input": {
        "mode": "file",
        "filePath": "C:/practice/input",
        "text": "2 3\n"
      },
      "status": "completed",
      "durationMs": 12,
      "exitCode": 0,
      "output": {
        "merged": "5\r\n"
      }
    }
  ]
}
~~~

#### 6.4.2 CPH测试全部

~~~json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "source": "cph",
  "operation": "test-all",
  "startedAt": "2026-11-24T14:05:00+08:00",
  "endedAt": "2026-11-24T14:05:00.300+08:00",
  "status": "completed",
  "workingDirectory": "C:/practice",
  "program": {
    "filePath": "C:/practice/sum.cpp",
    "language": "cpp",
    "code": "#include <cstdio>\nint main(){int a,b;if(std::scanf(\"%d%d\",&a,&b)!=2)return 1;std::printf(\"%d\\n\",a>b?a-b:a+b);}\n"
  },
  "compile": {
    "status": "succeeded",
    "compiler": "C:/BeCoder/toolchain/bin/g++.exe",
    "args": [
      "-std=c++17",
      "C:/Temp/becoder-example/cph/source.cpp",
      "-o",
      "C:/Temp/becoder-example/cph/program.exe"
    ],
    "workingDirectory": "C:/practice",
    "durationMs": 140,
    "exitCode": 0,
    "output": {
      "stdout": "",
      "stderr": ""
    }
  },
  "runs": [
    {
      "testCaseNumber": 1,
      "input": {
        "mode": "text",
        "text": "2 3\n"
      },
      "expectedOutput": "5\n",
      "status": "completed",
      "durationMs": 9,
      "exitCode": 0,
      "output": {
        "stdout": "5\n",
        "stderr": ""
      },
      "check": "passed"
    },
    {
      "testCaseNumber": 2,
      "input": {
        "mode": "text",
        "text": "7 1\n"
      },
      "expectedOutput": "8\n",
      "status": "completed",
      "durationMs": 11,
      "exitCode": 0,
      "output": {
        "stdout": "6\n",
        "stderr": ""
      },
      "check": "wrong-answer"
    }
  ]
}
~~~

#### 6.4.3 Notebook同程序多个input

~~~json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "source": "notebook",
  "operation": "run-inputs",
  "startedAt": "2026-11-24T14:10:00+08:00",
  "endedAt": "2026-11-24T14:10:00.250+08:00",
  "status": "completed",
  "workingDirectory": "C:/practice",
  "program": {
    "filePath": "C:/practice/study.bcnb",
    "codeBlockNumber": 2,
    "language": "cpp",
    "code": "#include <cstdio>\nint main(){int a,b;if(std::scanf(\"%d%d\",&a,&b)!=2)return 1;std::printf(\"%d\\n\",a>b?a-b:a+b);}\n"
  },
  "compile": {
    "status": "succeeded",
    "compiler": "C:/BeCoder/toolchain/bin/g++.exe",
    "args": [
      "-std=c++17",
      "C:/Temp/becoder-example/notebook/source.cpp",
      "-o",
      "C:/Temp/becoder-example/notebook/program.exe"
    ],
    "workingDirectory": "C:/practice",
    "durationMs": 140,
    "exitCode": 0,
    "output": {
      "stdout": "",
      "stderr": ""
    }
  },
  "runs": [
    {
      "inputCellNumber": 6,
      "inputName": "基础输入",
      "input": {
        "mode": "text",
        "text": "2 3\n"
      },
      "status": "completed",
      "durationMs": 12,
      "exitCode": 0,
      "output": {
        "merged": "5\n"
      }
    },
    {
      "inputCellNumber": 8,
      "inputName": "另一组输入",
      "input": {
        "mode": "text",
        "text": "7 1\n"
      },
      "status": "completed",
      "durationMs": 12,
      "exitCode": 0,
      "output": {
        "merged": "6\n"
      }
    }
  ]
}
~~~

Notebook一次编译多input及执行／采集解耦已接入源码；该JSON仅说明结构，验证见实现状态。inputCellNumber与codeBlockNumber计数范围不同，均指执行时位置，不作为回写或永久绑定键。

#### 6.4.4 Runner交互输入缺口示例

~~~json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "source": "runner",
  "operation": "run",
  "startedAt": "2026-11-24T14:00:00+08:00",
  "endedAt": "2026-11-24T14:00:00.200+08:00",
  "status": "completed",
  "workingDirectory": "C:/practice",
  "command": "run \"C:/practice/sum.cpp\"",
  "program": {
    "filePath": "C:/practice/sum.cpp",
    "language": "cpp",
    "code": "#include <cstdio>\nint main(){int a,b;if(std::scanf(\"%d%d\",&a,&b)!=2)return 1;std::printf(\"%d\\n\",a>b?a-b:a+b);}\n"
  },
  "compile": {
    "status": "succeeded",
    "compiler": "C:/BeCoder/toolchain/bin/g++.exe",
    "args": [
      "-std=c++17",
      "C:/Temp/becoder-example/runner/source.cpp",
      "-o",
      "C:/Temp/becoder-example/runner/program.exe"
    ],
    "workingDirectory": "C:/practice",
    "durationMs": 140,
    "exitCode": 0,
    "output": {
      "stdout": "",
      "stderr": ""
    }
  },
  "runs": [
    {
      "input": {
        "mode": "interactive",
        "text": null
      },
      "status": "completed",
      "durationMs": 12,
      "exitCode": 0,
      "output": {
        "merged": "2 3\r\n5\r\n"
      }
    }
  ],
  "gaps": [
    "runs[0].input.text：本次未取得可靠的交互输入正文；未保存按键流。"
  ]
}
~~~

该例表达“已取得终端合流输出，但未取得可靠stdin正文”，不是声称交互输入天然不可采集。示例中的回显不能拿来补input.text；当前无法可靠取得的交互stdin仍按null＋gaps表达，增强能力未交付。

#### 6.4.5 其余已定操作怎样表达

| 操作／结果 | 同一结构中的变化 |
| --- | --- |
| CPH单测试点 | operation为test-one，runs仅一项；保原testCaseNumber，例如原列表第5点仍写5，不改写1 |
| Notebook单input | operation仍为run-inputs，runs仅一项；codeBlockNumber与inputCellNumber保原执行位置 |
| Notebook运行全部多程序 | 各程序分别一条完整记录，各有一份compile；不另增整批父记录或重复保存所有程序 |
| 编译失败 | 外层compile-failed，compile保真实失败事实；已确定输入not-run／compile-failed，无虚构输出或check |
| 部分输入后取消 | 外层cancelled；已完成项不改成取消，实际取消项与未启动项分别表达 |
| CPH某点答案错误 | 学生程序status可为completed，check为wrong-answer；外层仍可completed，后续点照常执行 |

### 6.5 readRunRecord请求与返回

工具说明为：List recent runs, or read one complete run record by ID. 参数schema：

~~~json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "minLength": 1
    }
  },
  "additionalProperties": false
}
~~~

没有id时列目录；id:null、空字符串或多余参数报参数错误，不回退为空参。合法ID可直接读取，不强制先列目录。没有producer／revision／part／stream／测试点参数。

空参返回全部仍保留的简短目录，按最新入队在前展示；内部队列仍以尾部为新。summary由harness根据实际字段确定性生成，不调用模型，也不加入题目推断：

~~~json
{
  "records": [
    {
      "id": "33333333-3333-4333-8333-333333333333",
      "source": "notebook",
      "operation": "run-inputs",
      "startedAt": "2026-11-24T14:10:00+08:00",
      "endedAt": "2026-11-24T14:10:00.250+08:00",
      "status": "completed",
      "program": {
        "filePath": "C:/practice/study.bcnb",
        "codeBlockNumber": 2
      },
      "summary": "编译成功；2份input均正常退出，未作答案检查。"
    },
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "source": "cph",
      "operation": "test-all",
      "startedAt": "2026-11-24T14:05:00+08:00",
      "endedAt": "2026-11-24T14:05:00.300+08:00",
      "status": "completed",
      "program": {
        "filePath": "C:/practice/sum.cpp"
      },
      "summary": "编译成功；2个测试点，1个通过、1个答案错误。"
    },
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "source": "runner",
      "operation": "run-with-input",
      "startedAt": "2026-11-24T14:00:00+08:00",
      "endedAt": "2026-11-24T14:00:00.200+08:00",
      "status": "completed",
      "program": {
        "filePath": "C:/practice/sum.cpp"
      },
      "summary": "编译成功；输入来自文件，程序正常退出。"
    }
  ]
}
~~~

带ID返回外壳为record，值是6.4所示完整持久对象，不再组装第二套正文：

~~~text
readRunRecord({"id":"22222222-2222-4222-8222-222222222222"})
→ {"record": 上述完整CPH记录}
~~~

空目录是{"records":[]}。失败不冒充空目录／空记录；错误外壳例如{"error":{"code":"not_found","message":"该运行记录当前不可读取。"}}。invalid_arguments表示参数不合法；unavailable表示根或模式不允许；not_found表示本根当前无此ID；read_failed表示实际读取失败。被淘汰和从未存在不靠新建墓碑区分。不自动重试、换根或改读其他条目。

## 7. Notebook执行优化与采集解耦

### 7.1 独立执行优化

Notebook编译运行业务优化明确纳入本轮工具层重构。运行全部在点击时确定本次代码、input及对应关系，含未保存修改；中途编辑只影响下次运行。本次执行数据不构成持久代码快照。

同一代码块在本次批量内只编译一次，各input启动独立进程并分别计时、限时、限输出、呈现结果。复用限本次操作，不新增跨次编译缓存，也不把不同代码块按正文合并。

某代码块编译失败，跳过它对应input并明确未执行，继续其他代码块。单个input运行错误／超时／输出超限，保实际结果并继续后续input；用户主动停止则结束整个批次，不再启动剩余内容。

Notebook既有输入关联、顺序、原生结果展示和运行限制保留，每个input显示本次共享编译耗时，不能把复用结果计作新的编译。

### 7.2 模块边界

| 层 | 负责 | 不依赖的内容 |
| --- | --- | --- |
| Notebook／Runner执行层 | 本次输入计划、编译复用、独立进程、取消、输出、真实结果和清理 | Beacon工作区、模型工具、队列容量／文件格式和去重 |
| 采集适配层 | 消费执行层实际结果／事件，按程序组装run并应用8KiB保留规则 | 不决定程序怎样编译／运行，不发起补跑 |
| Beacon存储与读取层 | 根资格、队列入队／淘汰、模式消费和完整读取 | 不参与Notebook执行控制 |

可沿已有模块建立小型结果／回调接点，无需通用事件总线。没有Beacon工作区、采集不可用或落盘失败时，Notebook照常执行；更换执行实现不要求重写记录工具，存储策略也不改编译运行逻辑。

该优化的源码与验证边界见[实现状态](implementation-status.md)。

## 8. 输出保存上限与模型容量

每条run记录的**编译输出＋所有input的实际程序输出合计最多8 KiB，即8192个UTF-8正文字节**。不是每个input各8KiB，也不是整个Notebook批量操作共8KiB。超限保头尾，按来源／阶段／input保身份与省略说明；不能截坏JSON或UTF-8正文。

这是实际采集输出的保存额度，不是整条记录大小，也不把源码、输入、期望值和元数据误计作程序输出。源码、输入和各组状态保持对应关系；原运行器时限与输出限制不因Beacon保存额度改变。实际采集先已省略的内容不能恢复或称作完整。

readRunRecord按ID返回完整已保存记录，包括这些保留片段和省略事实。三个记录工具不再增加part／测试点读取或分页接口，也不因模型当前剩余容量对记录做第二次缩短。

如果工具结果加入后超过模型可用上下文，走既有当前模型同步压缩：在完整工具交换闭合后的下一请求准备处检查和整理，保当前问题、必要尾部和实际工具事实；90%主动线、约60%目标及同一步至多一次恢复保持。压缩后仍装不下，按既定容量失败结束，不静默裁内容、循环重试或重新执行工具。

压缩不改磁盘记录，不提供模型保存／删除代码的职责。8KiB是run采集输出规则，不擅自推广到verdict详情或fetchProblem题面。

## 9. verdict的终态与去重

完整problem记录只有id、problem:{oj,problemId}、filePath:string|null和viewedAt。完整verdict记录为id、problem:{oj,problemId}、filePath:string|null、observedAt、submission和result。

submission承接可得id、url、submittedAt、language、code、codeLength、sourceVerification；sourceVerification为matched／mismatch／unavailable／not-checked。result承接必有rawStatus及可得score、time、memory、compileMessage、compileSucceeded、testCaseSummary和groups。testCaseSummary为passed／total，groups为{name,rows:string[][]}列表；站点字符串、单位和19位整数文本不转成Number，缺项省略，不补隐藏测试。verdict目录只给ID、题目、文件、时间、原判词及可得分数，不注入源码或逐点正文。

仅在OJ Connect完全取得最终评测结果后考虑入队。排队、评测中和自动轮询中间态不占持久队列；无法确认最终结果时不伪造终态。没有提交代码不影响保存已经取得的最终判词。

去重规则为：

1. 必须同一oj、同一problemId。
2. 新旧记录都有可靠的实际提交代码，且正文完全相同，移除对应旧结果，新结果入队尾。不得以当前编辑代码补齐提交稿。
3. 按完整文本相等，不归一化空白、换行或注释来推定相同；hash若用于加速也不能代替最终相等判断。
4. 缺可靠提交代码时照常入队，跳过去重；不同站点或不同题目分别保留。
5. 保20条近期结果，保存失败不先删除旧结果；模型读取不晋升或改判词。

正文按OJ Connect实际用户可见内容组织，保原站状态、分数／量纲、编译与逐点明细、可得源码及提交身份，不抓面板HTML，不补造隐藏样例。聚合WA不能证明所有点同一种错误。原8KiB规则不额外裁剪这些内容。

## 10. 通用能力、权限与提示词

非五站题目仅导入CPH时，可inspectFile读取.cph目录中的对应.prob元数据，再在搜索开启时browseWeb获取题面。通用能力不伪造五站problem记录，不扩大磁盘／模式／网络权限；普通元数据样例和实际测评记录是不同事实。

运行／测评仍只以持久记录作一等自动来源，readPage、文件、终端渲染或Notebook输出不恢复被裁切的记录能力。主动材料保用户提供身份。readPage用于其他非C/C++普通页面；PDF／OCR／复杂页面提取本轮不扩展。

system承接导师定位、教学深度、按问题取材、当前稿与历史判词区别、内部ID默认不转述及不搬运整稿。description只说明工具用途；参数说明只解释真实字段；结果给事实与必要缺口。工程整理不塞进readCurrentCode提示词。目录、题面、代码注释、网页、摘要和材料不创造指令或许可。

模式与根继续分开：有效根下三队列始终采集，Blackout不列／读持久来源；三档均可读取当前可见代码和只读fetchProblem，browseWeb依搜索开关。切回只读仍保留记录，不补采，也不建镜像。

## 11. 历史与压缩权限

原工具调用／结果保真实名字与配对，重放不执行，新请求不通过旧入口恢复快照或写工具。有效分支约束消息、普通工具返回、材料和许可；无独立代码队列例外。旧磁盘数据不自动迁移／删除；新队列从后续真实行为形成，不为旧工具加隐藏执行别名，见底层设计。

压缩阶段只读本回答已合法固定的记录及已有授权材料，不读新代码、不首次消费队列、不重新联网或写资产；新工具仅作受限适配，不另改压缩算法或引入额外模型。

## 12. 工程入口与后续范围

- [工具schema／description](../../extensions/becoder.beacon/src/contextToolContract.ts)、[执行层](../../extensions/becoder.beacon/src/contextTools.ts)、[装配](../../extensions/becoder.beacon/src/provider.ts)与[系统提示](../../extensions/becoder.beacon/src/prompts.ts)。
- [记录类型](../../src/typings/becoder-beacon.d.ts)、[队列验证](../../src/vs/platform/beacon/common/beaconRecords.ts)、[Coordinator](../../src/vs/platform/beacon/node/beaconCoordinator.ts)与[Store](../../src/vs/platform/beacon/node/beaconStore.ts)。
- [页面](../../src/vs/workbench/contrib/becoder/electron-browser/beaconPages.ts)、[Notebook](../../extensions/becoder.notebook/src/extension.ts)、[程序组执行](../../extensions/danielpinto8zz6.c-cpp-compile-run/src/notebookProcess.ts)、[CPH](../../extensions/becoder.cph/src/execution.ts)与[OJ](../../extensions/becoder.oj-connect/src/extension.ts)。

代码读取没有快照持久化或跨分支回读例外。readPage现有PDF文本能力保留，复杂提取不在本合同新增。资产写入、完整工具可视化、检查器代码沉淀及对拍能力留PRD后续范围。源码、模型、stage与负责人体验分别验收，实际结果集中在实现状态。
