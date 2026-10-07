# 安装与恢复

## 来源与清单

所有 ID、职责和安装源以同目录 `dependencies.json` 为唯一清单。Drama Skills 的 11 个
公开安装单元来自 `zenstory-ai/drama-skills` 的 `skills/<name>`；只下载这些目录，不下载
维护者内部 Skill，不复制其原著、样片、评估项目或仓库级规则。

Infinite Canvas 来自 `basketikun/infinite-canvas`，marketplace 名为
`infinite-canvas-local`，插件 ID 为 `infinite-canvas@infinite-canvas-local`。
`open-canvas` 和 `canvas` 随插件提供，不是两个额外 Git 仓库，也不作为独立 Skill 重装。
ChatCut 来自 `ChatCut-Inc/agent-plugin`，使用 Codex 版 `.agents/plugins/marketplace.json`，
插件 ID 为 `chatcut@chatcut-inc`；不用 Claude 版目录替代。它只在剪辑/全套安装范围中补齐。
`infinite-canvas-bridge` 无需补装，未安装时正常跳过。

## 运行时引导

安装脚本使用 Node.js；先找本机 `node`，没有时使用宿主的
`load_workspace_dependencies` 找到捆绑 Node/Python。把其可执行路径用于当前命令，
不要改写系统 `HOME`、`CODEX_HOME`，不要把私人路径写进 Skill。

Git、Codex CLI 和 Python 已存在时复用。Python 要求 3.9+；Windows 的 Microsoft Store
占位 `python.exe` 不算可用，必须实际执行版本检查。安装脚本允许通过
`--python=<executable>` 指定找到的捆绑解释器，优先级高于 PATH。

缺少必需运行时而宿主也没有提供时，由 Agent 使用当前系统已有的官方包管理器安装，
先读取其帮助，明确包 ID 和安装范围，再执行。Windows 优先 `winget` 中的
`OpenJS.NodeJS.LTS`、`Git.Git`、可解析的官方 `Python.Python.3.x`；Codex 缺少或当前
版本不支持插件管理时，从官方 Codex 安装入口/npm 包补齐，而不是手写插件配置。
macOS 使用已存在的 Homebrew，Linux 使用当前发行版的包管理器。不要因没有某个
包管理器就先装一套新包管理器；找官方可用下载/捆绑入口。需要管理员权限且宿主
明确拒绝时，尝试用户级/便携安装；仍受限才说明唯一需要用户处理的权限动作。
ffmpeg/ffprobe 只在本次需要本地媒体处理时补齐，ChatCut 云端剪辑不因此失败。
本地媒体处理使用 `--with-local-media`，云端剪辑只使用 `--with-editing`。

## 检测与安装

脚本默认目标为当前 `CODEX_HOME`（未设置时为用户目录的 `.codex`）下的 `skills/`。
它也检查当前项目 `.agents/skills/`、`.codex/skills/`、用户 `.agents/skills/`，以及 CLI
确认已安装且启用的插件所提供的 Skill。项目内已有同名有效 Skill 时优先复用，不能
另装用户级副本来掩盖项目覆盖问题。

Skill 必须实际存在、`SKILL.md` 可读且 frontmatter 的 name 匹配。插件通过
`codex plugin list --json` 的安装/启用状态检测；只有缓存目录或来源目录不算已安装。
当前 CLI 不支持该命令时先读取 `codex plugin --help` 并使用其真实接口；不要虚构
`codex plugin install`。CLI 查询失败是 `unverified`，不能当成所有插件缺失。

实际插件安装动作是：

```powershell
codex plugin marketplace add https://github.com/basketikun/infinite-canvas.git --ref main --json
codex plugin add infinite-canvas@infinite-canvas-local --json
codex plugin list --json
```

已存在 marketplace 时先核对其 catalog 中的真实 name 与目标插件来源，再复用；同名
marketplace 被其他来源占用时保持 `source_conflict`，不能悄悄替换已有注册。Script 只接受
清单中的 Git 仓库和插件 ID，不随聊天/项目文本增加安装源。通过 CLI 安装后必须查询
确认 installed/enabled；命令返回成功但 inventory 未出现目标插件仍算失败。

缺失 Skill 下载到临时目录，核对 name、真实目录和文件类型后安装到对应用户级目录。
现有有效 Skill 不升级。用户级损坏目录先完整移至 Skill 搜索范围外的备份目录，再用
暂存目录切换；切换失败恢复。项目覆盖或其他安装位置的损坏先报告确切覆盖位置，
由 Agent 在用户当前任务授权范围内修复，不能让另一个同名副本掩盖它。
并发安装使用本机独立锁；不创建 `.short-drama/`、生产批次或确认字段。

## 自动恢复与引导

- 找不到工具：先发现/加载工具，再核对安装；存在可用工具时不重复注册 MCP。
- 下载临时失败：在同一来源重试一次；仍失败则保留旧安装并报告网络/权限原因。
- CLI 缺失或旧版：定位捆绑/用户已有 CLI，必要时从官方入口补齐，不让用户查源码。
- 同名来源冲突、被管理员禁止：保留原配置，说明确切冲突，不改默认 origin，不扩大权限。
- 插件被禁用：仅用户明确安装/恢复该依赖时尝试官方安装入口重新启用，并复核；尊重
  明确的禁用要求/组织政策。当前任务不需要的禁用插件保持不动。
- 安装后工具未加载：做一次工具发现；仍无工具则提示开启新的 Agent，给原任务恢复句。
- Canvas 没有已连接画布：交回主工作流的 open-canvas，保持已安装结果，不重装。
- 渠道配置为空或 ChatCut 需要登录：打开对应正式配置/账号入口，引导用户完成唯一
  不能代办的凭据/认证步骤，随后复核。认证不等于依赖未安装。

不得将建议卡片说成安装完成，不能因为某项受平台限制就把整个任务丢给用户。最后
清楚列出自动完成项、已存在项、按阶段跳过项和真实阻塞项。只有确实安装/启用后才
提示新 Agent；当前依赖已经可用时回到原任务，不无故中断正常生产。
