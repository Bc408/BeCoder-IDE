# Settings Localization and Display Language Repair

负责人直接要求修复：默认中文显示已修改蓝条，中文设置标题仍为英文，保证中英文兼容及切换。基线 `Beacon_Persona@61b4b5fc`，工作树起始干净；此前commit未推送。

## 理解与范围

BeCoder使用原生配置、设置编辑器和随包中文语言包。设置值、当前语言和标题属于不同所有者：语言贡献负责同步／应用locale，配置服务负责真实override，DefaultSettings及SettingsTree负责显示模型，扩展清单／双语资源负责标题。修复只针对这些链路，保留配置key、默认值、scope、枚举协议值与第三方名称。

蓝条表示目标scope中有配置，不能全局改为“值不同于默认”。应规范化语言这个设置的默认override，并清理之前自动写入的等默认项。中文标题不能由描述猜测，必须由显式本地化title到达显示模型；没标题的其他设置继续沿原有key格式化fallback。

## 执行切片

1. **语言同步与切换（主代理）。** 先补同语言请求后新请求、默认无override／旧显式默认／English非默认／application profile、切回默认和失败回滚回归。修复controller同步结束持有resolved promise的竞态。按defaultValue规范化语言写入，保留USER_LOCAL应用级重定向和现行受信语言包／重启流程，不写其他设置。
2. **标题数据与模型（主代理）。** DefaultSettings明确携带property.title，分类沿section.title；保留无title的原有分类及key fallback。回归分别覆盖中英文、分组、无标题和SettingsTree实际显示，不隐藏默认项或改其他修改标记。
3. **随包扩展文案（独立实现切片）。** 按实际发行清单，13个有配置扩展共118项设置：setup4已有标题，其他114补显式双语title。扩展自有英／中文资源与现有中文语言包对应package键同步；不改变全局翻译优先规则、不恢复已移除clangd设置、不翻译协议标识。相关enum标签与已显示说明逐项核对，仅补确认缺失项。标题覆盖回归先观察旧manifest失败。
4. **复核与交付。** 主代理更新语言包实际raw／compact目录hash和精确包校验pin；独立只读复核切换／profile／标题资源消费者。源码检查和隔离组件回归成立，不冒充安装版体验；不构建stage／Setup、不修改实际用户设置、不自动commit或push。

## 验证规划

先预检并冻结命令，记录失败与重跑：客户端typecheck（120秒）；标准 `npm run gulp transpile-client-esbuild`；`scripts/test.bat`定向语言贡献、preferencesModels、settingsTreeModels及新的实际清单本地化组件测试；118项标题与语言包资源边界测试；相关strict lint与仓库formatter；完整分层；文档和diff。扩展清单修改无需执行模型或启动日常用户实例。若实际增加编译源，补拥有者typecheck。包校验器修改只作语法及精确pin边界检查，本轮不宣称已验证新包。

## 验收边界

源码／组件检查应证明：中文默认无多余override、非默认英文仍显示配置、切回中文移除override、同语言与快速切换不阻塞、失败恢复、标题／分类／枚举中英文一致、无title的第三方设置fallback保持。原生设置页最终视觉和重启体验仍由负责人使用新构建验收。
