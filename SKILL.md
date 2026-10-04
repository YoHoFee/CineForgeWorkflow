---
name: short-video-workflow
description: 编排短视频、短剧、漫剧、动画和 AIGC 视频项目；自动连接 Infinite Canvas，协调 Drama Skills，管理资产目标、批次、状态、参考绑定和生产闸门。
---

# 影铸工作流

影铸只负责跨阶段编排、Canvas 交接、状态和生产闸门，不代替 Drama Skills 写故事、
剧本、视觉设定、图片提示词、分镜、视频提示词或剪辑。创作事实仍以项目的五份
creator-first Markdown 为准；Canvas 是可视化、绑定和生产基础设施，不是第五套事实源。

## 冷启动

短视频项目启动即自动连接 Infinite Canvas，不等待用户再次要求；`stage_only` 也不跳过
这一步。严格按以下顺序执行：

1. 读取项目 `AGENTS.md`、`README.md`、`short-drama.json`（如有）和
   `.short-drama/workflow-state.json`（如有）。
2. 确保 `canvas_get_state` 与 `infinite-canvas:open-canvas` 可用。`open-canvas` 是启动流程
   Skill，不是一个缺失的 MCP 函数；工具未出现在初始列表时，立即用 `tool_search` 搜索
   `canvas_get_state open-canvas`，加载状态工具并遵循启动 Skill，再继续。
3. 先调用 `canvas_get_state` 探测当前连接。
4. 若没有 `hasCanvas=true`、`projectId` 和共享 `clientId`，调用
   `infinite-canvas:open-canvas` 的启动流程。在线冷启动应复用普通 Canvas Agent；没有运行实例时启动
   `npx -y @basketikun/canvas-agent@latest`（不要启动 `... mcp` 代替网页 Agent），
   等待 `Local URL` 与 `Connect token`，打开带 `#agentUrl`/`#agentToken` 的 Canvas 页面，
   然后再次调用 `canvas_get_state`。已有可匹配页面或 Agent 时必须复用，不得启动第二实例。
5. 只有复核再次返回完整 `hasCanvas/projectId/clientId` 才算连接成功；锁定这组
   `projectId/clientId`，所有 UI 和 MCP 写入都必须落到对应 `/canvas/<projectId>` 页面。
   不得使用 `mode=new`、随机 Canvas 标签或另一套状态掩盖映射问题。

页面存在、MCP 工具已加载、Agent 进程存在或聊天中说过“已连接”都不是连接证据。完成
上述启动/复核前，不得向用户报告“画布不可用”；复核仍失败时才报告具体的
`no_canvas_tab`、`agent_unavailable`、`frontend_unreachable`、`route_mismatch`、
`shared_client_missing` 或 `state_stale`，并停止依赖 Canvas 的动作。在线 Canvas 不要求
本地项目目录；只有项目明确选择本地前端时才检查本地前端并切换其工作空间。

新建或恢复默认画布时，第一项写入必须是保存
`项目简称｜任务主题｜制作阶段`；重命名后重新查询状态。默认标题未改成功前不得创建节点。

## 执行顺序

1. 记录本轮用户事实和执行范围；默认 `end_to_end`，只有用户明确限定阶段才用
   `stage_only`。
2. 按缺口调用唯一 owner；已有且匹配的内容标记 `reuse`，不重复创作。
3. 依次补齐故事、剧本、视觉设定、图片提示词、分镜、视频提示词；阶段性请求只做
   指定阶段及必要前置。
4. 为每个需要的角色、场景、关键帧和必要道具明确 `reuse`、`generate`、`variant`
   或 `blocked`。缺少真实参考时完成可完成的文档，但保持视频交接阻塞，不得静默跳过
   或替用户选择文生视频。
5. 静态图片缺失时，先建立独立图片批次并按当前图片确认闸门执行；图片真实验收通过后，
   再建立独立的视频批次、参考绑定和视频报告。
6. 实时读取 Canvas，核对节点、媒体证据、语义角色、连线端点和当前批次 config，
   通过后才写 `ready_for_confirmation`。

## Owner 路由

- 项目初始化、跨阶段规划、故事开发：`$short-drama` / `$short-drama-develop`
- 剧本：`$short-drama-write`
- 角色、造型、场景、道具、连续性：`$short-drama-assets`
- 图片提示词：`$short-drama-image-prompts`
- 分镜、冻结关键帧：`$short-drama-storyboard`
- 视频运动提示词：`$short-drama-video-prompts`
- 已确认媒体生产：`$short-drama-produce`
- 剪辑交付：`$short-drama-edit`
- 用户点名审查或闸门发现问题：`$short-drama-review`

第三方 Skill 只拥有自己的正文和输出；影铸只校验统一交接，不复制或改写其创作规则。
Canvas 协同优先使用 `$infinite-canvas-bridge`；该 Skill 不可用时，直接使用
`infinite-canvas@infinite-canvas-local` 的 `open-canvas` 与 `canvas` 工具，协议不变。

## 不可违反的契约

- 新流程的角色参考只有一张 `character-design-sheet`，同一张图包含展示、正/侧/背、
  细节和面部区域；不得创建或连接 `character-sketch`、`character-turnaround`。
- `IMG-*` 是提示词条目，不是图片。参考图只能来自真实项目文件、真实附件或实时 Canvas
  图片节点；需要上传用户图片时使用 `canvas_create_attachment_nodes`。不得创建只有标题、
  尺寸、`assetId` 或 metadata 的空图片节点。
- 图片接入按固定优先级执行：先用 `canvas_get_state` 查找可复用的真实图片节点；
  本轮用户上传的图片用 `canvas_create_attachment_nodes`；缺少真实节点但图片资产已获
  确认时，交给图片生产 owner 或已注册的媒体适配层建立正常图片结果，再回到 Canvas
  复核。不要在对话中展开或手工拼接大段 Base64，也不要把本地路径、文件名或尺寸
  metadata 当作媒体。若当前工具链没有可验证的真实媒体入口，立即保持 `blocked`。
- 项目内已有图片或控制面预置图片只有在真实内容已经进入 Canvas、或已有可读取存储
  句柄时才可复用；创建或复用后必须立即用 `canvas_get_state` 核对 `status=success`、
  图片 MIME、非空媒体证据和自然尺寸。控制面预置的图片节点必须表现为正常生产资产，
  不能要求运行 Agent 自己猜测或重建隐藏的测试替代物。
- 复用已有 Canvas 图片前，必须逐节点比较项目资产的 `actualSize`/`naturalWidth`/
  `naturalHeight` 与实时节点的自然尺寸和媒体内容内嵌尺寸；任一不一致都按
  `resolution_invalid` 或 `blocked` 处理，重新写入真实媒体或建立新节点，不能只改
  `metadata`、`assetId` 或尺寸字段伪装通过。
- 阶段性视频提示词可以保留结构化的 `PLAN-*` 槽位并停在 `draft`；槽位必须保留顺序、
  用途、控制和不得控制语义，进入确认前必须替换为真实 `REF-*` 和可读取媒体。
- 视频参考按语义连接：`character-design-sheet` 管身份/造型，
  `scene-design-sheet` 管地理，`keyframe` 管起始构图，`ending-keyframe` 只在真实存在时
  管结束状态。连接方向必须是 `image -> video-config`。
- 同一真实文件在同一镜头承担多个语义时，必须建立多个独立真实图片节点，并在槽位记录
  `canvasNodeId`；一个图片节点不能承担多个 role。
- `参考音频` 独立于图片槽位，必须保留音频顺序、角色和语义；真实文件与目标模型能力
  均未核对前不得进入视频确认，不能静默丢弃或改写成图片节点。
- 每个当前视频批次只能有一个 `MOTION-*` 和一个当前 config。复用画布可以保留历史
  config，但不得把历史节点混入当前批次；config 必须是 `type=config`，且包含
  `modality=video`、`generationMode=video`、当前 `motionId`、`autoRun=false`，有参考时
  `referencePolicy=all-connected`，明确的非角色文生视频才用 `none`。
- `videoReferenceIds` 必须与实时参考绑定来源节点集合完全一致；当前批次的每条真实
  图片入边都必须登记，反向、猜端点、漏边和多挂参考都失败。
- 未获得当前媒体批次的明确确认前，不得调用 `canvas_generate_*`、
  `canvas_run_generation` 或外部媒体 adapter。图片、视频、配音和音乐分别确认；
  “继续”“提示词已接受”或上一次确认都不算本次授权。
- `$short-drama-produce` 只执行已确认的当前 modality、报告指纹和 targets；提交后用
  `generation_get_status` 恢复，不重复提交已有任务。

## 状态与恢复

使用 `references/workflow-state.md` 和 `scripts/workflow-state.mjs`。实时 Canvas 连接后先
用 `record-canvas` 登记 `projectId`、`routePath`、`clientId`、标题和检查时间；需要保存
节点时使用 `record-canvas-snapshot`，不要手写节点 ID、媒体证据或连线端点。

新状态的 Canvas `requirement` 固定为 `required`；没有实时连接不得继续短视频流程，也
不得把本地 Markdown 或 fixture 当作 Canvas 交接。状态脚本通过只代表保存的快照内部一致，
确认前仍必须由主 Agent 重新查询实时 Canvas。

失败、重连或新 Agent 从项目文件和状态恢复。遇到项目映射、真实媒体、参考语义、连线、
提示词交接或确认缺口，保持 `blocked`/失败并报告具体缺口，不创建替代画布。

修改本 Skill、reference、状态脚本或界面元数据后，按
`references/test-protocol.md` 的 `REAL-CANVAS-BLIND-PREPROD-V1` 执行真实 Canvas 盲跑；
真实 Canvas 不可用只能报告 `degraded`/`failed`，不能用 fixture 冒充通过。
