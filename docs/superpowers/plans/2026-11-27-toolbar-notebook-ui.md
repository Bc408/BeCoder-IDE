# Runner、OJ Connect与Notebook界面收敛

负责人要求完成设置本地化任务后继续：Run／Run With Input合为原生按钮，上Run、下Run With Input；OJ Connect各图标统一为现有提交代码纸飞机；移除BeCoder Notebook Markdown运行按钮和专属冗余代码。设置任务已完成源码验证（42原生组件／41资源边界），改动保留未提交；当前HEAD为 `61b4b5fc`。

## 理解与受保护行为

BeCoder仍以现有Runner、OJ和Notebook模块执行用户操作。这次只收敛入口与图标，不增加执行权限、自动提交、运行队列或新命令语义。保留F6／Shift+F6、两种运行的输入和输出合同、OJ五站真实提交与浏览会话、Markdown编辑／完成／渲染，以及C/C++／input单元格执行；普通ipynb及其他Notebook沿原规则。

## 实施切片

1. **Runner（主代理）。** 扩展清单保原命令／快捷键，两个editor/title按钮替成一个submenus入口，子菜单固定Run在上、Run With Input在下；原生所有者通过现有IActionViewItemService和DropdownWithDefaultActionViewItem渲染原生分体按钮，默认主动作固定Run，不记忆切成带输入运行，不新增自绘CSS。双语文案仍来自扩展原NLS。
2. **OJ图标（独立实现）。** 以现有SubmitIcon的Font Awesome纸飞机为唯一形状，更换OJ扩展资源及实际入口；保主题可见性和已修hover填色。保留版权／CC BY4.0声明，按消费者核实是否存在其他旧OJ code形图标。图标变化不得改提交行为。
3. **Markdown入口（独立实现）。** 跟踪真实Notebook菜单与执行路径，仅BeCoder Notebook的markup不显示运行／执行Section；移除本产品专属无消费者分支，保护共享Notebook render／编辑完成／键盘和代码／input运行，不按“markdown”关键词删除普通Notebook能力。
4. **验证与收尾（主代理）。** 每切片先失败回归再实现；客户端类型、标准转译、相关原生组件／扩展测试、实际原生split菜单顺序／主动作／键盘与浅深主题、SVG一致性、Notebook菜单条件、strict lint／formatter、文档与diff。根据源变更补OI拥有者build，不构建stage／Setup、不启动日常产品或写真实用户数据，不自动Git写入。

## 交付与验收

负责人后续补充检查账户项默认隐藏。当前 `isAccountsActionVisible` 已以 `false` 为无配置默认值，活动栏与标题栏共用；不覆盖用户明确保存的显示选择。补原生活动栏与内存 profile 的验证，覆盖无值隐藏、菜单开启／隐藏、显式偏好；指南说明恢复入口。

工程回归证明代码、资源、组件及既有命令消费。负责人对新stage的真实悬停／菜单外观和Notebook实际操作验收另行成立；现有stage／Setup不包含这些修改。遇到超出上述入口边界的行为冲突先报告，不改变运行／提交产品规则。
