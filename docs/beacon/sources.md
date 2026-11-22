# Beacon 历史来源索引

更新：2026-11-22。本索引只用于追溯。现行规则从[统一入口](README.md)读取；历史标题中的“正式”“当前”“已通过”仅表示当时状态，不能覆盖负责人后续决定。

## 固定恢复点

原稿来自本地Git提交 `e28ac79c490921aee8e27e92c589648c129607b0`。下列路径与SHA-256对应文档清洗前的原样副本；不把旧稿全文恢复到现行目录。可从仓库根只读查询：

```powershell
git show e28ac79c490921aee8e27e92c589648c129607b0:docs/beacon/prd.md
```

将冒号后的路径换为下表对应路径即可。原文行号仅相对该固定版本；不要用当前同名文件核对历史行号。SHA-256针对原样副本字节，Git正文可能因LF／CRLF转换有不同字节哈希，核对正文时需统一换行。119份原样副本仍由原整理工作包保存，本轮没有改写它们，项目正常阅读不依赖本机桌面目录。

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

需求条目的来源提取审计与就绪性复审留在原整理工作包，属于过程记录。其R1保存来源选择、R2/R3永久强绑定补法与R5模型删除契约均已被[现行队列决策](decisions/context-queues.md)覆盖；真实提交身份、摘要前缀和整理自身容量边界已纳入当前阶段与计划。旧回执不批准后续修订。

## 证据边界

固定源码研究见[三项目对照](research/2026-11-22-compaction-comparison.md)。旧提示词评估只代表对应模型、材料与当时实现，不作为下一阶段通过证明。当前源码核对、文档检查和未验收项见[实现状态](implementation-status.md)。
