# 变更记录

## 2026-10-08

### 影铸工作流自身更新

- 新增“检查更新/更新影铸”维护入口；默认发现新版后自动下载安装，明确要求仅检查时只读。
- 更新源固定为 `https://github.com/YoHoFee/CineForgeWorkflow.git` 的 `main` 分支。
- 使用 Git 提交和文件指纹比较版本，兼容无收据的旧安装；无法证明版本顺序时保留本地。
- 新增确定性更新脚本，完整备份、同盘暂存切换、并发锁和失败恢复；仅覆盖本 Skill。
- 安装成功后提示开启新的 Agent，当前 Agent 停止切换规则继续生产。

## 2026-10-07

### 生产经验同步

- 补充 Canvas 排布、稳定媒体映射、导出核验和 ChatCut 交付 reference；仅在用户要求
  交付成片且相关工具可用时启用。
- 强化视频提示词交接：明确参考图控制边界、空间方向、受力反馈、表演调度和默认不加
  背景音乐。
- 调整片段链规则：先按实际渠道时长约束规划，只有无法合理缩短的连续镜头才拆段；
  明确切镜不强制尾帧接力。
- 将生产 Agent 观察到的视频异步回填失败和模型时长枚举问题记录为脱敏排查案例；
  供应商字段和 `/content` 回退仅作兼容性线索，不能替代当前渠道文档。
- 角色设定图新增“身份/造型分离”可选版式；常规项目不自动强制全身白脸。

### Canvas Origin 选择与恢复

- 默认 Canvas Origin 调整为 `https://canvas.best`，但不再把 Origin 作为跨项目永久锁。
- 当前页面、目标项目状态和默认入口按优先级选择本轮 Origin；每次写入仍必须绑定同一
  `projectId/clientId/route`。
- 目标画布被占用时，明确复用旧项目仍提示关闭旧连接；测试、并行处理或独立项目可在
  同一 Origin 使用 `mode=new`。
- 新增“客户端存在但画布状态为空”和跨 Origin 连接排查指引，区分列表页、路由不匹配、
  Origin 不匹配与真实画布占用。
- 状态脚本允许在没有活动批次时重新绑定 Origin；有活动或已确认批次时继续阻止切换。

## 2026-10-04

### 影铸工作流统一契约

- 重写 `SKILL.md` 的执行入口，明确影铸只负责跨阶段编排、状态、Canvas 交接和生产闸门，不替代 Drama Skills 的创作职责。
- 新增 `references/unified-contract.md`，统一 Drama Skills、Infinite Canvas 和状态脚本之间的 owner、输入、输出与阻断条件。
- 明确第三方 `$infinite-canvas-bridge` 为可选协同层；不可用时直接使用 `infinite-canvas@infinite-canvas-local`，不创建第二套状态或确认协议。

### Canvas 冷启动与交接

- 短视频项目启动即自动执行 Canvas 探测、打开/复用、连接复核和项目身份锁定，不再等待用户补充“请连接画布”。
- 强制核对 `hasCanvas`、`projectId`、`clientId` 和可观察的路由；连接未完成前不得向用户直接报告画布不可用。
- 禁止冷启动后使用 `mode=new`、随机标签或未核验项目继续写入。
- 强化 Canvas 重命名、项目切换、实时快照和共享会话校验。

### 资产与节点契约

- 角色参考统一为单张 `character-design-sheet`，包含展示视图、正/侧/背视图、细节和面部区域。
- 新流程禁止创建或连接 `character-sketch`、`character-turnaround`。
- 参考图片必须来自真实项目文件、附件或可读取的 Canvas 图片媒体；标题、尺寸、`assetId` 和 metadata 不能替代图片内容。
- 统一角色、场景、起始关键帧和结束关键帧的语义角色与 `image -> video-config` 连线方向。
- 强制校验实时媒体证据、自然尺寸、参考绑定集合、当前 `MOTION-*` 和唯一视频配置节点。
- 参考音频独立于图片槽位，保留顺序、角色和控制范围，不再静默丢弃。

### 状态与生产闸门

- 扩展 `scripts/workflow-state.mjs`，支持 Canvas 身份、实时快照、参考绑定、视频提示词交接、音频槽位、片段链和 Canvas 审计校验。
- 图片、视频、配音和音乐确认边界相互独立；未获得当前批次明确确认前，不得触发真实媒体生产。
- 保留 `autoRun=false` 的视频确认前状态，并阻断缺失参考、错误连线、重复镜头、伪造媒体和未解决音频交接。
- 更新工作流状态、报告、资产模板、提示词交接和片段链 reference，移除互相冲突的旧流程描述。

### 验收

- 通过 `REAL-CANVAS-BLIND-PREPROD-V1` 真实 Canvas 盲跑验收。
- 实时项目：`gtQOrQk6dpDzvIAZFia1H`。
- 验收结果：4 个节点、3 条 `image -> video-config` 连线、3 个参考绑定，状态为
  `ready_for_confirmation / awaiting_video_confirmation`。
- 未提交视频、配音、音乐或其他付费任务。
- `node --check`、`git diff --check`、状态校验和实时 Canvas 快照审计通过。
