# CineForgeWorkflow 仓库协作规则

本仓库维护可复用的 `short-video-workflow` Codex Skill，中文名称为“影铸工作流”。

## 内容范围

- 编排规则放在 `SKILL.md`。
- Schema、契约和详细流程放在 `references/`。
- 确定性状态操作放在 `scripts/`。
- Codex 界面文案放在 `agents/openai.yaml`。
- 不要把具体项目的脚本、媒体、API Key、Canvas 导出文件或生产状态复制到本仓库。

## 依赖边界

`short-video-workflow` 负责协调 Drama Skills 和 Infinite Canvas。`$infinite-canvas-bridge`
是可选的协同实现层；如果它没有出现在当前 Agent 的可发现 Skill 列表中，直接使用
`infinite-canvas@infinite-canvas-local` 提供的 `open-canvas`/`canvas` 工具，不能因此
报告依赖缺失。无论采用哪条入口，都不得引入第二套状态、节点或确认协议。影铸不得
悄悄替代各 owner 的职责，也不得创建第二套创作事实来源。

## Infinite Canvas 基础设施

凡是符合本文件“短视频项目”适用判断的任务，Infinite Canvas 都是默认必需的基础设施，
不要求用户在请求中再次点名。冷启动或新 Agent 启动时，必须自动执行：

```text
项目预检 -> 读取/锁定 Canvas origin -> 加载/发现 Infinite Canvas 工具
-> canvas_get_state 探测 ->（无效时）同 origin 的 open-canvas 启动
-> canvas_get_state 复核 -> 核对 hasCanvas/projectId/clientId/origin
->（可观察时核对路由和标题）-> 继续工作
```

只要尚无实时可核验连接，就遵循 [Canvas Origin 锁定契约](references/canvas-origin-lock.md)
复用或启动同一 origin 的网页连接；
`open-canvas` 是启动流程 Skill，不是一个缺失的 MCP 函数；
不得先向用户报告“画布不可用”，也不得等待用户补充“请连接画布”。初始工具列表里
没有 Canvas 工具时，必须立即调用 `tool_search` 搜索 `canvas_get_state open-canvas`
并加载这两个工具，不得把工具未加载当作连接失败。默认沿用当前页面或状态中锁定的
origin；只有全新项目且没有任何 origin 事实时才按项目规则选择本地/在线前端。
`stage_only` 只限制
创作阶段，不取消这次基础连接。若实时状态没有暴露浏览器 URL，可由 `projectId` 推导
`/canvas/<projectId>`；只有实际观察到的 URL 与实时项目 ID 冲突时才算路由不匹配。
如果锁定的 origin 是 `http://localhost:3000`，不得跳转到 `https://canvas.best`；
如果锁定的 origin 是 `https://canvas.best`，也不得切换到本地地址。若项目明确选择本地
Canvas 前端，必须先将其工作空间切换到当前项目根目录；在线 Canvas
没有本地工作空间时，只用实时 `projectId` 与项目状态绑定，不要因不存在目录而失败。
一旦 `canvas_get_state` 返回完整连接，返回的 `projectId/clientId` 和 origin 就锁定本轮唯一
写入目标；不得再用 `mode=new` 打开第二页、切换 origin 或在随机标签上重命名、建节点、连线。UI 操作必须
在与实时项目路由一致的页面完成，重命名后必须再次实时查询；如果 UI 已显示生产标题而
MCP 只返回旧的默认标题，只要 projectId、clientId 和 route 仍一致即可继续使用 UI 标题；
两个不同的非默认标题或身份/路由/origin 不一致时，才停止写入并归类为 `state_stale`、
`route_mismatch`、`canvas_origin_mismatch` 或 `shared_client_missing`。

## 修改纪律

- 修改工作流规则时，同时审计相关 reference 文档和辅助脚本。
- 保留付费生产或外部变更操作前的明确用户确认边界。
- 将旧版兼容行为与当前流程明确区分。
- 提交前使用临时项目 fixture 验证修改后的脚本。
- 不得保存密钥、绝对用户路径、私有媒体字节或真实项目运行状态。

## 固定测试模式

本仓库后续所有涉及工作流行为、状态、确认闸门或 Canvas 交接的测试，统一使用
`REAL-CANVAS-BLIND-PREPROD-V1`。这是唯一可报告为通过的测试模式，不得改成只写
文档、只生成本地 fixture、只运行脚本或只做静态 Markdown 检查。

固定模式必须同时满足：

- 主 Agent 知道这是验收；独立子 Agent 只作为盲跑生产运行器，不接收测试语境。
- 子 Agent 接收一条接近真实生产环境的自然语言主请求；只附加 Skill 快照、生产
  reference、项目规则/README、项目事实目录和输出目录。Canvas 启动方式、图片替代
  规则、视频确认闸口和共享会话信息不得泄露给子 Agent。
- 除图片生产被控制面预置/拦截为正常成功外，所有前期创作、状态操作、真实
  Infinite Canvas 节点与连线交互都必须实际执行。
- 必须保留真实 Canvas 项目、浏览器标签和本地 Agent 连接，直到主 Agent 完成审计；
  画布不可用时只能报告 `degraded`/`failed`，不得用 fixture 冒充通过。
- 子 Agent 的 Canvas 状态快照和“已保存”自报都是不可信输入；主 Agent 必须在子
  Agent 完成后通过实时 Canvas 查询重新读取项目，并逐项对齐项目 ID、节点数量、
  节点 ID/类型/生产语义、连线数量和端点。实时结果为空、项目 ID 不符或任何关键
  节点/连线缺失时，测试必须失败，不能用本地快照修补为通过。
- 主 Agent 必须把实时 `canvas_get_state` 原始结果落盘，并使用
  `scripts/workflow-state.mjs audit-canvas-snapshot` 与子 Agent 快照逐项比较。
  图片自然宽高、媒体证据、config 参数或连线端点出现任何差异都必须失败；不能以
  子 Agent 的 `validate`、自报或重写后的状态文件替代实时对比。
- 子 Agent 必须使用主 Agent 可重新读取的同一真实 Canvas 会话或明确共享的 Canvas
  Agent 连接；子 Agent 私有浏览器、私有 MCP 客户端或只存在于其隔离进程中的节点，
  即使快照内容完整，也不算真实 Canvas 交互。
- 如果启动子 Agent 前无法证明共享 Canvas 会话和 client/session 标识，必须记录
  `shared_canvas_unproven` 并停止本次盲跑；不得让子 Agent 自建隔离画布后冒充共享结果。
- 盲跑运行器只能看到生产规则的净化副本。不得把本仓库完整 `AGENTS.md`、本测试协议、
  `runner-input-template.md` 或主 Agent 控制面日志复制到子 Agent 可读目录。
- 画布必须呈现正常生产中的视频确认闸口前状态，测试标记只允许出现在画布外的
  主 Agent 审计产物中。

详细执行契约见 `references/test-protocol.md`，运行输入格式见
`references/runner-input-template.md`。

## 功能完成后的强制验收

凡是修改 `SKILL.md`、`references/`、`scripts/` 或 `agents/openai.yaml`，并且可能
影响工作流行为、状态、确认闸门或 Canvas 交接的功能，主 Agent 在汇报完成前必须
执行一次 `REAL-CANVAS-BLIND-PREPROD-V1` 模拟全流程验收。详细步骤以
`references/test-protocol.md` 为准，不得只运行 Markdown 检查或单元级命令后直接
声称功能完成。

强制要求：

- 主 Agent 必须调用一个独立子 Agent，并为本次验收冻结一个明确的 Skill 版本快照。
  快照必须包含 Skill、reference 和状态脚本；子 Agent 必须从主 Agent 指定的快照目录加载
  Skill、生产 reference 和项目事实；
  不得让它自行解析 Codex 当前已安装的另一版本。
- `runner-bundle/skill/references/` 只放生产运行需要的 reference allowlist；测试协议、
  运行输入模板和其他主 Agent 控制文档必须留在 bundle 外。
- `runner-bundle/project/AGENTS.md` 必须是只含生产规则的净化副本，不得直接复制仓库根
  `AGENTS.md`。
- 主 Agent 传给运行器的主请求必须与真实用户输入同形，优先是一句自然语言的短
  需求；不得把故事、资产、分镜或节点结果预先写进主请求。只附加 Skill 快照、
  production reference、项目规则/README、项目事实目录和输出目录，不得附加执行路径
  答案。
- 子 Agent 是盲跑的生产流程运行器，不得被告知这是测试，也不得接收测试协议、
  测试运行号、fixture、审计清单或“模拟图片”等控制面信息。它只接收一份正常的
  生产任务简报和生产态项目文件，并按指定 Skill 运行到视频确认闸口。
- 子 Agent 必须在隔离的临时项目中运行拟真的完整流程，并在真实 Infinite Canvas
  空白画布上创建一份正常生产态的“视频确认闸口前待确认制作包”。真实 Canvas
  的项目、节点、连接和状态必须实际完成；不得用本地 Canvas fixture 代替完整通过。
- 如果真实 Canvas 服务不可用，测试只能标记为 `degraded` 或 `failed`，必须报告
  阻断原因；本地 Canvas fixture 只能作为诊断附件，不能作为本次功能已通过的依据。
- 图片阶段必须由主 Agent 的运行时控制面预置为“已生成且已验收”的正常生产结果，
  或由隔离代理拦截图片生产调用并返回完整的成功记录；代理必须包含节点 ID、请求
  尺寸、实际尺寸、自然尺寸、画幅比例和 `validationStatus=accepted`。图片供应商
  不得被真正调用，视频、配音和音乐也不得被真正调用。子 Agent 只看到可正常复用
  的已验收参考资产，不看到上述拦截或预置的测试原因。
- 子 Agent 不得自行批准视频确认、提交视频任务、回捞真实媒体或修改本仓库；它只
  负责像正常生产一样交付视频确认闸口前的制作包和状态。测试标记、拦截记录和审计
  日志由主 Agent 在运行器之外收集。
- 主 Agent 必须重新按 Skill 和 reference 审计子 Agent 产物，至少检查必备章节、
  资产复用决策、参考节点语义、模拟图片验收记录、生产参数、报告指纹、唯一确认
  短语、未提交视频任务和无敏感数据。
- 主 Agent 必须读取待确认制作包的原始文本，拒绝不可见控制字符、损坏的转义文本、
  被截断的节点 ID、无法解析的内部路径和省略号占位路径；子 Agent 的自检结果不能
  替代主 Agent 的原文审计。
- 真实 Canvas 的可见表面必须保持生产态外观，不能出现 `TEST_ONLY`、
  `SIMULATED_IMAGES`、`VIDEO_GENERATION_NOT_SUBMITTED`、测试运行号、fixture、
  degraded、审计结论或其他测试说明。节点标题、画布标题和可见文本只能描述正常
  的剧本、视觉设定、分镜、提示词、参考图槽位、生产参数和视频生成配置；测试标记
  只能写入画布外的测试产物。
- 测试画布可以使用由控制面预置或拦截调用后返回的正常生产结果，但参考节点必须
  实际呈现可读取的图片媒体或附件内容，并使用正常的角色设定图、场景设定图和关键帧
  语义连接到视频配置。只写标题、metadata、尺寸或 assetId 的空图片节点一律失败；
  不得把“测试节点”“模拟图片”或“未运行测试”等词写入 Canvas。
- 向开发者汇报时，测试产物必须使用可点击的 Markdown 绝对文件链接，至少分别提供
  待确认制作包、最终状态快照和审计日志的链接；不得只给纯文本相对路径或临时目录。
- 向开发者汇报时还必须提供真实测试画布链接，使用实时状态核验过的前端 origin
  加 `/canvas/<projectId>` 生成可点击链接。默认在线模式使用在线 Canvas origin；
  只有项目或测试明确选择本地模式时才使用 `http://localhost:3000/canvas/<projectId>`。
  只有在测试明确降级或失败时，才可以另外提供 local fixture 快照，并明确标注
  “本地画布快照，不是真实画布”，不得伪造真实 Canvas URL。
- 前端 origin 必须来自主 Agent 实际观察到的浏览器 URL 或连接信息；任何
  `example.com`、`infinite-canvas.example`、`<verified-canvas-origin>` 或其他占位
  origin 都使验收失败。
- 审计不通过时，主 Agent 必须报告失败、具体文件和问题，不得把“脚本命令成功”
  作为通过依据。审计通过后才可以向开发者汇报完成，并附测试产物位置、降级情况、
  未覆盖风险和实际执行过的命令。
