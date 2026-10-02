# 工作流状态契约

本文件定义 `$short-video-workflow` 的运行状态。它与五份创作文档分离，可以随项目
一起复制。

## 文件位置

```text
.short-drama/workflow-state.json
```

最小结构：

```json
{
  "schemaVersion": 3,
  "projectId": null,
  "currentCanvasProjectId": null,
  "canvas": {
    "requirement": "not_required",
    "status": "not_evaluated",
    "lastCheckedAt": null,
    "projectId": null,
    "lastIssue": null
  },
  "videoPromptHandoff": {
    "status": "not_started",
    "sourceSkill": "short-drama-video-prompts",
    "promptPath": null,
    "promptHash": null,
    "shotCount": 0,
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
  "storyStatus": "draft",
  "preproductionStatus": "draft",
  "designReportPath": null,
  "productionConfirmation": { "status": "pending_video_only", "reportHash": null, "confirmedAt": null },
  "characterReferencePresent": false,
  "characterDesignSheetStatus": "not_started",
  "scenePlateStatus": "not_started",
  "characterSketchStatus": "not_started",
  "characterTurnaroundStatus": "not_started",
  "keyframeStatus": "not_started",
  "videoReferenceIds": [],
  "videoGenerationStatus": "not_started",
  "activeBatchId": null,
  "updatedAt": null
}
```

`schemaVersion=1` 或 `schemaVersion=2` 的旧状态可以继续恢复，但新请求必须在进入
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
- `videoPromptHandoff.promptPath`：当前视频提示词文件的项目相对路径
- `videoPromptHandoff.promptHash`：当前文件哈希，用于确认交接版本没有变化
- `videoPromptHandoff.shotCount`：已校验的 `MOTION-...` 镜头数量
- `videoPromptHandoff.missingReferences`：缺失或未解析的参考图清单
- `videoPromptHandoff.errors`：最近一次交接校验错误
- `canvas.requirement`：`not_required`、`optional`、`required`
- `canvas.status`：`not_evaluated`、`connected`、`unavailable`、`degraded`、`mismatch`
- `canvas.lastCheckedAt`：最近一次实际检查 Canvas 的时间；未检查时为 `null`
- `canvas.projectId`：最近一次通过实时查询确认的 Canvas 项目 ID
- `canvas.lastIssue`：最近一次 Canvas 阻断原因；`not_required` 时应为 `null`
- `videoSegmentChain.status`：`not_started`、`planned`、`awaiting_tail_frame`、
  `in_progress`、`blocked`、`completed`
- `videoSegmentChain.model`：当前片段链使用的目标模型
- `videoSegmentChain.targetDurationSeconds`：连续视频的目标总时长
- `videoSegmentChain.maxSegmentSeconds`：当前模型单次允许的最长时长
- `videoSegmentChain.segmentCount`：片段总数
- `videoSegmentChain.segments`：按顺序记录每个片段的时长、起始帧来源、上一片段、
  输出视频和真实尾帧引用
- `storyStatus`：`draft`、`confirmed`
- `preproductionStatus`：`draft`、`ready_for_confirmation`、`confirmed`、`in_production`、`completed`、`failed`
- `characterDesignSheetStatus` 和 `scenePlateStatus`：`not_started`、`reused`、
  `planned`, `in_production`, `generated`, `resolution_invalid`, `failed`
- `productionConfirmation.status`：`pending_video_only`、`confirmed`、`consumed`、
  `invalidated`
- `characterSketchStatus`：`not_started`、`pending_confirmation`、`approved`
- `characterTurnaroundStatus`：`not_started`、`pending_confirmation`、`approved`
- `keyframeStatus`：`not_started`、`planned`、`in_production`、`generated`、
  `resolution_invalid`, `approved`
- `videoGenerationStatus`：`not_started`、`prepared`、`awaiting_video_confirmation`、
  `submitted`, `completed`, `blocked`, `failed`

## 状态转换规则

- `storyStatus=confirmed` 是正式角色或镜头生产的前置条件。
- 新的角色视频项目使用一张 `character-design-sheet` 参考图，不再拆分为草图和
  三视图。旧批次仍可以继续记录 `character-sketch` 和 `character-turnaround`。
- 在需要角色或场景参考时，视频批次必须记录统一角色设定图以及对应的场景设定图
  或关键帧。
- 每个图片目标都必须记录 `requestedSize`、`actualSize`、`naturalWidth`、
  `naturalHeight`、`aspectRatio` 和 `validationStatus`。供应商任务成功但尺寸
  不合格，不能视为成功的生产资产。
- 16:9 视频必须使用已验收的 16:9 起始关键帧。不得把方图或比例不匹配的关键帧
  连接到视频配置。
- `videoGenerationStatus=submitted` 时，活动批次中必须存在任务 ID。
- `videoGenerationStatus=completed` 时，必须存在已验证的输出 manifest。
- 提示词、模型、时长、参考图集合或输出目标发生变化时，必须创建新批次，并使
  旧确认失效。
- `intake.status=needs_user_input` 时不得进入 `preproductionStatus=in_production`，
  也不得创建需要付费生产的批次。
- `preproductionStatus` 进入 `ready_for_confirmation` 或之后时，`intake.status`
  必须为 `ready` 或 `routed`，并且 `blockingQuestions` 为空。
- `preproductionStatus` 进入 `ready_for_confirmation` 或之后时，
  `videoPromptHandoff.status` 必须为 `validated`。
- `videoPromptHandoff.status=blocked` 或 `missingReferences` 非空时，不得确认或提交
  视频任务。
- `videoSegmentChain.status=awaiting_tail_frame` 时，不得提交当前链中缺少真实尾帧的
  后续片段。
- 片段链的总时长必须等于目标时长，且每个片段时长不能超过
  `maxSegmentSeconds`。
- `canvas.requirement=not_required` 时不得因为 `canvas.status=unavailable` 阻塞本地
  创作阶段。
- `canvas.requirement=required` 且 `canvas.status` 不是 `connected` 时，不得执行依赖
  Canvas 的生成、绑定或回捞动作。

## 批次记录

每个 `.short-drama/production-batches/<batch-id>.json` 只记录一种媒体类型：

```json
{
  "schemaVersion": 1,
  "batchId": "BATCH-20261002-SHOT01-V01",
  "modality": "video",
  "sourceEntry": "MOTION-01",
  "canvasProjectId": "canvas-id",
  "configNodeId": "config-id",
  "referenceNodes": [
    { "nodeId": "image-id", "role": "character-sketch", "title": "角色草图" },
    { "nodeId": "image-id", "role": "character-turnaround", "title": "角色三视图" },
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
