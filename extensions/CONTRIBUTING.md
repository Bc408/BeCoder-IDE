# 内置扩展开发

本目录包含 BeCoder 自有扩展、修改后的第三方扩展和保留的 Code - OSS 内置扩展。产品边界及操作规则先读根目录 [AGENTS.md](../AGENTS.md) 与 [VISION.md](../VISION.md)，常用命令见[开发指南](../docs/development.md)。

## 查找所属入口

以扩展自己的 `package.json` 为准：`main`/`browser`、`activationEvents`、`contributes`、依赖及 scripts 共同决定入口。TypeScript 源码通常位于 `src/`，配置位于 `tsconfig*.json`；构建可能使用 `esbuild.mts`、`build.mjs` 或 webpack，不假定所有扩展采用同一工具。

修改前检查相邻扩展及所属测试。生产载荷由扩展构建配置、`.vscodeignore` 和根构建筛选共同决定；新加资源需确认会实际进入产品。`out/`、`dist/` 及测试输出属于生成内容，不直接编辑。

若所属扩展需要浏览器入口，使用 manifest 的 `browser` 及相应 browser-safe 构建和 TypeScript 配置；不得仅为对齐上游示例恢复 BeCoder 已排除的产品能力。

## 验证与分发

优先使用所属扩展已存在的 typecheck、build、test 脚本，确认依赖和输入后执行。仓库整体 OI 扩展构建为 `npm run compile-oi-extensions`，它不能代替所有者测试或 GUI 验收。不要为扩展另行安装依赖、改 lock 或清除生成内容，除非该任务已授权。

可见文字保持中英文同步，保留来源、版权头、许可证及第三方声明；具体分发义务见[许可索引](../licenses/README.md)。源码支持和测试成功不等于完整应用已包含并验证该扩展。
