# CineForgeWorkflow 仓库协作规则

本仓库维护可复用的 `short-video-workflow` Codex Skill，中文名称为“影铸工作流”。

## 内容范围

- 编排规则放在 `SKILL.md`。
- Schema、契约和详细流程放在 `references/`。
- 确定性状态操作放在 `scripts/`。
- Codex 界面文案放在 `agents/openai.yaml`。
- 不要把具体项目的脚本、媒体、API Key、Canvas 导出文件或生产状态复制到本仓库。

## 依赖边界

`short-video-workflow` 负责协调 Drama Skills 和 `infinite-canvas-bridge`，不得
悄悄替代它们的职责，也不得创建第二套创作事实来源。

## 修改纪律

- 修改工作流规则时，同时审计相关 reference 文档和辅助脚本。
- 保留付费生产或外部变更操作前的明确用户确认边界。
- 将旧版兼容行为与当前流程明确区分。
- 提交前使用临时项目 fixture 验证修改后的脚本。
- 不得保存密钥、绝对用户路径、私有媒体字节或真实项目运行状态。
