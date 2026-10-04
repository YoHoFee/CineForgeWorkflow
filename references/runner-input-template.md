# REAL-CANVAS-BLIND-PREPROD-V1 盲跑运行输入模板

本模板是 `REAL-CANVAS-BLIND-PREPROD-V1` 的固定输入格式。它把真实用户请求和
最小运行定位参数分开，使子 Agent 仍然从接近生产环境的自然语言需求开始工作；
媒体代理和 Canvas 会话由主 Agent 控制面管理。不得将主请求改写成测试指令，
也不得用只写文档或本地 fixture 的方式替代真实 Canvas 运行。

## 主请求

主请求只保留真实用户会输入的一句话，不预先提供剧本、角色、场景、分镜、提示词、
节点 ID 或资产决策。例如：

```text
帮我制作一段古风仙侠背景的短视频，总时长 12 秒。
```

主请求中的题材和总时长可以按本次验收场景替换；盲跑默认使用不超过目标模型单次
时长上限的单片段需求，避免在不执行真实视频生产时人为引入“等待上一片段真实尾帧”的
阻塞。不能改写成“请测试工作流”或直接给出前期制作结果。
除非验收场景明确要验证阶段性请求，主请求默认表示一次性完成端到端制作；若要
验证阶段模式，必须在主请求中自然地写出“先做剧情”“先做角色设定”等限定。

## 附加运行参数

主 Agent 在主请求后单独附加以下参数。这些参数是运行器配置，不是测试解释：

```text
运行 Skill：<runner-bundle>/skill/SKILL.md
生产 reference：<runner-bundle>/skill/references/
项目规则与 README：<runner-bundle>/project/
项目事实目录：<runner-bundle>/project-facts/
输出目录：<runner-bundle>/run-output/
```

主 Agent 控制面必须在子 Agent 启动前建立并验证可共享的真实 Canvas 会话，并在运行
期间保留浏览器标签、Canvas Agent 连接和生产代理。子 Agent 只应看到正常项目事实和
正常生产结果，不应看到代理原因、测试运行号或审计信息。主 Agent 通过实时 Canvas
状态查询确认项目 ID、节点、连线和生产闸口状态。子 Agent 的本地 Canvas 快照只能
作为待核对清单，不能作为 Canvas 已保存的证明。

## 禁止泄露给运行器的内容

- 本测试契约、测试状态、审计清单和主 Agent 控制面日志。
- `TEST_ONLY`、`SIMULATED_IMAGES`、`VIDEO_GENERATION_NOT_SUBMITTED` 等测试标记。
- Canvas 启动方式、共享会话说明、图片替代规则和视频确认闸口提示。
- fixture、降级原因、运行号、子 Agent 角色说明或“这是一次测试”等措辞。

主 Agent 最终仍须把附加运行参数、图片适配器记录和负向断言写入画布外审计附件，
但不得把它们写进 Canvas 可见内容或运行器交付的正常制作包。
