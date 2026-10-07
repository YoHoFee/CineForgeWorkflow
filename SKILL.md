---
name: short-video-workflow
description: 编排短视频、短剧、漫剧、动画和 AIGC 视频项目，协调 Drama Skills、Infinite Canvas 和生产闸门；用户要求检查或更新影铸时从固定 Git 仓库更新本 Skill，要求安装依赖或执行中确认依赖缺失时调用专用安装 Skill。
---

# 影铸工作流

影铸只负责跨阶段编排、Canvas 交接、状态和生产闸门，不代替 Drama Skills 写故事、
剧本、视觉设定、图片提示词、分镜、视频提示词或剪辑。创作事实仍以项目的五份
creator-first Markdown 为准；Canvas 是可视化、绑定和生产基础设施，不是第五套事实源。

## 检查更新与更新影铸

用户要求“检查影铸更新”“更新影铸工作流”“更新 short-video-workflow”，或在明确谈论
本 Skill 时说“检查更新/更新”，先进入本维护入口。更新对象仅为当前安装的
`short-video-workflow`，来源固定为 `https://github.com/YoHoFee/CineForgeWorkflow.git`
的 `main` 分支，不接受其他仓库、分支或其他 Skill 作为替代来源。

读取 [Skill 更新契约](references/skill-update.md)，然后执行当前已加载 Skill 目录中的
`scripts/update-skill.mjs`。默认“检查更新”也授权发现新版后自动下载安装：比较远端提交
与本地安装记录，先完整备份，再覆盖受管理的 Skill 文件；无需再次询问安装许可。
用户明确说“仅检查，不安装”时使用 `--check`，只报告版本差异。

维护入口不属于视频制作，不执行下方 Canvas 冷启动，不改项目状态、不触发媒体生产。
更新成功后报告旧/新提交、备份位置，并明确提示：**请开启新的 Agent 来启用新版影铸工作流。**
当前 Agent 结束本次维护，不在同一会话切换新规则继续生产。没有新版、无法确定版本顺序
或安装失败时按脚本实际结果说明；不得把下载完成当作安装成功。

## 安装依赖与缺失恢复

用户主体要求安装影铸依赖、首次安装引导，或执行中确认本次必需的 Skill/插件未安装时，
进入 `$cineforge-dependencies` 的职责；本工作流优先读取当前版本内附的
[影铸依赖安装](skills/cineforge-dependencies/SKILL.md)，按其清单和脚本执行。尚未发现独立
Skill 也可以直接加载内附入口；不要因安装器
本身未单独安装而让用户手动找依赖。首次安装列出全套依赖，自动补齐缺失项；执行中恢复
只补当前缺口，保留原项目阶段。安装入口不执行 Canvas 冷启动，不触发媒体生产。

正常生产不执行依赖全量检查。初始工具列表没有 Canvas 工具时先发现/加载工具，只有
确认插件未安装后才进入安装恢复；无画布、连接失败、渠道为空和需要登录按对应流程处理，
不能当作依赖缺失。可选 `$infinite-canvas-bridge` 缺少时直接使用插件，不为它触发安装。
安装后复查实际安装与工具加载；需要新 Agent 时给原任务恢复句，不自动新建聊天。

## 问题排查

遇到 Canvas 启动/连接、渠道配置、媒体 API、生成状态或结果回写问题时，**先读取**
[问题指引](references/problem-guide.md)，再检查日志、查询任务、重试或修改流程。先匹配
已知症状和排查顺序；指引是定位线索，不替代实时状态、当前供应商文档或安全闸门。
没有匹配案例时，按本文与相关 reference 的契约排查；确认新的可复用根因后，补充一条
脱敏案例和验证方式，不记录密钥、用户路径、项目/客户端 ID、提示词或媒体内容。

## 冷启动

短视频项目启动即自动连接 Infinite Canvas，不等待用户再次要求；`stage_only` 也不跳过
这一步。严格按以下顺序执行：

1. 读取项目 `AGENTS.md`、`README.md`、`short-drama.json`（如有）和
   `.short-drama/workflow-state.json`（如有）。
2. 读取 [Canvas Origin 选择契约](references/canvas-origin-lock.md) 中的
   `canvas.origin`。如果当前浏览器已有有效 Canvas 页面，先从可观察 URL 提取
   origin；如果没有可核验连接，再检查项目状态中目标画布的 origin，最后使用默认
   `https://canvas.best`。项目状态中的旧 origin 不是永久锁，不能覆盖当前有效页面或
   使新项目无法使用默认入口。确保
   `canvas_get_state` 与 `infinite-canvas:open-canvas` 可用。`open-canvas` 是启动流程
   Skill，不是一个缺失的 MCP 函数；工具未出现在初始列表时，立即用 `tool_search` 搜索
   `canvas_get_state open-canvas`，加载状态工具并遵循启动 Skill，再继续。
3. 先调用 `canvas_get_state` 探测当前连接。
4. 若没有 `hasCanvas=true`、`projectId` 和共享 `clientId`，调用
   `infinite-canvas:open-canvas` 的启动流程，但必须使用本轮选定的 origin。在线冷启动应复用普通 Canvas Agent；没有运行实例时启动
   `npx -y @basketikun/canvas-agent@latest`（不要启动 `... mcp` 代替网页 Agent），
   等待 `Local URL` 与 `Connect token`，在同一 origin 打开带
   `#agentUrl`/`#agentToken` 的 Canvas 页面，然后再次调用 `canvas_get_state`。
   已有可匹配页面或 Agent 时必须复用，不得启动第二实例。不同 origin 不能互相
   代替；如果本轮选定的 origin 连接失败，先排查该 origin 的前端、Agent、SSE
   客户端和路由，不得静默切换到另一个 origin 绕过问题。
5. 只有复核再次返回完整 `hasCanvas/projectId/clientId` 才算连接成功；锁定这组
   `projectId/clientId`，并将实时浏览器 origin 记录到 `canvas.origin`；所有 UI 和
   MCP 写入都必须落到同一 origin 的 `/canvas/<projectId>` 页面。`mode=new` 只允许
   用于用户要求独立项目，或默认 `https://canvas.best` 上的目标被占用且用户没有指定
   必须复用某个既有项目的场景。具体规则见 [canvas-origin-lock.md](references/canvas-origin-lock.md)。

如果用户明确要求打开某个已有 Canvas 项目，而实时检测发现该画布已经被其他 Agent
打开或连接占用，不要报“画布不可用”，直接提醒用户：

> 目标画布已经被其他 Agent 打开，请先关闭旧 Agent 的画布连接或对应画布标签页，
> 关闭后再通知我继续。

等待用户处理期间只允许只读检查，不创建节点、不重命名、不连线、不提交生成任务。
如果用户只是要测试、并行处理或打开一个独立项目，而没有指定必须复用该项目，则在
同一 origin 使用 `mode=new` 打开新的独立画布；不得切换新端口。若用户指定必须复用
原项目，则等待旧连接释放后重新调用 `canvas_get_state`，确认
`hasCanvas/projectId/clientId` 后再继续。

### 渠道配置

渠道配置属于 **Canvas 网页 origin**，不属于某个 `projectId`。因此切换画布不需要
逐个画布复制配置；所有新 Agent 必须打开同一个已配置 origin，配置自然可用。

- 默认渠道 origin 为 `https://canvas.best`。如果当前浏览器已有可核验页面，或用户
  明确指定了其他部署，则本轮沿用该 origin；这不是跨所有项目的永久锁定。
- 每个 origin 的渠道配置和画布数据彼此隔离。连接前后必须保持本轮选定的同一 origin；
  如果新 Agent 进入了另一个 origin，先按 `canvas_origin_mismatch` 排查，不要把它当作
  新画布，也不要用切换 origin 绕过连接失败。
- 对本轮选定的 origin，先检查网页入口、Agent `/health`、客户端连接和
  `canvas_get_state`。只有确认该 origin 的 `/config` 没有可用渠道，才能报告
  `channel_config_missing`；不能把另一个 origin 的空配置误报成渠道丢失。

页面存在、MCP 工具已加载、Agent 进程存在或聊天中说过“已连接”都不是连接证据。完成
上述启动/复核前，不得向用户报告“画布不可用”；复核仍失败时才报告具体的
`no_canvas_tab`、`agent_unavailable`、`frontend_unreachable`、`route_mismatch`、
`shared_client_missing`、`canvas_origin_mismatch` 或 `channel_config_missing`，并停止
依赖 Canvas 的动作。若明确检测到目标画布被其他 Agent/client 占用，使用
`canvas_occupied` 进入用户提示和只读等待分支，不把它改写成普通连接失败。在线 Canvas
不要求本地项目目录。

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

## 画布排布与剪辑交付

新建视频批次、整理画布、导出采用素材或交付成片前，先读取
[Canvas 排布、导出与 ChatCut 交付](references/canvas-layout-and-chatcut-delivery.md)。
它定义项目通用的片段排布、节点到导出文件的确定性映射、manifest 校验和 ChatCut
剪辑交接；不得凭聊天记忆、随机下载文件名或画布位置推断素材对应关系。

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
  如果项目生产档案或 owner 明确选择“身份/造型分离”版式，全身视图使用无五官白脸，
  面部身份由旁侧独立正面和侧面特写提供；否则沿用项目已确认的角色设定图版式。具体
  分区和生成/视频提示词措辞见 [资产设定图模板](references/asset-sheet-templates.md)。
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
- 镜头时长优先容纳完整镜头；不可为了凑满单次上限主动拆镜或拖长。仅当完整镜头无法
  落入模型合法时长时才考虑拆分，并按
  [视频片段链契约](references/video-segment-chain.md) 区分连续镜头与明确切镜。
- 提示词需写清每张参考图控制什么/不控制什么，以及镜头方位、运动方向、人物和场景
  连续性；避免静态站桩式对白和违反空间关系的背景运动。详见
  [视频提示词交接契约](references/video-prompt-handoff.md)。
- 默认只生成/保留对白、人声和叙事音效，不添加背景音乐；只有创作者明确授权本集
  配乐时才例外，通常在 ChatCut 后期统一加入。

## 状态与恢复

使用 `references/workflow-state.md` 和 `scripts/workflow-state.mjs`。实时 Canvas 连接后先
用 `record-canvas` 登记 `origin`、`projectId`、`routePath`、`clientId`、标题和检查时间；需要保存
节点时使用 `record-canvas-snapshot`，不要手写节点 ID、媒体证据或连线端点。

新状态的 Canvas `requirement` 固定为 `required`；没有实时连接不得继续短视频流程，也
不得把本地 Markdown 或 fixture 当作 Canvas 交接。状态脚本通过只代表保存的快照内部一致，
确认前仍必须由主 Agent 重新查询实时 Canvas。

失败、重连或新 Agent 从项目文件和状态恢复。遇到项目映射、真实媒体、参考语义、连线、
提示词交接或确认缺口，保持 `blocked`/失败并报告具体缺口，不创建替代画布。

遇到运行故障时，先按上文读取 [问题指引](references/problem-guide.md)，然后再进行对应
的只读核查与恢复；不要因供应商已接受任务就重复提交，也不要仅凭节点错误状态断定供应商
生产失败。

修改本 Skill、reference、状态脚本或界面元数据后，按
`references/test-protocol.md` 的 `REAL-CANVAS-BLIND-PREPROD-V1` 执行真实 Canvas 盲跑；
真实 Canvas 不可用只能报告 `degraded`/`failed`，不能用 fixture 冒充通过。
