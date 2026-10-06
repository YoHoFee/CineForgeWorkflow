# 影铸统一执行契约

本文件是 `$short-video-workflow`、Drama Skills 与 Infinite Canvas 之间的统一接口。
`$infinite-canvas-bridge` 是可选的 Canvas 协同实现层，底层可以委托当前插件工具；
如果它没有在当前 Agent 的 Skill 列表中出现，直接使用
`infinite-canvas@infinite-canvas-local` 的 `open-canvas`/`canvas` 工具，不能把名称
不可发现当作连接故障。任何入口都不拥有第二套状态或确认账本。本文件只规定编排层
必须交付和校验的事实，不重写任何第三方 Skill 的创作方法。

## Owner

| 内容 | 唯一 owner |
|---|---|
| 故事开发 | `$short-drama` / `$short-drama-develop` |
| 剧本 | `$short-drama-write` |
| 视觉设定、资产身份与连续性 | `$short-drama-assets` |
| 图片提示词 | `$short-drama-image-prompts` |
| 镜头、冻结关键帧与画面依据 | `$short-drama-storyboard` |
| 视频运动提示词 | `$short-drama-video-prompts` |
| 媒体生产 | `$short-drama-produce` + Infinite Canvas 工具（可由 `$infinite-canvas-bridge` 协调） |
| 剪辑交付 | `$short-drama-edit` |
| 内容审查 | `$short-drama-review` |
| 跨阶段路由、状态、批次和交接校验 | `$short-video-workflow` |

编排层不得代写 owner 的正文，不得把 Canvas 节点、批次 JSON 或测试快照当作第五套
创作事实。创作事实仍只来自五份 creator-first Markdown。

当某个 Drama Skill 被单独调用时，它仍可按自身阶段契约运行；当任务进入
`$short-video-workflow` 路由时，本文件只覆盖 Canvas 连接、状态、参考交接和生产闸门，
不覆盖创作 owner 的正文规则。这样既保持第三方 Skill 解耦，也避免 standalone 的可选
行为绕过影铸的确认前置条件。

## 最高优先级闸门

在当前批次明确确认前，不得调用 `canvas_generate_*`、`canvas_run_generation` 或
外部媒体 adapter；准备阶段只能创建节点和 `autoRun=false` 的生成流程。已接受登记、
`IMG-*`、文件名、尺寸或验收 metadata 都不等于真实媒体；缺少可读取文件、附件或
Canvas 图片节点时必须标记 `blocked`，不得自动补图或静默改走文生视频。

当流程交给 `$short-drama-produce` 时，影铸的媒体批次边界优先于该 Skill 的通用
整包入口：图片确认、视频确认、配音确认和音乐确认不能互相授权；影铸不会把图片
和视频 targets 放进同一个确认批次。影铸核心 `workflow-state` 的 `activeBatchId`、
`videoGenerationStatus` 和 `production-batches/*.json` 只记录视频批次；其他 modality
继续由生产 owner 的 job ledger 记录，不得伪装成视频状态。

## 资产目标

每个本批次实际需要的角色、场景和起始关键帧，必须逐项标记为 `reuse`、`generate`、
`variant` 或 `blocked`。

状态文件中的 `assetTargets` 是这份清单的机器可校验表示；它不是新的创作事实。

- `character-design-sheet`：一张角色设定图，包含展示视图、正/侧/背视图、细节和面部
  区域。它完全替代旧的 `character-sketch` 与 `character-turnaround`。
- `scene-design-sheet`：一张无人物场景设定图，包含总览、空间关系、替代角度和细节。
- `keyframe`：镜头起始画面；必须符合视频画幅和目标模型能力。
- `prop/state`：只有视觉设定或镜头明确要求独立稳定参考时才建立。

`IMG-*` 是提示词条目，不代表图片存在；真实文件或 Canvas 图片节点才是可用参考。
Canvas 图片节点还必须实际呈现可读取的图片媒体或附件内容；`type=image`、标题、
尺寸、`assetId`、`validationStatus` 或其他 metadata 单独存在都不能证明图片存在。
实时状态或界面显示“空图片节点”时，该资产必须按缺失处理。
输入类型按固定优先级处理：先从实时 Canvas 复用已存在且媒体可读的图片节点；本轮
用户上传的图片使用 `canvas_create_attachment_nodes`；缺少真实节点但图片资产已经
确认时，由图片生产 owner 或已注册的媒体适配层建立正常图片结果，再回到 Canvas
复核。项目内文件只有在能够把真实内容或当前工具支持的真实存储句柄写入 `type=image`
节点时，才可使用 `canvas_create_node`/等价批量操作。不要在对话中展开或手工拼接大段
Base64；不要把本地路径、文件名、assetId 或尺寸 metadata 当作媒体。创建后必须立即
重新查询 `canvas_get_state`，核对成功状态、图片 MIME、媒体证据和自然宽高；无法传递
真实内容时保持 `blocked`。
控制面预置的图片节点可以作为正常生产中已生成并验收的参考资产，但必须在运行 Agent
开始前已经存在于共享 Canvas，且运行 Agent 只能按普通 `reuse` 逻辑读取和绑定，不得
被要求猜测隐藏的测试替代规则。
复用已有 Canvas 图片时，还必须将项目资产的 `actualSize`/`naturalWidth`/
`naturalHeight` 与实时节点的自然尺寸和媒体内容内嵌尺寸逐项比较；尺寸或媒体内容
不一致时必须重新写入真实媒体或建立新节点，不能只修正 metadata、assetId 或尺寸字段。
角色、场景和关键帧图可以复用，但必须核对身份、变体、画幅、尺寸、内容和用途。
明确选择的非角色文生视频可以没有参考图；这不是默认降级。该批次必须显式记录
`videoPromptHandoff.referenceMode=text-to-video`，并确保视频提示词逐镜写出完整静态
视觉锚点。角色镜头、需要角色身份连续性的镜头和需要稳定地理/起始构图的镜头不得
使用这个例外。

## 视频参考

视频配置的参考图按本镜可见事实连接，不按资产数量凑图：

```text
character-design-sheet -> 用途：身份 或 造型状态
scene-design-sheet     -> 用途：地理
keyframe               -> 用途：起始帧
ending-keyframe        -> 用途：结束帧，仅在有真实结束帧时
```

一张角色设定图是唯一角色资产参考，不得再创建、要求或连接 `character-sketch`、
`character-turnaround`。单独的草图、三视图和旧角色节点只允许旧批次恢复，不得进入新批次。

视频配置必须能被实时查询证明：

- 每个连接端点都是真实图片节点；
- 图片节点必须实际呈现可读取的媒体或附件内容；只写标题、尺寸、`assetId`、
  `validationStatus` 或其他 metadata 的空节点不得进入确认阶段；
- 实时快照中的图片节点必须标记 `mediaAvailable=true`；当前批次必须唯一定位一个
  `type=config` 节点，历史 config 可以保留但不得混入当前批次；状态文件不得只保存自报
  的端点字符串；
- 节点 metadata 的 `shortDramaAssetRole` 与上表一致；
- `assetTargets` 中标记为已完成且进入本批次的视频参考资产，必须各自对应同一
  `nodeId` 和相同语义 role 的实时绑定；
- 参考连接方向为 `image -> video-config`；
- Canvas 中所有指向当前视频 config 的图片连接都必须出现在
  `referenceBindings`，所有 `referenceBindings` 也必须在实时 `connections` 中存在；
  不允许多挂未声明的图片参考或漏挂提示词中的真实 REF；
- 有参考图时使用 `referencePolicy=all-connected`；只有明确的非角色文生视频例外才
  使用 `referencePolicy=none`；
- 当前视频配置节点的 metadata 必须包含 `modality=video`、`generationMode=video`、
  `referencePolicy`、当前唯一 `MOTION-*`，并明确 `autoRun=false`；
- 字符角色镜头必须存在 `character-design-sheet`，需要场景时必须存在
  `scene-design-sheet`，需要起始构图时必须存在 `keyframe`；
- 缺少必需参考时状态为 `blocked`，不得降级为无参考视频。
- 一个视频批次不得混合“有参考图”和“明确无参考文生”两种模式；需要混合时拆成
  独立批次和独立配置节点。
- 一个 Canvas 视频配置和一个工作流活动批次只对应一个 `MOTION-*` 镜头。视频提示词
  文件可以包含多个镜头，但进入当前 Canvas 确认批次时必须按镜头拆分配置、连线和
  批次记录；不得用一个 `motionId` 冒充整份多镜头文件。
- 状态中的 `canvas.videoMotionId` 必须明确记录当前批次的 `MOTION-*`；提示词文件包含
  多个镜头时不得只凭 config 标题、节点顺序或旧批次节点推断当前镜头。
- `videoReferenceIds` 必须与实时 `referenceBindings[].sourceNodeId` 做集合完全一致
  校验；文生视频例外时两者都必须为空。不能只登记部分节点，也不能保留上一批次的
  旧节点 ID。
- `参考音频` 是视频提示词中的独立交接槽位，不是 Canvas 图片节点，也不能被静默丢弃。
  影铸必须保留其顺序、项目相对路径、`用途=音色`、角色、控制和不得控制范围；真实
  音频文件缺失时保持 `draft/blocked`，生产 owner 根据目标模型是否声明
  `reference_audio` 决定能否提交。

阶段性的视频提示词任务可以暂时保留 `PLAN-*` 或待补参考图，并将交接状态保持为
`draft`。`PLAN-*` 必须保留与 `REF-*` 相同的顺序、用途、控制和不得控制语义；这只
表示提示词阶段完成，不表示参考图已存在，也不能进入确认或生产。进入生产前，所有
`PLAN-*` 必须替换为真实 `REF-*`，而不是只修改标题或补一个 assetId。

同一真实文件如果在一个镜头内承担两个不同用途，不能让同一个 Canvas 图片节点承担
两个 role。应为每个语义槽位建立独立的真实图片节点，并在状态槽位上记录对应
`canvasNodeId`；同一节点多挂 role 会使 `videoReferenceIds`、连接和提示词语义无法
一一核对，必须阻塞。

## Canvas 结构

Canvas 冷启动固定为：

```text
项目预检 -> 加载/发现 Infinite Canvas 工具 -> canvas_get_state 探测
->（探测无效时）infinite-canvas:open-canvas
-> canvas_get_state 复核 -> 校验 projectId/clientId
-> 锁定 origin ->（可观察时核对 route）-> 操作
```

Infinite Canvas 是短视频工作流的默认基础设施，不需要用户在每个任务中重复要求。
冷启动先确保 `infinite-canvas:canvas` 工具已加载，再调用 `canvas_get_state` 探测当前
连接；工具未出现在初始列表中不等于连接失败。此时必须立即调用 `tool_search` 搜索
`canvas_get_state open-canvas` 并加载这两个工具。`$infinite-canvas-bridge` 已加载时
可由它协调，未加载时直接发现并调用
`infinite-canvas:open-canvas`（对应插件 `infinite-canvas@infinite-canvas-local`）
复用或启动普通 Canvas Agent 并打开页面。在线冷启动没有普通 Agent 时启动
`npx -y @basketikun/canvas-agent@latest`（不是 `... mcp`），等待 `Local URL` 与
`Connect token`，打开带 `#agentUrl=<Local URL>&agentToken=<Connect token>` 的在线
Canvas 页面；已有匹配页面或 Agent 时不得启动第二实例。随后再次用 `canvas_get_state`
核验；如果没有 `hasCanvas=true`、项目 ID 或共享 `clientId`，等待网页完成连接后只重试一次。
`canvas_get_state` 通常只提供项目和连接状态，不提供浏览器 origin/route；此时可由
实时 `projectId` 推导 `routePath=/canvas/<projectId>`，不能仅因 URL 未暴露而阻断。
能观察浏览器 URL 时，必须核对它与实时 `projectId` 一致；只有观察到冲突才是
`route_mismatch`。多个 Canvas 标签时不能依赖随机当前标签，也不能因为标签存在、插件
MCP 进程存在、页面标题正常或聊天历史中的“已连接”而跳过探测和重试。
一旦 `canvas_get_state` 返回完整连接，返回的 `projectId/clientId` 与浏览器 origin 就锁定
本轮唯一写入目标；不得再打开 `mode=new`、切换站点 origin 或在随机标签上重命名、建节点、
连线。UI 操作必须在与实时项目路由和 origin 一致的页面完成，并在每次重命名后重新查询
实时状态；如果 UI 已显示生产标题而
MCP 只返回旧的默认标题，只要 projectId、clientId 和 route 仍一致即可继续使用 UI 标题；
两个不同的非默认标题或身份/路由不一致时，才停止写入并归类为 `state_stale`、
`route_mismatch` 或 `shared_client_missing`。
如果确实切换到另一个 Canvas 项目，必须先确认没有活动或已确认批次；登记新项目后旧
项目的节点、连线、参考绑定、当前 config 和 `videoReferenceIds` 都视为失效，必须重新
保存新项目的实时快照，不能把旧项目快照带入新项目。

### 原始 Canvas 快照规范化

`canvas_get_state` 返回的原始图片节点不能直接当作工作流状态写入。对每个
`type=image` 节点，必须在保存 `canvas.nodes` 前完成一次确定性规范化：

```text
mediaAvailable =
  metadata.status == "success"
  AND (metadata.content 为非空字符串 OR metadata.storageKey 为非空字符串)
  AND metadata.mimeType 以 "image/" 开头
  AND metadata.naturalWidth、metadata.naturalHeight 为正整数
```

规范化后保存实时节点 ID、`type=image`、`mediaAvailable=true`、语义角色、状态、
图片 MIME 类型和 `naturalWidth/naturalHeight`。`content`、`storageKey` 和字节数等
证据可以因不可序列化或隐私原因不落入工作流状态，但必须来自本次实时查询，不能由
标题、节点显示尺寸、`assetId`、`validationStatus` 或 Agent 自报补写。完成保存后，
主 Agent 仍必须再次实时查询复核。

优先使用状态脚本的 `record-canvas-snapshot` 规范化入口；它会拒绝缺少项目 ID、共享
client ID、节点或连接数组的快照，并阻止用一个已连接项目的快照覆盖另一个项目。

连接阻断必须归类为以下之一：`no_canvas_tab`、`agent_unavailable`、
`frontend_unreachable`、`state_stale`、`route_mismatch`、`shared_client_missing`、
`canvas_origin_mismatch`。
UI 已显示生产标题且身份/路由一致时，MCP 的默认标题读模型延迟不属于连接阻断；
不得只报告“画布不可用”。

默认模式沿用当前浏览器页面或项目状态中已锁定的 Canvas origin。只有没有任何锁定
origin 的全新项目，才按项目规则选择在线或本地前端；锁定 `http://localhost:3000`
后不得静默切换到 `https://canvas.best`，反之亦然。`http://127.0.0.1:17371` 是普通
Canvas Agent 的本地连接地址，不是网页 origin。`canvas_get_state` 失败时必须先完成启动/重连尝试，再报告具体
启动环节，不得把“没有打开标签”概括为项目画布损坏。`open-canvas` 不可发现时，按
同一启动动作使用浏览器和终端完成，不得把工具缺失报告成连接失败。

在线 Canvas 项目不是本地文件夹，不得因为它没有“当前工作空间目录”就判定连接失败；
项目文件目录与 Canvas `projectId` 的对应关系由工作流状态记录。只有项目明确选择本地
前端时，才检查本地前端地址，并把其工作空间切换到当前项目根目录。

连接记录还必须保存经 UI 观察到的画布标题。默认标题不阻断冷启动连接，但新建或恢复
默认标题时，必须先用 Canvas 的重命名控件保存 `项目简称｜任务主题｜制作阶段`，再创建
节点；如果开始写入前 UI 中标题仍是 `无限画布`、`无限画布 <数字>`、`画布`、`画布 <数字>`、
`Canvas`、`Infinite Canvas` 或 `Untitled` 占位标题，或者重命名控件不可用，停止
Canvas 写入并报告阻断。若 UI
已经显示生产标题，而 MCP 读模型在一次复核后仍返回旧的默认标题，只要 projectId、
clientId 和 route 一致即可继续；状态脚本保留已登记的生产标题。两个不同的非默认标题
不允许互相覆盖。

短视频工作流的新状态默认使用 `canvas.requirement=required`。连接记录必须同时包含
`projectId`、`routePath=/canvas/<projectId>`、`clientId`、`title` 和 `lastCheckedAt`；即使当前只是
剧本、资产或提示词阶段，也必须先完成这次冷启动连接。在真实 Canvas 项目、节点、
metadata 和连接经实时查询核验前，不得把
前期制作状态写成 `ready_for_confirmation`，也不得用本地制作包替代 Canvas 交接。

每个目标只允许一个配置节点。正常结构为：

```text
提示词/注释 -> 图片配置 -> 图片输出
角色设定图 ─┐
场景设定图 ─┼-> 视频配置 -> 视频输出
起始关键帧 ─┘
```

提示词和注释节点只用于 Canvas 可见说明，权威内容仍在项目 Markdown。生产前必须先
保存并命名项目，再创建节点；生产后必须用实时状态查询核对项目 ID、节点、metadata
和连接端点。

## 闸门

所有付费媒体统一使用：

```text
prepare -> 展示当前批次预览 -> 用户明确确认 -> run
```

图片可以自动准备任务和 Canvas 流程，但没有当前批次确认不得调用图片、视频、配音或
音乐供应商。确认只覆盖报告指纹和报告中列出的 targets；参数、提示词、参考图或输出
范围变化时确认失效。
图片批次与视频批次分开确认：缺少静态图片时先确认并完成图片批次；图片验收通过后
重新建立视频报告、Canvas 参考绑定和视频确认。图片批次的确认不得自动授权视频。

视频确认的前置条件：

1. intake 已完成且无阻塞问题；
2. 所有 `generate` / `variant` 图片目标已生成并通过尺寸、比例和自然尺寸验收；
3. 视频提示词交接为 `validated`；
4. Canvas 参考图和连线通过实时查询；
5. 状态为 `ready_for_confirmation`；
6. 未有已提交的视频任务。

## 停止条件

遇到以下任一项必须停止依赖动作并报告具体缺口：

- 项目文件、工作流状态和 Canvas 项目无法对应；
- 必需资产没有真实文件或真实节点；
- 图片尺寸、比例或内容验收失败；
- 节点角色、连接方向或目标配置不一致；
- 第三方提示词交接不完整；
- 当前批次确认缺失或已经失效；
- 已有 provider task ID 但未先查询/回收。

## 旧版兼容

旧状态中的 `characterSketchStatus` 和 `characterTurnaroundStatus` 仅用于读取和迁移。
新状态只写 `characterDesignSheetStatus`，新批次只写 `character-design-sheet`。
