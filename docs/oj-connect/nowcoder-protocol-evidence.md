# 牛客 ACM 接入协议证据

[开发入口](README.md) · [设计](../superpowers/specs/2026-11-17-nowcoder-acm-design.md) · [实施计划](../superpowers/plans/2026-11-17-nowcoder-acm.md)

日期：2026-11-17。本文归档本轮采证的必要结论，避免正式开发依赖可被清理的 `tmp/`。事实来自此前已授权的隔离原生 Session 实验、官方网页／编译资源、官方 VSIX 和负责人随后提供的个人记录截图。本轮文档落盘未新增网络提交。内部协议不是平台承诺稳定的开放 API。

## 决定与证据层级

负责人观察官网本人记录后，选择“形成 `8…` ID、与自己手动交题产出一致”的 ACM 路线。选定 `/nccommon/submit_cd`，不同时维护现代备用路线；ID 前缀不成为成功判断条件。此决定取代研究阶段暂不选型的结论，不修改或抹去此前探索记录。

现代练习路径已由官网原生编辑器实际 action 提交验证，现代 ACM 也有多条真实 AC／WA／CE；不能称为无效接口。限定问题是本轮现代 ACM 实验组合没有对齐官网比赛分数和代码长度，且所查 ACM 页面尚未实际启用现代编辑器分支。选择 ACM 官网路线不等于对现代方案作全局优劣判断。

## 固定材料

| 材料 | 身份与用途 |
| --- | --- |
| 官方插件 VSIX | `nowcoder.nowcoder-1.0.24.vsix`，SHA256 `e0f93a31b63d8730a35c5e6bc0fba9a45be5c61c4767f9d3b77583c6762ba5a9`；包内 MIT，2023 北京牛客科技有限公司；所读为编译 JS，不称原始 TS |
| 官网 ACM 题目资源 | `https://static.nowcoder.com/acm/nowcoder/2.0.120/javascripts-acm/page/terminal/contest/main.entry.js`；本地解码材料 SHA256 `65f656ebec118de6f77db51ce35d9b2ad5d856c7b3166141b0e6ddac6706fe50` |
| 官网 env／common | 解码材料分别为 `379f3c3872aebe59d3d2d101089da4ee203a165c9698c2a6a7eead24260353ef`、`c24ce5bb25d07e19ca508d602d653cf38bad0a6ab080cc0aff1cadbb1db22c85`；核对 ACM 语言分支及提交包装 |
| 官网练习资源 | `https://static.nowcoder.com/nowcoder/2.0.321/javascripts-wp/page/ta/question/main.entry.js`；解码 SHA256 `fe2083f1c5bc4ea418d39747c68f6a8ee0e392135dc1ff4fee24994acb8e8164`；用于对照现代路径，非首版生产依赖 |
| 洛谷参考 | vscode-luogu 4.20.0 / `987ca974b5419230a07b59a195ec44026e16f6f4`；参考一次提交、正式回执和独立结果节奏，使用本仓库已迁入组件 |

哈希标记当时采集字节，不保证上述 URL 将来仍返回相同内容。协议接入按当时真实字段核对，不能仅用固定 bundle 版本证明未来网站兼容。

## 已验证 ACM 链路

| 操作 | 本轮事实 |
| --- | --- |
| 登录摘要 | 同一 Session GET `https://gw-c.nowcoder.com/api/sparta/user/info/global/pc`：登录后 code 0 且有 userId；无凭据对照 code 999／need login。冷重启仍能读取 |
| 题目身份 | GET ACM 题库／比赛 HTML，Acorn 只读 `window.pageInfo` 字面量，不执行远程脚本；公开 18204 → qid235780／subTagId0／doneQuestionId18204，5657/A → 同 qid／subTagId1／doneQuestionId5657 |
| 语言 | 实际官网编辑器 langList：2 为 ACM Clang18／C++23，38 为 GCC13／C++23；旧材料的 22 不在该目录，预检查拒绝后零次发送。现代目录及语言环境不同，不混用 |
| 发送 | 原生 Session POST `https://ac.nowcoder.com/nccommon/submit_cd`；表单字段 questionId、tagId4、subTagId、doneQuestionId、content、language、languageName；未获取现代 judge token |
| 官网请求对照 | 调用官网编译模块 65010 的 submitSelfCode，截断网络捕获配置：地址和业务字段一致，未发生额外正式提交 |
| 回执 | HTTP 与业务结果分别检查；code0、明确提交成功和正式 ID。每次实验仅发送一次 |
| 读取 | GET `/nccommon/status?submissionId={id}&tagId=4&subTagId={0或1}`；字段有顶层返回，不可一律取 data。确认返回 ID 与查询 ID 一致 |
| 正式详情 | `/acm/contest/view-submission?submissionId={id}`；实验核对账号、题目、源码及原 ID，不用列表最近 AC 替代 |

在部分验证中，发送前将唯一远程窗口导航到 about:blank 并隐藏，之后不再加载题目页；多次原生发送和查询仍成功。现代扩展实验也证明原生 Session 可无网页读取。由此不需要为 ACM 发送复制 AtCoder 的隐藏表单／验证等待。

## 代表性正式记录

| 路线与场景 | ID | 发送到回执 | 结果及限制 |
| --- | --- | --- | --- |
| ACM，5657/A | 85571289 | 391 ms | AC，接口汇总20/20；账号、题目、源码核对 |
| ACM，公开18204 | 85571355 | 321 ms | AC，20/20；三项核对 |
| ACM，5657/B | 85571362 | 336 ms | AC，20/20；语言2 |
| ACM，5657/A故意编译错误 | 85571365 | 350 ms | CE12，memo有诊断；按明确前缀结构分离后源码匹配 |
| 现代ACM，143199/A正确程序 | 500000744 | 125 ms | AC，24点；比赛历史0/50、length0 |
| ACM，同题同正确源码 | 85571796 | 197 ms | AC；比赛历史50/50、length276 |
| 现代ACM，同题错误程序 | 500000745 | 118 ms | WA，24点中3点AC；比赛历史0/50、length0 |
| ACM，同题同错误源码 | 85571797 | 479 ms | WA，3/24；比赛历史6.25/50、length370 |

以上时间不包含完整产品按键流程，部分样本后续核对口径不同，不据此比较全链路速度或报告 p95。累计研究有19条正式记录（现代10、ACM9），含刻意 WA／CE 和不支持语言实验，不是19次成功，也不是产品稳定率。

本人比赛历史经新进程、新授权、cache-buster 复查，现代正确记录约8分36秒后仍为0/50、length0；排除了仅最初几秒的回写等待，不排除更长后台任务或平台配置。官网现代终态回调追踪未找到必需的第二次登记分数／长度 POST；题目评价 POST 属于用户难度／标签反馈，不可挪用。

负责人后续个人 ACM 历史截图显示相同差异：85571796 为100分、长度276，85571797 为12.50分、长度370；500000744／745 为0分、长度0。该页面采用100尺度，前表是单场50尺度，不能互相覆盖或自行折算为产品成绩。

## 展示与错误陷阱

- 等待状态带有得分、耗时、内存零值，不表示最终指标。缺失分数、等待零值和真实终态0分必须区别处理。
- `rightHundredRate` 是通过百分比，不是正式比赛分数。正确程序旧汇总20/20、错误程序3/24，不能据固定20/20推断底层测试数量或两路线数据集完全一致。
- CE 的 memo 可直接展示诊断；record pre 可能是精确标记 `SPECIAL_TM_FH_MEMO_JSON_TAG` 的 JSON 加空行再加源码。没有明确结构不删除文本。
- 未取得可展示测试点时保留总体状态；`isShowTestCase=false` 不构造点位，CE 的0/0不绘制。
- 已观察0／1／2等待过程、5AC、4WA、12CE、14内部错误；未知状态不能只用数值大小推断完成。现代查询旧ID曾出现外层code0、内部status500且无ID的错误体，提示解析需验证结构，不能当正常终态。
- 现代接口的配置id、languageId、不同业务的实际编译标准不等价。ACM目录2／38的证据不推定其在现代接口也有效。

## 未证明的部分及复现材料

研究阶段尚未证明：生产可维护的无网页语言目录获取、完整退出与跨子域失效通知、全部状态和资源单位、长期稳定性、限流／认证实际响应，以及所有题目类型。账号过期、回包丢失、防重和跨会话故障优先合成验证，不能为补材料主动制造重复正式提交。

可清理的本地研究根为 `tmp/oj-connect-audit/nowcoder-20261117/`，有 RESEARCH.md、AUTHENTICATED.md、STABILITY.md、MODERN.md、expanded/EXPANDED.md、expanded/SOURCE-TRACE.md 和 validation.json。它们保留探索时序与失败，正式开发以本文和设计为入口；研究脚本、账号 profile、下载 bundle 均不成为产品或自动测试依赖，不纳入发布包。

此前研究验证包括脚本语法、回执／结果一致性断言、官方VSIX契约零网络对照和研究时干净Git状态。它们只证明研究材料一致；当时牛客产品尚未实施，不宣称该研究已通过产品测试、stage 或负责人验收。Cookie和短期token不写入本文、测试fixture或日志。

## 同日实施补充

后续按批准方案完成候选实现，见[实施记录](nowcoder-implementation-2026-11-17.md)。已从现行官网 env 字面量解析 C／C++ 目录，核准状态与 ms／KB 单位，加入共享 Session 登录／退出和失效通知；通过纯函数、真实 Electron 截获网络夹具及三站页面回归。Acorn 为显式批准的主进程生产依赖，按需加载，不执行网站脚本。上述历史未知项不再等同于当前源码缺口；真实生产链路的登录后验收、长期兼容与最终构建仍分别记录，不能由合成测试替代。
