# 工作流状态契约

本文件定义 `$short-video-workflow` 的运行状态。它与五份创作文档分离，可以随项目
一起复制。

## 文件位置

```text
.short-drama/workflow-state.json
```

完成 Canvas 冷启动并通过实时 `canvas_get_state` 核验后，优先使用：

```powershell
node <skill-root>/scripts/workflow-state.mjs record-canvas <project-root> `
  --project-id=<projectId> --client-id=<clientId> `
  --origin=<canvas-origin> `
  --route-path=/canvas/<projectId> --title="项目简称｜任务主题｜制作阶段"
```

该命令只登记实时连接事实，不会启动 Canvas、创建节点或触发生产；它会拒绝不规范的
origin、项目路由不一致和缺失共享 `clientId`。默认标题可以先登记连接，但在创建第一个节点或进入
确认前必须通过实时页面重命名为生产语义标题。
如果切换到另一个 Canvas `projectId`，只有在没有活动/已确认批次时才允许登记；脚本会
清空旧项目的节点、连线、参考绑定、当前 config 和 `videoReferenceIds`，必须重新记录
该项目的实时快照后才能进入确认阶段。

旧项目状态会在 `record-canvas` 时自动从 schema 1/2/3 升级为 schema 4，也可以显式
执行：

```powershell
node <skill-root>/scripts/workflow-state.mjs migrate <project-root>
```

登记连接后，如果需要把一次实时 `canvas_get_state` 的原始 JSON 写入规范化状态，
使用项目内相对路径执行：

```powershell
node <skill-root>/scripts/workflow-state.mjs record-canvas-snapshot <project-root> `
  --path=.short-drama/raw-canvas-state.json `
  --motion-id=MOTION-001 --config-node-id=<current-config-node-id>
```

原始快照至少需要 `projectId`、共享 `clientId`、`nodes`、`connections`（或 `edges`）。
图片节点必须同时具备成功状态、非空 `content` 或 `storageKey`、图片 MIME 类型和自然
尺寸，脚本才会保存 `mediaAvailable=true`；否则会保存为不可复用图片并阻止后续确认。
当节点包含可解析的 `data:image/png` 或 `data:image/jpeg` 内容时，脚本还会核对媒体
内嵌的真实像素尺寸与 `naturalWidth`/`naturalHeight`；不一致会直接拒绝快照，防止
只改 metadata 或尺寸字段冒充已验收资产。
提示词文件包含多个镜头时，`--motion-id` 和 `--config-node-id` 应由当前实时批次的
config/`MOTION-*` 明确提供；不应让脚本凭节点顺序猜测。
快照中的项目 ID 和 client ID 必须与当前 `record-canvas` 登记完全一致，不能用快照覆盖
另一个已连接的 Canvas 项目。网页重命名后，MCP 读模型可能暂时仍返回旧的默认标题；
如果项目 ID、client ID 和路由一致，且 `record-canvas` 已登记了非默认生产标题，
`record-canvas-snapshot` 会保留已登记标题，不把这次默认标题读模型延迟误判为项目切换。
两个不同的非默认标题不允许互相覆盖。

最小结构：

```json
{
  "schemaVersion": 4,
  "projectId": null,
  "currentCanvasProjectId": null,
  "canvas": {
    "requirement": "required",
    "status": "not_evaluated",
    "lastCheckedAt": null,
    "origin": null,
    "projectId": null,
    "routePath": null,
    "clientId": null,
    "title": null,
    "lastIssue": null,
    "videoConfigNodeId": null,
    "videoMotionId": null,
    "referenceBindings": [],
    "nodes": [],
    "connections": []
  },
  "videoPromptHandoff": {
    "status": "not_started",
    "sourceSkill": "short-drama-video-prompts",
    "referenceMode": "reference",
    "promptPath": null,
    "promptHash": null,
    "shotCount": 0,
    "referencePaths": [],
    "referenceSlots": [],
    "planReferenceSlots": [],
    "audioReferenceSlots": [],
    "missingReferences": [],
    "errors": []
  },
  "videoSegmentChain": {
    "status": "not_started",
    "model": null,
    "targetDurationSeconds": null,
    "maxSegmentSeconds": null,
    "segmentCount": 0,
    "segments": []
  },
  "intake": {
    "status": "not_started",
    "requestDetailLevel": null,
    "executionScope": "end_to_end",
    "requestedStages": [],
    "blockingQuestions": [],
    "missingInputs": [],
    "reusableInputs": [],
    "route": [],
    "lastAssessedAt": null
  },
  "assetTargets": [],
  "storyStatus": "draft",
  "preproductionStatus": "draft",
  "designReportPath": null,
  "productionConfirmation": { "status": "pending", "reportHash": null, "confirmedAt": null },
  "characterReferencePresent": false,
  "characterDesignSheetStatus": "not_started",
  "sceneDesignSheetStatus": "not_started",
  "keyframeStatus": "not_started",
  "videoReferenceIds": [],
  "videoGenerationStatus": "not_started",
  "activeBatchId": null,
  "updatedAt": null
}
```

`schemaVersion=1`、`schemaVersion=2` 或 `schemaVersion=3` 的旧状态可以继续恢复，但新请求必须在进入
创作或生产前补写 `intake` 和 `videoPromptHandoff`。这些字段是编排状态，不替代
五份 Drama Markdown 文档。

允许的状态值：

- `intake.status`：`not_started`、`in_progress`、`needs_user_input`、`ready`、
  `routed`
- `intake.requestDetailLevel`：`brief`、`partial`、`detailed`、`production_ready`、
  `continuation`
- `intake.executionScope`：`end_to_end`（默认一次性补齐）或 `stage_only`（用户
  明确要求只做某个阶段）
- `intake.requestedStages`：`stage_only` 时用户明确要求的阶段列表；`end_to_end` 时
  为空
- `intake.blockingQuestions`：当前仍阻塞下一阶段的问题列表
- `intake.missingInputs`：缺失或失效的输入维度，例如 `duration`、`story`、
  `characters`、`scenes`、`storyboard`、`video_prompts`
- `intake.reusableInputs`：本轮明确复用的项目文档、资产或 Canvas 节点引用
- `intake.route`：按顺序排列的路由项，每项至少包含 `owner`、`reason`、`action`
  和 `status`；`action` 使用 `create`、`revise`、`reuse`、`skip`，`status` 使用
  `pending`、`active`、`complete`、`blocked`
- `videoPromptHandoff.status`：`not_started`、`requested`、`draft`、`blocked`、
  `validated`、`superseded`
- `videoPromptHandoff.sourceSkill`：固定为 `short-drama-video-prompts`
- `videoPromptHandoff.referenceMode`：`reference`、`text-to-video` 或 `mixed`；新视频批次
  默认是 `reference`。`text-to-video` 只表示创作者明确选择的非角色文生视频批次，
  必须没有 `REF-*`，且不得混入角色、场景或关键帧参考目标；旧状态缺失时按
  `reference` 读取。`mixed` 只用于提示词文件的盘点结果；进入确认或生产前必须按
  生成方式拆成独立批次，不得作为单一视频批次提交。
- `videoPromptHandoff.promptPath`：当前视频提示词文件的项目相对路径
- `videoPromptHandoff.promptHash`：当前文件哈希，用于确认交接版本没有变化
- `videoPromptHandoff.shotCount`：已校验的 `MOTION-...` 镜头数量
- `videoPromptHandoff.referencePaths`：从当前 `REF-*` 行解析出的项目相对路径；每条必须
  解析到真实、可读取的图片文件，或由已验收的 Canvas 图片节点在 `assetTargets` 中登记
- `videoPromptHandoff.referenceSlots`：从每条 `REF-*` 解析出的槽位、顺序、路径、用途、
  控制和不得控制范围；`order` 与 `planReferenceSlots` 共用每个 `MOTION-*` 镜头内的
  1-based 连续顺序；进入确认阶段时不得丢失这些语义。若一个真实图片文件需要在同一
  镜头承担多个语义，必须为每个语义建立独立的真实 Canvas 图片节点，并在槽位上保存
  `canvasNodeId`，不能让一个节点承担多个 role。
- `videoPromptHandoff.planReferenceSlots`：从每条 `PLAN-*` 解析出的待挂载槽位、顺序、
  路径占位、用途、控制和不得控制范围。`stage_only` 可保留它们并保持 `draft`；进入
  `validated`、确认或生产前必须全部替换为 `REF-*` 和真实媒体。
- `videoPromptHandoff.audioReferenceSlots`：从每个 `MOTION-*` 的独立「参考音频」字段
  解析出的音频槽位、音频顺序、项目相对路径、中文名、`用途=音色`、角色、控制和不得
  控制范围。音频槽位与图片 `REF-*` 使用独立编号空间，同一镜头可以各自从 1 开始；
  它不伪装成 Canvas 图片绑定；进入 `validated` 前必须是可读取的项目音频
  文件，生产 owner 再按目标模型能力翻译为 `reference_audio`，不支持时在提交前阻塞。
- `videoPromptHandoff.missingReferences`：缺失或未解析的参考图清单
- `videoPromptHandoff.errors`：最近一次交接校验错误
- `canvas.requirement`：新状态固定为 `required`；旧状态可读取 `not_required`、`optional`
  以便迁移
- `canvas.status`：`not_evaluated`、`connected`、`unavailable`、`degraded`、`mismatch`
- `canvas.lastCheckedAt`：最近一次实际检查 Canvas 的时间；未检查时为 `null`
- `canvas.projectId`：最近一次通过实时查询确认的 Canvas 项目 ID
- `canvas.origin`：最近一次实时核验的浏览器 origin。渠道和模型配置按 origin 隔离；
  它是恢复线索而不是跨项目永久锁。新 Agent 应先核验当前页面/目标项目，缺少可复用
  连接时默认使用 `https://canvas.best`。
- `canvas.routePath`：最近一次实时核验或由实时 `projectId` 推导的项目路由，必须为
  `/canvas/<projectId>`；如果浏览器 URL 可观察，应优先记录实测路由
- `canvas.clientId`：最近一次实时核验的共享 Canvas client/session 标识
- `canvas.title`：最近一次实时核验的画布名称；连接状态下必须存在。默认标题可以暂时
  记录为连接事实，但创建节点或进入确认前必须改为生产语义名称，不得保留
  `无限画布`、`无限画布 <数字>`、`画布`、`画布 <数字>`、`Canvas`、
  `Infinite Canvas` 或 `Untitled`
- `canvas.lastIssue`：最近一次 Canvas 阻断原因；旧状态为 `not_required` 时应为 `null`
- `canvas.videoConfigNodeId`：当前确认/生产批次唯一视频 config 节点 ID。画布可以保留
  其他历史镜头的 config 节点，但它们不属于当前批次；进入确认阶段时必须能由该字段、
  当前 `MOTION-*` 或当前参考绑定唯一定位同一个节点。
- `canvas.videoMotionId`：当前确认/生产批次唯一的 `MOTION-*`。提示词文件包含多个镜头时
  必须显式记录它，并与当前 config 的 `metadata.motionId` 完全一致。
- `canvas.referenceBindings`：实时核对过的图片节点到视频配置节点的绑定；每项包含
  `sourceNodeId`、`targetNodeId`、`role` 和 `direction=image->video-config`
 ；进入确认阶段时，当前视频 config 的所有图片入边必须与此数组一一对应，且所有
  当前 `REF-*` 槽位都必须能映射到其中一个真实来源节点
- `canvas.nodes`、`canvas.connections`：最近一次实时 Canvas 快照的规范化节点和边；
  节点至少包含 `id`、`type`，图片节点还必须有 `mediaAvailable=true`，边必须包含
  `fromNodeId` 和 `toNodeId`。原始 Canvas 图片节点只有在本次实时查询同时满足
  `metadata.status=success`、存在非空 `metadata.content` 或 `metadata.storageKey`、
  `metadata.mimeType` 为图片类型以及正整数 `metadata.naturalWidth`/
  `metadata.naturalHeight` 时，才能规范化为 `mediaAvailable=true`；保存时使用自然
  尺寸，不使用节点显示尺寸
- `assetTargets`：本批次每个角色、场景、关键帧或必要道具参考的清单；每项包含
  `assetId`、`assetType`、`action`、`status`，图片目标还必须有尺寸字段和
  `validationStatus=accepted`；`aspectRatio` 使用 `W:H` 字符串（旧状态可读正数）；
  若参考图不以项目文件存在，必须记录其 `projectRelativePath` 与真实 Canvas
  `nodeId`；同一文件被多个语义槽位使用时可用 `nodeIds` 保存多个独立图片节点，
  并在 `referenceSlots[].canvasNodeId` 中逐槽位指明；进入确认阶段的已完成图片还必须
  至少记录一个真实 Canvas `nodeId`
- `videoSegmentChain.status`：`not_started`、`planned`、`awaiting_previous_output`、
  `ready`、`in_production`、`generated`、`tail_frame_extracted`、`blocked`、
  `completed`
- `videoSegmentChain.model`：当前片段链使用的目标模型
- `videoSegmentChain.targetDurationSeconds`：连续视频的目标总时长
- `videoSegmentChain.maxSegmentSeconds`：当前模型单次允许的最长时长
- `videoSegmentChain.segmentCount`：片段总数
- `videoSegmentChain.segments`：按顺序记录每个片段的时长、起始帧来源、上一片段、
  输出视频和真实尾帧引用
- `storyStatus`：`draft`、`confirmed`
- `preproductionStatus`：`draft`、`ready_for_confirmation`、`confirmed`、`in_production`、`completed`、`failed`
- `characterDesignSheetStatus` 和 `sceneDesignSheetStatus`：`not_started`、`reused`、
  `planned`, `in_production`, `generated`, `resolution_invalid`, `failed`
- `productionConfirmation.status`：`pending`、`confirmed`、`consumed`、
  `invalidated`
- 旧状态可读取 `characterSketchStatus`、`characterTurnaroundStatus`，但新任务不得写入
  或依赖这两个字段。
- `keyframeStatus`：`not_started`、`planned`、`in_production`、`generated`、
  `resolution_invalid`, `approved`
- `videoGenerationStatus`：`not_started`、`prepared`、`awaiting_video_confirmation`、
  `submitted`, `completed`, `blocked`, `failed`
- `activeBatchId`、`videoGenerationStatus` 和 `production-batches/*.json` 是影铸核心状态
  中的视频批次字段；图片、TTS/配音和音乐批次由 `$short-drama-produce` 的对应 job
  ledger 按同一报告/确认规则管理，不得把它们伪装成视频批次写入这些字段。

## 状态转换规则

- `storyStatus=confirmed` 是正式角色或镜头生产的前置条件。
- 新的角色视频项目只使用一张 `character-design-sheet` 参考图，不再拆分为草图和
  三视图。旧批次只允许读取旧角色字段，不得写入新批次。
- 在需要角色或场景参考时，视频批次必须记录统一角色设定图以及对应的场景设定图
  或关键帧。
- 每个图片目标都必须记录 `requestedSize`、`actualSize`、`naturalWidth`、
  `naturalHeight`、`aspectRatio` 和 `validationStatus`。供应商任务成功但尺寸
  不合格，不能视为成功的生产资产。
- 16:9 视频必须使用已验收的 16:9 起始关键帧。不得把方图或比例不匹配的关键帧
  连接到视频配置。
- 关键帧和结束关键帧的比例必须匹配 `short-drama.json#/format/aspect_ratio`；
  视频 config 的 `targetSize`/`size` 也必须匹配该目标画幅。项目未声明目标画幅时，
  不得自行猜测比例。
- 视频 config 准备阶段必须明确 `metadata.autoRun=false`；缺失或为 `true` 都不能
  进入确认阶段。
- `videoReferenceIds` 必须与当前实时 `canvas.referenceBindings` 的来源节点 ID
  集合完全一致；文生视频例外时必须都为空，不能沿用旧批次节点。
- `ready_for_confirmation` 或 `awaiting_video_confirmation` 状态树中不得残留
  `providerTaskId`、`provider_task_id`、`taskId` 或 `task_id`；发现旧任务必须先
  查询/回收并把状态迁移到正确的恢复阶段。
- `videoGenerationStatus=submitted` 时，活动批次中必须存在任务 ID。
- `videoGenerationStatus=completed` 时，必须存在已验证的输出 manifest。
- 已完成 manifest 的每个输出必须是项目内相对路径，文件真实存在，`byteCount`（如有）
  与文件大小一致，且 `sha256` 与文件实际内容一致。
- `ready_for_confirmation` 的 `designReportPath` 必须是项目内文件，且包含当前
  `productionConfirmation.reportHash` 和唯一确认短语；确认短语中的 SHA-256 必须与
  `productionConfirmation.reportHash` 相同，报告规范化哈希同时替换这两处指纹。
- 提示词、模型、时长、参考图集合或输出目标发生变化时，必须创建新批次，并使
  旧确认失效。
- 一个 Canvas 视频 config、`activeBatchId` 和当前确认批次只对应一个 `MOTION-*`；
  多镜头文件必须按镜头拆分配置和批次，不能只保存一个 `motionId`。
- 复用已有 Canvas 项目时，历史 `type=config` 节点可以保留；唯一性只针对当前
  `videoConfigNodeId`/当前 `MOTION-*`，不得把整张画布的历史 config 当成当前批次冲突。
- 视频 config 的 `metadata.motionId` 必须等于当前交接文件中唯一的 `MOTION-*`；
  只符合 `MOTION-*` 格式但指向另一镜头的节点不能通过校验。
- `intake.status=needs_user_input` 时不得进入 `preproductionStatus=in_production`，
  也不得创建需要付费生产的批次。
- `preproductionStatus` 进入 `ready_for_confirmation` 或之后时，`intake.status`
  必须为 `ready` 或 `routed`，并且 `blockingQuestions` 为空。
- `preproductionStatus` 进入 `ready_for_confirmation` 或之后时，
  `videoPromptHandoff.status` 必须为 `validated`。
- `stage_only` 的视频提示词可以暂时保留 `PLAN-*` 或待补参考图，交接状态为 `draft`；
  这只表示该阶段文档已完成，不能进入 `ready_for_confirmation`、确认或生产。
- `videoPromptHandoff.status=blocked` 或 `missingReferences` 非空时，不得确认或提交
  视频任务。
- `videoSegmentChain.status=awaiting_previous_output` 时，不得提交当前链中缺少真实尾帧的
  后续片段。
- 片段链的总时长必须等于目标时长，且每个片段时长不能超过
  `maxSegmentSeconds`。
- 旧状态 `canvas.requirement=not_required` 可继续读取，但新状态不得使用；新短视频
  工作流没有实时 Canvas 连接时必须停止。
- `canvas.requirement=required` 且 `canvas.status` 不是 `connected` 时，不得执行依赖
  Canvas 的生成、绑定或回捞动作。
- 新状态从工作流启动起就必须记录实时连接；`draft` 也不能以
  `canvas.status=not_evaluated` 通过校验。连接记录必须同时包含
  `projectId`、`routePath`、`clientId` 和 `lastCheckedAt`。
- 项目 `short-drama.json` 的 `production_profile.backend=infinite-canvas` 时，
  `canvas.requirement` 必须为 `required`；进入 `ready_for_confirmation` 或之后时，
  必须同时具备实时核验时间、Canvas `projectId`、一致的
  `currentCanvasProjectId`。普通参考批次至少有一条 `referenceBindings`；明确的
  `text-to-video` 批次必须没有参考绑定。
- 新建或初始化的短视频工作流状态一律使用 `canvas.requirement=required`；没有实时
  Canvas 连接时不得继续执行短视频流程。
- 进入确认阶段时，主 Agent 必须从实时 Canvas 状态和可见界面确认每个参考节点实际
  有可读取的图片媒体或附件内容。只有 `type=image`、标题、尺寸、`assetId` 或验收
  metadata 的空节点不得登记为已完成资产；界面显示“空图片节点”时必须保持
  `videoPromptHandoff` 或前期状态为阻塞。
- `workflow-state.mjs validate` 只能证明保存的规范化快照内部字段一致，不能证明快照
  本身来自实时 Canvas；进入确认阶段前，主 Agent 仍必须通过实时 `canvas_get_state`
  重新对齐项目 ID、标题、节点类型、metadata、媒体可读性和连线端点。
- `canvas.status=unavailable`、`degraded` 或 `mismatch` 只有在工作流明确记录为
  `preproductionStatus=failed`、`videoGenerationStatus=blocked` 或 `failed` 时才可作为
  失败终态；不得借此进入确认或生产。

## 批次记录

影铸核心状态中的 `.short-drama/production-batches/<batch-id>.json` 只记录一个视频批次；
其他 modality 仍由生产 owner 的 job ledger 记录，不能复用 `videoGenerationStatus`：

```json
{
  "schemaVersion": 1,
  "batchId": "BATCH-20261002-SHOT01-V01",
  "modality": "video",
  "sourceEntry": "MOTION-01",
  "canvasProjectId": "canvas-id",
  "configNodeId": "config-id",
  "referenceNodes": [
    { "nodeId": "image-id", "role": "character-design-sheet", "title": "角色设定图" },
    { "nodeId": "image-id", "role": "keyframe", "title": "镜头关键帧" }
  ],
  "promptHash": null,
  "parameters": {},
  "segmentChain": {
    "status": "planned",
    "model": "minimax-h3",
    "targetDurationSeconds": 35,
    "maxSegmentSeconds": 15,
    "segmentCount": 3,
    "segments": [
      {
        "segmentId": "SEG-001",
        "sourceShotId": "MOTION-001",
        "index": 1,
        "durationSeconds": 15,
        "startFrameSource": "frozen-keyframe",
        "startFrameRef": "keyframe-001",
        "outputVideoRef": null,
        "tailFrameRef": null,
        "status": "planned"
      },
      {
        "segmentId": "SEG-002",
        "sourceShotId": "MOTION-001",
        "index": 2,
        "durationSeconds": 15,
        "startFrameSource": "actual-tail-frame",
        "startFrameRef": null,
        "previousSegmentId": "SEG-001",
        "outputVideoRef": null,
        "tailFrameRef": null,
        "status": "awaiting_previous_output"
      },
      {
        "segmentId": "SEG-003",
        "sourceShotId": "MOTION-001",
        "index": 3,
        "durationSeconds": 5,
        "startFrameSource": "actual-tail-frame",
        "startFrameRef": null,
        "previousSegmentId": "SEG-002",
        "outputVideoRef": null,
        "tailFrameRef": null,
        "status": "awaiting_previous_output"
      }
    ]
  },
  "confirmation": { "status": "pending", "confirmedAt": null },
  "attempts": [],
  "outputs": []
}
```

不得在这些文件中保存 API Key、私有输入字节或绝对机器路径。
