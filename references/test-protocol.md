# 固定测试模式：REAL-CANVAS-BLIND-PREPROD-V1

这是本仓库唯一允许报告为 `passed` 的测试模式。它不是文档演练，也不是本地
Canvas fixture 演练，而是在真实 Infinite Canvas 上执行所有非生成交互的盲跑生产
验收。测试控制面只属于主 Agent；子 Agent 不得知道这是测试。

任何缺少真实 Canvas、独立盲跑子 Agent、主 Agent 独立审计、可点击真实画布链接或
视频确认闸口状态的运行，都不得报告为 `passed`。只生成 Markdown、只运行状态脚本、
只做本地 fixture 或只检查节点快照，最多只能作为诊断附件。

# 功能完成后的模拟全流程测试契约

本契约用于验收 `short-video-workflow` 的规则、状态脚本、reference 和 Codex
界面元数据变更。它使用真实生产入口模拟从项目冷启动到视频确认闸口前的完整流程，
但不执行真实图片、视频、配音或音乐生产。运行输入模板见
[runner-input-template.md](runner-input-template.md)。

## 1. 固定模式不变量

每次运行都必须保持以下不变量：

1. 主请求只是一句接近真实生产输入的自然语言需求，例如：
   `帮我制作一段古风仙侠背景的短视频，总时长 12 秒。`
   未明确限定阶段时，运行器应按 `executionScope=end_to_end` 一次性完成全部缺失
   前期制作；只有主请求明确写出“先做剧情/角色/分镜”等阶段意图时，才使用
   `stage_only` 并停在该阶段。
   为了让盲跑确实抵达视频确认闸口，默认选择不超过目标模型单次时长上限的单片段
   需求；若使用片段链，后续片段必须已有真实尾帧，不能依赖本次被禁止的真实视频生产。
2. 子 Agent 可见输入只包含 Skill 快照路径、生产 reference、项目规则/README、项目事实
   目录和输出目录。
   不得传递 Canvas 启动方式、图片替代规则、视频确认闸口、共享会话说明或任何
   能暗示待测执行路径的参数。媒体拦截、Canvas 会话绑定和视频阻断必须由运行器外
   的控制面完成。
3. 子 Agent 是盲跑生产运行器；主 Agent 不得把测试协议、运行号、fixture、审计
   清单或“模拟图片”等控制面信息泄露给它。
4. 图片、视频、音频、配音和音乐调用由运行器外的生产代理控制。子 Agent 看到的
   只能是正常生产结果或正常供应商失败，不得看到拦截原因。
5. 真实 Canvas 必须创建、保存并完成正常生产节点、元数据和连线；测试结束前保留
   浏览器标签、画布和 Agent 连接。
   `canvas_get_state` 返回完整连接后，测试运行器只能操作该实时
   `projectId/clientId` 对应的页面；除非明确验证“独立新画布”分支，否则不得再打开
   `mode=new` 或使用随机标签。任何 UI
   重命名后都必须重新查询实时状态，项目 ID、标题和 client/session 不一致时立即判定
   Canvas 交接失败。
6. 画布可见内容必须是正常视频生产准备态；所有测试标记、拦截记录、状态判断和
   审计结论只能写入画布外的主 Agent 产物。
7. 子 Agent 提供的 Canvas 快照、节点计数和“已保存”自报一律视为不可信输入。
   主 Agent 必须通过实时 `canvas_get_state` 或等价查询重新读取项目，并逐项对齐
   项目 ID、节点数量、节点 ID/类型/生产语义、连线数量和端点；空画布、项目 ID
   不符或关键节点/连线缺失都必须失败。
   同时必须核对浏览器前端 origin 与本轮选定的目标 origin。项目状态中的旧
   `canvas.origin` 需要先作为恢复线索验证；若重新绑定到另一个已核验 origin，必须
   记录新 origin，并在存在活动批次时失败。
8. 子 Agent 必须使用主 Agent 可重新读取的同一真实 Canvas 会话或明确共享的
   Canvas Agent 连接；子 Agent 私有浏览器、私有 MCP 客户端或隔离进程中的节点，
   即使有完整快照，也不得视为真实交互。
9. 主 Agent 必须重新读取原始产物、查询实时 Canvas、校验状态并独立审计后才可
   汇报；子 Agent 自检不能替代主 Agent 审计。
## 2. 触发条件

以下任一文件发生行为性修改时，必须执行本测试：

- `SKILL.md`
- `references/`
- `scripts/`
- `agents/openai.yaml`

只修改拼写或排版时可以只做静态检查，但主 Agent 应说明为何不触发全流程测试。

## 3. 角色分工与盲跑边界

### 主 Agent 控制面

- 负责识别待测 Skill 和受影响的 reference。
- 负责冻结本次运行使用的 Skill 快照、生产 reference 快照和项目事实快照，并记录
  版本指纹；不得让子 Agent 自行解析 Codex 当前安装版本。
- 负责创建只包含生产语义的运行器目录和生产任务简报。主请求必须是一句接近真实
  用户输入的自然语言短需求，不得预先写入故事、资产、分镜或节点结果。只附加
   Skill 路径、生产 reference、项目规则/README、项目事实目录和输出目录；不得附加 Canvas 启动提示、
  图片替代说明、视频确认提示或共享会话说明。
- 负责在子 Agent 看不到的运行时控制面预置正常项目可见的图片资产登记，或安装
  只对本次运行生效的媒体代理。图片代理返回正常成功记录，但不触达真实供应商；
  视频、音频、配音和音乐代理必须在任何提交前阻断调用。
- 负责最终读取和审计子 Agent 产物，追加测试标记、状态判断、负向断言和日志，
  并向开发者报告通过、失败、降级和剩余风险。

### 流程运行子 Agent

- 只从主 Agent 指定的 Skill 快照、生产 reference 快照、项目 `AGENTS.md` 的生产
  部分、`README.md` 和正常项目事实加载规则；不得加载本文件或主 Agent 控制面日志。
- 接收一份正常的生产任务简报，把本次运行当作真实项目，从冷启动执行到视频确认
  闸口前。
- 看到的图片参考资产应当表现为正常的已生成且已验收资产；它不需要知道这些结果
  是由项目事实、预置登记还是生产代理提供的。
- 不得批准视频确认、提交视频任务、回捞真实媒体或修改本仓库。它只交付正常生产
  语义的待确认制作包、状态快照和 Canvas 状态。

子 Agent 不能同时担任最终审计者。主 Agent 可以知道完整控制面事实，但不得把这些
事实泄露给运行器，否则本次运行不再是盲跑。

## 4. 测试环境

### 临时项目

测试项目必须位于仓库外的临时目录，例如：

```text
<temp>/cineforge-workflow-fixture/<run-id>/
```

临时项目只允许包含最小的生产创作事实、`.short-drama/` 状态、批次或运行器产物。
不得复制真实项目脚本、媒体字节、API Key、私有提示词或真实运行状态。测试结束后
应清理临时目录；若因调试保留，必须使用随机 run ID，并在汇报中明确位置。

### Skill 版本快照

主 Agent 必须在启动子 Agent 前创建一个不可变的运行器目录，至少包含：

```text
runner-bundle/
  skill/SKILL.md
  skill/references/                 # 仅生产 reference allowlist
  skill/scripts/
  project/AGENTS.md              # 净化后的生产规则副本
  project/README.md
  project-facts/
  runtime/accepted-image-adapter/
```

`skill/SKILL.md`、`skill/references/` 和 `skill/scripts/` 必须来自本次修改后的明确版本。
`skill/references/` 只放生产 allowlist，至少包含 `unified-contract.md`、`workflow-state.md`、`intake-and-routing.md`、
`asset-sheet-templates.md`、`preproduction-report.md`、`video-prompt-handoff.md`、
`video-segment-chain.md` 和 `problem-guide.md`，不得包含 `test-protocol.md` 或
`runner-input-template.md`。
`project/AGENTS.md` 必须由主 Agent 从生产规则生成，不能直接复制仓库根 `AGENTS.md`。
运行器只看这份快照及生产部分，不读取仓库中带有本测试契约的控制面文件。生产代理在运行器
外部工作：它可以预先登记完整的成功图片记录，或拦截生产调用并返回正常结果，但
不得触达真实媒体供应商，也不得向子 Agent 暴露拦截原因。

### 空白 Canvas

主 Agent 必须先建立一个可被子 Agent 与主 Agent 共同读取的 Infinite Canvas MCP
会话，并在启动子 Agent 前验证共享 client/session 标识。验证必须证明子 Agent 能读取
同一实时 `projectId`、`clientId` 和 `/canvas/<projectId>` 页面；只比较同名 `clientId`
字符串不够。若执行环境无法提供共享证据，必须在启动运行器前记为
`shared_canvas_unproven`，不得继续做盲跑。

启动运行器前，主 Agent 还必须核对项目事实中每个标记为 `reuse` 的图片资产都能在
运行器授权范围内读取真实媒体，或能由控制面绑定到一个已有、可读取的 Canvas 图片
节点。对于本次测试由控制面预置的图片结果，必须在子 Agent 启动前把真实媒体节点
写入同一个共享空白 Canvas，并给出正常生产语义的标题、尺寸和 role；子 Agent 只需
像普通生产一样读取并复用这些节点，不得被迫在对话上下文中展开本地图片字节。
只有资产登记、路径字符串或尺寸 metadata 而无媒体字节/可读取节点时，记为
`runner_asset_unavailable`；不得把它伪装为已验收图片，不得要求盲跑 Agent 访问授权范围
之外的文件，也不得在盲跑过程中临时向它解释测试替代规则。该条件阻止端到端验证时，
仅允许记录 `degraded` 诊断结果。

通过上述准入后，必须在一个新建且命名明确的真实空白画布上执行 Canvas 交互。画布标题应使用生产语义，例如：

```text
<项目简称>｜<内容标题>｜视频生产准备
```

只创建正常生产流程会出现的剧本/视觉设定/分镜/提示词/生产参数文本节点、由控制面
预置为正常结果的图片参考节点、视频配置节点和必要关系，不调用生成工具。Canvas 项目的 ID、节点
ID、节点类型、元数据、连接关系和最终路由必须记录到测试快照。测试结束后不得
断开 Agent 或关闭画布，确保开发者可以点击链接继续验收。

测试信息只写入画布外的制作包、状态快照和日志。真实 Canvas 的标题、节点标题、
节点正文和元数据不得出现 `TEST_ONLY`、`SIMULATED_IMAGES`、
`VIDEO_GENERATION_NOT_SUBMITTED`、测试运行号、fixture、degraded、审计结论、
“模拟图片”或“测试节点”等词。图片生产被控制面拦截时，画布仍必须表现为带有可读取
媒体或附件内容的正常角色设定图、场景设定图和起始关键帧节点；只写标题、metadata、
尺寸或 assetId 的空图片节点必须失败。控制面不得把原始供应商图片字节写入仓库，但
必须通过真实 Canvas 资产、附件或已存在的可读取媒体句柄提供节点内容。

如果共享 Canvas 会话或运行器所需的真实图片资产无法在启动前证明，不得启动盲跑
并声称完整验收；记录 `shared_canvas_unproven` 或 `runner_asset_unavailable`，并在
测试报告中写明 `TEST_STATUS=degraded`。如果 Canvas 服务不可用，不得将 local fixture
当作通过结果，必须停止真实 Canvas 验收并在测试报告中写明：

```text
TEST_STATUS=degraded
CANVAS_MODE=local-fixture|blank-canvas
CANVAS_DEGRADED_REASON=<具体原因>
```

local fixture 仅可用于记录诊断信息，不得伪造真实 Canvas origin 下的
`/canvas/<id>` 链接，也不得通过新建一个真实生产画布来掩盖服务不可用或项目映射错误。

## 5. 盲跑执行步骤

主 Agent 在控制面准备运行器目录、生产代理和共享 Canvas 会话后，子 Agent 按正常生产方式执行以下
步骤；子 Agent 不得看到本节中的控制面说明：

1. 从运行器目录加载指定版本的 Skill、生产 reference、净化项目规则和项目事实，不依赖
   主 Agent 的摘要，也不读取本测试契约、运行输入模板或其他控制面文件。
2. 在隔离临时项目中完成冷启动，初始化 `.short-drama/workflow-state.json`，运行
   状态脚本的初始化和校验。状态脚本通过不代表 Canvas/媒体准入通过。
3. 在主 Agent 已建立且可共享的真实 Infinite Canvas 会话中，读取控制面预置或生产
   owner 已建立的正常图片参考节点，然后创建并保存正常生产态的剧本、视觉设定、
   分镜、提示词、生产参数、视频配置和必要连线。运行 Agent 不得通过手工展开大段
   Base64 来替代图片节点；若实时 Canvas 没有可读取媒体，应阻断而不是创建空节点。
4. 按生产流程完成故事确认、前期制作、资产检索、复用决策、分镜、关键帧和视频
   提示词，不加入任何测试语言。
   这条是默认端到端生产请求的要求；阶段性请求只执行指定阶段及必要前置，不应
   自动创建后续阶段内容。
5. 图片生产阶段由运行器外部的生产代理满足：每个目标必须返回或预置完整的
   正常验收字段：
   - 稳定的节点 ID
   - `requestedSize`
   - `actualSize`
   - `naturalWidth`
   - `naturalHeight`
   - `aspectRatio`
   - `validationStatus=accepted`
   子 Agent 看到的结果应与真实生产成功后可复用的参考资产一致。
6. 不触达真实媒体供应商，不下载、伪造或保存图片字节；代理必须记录调用与阻断日志，
   但这些日志只写入主 Agent 控制面。
7. 创建覆盖
   [preproduction-report.md](preproduction-report.md) 全部章节的正常待确认制作包。
8. 创建视频批次快照，写明真实 Canvas 中的有序参考节点及语义角色；角色视频至少
   覆盖统一角色设定图、场景设定图或关键帧等必需参考关系。
9. 将状态推进到视频确认闸口前：
   `preproductionStatus=ready_for_confirmation`，
   `videoGenerationStatus=awaiting_video_confirmation`，
   `productionConfirmation.status=pending`。
10. 生成正常生产语义的待确认制作包，包含唯一确认短语和报告指纹，但不要添加
    测试标记。
11. 主 Agent 在控制面追加外部测试记录，并对“没有确认就不能生产视频”做负向断言：
    不得存在已提交视频任务 ID、已提交视频状态或真实视频输出 manifest。
 12. 主 Agent 重新读取实时 Canvas，对照子 Agent 交付的节点/连线清单；只有项目
     ID、节点、连线和生产语义全部一致时才接受 Canvas 结果。生产语义至少核对
     画布名称不是 `无限画布`、`无限画布 <数字>`、`画布`、`画布 <数字>`、`Canvas`、
     `Infinite Canvas` 或 `Untitled` 占位标题，唯一视频配置是 `type=config`，且其
     metadata 包含 `modality=video`、`generationMode=video`、`referencePolicy=all-connected`、
     `autoRun=false` 和当前 `MOTION-*`；当前批次只能有一个 config，历史 config 可以保留；
     状态快照中的 `videoMotionId` 必须与 config 的 `motionId` 一致，每个参考节点必须标记
     `mediaAvailable=true`，且界面
     不能显示“空图片节点”。规范化快照不能替代这次实时查询。
     `videoReferenceIds` 必须与实时参考绑定来源节点集合完全一致；状态树不得出现任何
     provider task ID。视频提示词若声明 `参考音频`，其槽位必须在状态中保留，路径、
     角色、音频顺序和 `用途=音色` 可审计；它不伪装成 Canvas 图片节点，也不得被静默
     丢弃。项目声明目标画幅时，关键帧自然尺寸和视频 config 尺寸也必须匹配。
    不得因为子 Agent 提供了本地 `canvas-state.json` 就跳过这一步。主 Agent 必须保存
    本次实时 `canvas_get_state` 原始 JSON，并运行
    `scripts/workflow-state.mjs audit-canvas-snapshot` 对比盲跑交付快照。该命令必须
    逐项比较 `projectId`、共享 `clientId`、非默认标题、节点 ID/类型、图片媒体证据、
    `mediaAvailable`、自然宽高、语义 role、config 参数、连线端点和参考绑定；任何
    差异都判定为失败。不能只运行盲跑 Agent 的 `validate`，也不能把交付快照重新写回
    状态后再声称通过。
13. 保留浏览器标签、真实 Canvas 项目和共享的本地 Agent 连接；主 Agent 读取最终状态后
    才结束验收。

## 6. 待确认制作包最低内容

待确认制作包可以是 Markdown，也可以是结构化 Markdown 加 JSON 快照，但必须能够
让主 Agent 在不查看聊天历史的情况下完成审计。至少包括：

1. 任务契约：标题、格式、时长、画幅、平台、音频和排除项。
2. 创作方向：前提、基调、视觉风格、结尾和风险。
3. 故事包：人物关系、场次、剧本摘要、镜头表和时间安排。
4. 资产决策：每个角色和场景的 `reuse`、`generate` 或 `variant`。
5. 图片验收表：节点、尺寸、比例和验收状态。测试适配器的 `simulated` 标记只写在
   画布外的主 Agent 审计附件中，运行器看到的制作包不使用该标记。
6. 完整图片/视频提示词或其可追踪引用。
7. 有序参考节点绑定及语义角色。
8. 模型、尺寸、质量、视频分辨率、时长、音频、水印和重试策略。
9. 预计任务数、成本边界、`reportHash` 和唯一确认短语。
10. 运行器交付的制作包保持生产语义；`TEST_ONLY`、`SIMULATED_IMAGES` 和
    `VIDEO_GENERATION_NOT_SUBMITTED` 只能由主 Agent 写入画布外的审计附件。

上述三个标记以及测试运行号只允许出现在画布外的待确认制作包或审计产物中，
不得复制到真实 Canvas 的标题、节点标题、正文或 metadata。Canvas 必须保持为
开发者实际接管生产时将看到的前期制作状态。

## 7. 主 Agent 审计清单

主 Agent 必须独立检查：

- 子 Agent 读取了正确的 Skill 和 reference。
- 项目事实没有被测试文档替代或捏造为真实事实。
- 资产检索和复用决策存在，未无理由重复生成。
- `intake` 已记录需求详细程度、执行范围、阻塞问题、复用输入和完整路由；没有
  明确阶段意图时不得错误停在单一创作阶段。
- 图片虽然跳过实际生产，但每个必需目标都有完整且一致的模拟验收记录。
- 每个 Canvas 参考节点都是真实可读取的图片节点；空图片节点不得按模拟验收通过。
- 请求尺寸、实际尺寸、自然尺寸和画幅比例相互一致。
- 角色设定图、场景设定图和关键帧符合当前模板及下游参考约束。
- 报告具备全部章节，报告指纹与确认短语存在且唯一。
- 当前状态停在视频确认闸口前。
- 实时 Canvas 查询结果与交付清单逐项一致；子 Agent 的本地 Canvas 快照不能作为
  唯一证据。
- 待确认制作包原始文本不存在 C0 控制字符（正常的换行、回车和制表符除外）、
  损坏的反斜杠转义、被截断的标识符或不可见字符导致的字段变形。
- 报告中的相对路径必须以测试项目根目录为基准可解析；不得使用 `...`、临时占位
  路径或指向仓库外真实文件的绝对路径。
- 没有真实图片/视频/音频任务、外部生产调用或真实媒体字节。
- 没有 API Key、绝对用户路径、私有媒体或真实项目状态进入产物。
- 状态脚本、JSON、Markdown 和 Git 检查均通过。

建议同时运行至少两个负向检查：

- 移除视频确认后，流程必须阻止视频提交。
- 将任一模拟图片标记为 `resolution_invalid` 或改变报告参数后，确认必须失效或
  流程必须阻止进入视频生产。
- 将 Canvas config 的 `motionId` 改成同一提示词文件中的另一镜头，或增加一条未登记
  的图片入边，状态校验必须失败。

## 8. 开发者汇报格式

主 Agent 的最终汇报至少包含：

```text
TEST_STATUS=passed|failed|degraded
TEST_RUN_ID=<run-id>
TEST_ARTIFACT=[待确认制作包](<absolute-file-link>)
TEST_STATE=[最终状态快照](<absolute-file-link>)
TEST_LOG=[审计日志](<absolute-file-link>)
CANVAS_LINK=[测试画布](<verified-real-canvas-link>)
CANVAS_MODE=blank-canvas
VIDEO_GENERATION_SUBMITTED=false
IMAGE_GENERATION_EXECUTED=false
AUDIT_FINDINGS=<none or concise list>
COMMANDS=<executed validation commands>
RESIDUAL_RISKS=<none or concise list>
```

产物链接必须是 Codex 可直接打开的绝对文件链接，使用正斜杠路径，例如：

```markdown
[待确认制作包](C:/Users/example/AppData/Local/Temp/cineforge-fixture/run-123/reports/ready-for-confirmation-package.md)
[最终状态快照](C:/Users/example/AppData/Local/Temp/cineforge-fixture/run-123/artifacts/final-state-snapshot.json)
[审计日志](C:/Users/example/AppData/Local/Temp/cineforge-fixture/run-123/artifacts/test-log.md)
[测试画布](<verified-canvas-origin>/canvas/verified-project-id)
```

不要只链接临时目录；不要使用 `file://`、省略号或无法解析的相对路径。测试产物若
因调试保留在临时目录中，链接必须指向实际存在的文件。

真实 Canvas 链接只有在 `canvas_get_state` 或等价状态查询确认项目 ID 属于本次
测试后才允许输出。前端 origin 必须来自主 Agent 实际观察到的浏览器 URL 或
Infinite Canvas 连接信息；`https://infinite-canvas.example`、`example.com`、
`<verified-canvas-origin>` 等占位值一律视为失败。`CANVAS_MODE=blank-canvas` 时，链接必须指向实时返回 origin
下的：

```text
<verified-canvas-origin>/canvas/<verified-project-id>
```

如果没有已连接 Canvas 或 Canvas 服务不可用，不得报告完整通过，必须使用：

```markdown
[本地画布快照（不是真实画布）](C:/Users/example/AppData/Local/Temp/cineforge-fixture/run-123/canvas-fixture/canvas-state.json)
```

此时必须将 `CANVAS_MODE` 标记为 `local-fixture`，将测试状态标记为 `degraded` 或
`failed`，并明确说明开发者不能直接在 Infinite Canvas 中打开和接管该 fixture。

如果测试失败，必须先报告失败原因和阻断位置，再说明代码或规则是否需要继续
修改。不得用“未执行真实生产”作为通过依据；测试的目标是证明确认闸口前的文档、
状态和参考关系完整且可审计。
