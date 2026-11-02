# 参与开发

安装 Node.js 22+、Rust stable 和 Tauri 2 对应平台依赖，然后运行 `npm ci` 和 `npm run tauri dev`。

- UI、交互和任务行为在 `src/`；桌面命令在 `src-tauri/src/`。
- 提交前运行 `npm test`、`npm run build` 和 `cargo check --manifest-path src-tauri/Cargo.toml`。
- 修复问题时描述复现步骤和结果；界面修改附一张截图。
- 优先做明确可用的功能，保持实现简单，不为假想场景增加抽象层。
- 不提交个人任务、API Key、数据库、依赖目录或构建产物。
