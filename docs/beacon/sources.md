# Beacon 历史来源索引

更新：2026-11-25。本索引只用于追溯，并解释PRD来源代号。现行规则从[统一入口](README.md)读取；历史标题中的“正式”“当前”“已通过”仅表示当时状态。

## Git恢复点与本次清理

| 固定提交 | 用途 |
| --- | --- |
| e28ac79c490921aee8e27e92c589648c129607b0 | 下文P／N／B等原始来源及其行号 |
| 74d09ef4e784fb29607569bb297131d739742ef4 | 三队列重构前的旧工具、队列与代码快照合同 |
| dadbec9ddb183513a0838ef4e66f4afe9eda6e34 | 已完成工具重构、复审与显示调整，也是2026-11-25文档清理前版本 |

本次移除以下冗余文件，仍有效内容先合入现行文档。历史原稿可用 `git show dadbec9d:下表路径` 只读恢复；不将旧稿整体恢复为现行规则。

| 原路径 | 当前去向／身份 |
| --- | --- |
| docs/superpowers/specs/2026-11-23-beacon-tool-interface-simplification-design.md | 迁为[工具合同](tool-contract.md)，承接已实现接口及字段 |
| docs/beacon/code-reading.md | 合入工具合同§4 |
| docs/beacon/decisions/context-queues.md | 合入[底层设计](foundation-design.md) |
| docs/superpowers/specs/2026-11-23-beacon-tool-information-flow-design.md | 已被九工具合同替代，历史追溯 |
| docs/superpowers/plans/2026-11-22-beacon-foundation-implementation.md | 旧架构执行计划，历史追溯 |
| docs/superpowers/plans/2026-11-23-beacon-context-effect-evaluation.md | 已完成评测计划，结果保留在evaluation |
| docs/superpowers/plans/2026-11-23-beacon-tool-information-flow.md | 已完成旧工具专项计划，结果保留在evaluation |
| docs/superpowers/plans/2026-11-24-beacon-context-tools-rebuild.md | 已完成重构计划；接口／兼容／失败规则合入合同与底层设计，实绩见实现状态和报告 |
| docs/beacon/review/2026-11-22-document-return.md | 已完成文档回迁过程，历史追溯 |
| docs/beacon/review/2026-11-23-implementation-planning.md | 旧方案筹划过程，图片预算决定已保留在压缩合同与LONG04 |

独立模型评测、问答、源码研究和输出质量清单保留。忽略目录 `.superpowers/sdd/` 中引用旧路径的历史整理脚本只作执行证据，不再用于生成现行文档。

## 固定恢复点

原稿来自本地Git提交 `e28ac79c490921aee8e27e92c589648c129607b0`。下列路径与SHA-256对应文档清洗前的原样副本；不把旧稿全文恢复到现行目录。可从仓库根只读查询：

```powershell
git show e28ac79c490921aee8e27e92c589648c129607b0:docs/beacon/prd.md
```

将冒号后的路径换为下列原路径即可。原文行号仅相对该固定版本，不用当前同名文件核对。SHA-256是原整理时原样副本的记录值，Git正文可能因LF／CRLF转换有不同字节哈希；本次未重新核验外部副本，不据这些值声称当前外部文件完整。项目阅读和历史恢复不依赖本机桌面目录。

### P

原路径：`docs/beacon/prd.md`。

SHA-256：`40cfb3c983224b356cc1e8d11e644913a2f41d34881651c98618edd34de4b758`。

### N

原路径：`docs/beacon/notebook.md`。

SHA-256：`6fc11064da0f0c6f085159959f442e12bd7c18318014e929280fcaa35fba395f`。

### B

原路径：`extensions/becoder.beacon/README.md`。

SHA-256：`12b7b540d33c4de855dba92fecaa6024f9d2abbee0f41338e81badfa2f827105`。

### K

原路径：`extensions/becoder.notebook/README.md`。

SHA-256：`9625bedcac0d0d113e2bf3504c4b6b4acea3e82936c4e91dc9f51b819ea93748`。

### D

原路径：`docs/superpowers/specs/2026-11-22-beacon-foundation-design.md`。

SHA-256：`7154e53b85b8b30c7384e6dbd0fee155a142a8a6de8e326efd70e8f20154bc2a`。

### A

原路径：`docs/beacon/architecture.md`。

SHA-256：`f274082bfafecff0e44bc60b6d831010d179671fbd246b1593f6395e34ac0488`。

### M

原路径：`docs/beacon/memory-quality-technical-design.md`。

SHA-256：`52795d0cf13de55e7250df01282c128120a219ed5b53d7bc7be3db86c61a3a92`。

### W

原路径：`docs/beacon/workspace-ui-draft-design.md`。

SHA-256：`15fad8c9c1d02f1c25081456b778f90e486e18ac96bf33a7e3aea14fe81493f2`。

### C

原路径：`docs/beacon/mode-conversation-design.md`。

SHA-256：`810e425b32415ba50b3a56d207faedbc448ebddcd1c78e052d7dd8475bde171f`。

### O

原路径：`docs/beacon/oj-technical-design.md`。

SHA-256：`ab361f8e206cf7ed1533c97221b86ef70cb2e9843c59a498847821e79c065f53`。

### T

原路径：`docs/beacon/technical-research.md`。

SHA-256：`cf8cc12cf71a8600fbae2fe3ed62b78cccfe8214a25ade654a7ed8f1a4baaaa5`。

### S

原路径：`docs/beacon/implementation-status.md`。

SHA-256：`b06b08f24d2da3062219be43abe068e67dd7705756db2ef56d40c495dbe44d61`。

### U

原路径：`docs/superpowers/specs/2026-11-21-beacon-prompt-context-design.md`。

SHA-256：`845028045851b80f732b7675885c8c515876670cec3963b4ad43cd874bd4796a`。

### V

原路径：`VISION.md`。

SHA-256：`5407296fe875cbeede05c94627e2e3b4613901528e843b22b3116fae1b5aa1cd`。

### R

原路径：`README.md`。

SHA-256：`e79541a1115540225bc37239af868c1d65337599d16be7798e61a9b64ae47745`。

### I

原路径：`docs/beacon/README.md`。

SHA-256：`31d7b425fbdc66fd336048ddccebde51c9bea1259a32fa4ca9eaf842033de5fc`。

## Review history

需求提取审计与就绪性复审原件由原外部整理工作包保存，Git只能恢复其来源索引，不能据此承诺恢复外部原件；本次未核验该工作包。已跟踪的回迁／筹划记录可从dadbec9d恢复。旧保存来源、永久绑定及模型删除建议已失效。当前工具与队列已实施，真实提交身份、摘要有效前缀和有界恢复继续保留；源码差距、模型瓶颈及负责人验收见实现状态，不从旧批准记录推断新阶段授权。

## 证据边界

固定源码研究见[三项目对照](research/2026-11-22-compaction-comparison.md)。旧提示词评估只代表对应模型、材料与当时实现，不作为下一阶段通过证明。当前源码核对、文档检查和未验收项见[实现状态](implementation-status.md)。
