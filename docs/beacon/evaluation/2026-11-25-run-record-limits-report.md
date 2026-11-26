# Beacon run记录容量修复报告

日期：2026-11-25。基线`Beacon_Next@950befec109132e25c190d896e8375a17a04ef0a`；负责人已批准[设计](../../superpowers/specs/2026-11-25-beacon-run-record-limits-design.md)并授权实施。

本轮将run从8KiB跨流共享输出规则调整为独立字段前缀截断，并在入队及历史正文读取处检查32KB。输入、源码和编译报错都获得固定边界；不调整模型输出预算或压缩算法，不改实际编译运行和用户数据。

## 实际修改

| 对象 | 行为 |
| --- | --- |
| 执行源码 | 前8192 Unicode码点 |
| 每份input／expected及每个编译／程序stream | 各前4096码点，不共享或回配额度 |
| 外层／compile／各input的error | 每处前1024码点 |
| 截断值 | 完整文本为字符串，截断为{text,truncated:true}；不拼尾、不加伪造省略号，不截断代理对；未知输入null保持 |
| 单条run | 按含ID／转义／标记的紧凑JSON计算，最多32768 UTF-8字节；超过拒收并明确提示，旧队列不变 |
| 旧run | 不迁移或重写，旧head/tail仍识别；目录可列，超大正文返回too_large，不阻塞其他记录或新增 |
| 原执行 | CPH check、stdout／stderr差异、Runner／Notebook merged、执行时限和页面结果不受采集限制影响 |

新公共纯函数位于`src/vs/platform/beacon/common/beaconRunRecord.ts`，采集适配器和原生入队入口复用同一规则。流式正文保留有限前缀，源头已省略时停止把缺口后的文本接成连续前缀。Store只在读选中run正文时应用旧记录32KB关卡，list继续识别全队列。

工具参数与导师system不变；readRunRecord仅补截断值的结果语义，产品知识同步说明容量边界。problem、verdict、当前代码和fetchProblem不套用本次run限制。

共享纯函数使Runner测试转译输出包含仓库目录，已同步相关测试、CPH联动和probe引用；产品打包入口仍是原dist/extension.js。测试发现CPH一项原有用例只依赖外部helper环境变量，已补与其他用例一致的stage默认路径，避免未设置环境变量时造出启动错误。

## 验证与证据

- 新测试先见失败：字段未截断、32KB未拒收、旧巨大正文未拒读，以及工具将容量错归为read_failed；修改后通过。
- 原生记录／基础设施55项、Runner127项、Beacon280项、Notebook38项通过；CPH86项通过，1项依赖用户生成PCH缓存而跳过。不能称所有用例无跳过。
- 客户端typecheck、OI统一编译、完整分层、Beacon严格lint及受影响core lint已通过；最终准确命令和退出码见台账。后续源码修正导致的失效检查必须重跑，旧通过不代替最终状态。
- stage采用标准`npm run gulp vscode-win32-x64-min`，目标`C:/Users/Bc/Desktop/BeCoder/VSCode-win32-x64/BeCoder.exe`；本轮构建的实际退出码和时间见`.superpowers/sdd/2026-11-25-beacon-run-record-limits/checks.jsonl`，未运行的构建不算通过。

复测使用[完整问答](2026-11-25-run-record-limits-samples.md)。模型选择deepseek-flash，生成设置沿用户私有配置；没有打印或写入凭据。

1. 原生1,600,017字节输入经新采集规则进入真实Store，字段带截断标记。模型读取目录及详情，识别input／output都是不完整前缀，随后普通追问成功。
2. 合成长编译诊断经字段限制，模型识别具体语法错误和诊断不完整，后续追问成功。此场景是固定合成材料，不冒称真实编译器输出。
3. 旧1.6MB记录保持原文，目录仍可见，正文返回too_large；模型明确正文未知，普通追问成功。

修正后的6回合全部完成；模型仍有无关文件探查，以及把合成重复诊断解释为聚合放大等未经证实的推测。这些保留在原文，不作为教学质量通过。首批6回合也完成，但FileTool未接入且编译诊断与源码不一致，属于评测夹具问题；修正后才采用最终6回合作效果证据。

原始模型数据在`tmp/beacon-run-record-limits/`，构建／验证台账及临时驱动在`.superpowers/sdd/2026-11-25-beacon-run-record-limits/`。测试脚本产生过路径／VM夹具失败，均保留原日志并在相应层修正；不以它们冒充产品执行缺陷。

独立只读review发现并复现了Notebook同一输出块的省略事件早于有效字节交付，可能导致尚未达到字段额度的前缀丢失。现已将采集事件按有效前缀→省略标记排序，原生展示／限制触发保持；新增真实Node helper回归先见失败，再验证修复。

## 保留的边界

本轮阻止新超大run正文进入会话，并拒读存量超大run。此前已经进入某聊天的巨大工具交换未被改写，原压缩和错误传播缺口仍是后续事项。本轮不证明全部上下文容量问题、全部教学质量或真实桌面流程已经修复。

源码和stage分别验收；没有本轮GUI、Setup、Release、commit或push。负责人可使用新stage检查大输入、编译错误和多测试点的实际提示与采集结果。
