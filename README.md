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
| `infinite-canvas:open-canvas` | 冷启动探测无效时启动/复用普通 Canvas Agent 并打开在线或项目指定画布 | 短视频工作流必需 |
| `infinite-canvas:canvas` | 读取 Canvas、创建节点、连接参考图、生成和状态查询 | 短视频工作流必需 |
| `$infinite-canvas-bridge` | 可选的 Infinite Canvas 协同实现层；未加载时由插件工具直接执行 | 非必需别名 |
| Infinite Canvas Web | 在线或项目指定的画布前端 | 短视频工作流必需 |

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
references/                      状态、需求路由、视频提示词交接、片段链、报告和资产模板契约
                               intake-and-routing.md：需求详细程度与动态路由
                               unified-contract.md：跨 Skill 的统一接口和停止条件
                               video-prompt-handoff.md：第三方视频提示词交接契约
                               video-segment-chain.md：超长视频片段链契约
references/test-protocol.md     模拟全流程测试契约
                               固定模式：REAL-CANVAS-BLIND-PREPROD-V1
scripts/workflow-state.mjs       状态初始化与校验脚本
```

Skill 当前仍以 `$short-video-workflow` 的名称被发现和调用；仓库名称为
`CineForgeWorkflow`，中文名称为“影铸工作流”。

## 本地校验

```powershell
node scripts/workflow-state.mjs init <project-root>
# 先完成 Canvas 冷启动，再用 record-canvas 写入 projectId、routePath、clientId、lastCheckedAt
node scripts/workflow-state.mjs record-canvas <project-root> `
  --project-id=<projectId> --client-id=<clientId> `
  --origin=<canvas-origin> `
  --route-path=/canvas/<projectId> --title="项目简称｜任务主题｜制作阶段"
# 可选：把实时 canvas_get_state 原始 JSON 规范化写入 nodes/connections/referenceBindings
node scripts/workflow-state.mjs record-canvas-snapshot <project-root> `
  --path=.short-drama/raw-canvas-state.json
# 主 Agent 必须将盲跑交付快照与重新查询的实时快照逐项对比
node scripts/workflow-state.mjs audit-canvas-snapshot <project-root> `
  --expected=<runner-output-relative-json> `
  --actual=.short-drama/live-canvas-state.json
# 再校验
node scripts/workflow-state.mjs validate <project-root>
```

具体视频项目的工作流状态应保存在目标项目中，不应写入本仓库。
