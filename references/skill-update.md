# 影铸工作流更新契约

本入口仅维护 `short-video-workflow` 的安装文件，独立于视频项目、Canvas 与媒体生产。
用户在本 Skill 的语境中要求“检查更新”或“更新”时，默认授权有新版就自动安装；
明确要求只查看版本时，只检查，不安装。

## 固定来源与调用

- 仓库：`https://github.com/YoHoFee/CineForgeWorkflow.git`
- 分支：`main`
- Skill：`short-video-workflow`
- 运行时：Node.js 与 Git；脚本使用参数数组调用 Git，不执行远端安装脚本。
- 目标：当前加载的 Skill 安装目录，不使用视频项目的当前工作目录推断目标。

```powershell
node <loaded-skill-root>/scripts/update-skill.mjs
# 用户明确要求“仅检查，不安装”
node <loaded-skill-root>/scripts/update-skill.mjs --check
```

维护仓库中的脚本默认拒绝覆盖 Git checkout。需要从维护仓库调用时，显式提供实际
安装目录：`--install-dir=<installed-short-video-workflow-root>`。脚本核对目录名、Skill
身份和目录类型；不支持 `--repo`、`--branch`、镜像或其他来源覆盖参数。

## 版本比较

使用远端 Git 提交 SHA 作为版本，不按文件时间或提交日期猜测新旧。
安装成功后记录 `.skill-install.json`，包含固定仓库/分支、提交 SHA、安装时间和受管理
文件的内容指纹；该文件是安装收据，不是视频项目的工作流状态。

已登记提交与远端相同且文件一致时，报告 `up_to_date`；远端是本地提交的后继时才
自动更新。若本地比远端新，报告 `local_ahead`，不降级；分支历史分叉或登记提交不能
核验时，报告 `version_unproven`，保持原安装。相同提交存在本地修改时报告
`local_modified`，不把它误判成上游新版。

没有安装收据的旧安装，通过受管理文件的内容在固定仓库 `main` 历史中寻找匹配版本；
文本换行差异不算版本变化。匹配到旧提交后可自动更新；完全匹配最新提交则报告
`up_to_date`，默认模式补登记收据。找不到匹配版本时报告 `version_unproven`，说明
可能存在本地定制或未发布版本，不盲目覆盖。“仅检查”不会写收据、备份或安装文件。

## 安装与恢复

受管理范围为 `SKILL.md`、`agents/`、`references/`、`scripts/`、内附安装器
`skills/cineforge-dependencies/`，以及仓库存在的
`README.md`、`CHANGELOG.md`、`LICENSE`。同步会移除新版中已删除的受管理文件。
其他顶层内容原样保留；不复制远端 `.git`、仓库级 `AGENTS.md`、项目状态或媒体。
附带安装器随影铸更新；用户另行安装的独立 `cineforge-dependencies` 目录不会被此脚本
覆盖。主工作流缺失恢复优先读取当前影铸内附版本，避免独立安装器的旧清单影响恢复。

先在临时目录下载固定仓库并核对 Skill 身份、文件类型和完整文件指纹。更新采用同盘
暂存目录、完整旧目录备份和目录切换；并发更新由安装目录旁的锁阻止。写入前复核
安装内容未变化，安装后复核与下载的受管理文件一致，再写入提交收据。下载、校验或
切换失败时保留/恢复原目录，返回失败及可恢复备份，不报告成功。

备份位于 Skill 搜索目录之外的 `skill-backups/short-video-workflow/<timestamp-id>/`，
避免旧版被作为另一份 Skill 自动发现。备份与暂存路径由安装目录推导，不把机器
绝对路径写进仓库。完整备份保留本地定制，成功更新后不自动删除。

## 用户提示与停止条件

`updated` 才能报告“已更新”，必须附旧/新提交和备份位置，并提示：

> 已更新影铸工作流。请开启新的 Agent 来启用新版；当前 Agent 不继续执行新版流程。

`up_to_date` 报告已是最新版本；`update_available` 仅用于 `--check`。
`local_ahead`、`local_modified`、`version_unproven`、网络失败、缺少 Git/Node、目录
被占用或锁冲突都应说明实际原因，保持本地安装，不转向其他仓库或强制 `reset`。
用户同时要求更新和制作视频时，更新成功后停在新 Agent 提示；其制作需求交给新的
Agent 继续，旧确认不能因更新而扩大授权。
