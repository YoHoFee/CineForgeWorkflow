# CineForgeWorkflow

**CineForgeWorkflow（影铸工作流）**是 `$short-video-workflow` Codex Skill 的维护
仓库。它负责把创意、剧本、视觉资产、分镜、提示词、媒体生产、剪辑和交付组织成
一条可恢复、可追踪的短视频自动化流程。

## 依赖的 Skills 与插件

### 核心 Skills

| 名称 | 用途 | 依赖级别 |
| --- | --- | --- |
| `$short-drama` | 项目路由、初始化和跨阶段规划 | 必需 |
| `$short-drama-write` | 编写和修订剧本 | 按阶段使用 |
| `$short-drama-assets` | 角色、造型、场景、道具和连续性设定 | 按阶段使用 |
| `$short-drama-image-prompts` | 图片提示词编写 | 按阶段使用 |
| `$short-drama-storyboard` | 分镜和冻结关键帧设计 | 按阶段使用 |
| `$short-drama-video-prompts` | 视频动作、表演和运镜提示词 | 按阶段使用 |
| `$short-drama-produce` | 已确认的图片、视频、配音和音乐生产 | 生产阶段使用 |
| `$short-drama-edit` | 素材装配、剪辑和交付 | 交付阶段使用 |
| `$short-drama-review` | 剧本、资产、提示词和媒体质量审查 | 按需使用 |

### 执行插件与后端

| 名称 | 用途 | 依赖级别 |
| --- | --- | --- |
| `$infinite-canvas-bridge` | 画布绑定、参考图连线、图片/视频生成、状态恢复和素材回捞 | 使用 Infinite Canvas 时必需 |
| Infinite Canvas MCP | 提供 Canvas 状态、节点、生成、状态查询和导出工具 | 使用 Canvas 生产时必需 |
| Canvas Agent | 本地 Canvas 执行代理，默认地址为 `http://127.0.0.1:17371` | 使用本地 Canvas 时必需 |
| Infinite Canvas Web | 本地画布前端，默认地址为 `http://localhost:3000/` | 使用本地 Canvas 时必需 |

### 本地运行时

- Node.js：执行 `scripts/workflow-state.mjs`。
- Git：维护本仓库版本记录。
- Codex：加载 Skill、调用 MCP 和执行工作流。

本仓库不包含上述外部 Skills、插件、API Key、Canvas 数据或具体视频项目状态。

## 仓库结构

```text
SKILL.md                         Skill 主入口
AGENTS.md                        仓库协作规则
agents/openai.yaml               Codex 界面元数据
references/                      状态、报告和资产模板契约
scripts/workflow-state.mjs       状态初始化与校验脚本
```

Skill 当前仍以 `$short-video-workflow` 的名称被发现和调用；仓库名称为
`CineForgeWorkflow`，中文名称为“影铸工作流”。

## 本地校验

```powershell
node scripts/workflow-state.mjs init <project-root>
node scripts/workflow-state.mjs validate <project-root>
```

具体视频项目的工作流状态应保存在目标项目中，不应写入本仓库。
