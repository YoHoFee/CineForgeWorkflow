# 问题指引

遇到 Canvas 或媒体生产故障时，先按本文件的症状入口排查，再执行重试、重连或代码修改。
这里记录的是已观察到的案例，不代表所有供应商都使用相同响应结构；以本次任务的原始
响应、当前供应商文档和 Canvas 实时状态为准。检查响应时必须隐藏认证头、密钥和用户数据。

## 快速分流

| 症状 | 先检查 |
| --- | --- |
| 画布显示未连接或状态为空 | `canvas_get_state` 的 `hasCanvas`、`projectId`、`clientId`；当前页面真实 origin、目标项目的 origin 和 `/canvas/<projectId>` 路由；按 `canvas-origin-lock.md` 在同一 origin 完成前端、Agent、客户端和路由复核。 |
| Agent 有多个客户端但 `hasCanvas=false` | 先区分 `/canvas` 列表页与 `/canvas/<projectId>` 画布页；`clients>0` 只代表网页连接数，不代表目标项目被占用。读取项目列表并在同一 origin 打开目标路由，或按用户要求用 `mode=new` 创建独立画布。 |
| 当前 Origin 无法打开画布 | 先检查该 Origin 的入口 HTTP 状态、Agent `/health`、SSE 客户端和 `canvas_get_state`；同一 Origin 内重试一次并复核路由。不要直接切换另一个 Origin，把配置隔离问题误报成修复成功。 |
| 用户指定的画布已被其他 Agent 打开 | 若必须复用该项目，提醒用户关闭旧 Agent 的画布连接/标签页后重新查询；若用户只是测试、并行处理或未指定项目，可在同一 Origin 用 `mode=new` 打开独立画布。 |
| 页面已连上但模型或渠道不可用 | 核对当前实际 Origin 的 `/config`。不同 Origin 的本地渠道存储互不共享；不要换 Origin 来绕过配置问题。 |
| 供应商后台显示已生成，Canvas 却显示失败 | **不要立即重新提交。** 用提交响应中的任务 ID 查询现有任务，分别检查供应商任务终态、响应解析、图片下载/存储和 Canvas 节点状态；按下方案例检查异步响应形状。 |
| 供应商任务失败或没有任务 ID | 保存脱敏后的 HTTP 状态、供应商错误码/消息及响应字段结构；核对当前模型的提交/查询接口和参数后再决定是否重试。不要把没有解析到 ID 等同于供应商没有接受任务。 |
| 供应商成功但 Canvas 图片节点不完整 | 查验节点 `metadata.status`、图片 MIME、可读取的 `content` 或 `storageKey`、正整数自然宽高；仅有成功状态、URL 字符串或尺寸 metadata 不足以证明媒体已落入画布。 |

恢复任何异步任务时，优先查询已存在的 provider task，不要再次提交可能计费的生成任务。
只有确认没有已接受的任务，或原任务明确终止且重试策略允许时，才考虑重试。每次重试前
都重新读取 Canvas 与任务状态。

## 案例：连接客户端存在但画布状态为空

### 现象

Agent 健康接口显示存在一个或多个客户端，但 `canvas_get_state` 返回
`hasCanvas=false`、没有 `projectId`；浏览器当前页面是 `/canvas` 而不是
`/canvas/<projectId>`。

### 根因

Canvas Agent 的网页连接数、客户端状态上报和具体画布路由是三个不同层次。`/canvas`
列表页可以保持 Agent SSE 连接，却没有加载具体项目，因此不能把 `clients>0` 或多个
标签直接判定为目标画布被占用。某些 Agent 版本的健康字段只表示存在客户端状态对象，
还可能与状态对象内部的 `hasCanvas` 语义不同。

### 排查与恢复

1. 保留当前 Origin，读取 `canvas_get_state` 和 `canvas_list_projects`，确认当前客户端
   是否只是列表页以及目标项目是否存在于这个 Origin。
2. 目标项目存在时，在同一 Origin 打开 `/canvas/<projectId>`，再次核对
   `hasCanvas=true`、`projectId`、`clientId` 和路由。
3. 目标项目不在当前 Origin 时，核对项目状态记录的 Origin；按
   `canvas_origin_mismatch` 或 `route_mismatch` 处理，不把它归类为占用，也不直接新建
   项目掩盖错误。
4. 用户只是测试、并行处理或没有指定必须复用旧项目时，默认 Origin
   `https://canvas.best` 被占用可以在同一 Origin 使用 `mode=new`；新项目建立后必须
   完成实时状态复核再写入。
5. 用户明确要求复用旧项目时，才提示关闭对应旧标签页或 Agent 连接；等待期间只读。

### 回归检查

- `clients>0` 且当前页面为 `/canvas` 时，不再错误报告为 `canvas_occupied`。
- 目标项目在当前 Origin 时，能恢复到 `/canvas/<projectId>` 并返回完整实时身份。
- 目标项目不在当前 Origin 时，报告 `canvas_origin_mismatch`/`route_mismatch`，不伪造
  新项目作为恢复结果。
- 默认 `https://canvas.best` 被占用且用户允许独立项目时，新画布在同一 Origin 建立并
  返回完整 `projectId/clientId`。

## 案例：Canvas 前端未启动导致无法连接

### 现象

Canvas Agent 的健康接口仍可访问，但健康状态显示 `clients=0`、`hasCanvas=false`；
访问本轮选定的前端 origin 被拒绝，浏览器页面无法建立网页连接。

### 根因

Canvas Agent 只提供本地连接服务，不负责提供 Infinite Canvas 网页前端。前端 Vite
进程停止时，浏览器无法加载或连接 Canvas 页面，因此 Agent 没有网页客户端，也不会
收到画布状态上报。

### 排查与修复

1. 先访问本轮选定的前端 origin，确认不是端口拒绝；同时读取 Agent 健康状态，记录
   `clients` 和 `hasCanvas`，不要把它判断为画布占用。
2. 在现有 Infinite Canvas 前端项目的 `web` 目录启动：

   ```powershell
   npm run dev
   ```

3. 等待选定的 origin 返回 HTTP 200；不要切换到另一个 origin、随机端口或新建画布
   来掩盖前端故障。
4. 复用当前 Agent 的 `Local URL`、token 和原 `/canvas/<projectId>` 路由重新打开页面。
5. 以 Agent 健康状态出现 `clients>=1`、`hasCanvas=true`，并且
   `canvas_get_state` 返回完整 `projectId/clientId` 作为连接层恢复标准。

### 回归验证

- 前端未运行时：前端 origin 请求被拒绝，Agent 为 `clients=0`、`hasCanvas=false`。
- 启动前端后：前端 origin 返回 HTTP 200，网页客户端建立连接，Agent 变为
  `clients=1`、`hasCanvas=true`。
- 目标项目是否存在必须另行用实时 `canvas_get_state` 和项目列表核对；若项目不存在，
  不得把它归类为占用，也不得自动创建替代项目。

## 案例：供应商已生成，Canvas 报失败

### 现象

供应商后台已经有图片成品，但 Infinite Canvas 的图片生成任务被标成失败，用户看不到
成功的画布结果。单看 Canvas 的失败状态，容易误判成供应商生成失败并重复提交。

### 根因

这次 APIMart 异步图片流程的响应解析没有适配实际返回结构：提交响应中的任务 ID 位于
`data[0].task_id`；完成响应中的图片地址位于 `result.images[]`，每项的 `url` 还可能是
数组。解析器未能提取任务 ID 或未展平图片 URL，导致轮询/结果接收链无法完成，最终把
已在供应商侧完成的任务显示为 Canvas 失败。

这是该次集成观察到的响应形状，不是对 APIMart 所有产品、模型或 API 版本的通用承诺。
调整解析器前应对照当前端点的官方文档和脱敏原始响应。

### 排查与修复

1. 从脱敏提交响应中检查 HTTP 状态、顶层 `code`、`data` 类型和任务 ID 字段；数组响应
   按实际元素读取 `data[0].task_id`，不要假设任务 ID 一定在顶层。
2. 若任务 ID 已返回，使用它查询已有任务直到终态；不得因 Canvas 节点报错而重新提交。
3. 在完成响应中检查 `result.images`。提取每个非空 `url`，同时支持字符串和字符串数组，
   并将数组展平；校验结果非空后再进入图片获取和写入流程。
4. 确认图片内容已真实保存到 Canvas 节点，而不是只保存远程 URL 或成功 metadata。用
   `canvas_get_state` 复核节点成功状态、`image/*` MIME、可读取媒体证据和自然尺寸。
5. 将供应商任务终态、解析结果和 Canvas 节点状态分开记录，避免把“供应商成功、结果
   解析失败”折叠成笼统的“生成失败”。

### 回归验证

- 用脱敏的成功响应 fixture 覆盖 `data[0].task_id`，确认能恢复并查询同一个任务 ID。
- 覆盖 `result.images[].url` 是单个字符串及 URL 数组两种形状，确认输出非空且无嵌套数组。
- 覆盖缺失 `data`、缺失任务 ID、空 `images`、空 `url` 和供应商失败状态；应给出可诊断
  的解析错误，不能错误报告成功或自动重复提交。
- 在真实 Canvas 流程中确认任务完成后图片节点具有可读取媒体证据。供应商成功本身不代表
  Canvas 落图成功。

本案例修复后的画布回归只提交了一张最低质量图片；生成任务返回 `success`，Canvas 节点有
可读取存储证据，图片自然尺寸为 `1024×1024`。这验证了该次端到端路径，不代表所有模型
都会返回相同尺寸。

## 案例：供应商视频已生成，但 Canvas 一直 loading 或显示失败

### 现象

供应商后台已经有视频成品，Canvas 节点却持续 `loading`、显示解析失败，或只出现一个没有
可播放内容的失败节点。用户再次点击生成后，画布上出现两段相同或高度相似的视频。

### 根因

视频提交成功和 Canvas 结果回填是两个独立阶段。某些 OpenAI 兼容渠道的实际响应可能：

- 使用 `success`、`succeeded`、`done`、`finished`、`ready` 等终态，而不是只有
  `completed`；
- 把状态、任务 ID 或视频地址放在 `data`、`result`、`output`、数组或更深层对象中；
- 终态响应不直接返回视频 URL，只能通过
  `GET /v1/videos/{id}/content` 获取视频二进制内容。

默认解析器只检查少量顶层字段时，会把“供应商已成功”误判成“生成失败”。随后重复提交
会产生第二个真实供应商任务；回捞阶段如果分别恢复两个任务，画布就会出现两段视频。

### 排查与恢复

1. 先读取 Canvas 节点和 `generation_get_status`，记录每个节点的
   `videoTaskId`、当前状态和模型；不要仅依据节点上的 `loading` 或 `error` 判断供应商
   任务失败。
2. 对已有任务 ID 查询供应商任务终态，优先确认任务是否已经成功；任务已接受、状态未知
   或仍在运行时，禁止再次提交同一生成请求。
3. 使用递归解析器检查常见视频 URL 字段，包括 `video_url`、`videoUrl`、`result_url`、
   `download_url`、`file_url`、`output_url`、`url`、`content`、`result`、`data`、
   `output`、`video` 和 `file`；同时识别成功、失败和取消状态的常见变体。
4. 终态没有可用 URL 时，调用对应任务的 `/content` 端点并以 blob/视频文件回填 Canvas。
   回填后必须验证 `metadata.status=success`、`mimeType=video/*`、可读取的 `content` 或
   `storageKey`、正整数自然宽高以及非空媒体大小。
5. 若已存在多个任务，按任务 ID 去重：保留真实成功结果，保留原始节点的提示词和参考关系，
   将重复结果标为历史/待清理，不再为“修复解析”创建新的供应商任务。
6. 修复渠道脚本时，恢复为通用提交、轮询、递归解析和 `/content` 回退逻辑；不要留下只
   查询某一个历史任务 ID 的临时脚本。

### 回归检查

- 同一批次存在 `loading`、`queued`、`running` 或已有 `videoTaskId` 时，再次执行生成会
  先查询/恢复，不会再次 POST。
- 覆盖顶层和嵌套的任务 ID、视频 URL、成功状态，以及没有 URL 时的 `/content` 回退。
- 覆盖供应商失败、取消、空响应、缺失任务 ID 和超时，均给出可诊断错误，不能静默创建
  第二个任务。
- 真实 Canvas 结果必须同时具备视频 MIME、可读取媒体证据、自然尺寸和非空大小；只有
  `success`、URL 字符串或尺寸 metadata 不足以证明视频已回填。

## 案例：请求时长不被当前视频模型接受

### 现象

视频生成节点立即失败，并提示 `seconds` 不在允许值中；随后用户可能误以为 API 不可用，
重复提交相同参数。

### 根因

视频模型和渠道各自声明可用时长，不能从用户描述的“单次最多 N 秒”推断接口实际枚举。
本次 MiniMax-H3 接口只接受 `4`、`8`、`12` 秒，提交 `15` 秒会在 Canvas/渠道参数校验阶段
直接失败，尚未进入供应商生成。

### 排查与恢复

1. 在提交前读取当前模型/渠道的实际参数约束，校验 `seconds`、尺寸、分辨率、音频和参考
   模式；失败后不要原样重试。
2. 若用户需要更长连续片段，将剧本和视频提示词拆成模型支持的时长，并为每段写清起止
   状态、衔接动作和连续性控制。
3. 只有确认没有已接受的供应商任务时，才按新参数重新提交；参数校验失败不会产生可回捞
   的供应商任务。

### 回归检查

- 不支持的时长在提交前被拦截，并明确列出当前模型允许值。
- 已提交任务和参数校验失败被分开记录，不能把校验失败误判成供应商失败。
- 多段视频批次保持一个当前 `MOTION-*` 和一个当前 config，历史失败节点不混入当前批次。

## 新案例记录格式

确认新故障可复用后，追加案例时至少记录症状、可验证根因、恢复步骤和回归检查。只保留
必要的响应字段路径与类型；删除 API Key、Authorization、用户提示词、私有媒体、绝对路径、
项目 ID、Canvas client/session ID 和可关联的任务 ID。
