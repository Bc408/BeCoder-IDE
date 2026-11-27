# 设置本地化与语言切换修复

日期：2026-11-27（Asia/Shanghai）。基线 `Beacon_Persona@61b4b5fc`，应用版本2.2.0。负责人报告中文为默认值仍显示已配置蓝条，且中文设置页出现英文标题，要求检查中英文兼容与切换；[实施范围](superpowers/plans/2026-11-27-settings-localization.md)保留任务边界。

## 根因与修改

- **默认蓝条。** 原语言贡献在启动时显式写 `USER_LOCAL=zh-cn`；显式target保留等默认值的配置，而设置树按override存在显示已配置。现按注册defaultValue将默认选择规范化为undefined，清理旧版本自动写入的冗余中文项；考虑applicationValue与实际有效值，保留英文非默认覆盖及共享profile存储语义。其他设置的已配置判定不变。
- **语言切换。** 原controller在空闲请求当前语言时同步完成，却又保留resolved processingPromise，后续请求不再启动。增加正确的空闲处理；配置规范化和locale应用使用同一个现有最新请求循环，延迟清理／回滚时用户改选仍保留，过时请求不得弹重启。只忽略与本次自写预期一致的配置事件，不忽略所有写入期间的用户修改。保留受保护中文包、默认英文及重启后生效合同。
- **已有标题丢失。** DefaultSettings没有携带property.title，中文“界面语言”等退回英文键名生成。现传递显式标题，分类使用configuration／section标题，避免属性标题重复成为分类；无显式title的第三方设置仍使用原fallback。
- **随包标题与选项缺口。** 按实际Windows扩展筛选，13个扩展共118项一级配置：Setup已有4个标题保持，其他114项补双语title，32项补可见enumItemLabels。包括CodeSnap、Beacon、CPH、BeCoder Notebook、OJ、Runner、ipynb、JSON、Markdown、Math、PDF与Mermaid。默认值、scope、配置键、实际枚举值、命令和功能均保持；clangd／GCC诊断没有现行配置贡献，不恢复历史设置。

自有扩展沿本地英／中文NLS，已有语言包接管的五个内置扩展同步其contents.package新键，不改变全局翻译优先规则。语言包raw目录hash为 `037f409f2a44a2a6b739742e5272c03cd7646a70967220077e28a53b39a11c78`，JSON压缩后的目录hash为 `b82005bf18d6679e14ac4f8a9ea270752854a799df9ffc6a4aebea101c5d8f0a`；清单变更说明及校验器pin同步，上游原始VSIX来源hash保持。

## 验证及边界

修复前原生回归出现9项预期失败，覆盖默认override、profile、同语言后切换及标题链；追加延迟写回归也先复现丢最新选择。资源回归旧清单7项中5项失败，补齐后全部通过。

最终客户端typecheck、标准转译、strict lint、formatter、完整分层通过。隔离Electron组件42项通过（含框架guard）：实际语言贡献的默认／已有默认／application profile／英文启动／失败回滚／快速切换及延迟写竞态，DefaultSettings／SettingsTree已有分组和fallback，以及真实118项清单经localizeManifest→注册→显示模型的en→zh-cn→en三轮。Node资源与OI边界41项通过，零失败／跳过／取消。原生日志有Electron既有vm说明，不将其称为零诊断。

验证过程中修正测试事件fixture类型、common测试引用browser层、实际配置注册前的legacy experiment-tag适配；这些失败均保留并在相应层重跑，未绕过校验。证据在 `C:/Users/Bc/.codex/visualizations/2026/11/27/01a21b48-48ad-7080-8994-4e11d8e33f3a/settings-localization`，含冻结命令、日志及资源语义审计。

独立只读复核确认默认清理期间改选、旧locale重启抑制、回滚期间改选及whenIdle等待准备四项竞态，无阻塞发现；主代理也复核实际清单和既有行为字段差异。

没有读取或改写实际用户配置、请求模型、启动日常产品、构建stage／Setup或执行Git写操作。组件显示模型及重启策略检查不等于安装版实际语言切换和最终视觉验收；此前安装包不包含本轮源码。
