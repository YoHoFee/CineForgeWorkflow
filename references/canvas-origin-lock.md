# Canvas Origin 锁定契约

Infinite Canvas 的渠道、默认模型和 API 凭据保存在网页端本地存储中。它们按
浏览器 origin 隔离；`http://localhost:3000` 与 `https://canvas.best` 不是同一份
渠道配置。Canvas 项目 ID 和 Agent clientId 一致，也不能把两个 origin 的配置视为
可以互换。

## 启动规则

1. 每次短视频工作流冷启动先读取项目状态中的 `canvas.origin`。
2. 如果当前 Codex 浏览器页面 URL 可观察，提取它的 origin。已存在的项目状态
   origin 优先；当前页面只有在与状态 origin 一致时才可复用。
3. 如果当前页面已经是 `/canvas/<projectId>`，先调用 `canvas_get_state`，不要因为
   `open-canvas` 的默认在线地址而重新打开页面。
4. `canvas_get_state` 返回有效 `projectId/clientId` 后，必须在同一个 origin 下对齐
   `/canvas/<projectId>` 路由，再次查询确认。不能用另一 origin 的页面满足路由检查。
5. `canvas.origin` 已经存在时，禁止调用会改变 origin 的默认启动路径。需要启动
   页面时，必须使用同一 origin 的启动方式；第三方 `open-canvas` 默认在线地址不能
   覆盖本项目已锁定的 origin。
6. origin、项目 ID、路由或 clientId 任一不一致时，停止写入并报告
   `canvas_origin_mismatch`、`route_mismatch` 或 `shared_client_missing`。不得创建
   新项目、清空配置、切换到另一站点或要求 Agent 猜测渠道。

当锁定 origin 为 `http://localhost:3000` 时，使用本地前端的相对 Canvas 路由或本地
启动流程，禁止调用第三方 `open-canvas` 的默认在线启动路径；当锁定 origin 为
`https://canvas.best` 时，才使用在线启动流程。两种模式都必须复用已有普通 Canvas
Agent，不得因为切换启动入口而创建第二个 Agent。

## 状态记录

实时连接确认后，使用状态脚本记录：

```powershell
node <skill-root>/scripts/workflow-state.mjs record-canvas <project-root> `
  --project-id=<projectId> --client-id=<clientId> `
  --origin=http://localhost:3000 `
  --route-path=/canvas/<projectId> `
  --title="项目简称｜任务主题｜制作阶段"
```

`--origin` 必须是没有路径、查询和片段的 `http://` 或 `https://` origin。后续 Agent
恢复时必须复用该 origin。没有 `canvas.origin` 的旧状态可以读取，但新连接确认后
必须补写；不能把旧状态当成允许跨 origin 启动的许可。

## 渠道保护

- 影铸不得读写、清空或重置 Infinite Canvas 的渠道本地存储。
- 影铸不得把 `http://localhost:3000` 自动替换成 `https://canvas.best`，也不得反向
  替换。
- 生成前使用的模型必须从当前 origin 的配置中解析；如果当前页面渠道为空，先按
  origin 复用/重连并重新查询，不能使用默认渠道顶替。
- 如果用户明确要求切换 Canvas origin，先在项目状态中记录旧 origin，要求新的 origin
  由用户明确指定，并在切换后重新核验渠道和 projectId；这不是普通冷启动行为。
