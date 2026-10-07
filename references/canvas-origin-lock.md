# Canvas Origin 选择与绑定契约

Infinite Canvas 的渠道、默认模型和 API 凭据保存在网页端本地存储中。它们按
浏览器 origin 隔离；不同 origin 不是同一份渠道配置。Canvas 项目 ID 和 Agent
clientId 一致，也不能把两个 origin 的配置视为可以互换。

## 冷启动与选择优先级

1. 先调用 `canvas_get_state`，有完整连接时沿用当前实时页面的 origin 和项目。
2. 没有完整连接时，如果用户指定了已有项目且状态记录的 origin 仍可访问，先使用
   该项目记录的 origin；如果状态只留下旧的、不可核验的 origin，不得把它当作永久锁。
3. 没有可复用的有效页面或目标项目时，默认使用 `https://canvas.best`。
4. 页面必须打开在本轮选定的 origin，然后再次调用 `canvas_get_state`。
5. 复核得到 `hasCanvas=true`、`projectId` 和共享 `clientId` 后，继续使用同一
   origin 下的 `/canvas/<projectId>`；这一组身份只锁定本轮写入目标，不锁定未来所有
   项目的 origin。
6. 不得根据随机标签或旧状态静默切换 origin；但当用户明确选择另一个部署，或需要把
   一个没有活动批次的项目重新绑定到另一个可核验 origin 时，可以重新选择并记录新 origin。

`http://127.0.0.1:17371` 只是 Canvas Agent 的连接服务地址，不是网页 origin。

全新 Agent 没有项目状态且没有可复用页面时，默认使用 `https://canvas.best`。
本地 `http://localhost:3000` 仍可作为用户明确指定或当前页面已经核验的独立部署，
不能因为默认值而强行切换到在线版。

## 渠道配置初始化

渠道配置只需在实际使用的 Canvas origin 的配置页初始化一次。它不是画布节点数据，
也不是 `projectId` 的属性；换画布只改变 `projectId`，不改变 origin。同一 origin
下的所有画布和后续 Agent 自动共享同一份渠道配置，不需要逐个画布导入。

默认在线入口是 `https://canvas.best/canvas`。本地部署
`http://localhost:3000` 与在线版不是同一份浏览器存储；使用本地部署时必须先核验
本地入口和该 Origin 的 `/config`，不能拿在线版的项目 ID 或渠道配置直接补救。

影铸不把配置文件、API Key、WebDAV 密码或浏览器存储复制到项目仓库，也不通过 URL、
节点 metadata 或提示词传递凭证。若锁定 origin 没有可用渠道，停止媒体生产并提示
用户先在该 origin 的配置页完成初始化；不得跳到另一个 origin 读取默认空渠道。

## 状态记录

实时连接确认后，使用状态脚本记录实际 origin：

```powershell
node <skill-root>/scripts/workflow-state.mjs record-canvas <project-root> `
  --project-id=<projectId> --client-id=<clientId> `
  --origin=<canvas-origin> `
  --route-path=/canvas/<projectId> `
  --title="项目简称｜任务主题｜制作阶段"
```

状态里的 `canvas.origin` 是连接审计字段，必须来自当前浏览器页面的实际 origin。
`projectId`、`routePath` 和 `clientId` 仍然必须来自同一次实时 `canvas_get_state`，
不能手写或从另一个 origin 复制。

## 失败条件

出现以下任一情况时停止 Canvas 写入和媒体生产：

- 当前页面 origin 与本轮已核验的目标 origin 不一致；
- 实时状态的 `projectId` 与 `/canvas/<projectId>` 不一致；
- 缺少共享 `clientId`；
- 配置页显示没有可用渠道或目标能力没有模型；
- 试图通过切换 origin 或创建新项目来绕过当前 origin 的连接问题。

错误应归类为 `canvas_origin_mismatch`、`route_mismatch`、
`shared_client_missing` 或 `channel_config_missing`。

如果用户指定的已有画布已被其他 Agent/client 打开，按
`canvas_occupied` 做用户操作提示，不把它当作普通连接失败：提示用户关闭旧 Agent
的画布连接或标签页，等待用户确认后重新查询。若用户只是测试、并行处理或没有指定
必须复用该项目，则可以在同一 origin 使用 `mode=new` 创建独立画布；不得切换新端口、
关闭未知的旧进程或继续写入被占用的旧项目。

如果只是发现 `clients>0` 或多个标签，不足以判定目标画布被占用。必须同时核对实时
`projectId`、页面路由和 clientId；当前页面是 `/canvas` 列表页时，属于
`no_canvas_tab`/`route_mismatch`，不是 `canvas_occupied`。
