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
  "schemaVersion": 1,
  "projectId": null,
  "currentCanvasProjectId": null,
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
  "videoGenerationStatus": "awaiting_video_confirmation",
  "activeBatchId": null,
  "updatedAt": null
}
```

允许的状态值：

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
  "confirmation": { "status": "pending", "confirmedAt": null },
  "attempts": [],
  "outputs": []
}
```

不得在这些文件中保存 API Key、私有输入字节或绝对机器路径。
