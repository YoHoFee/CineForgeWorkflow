#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [command = "validate", projectArg = process.cwd(), ...args] = process.argv.slice(2);
const project = path.resolve(projectArg);
const stateFile = path.join(project, ".short-drama", "workflow-state.json");

const emptyState = {
    schemaVersion: 3,
    projectId: null,
    currentCanvasProjectId: null,
    canvas: {
        requirement: "not_required",
        status: "not_evaluated",
        lastCheckedAt: null,
        projectId: null,
        lastIssue: null,
    },
    videoPromptHandoff: {
        status: "not_started",
        sourceSkill: "short-drama-video-prompts",
        promptPath: null,
        promptHash: null,
        shotCount: 0,
        missingReferences: [],
        errors: [],
    },
    videoSegmentChain: {
        status: "not_started",
        model: null,
        targetDurationSeconds: null,
        maxSegmentSeconds: null,
        segmentCount: 0,
        segments: [],
    },
    intake: {
        status: "not_started",
        requestDetailLevel: null,
        executionScope: "end_to_end",
        requestedStages: [],
        blockingQuestions: [],
        missingInputs: [],
        reusableInputs: [],
        route: [],
        lastAssessedAt: null,
    },
    storyStatus: "draft",
    preproductionStatus: "draft",
    designReportPath: null,
    productionConfirmation: { status: "pending_video_only", reportHash: null, confirmedAt: null },
    characterReferencePresent: false,
    characterDesignSheetStatus: "not_started",
    scenePlateStatus: "not_started",
    characterSketchStatus: "not_started",
    characterTurnaroundStatus: "not_started",
    keyframeStatus: "not_started",
    videoReferenceIds: [],
    videoGenerationStatus: "not_started",
    activeBatchId: null,
    updatedAt: null,
};

if (command === "init") {
    ensureDirectories();
    if (!fs.existsSync(stateFile)) writeJson(stateFile, emptyState);
    console.log(stateFile);
    process.exit(0);
}

if (command === "approve-sketch") {
    if (!args.includes("--confirmation=USER_CONFIRMED_SKETCH") && !args.includes("USER_CONFIRMED_SKETCH")) {
        fail("缺少明确确认 token：USER_CONFIRMED_SKETCH");
    }
    const state = readState();
    state.characterSketchStatus = "approved";
    state.updatedAt = new Date().toISOString();
    writeJson(stateFile, state);
    console.log("characterSketchStatus=approved");
    process.exit(0);
}

if (command === "validate-video-prompts") {
    const state = readState();
    const promptPathArg = args.find((arg) => arg.startsWith("--path="));
    const promptPath = promptPathArg
        ? path.resolve(project, promptPathArg.slice("--path=".length))
        : state.videoPromptHandoff?.promptPath
            ? path.resolve(project, state.videoPromptHandoff.promptPath)
            : null;
    if (!promptPath) fail("缺少视频提示词路径：请提供 --path=<project-relative-path>");
    const result = validateVideoPromptDocument(promptPath);
    state.videoPromptHandoff = {
        ...(state.videoPromptHandoff ?? {}),
        sourceSkill: "short-drama-video-prompts",
        status: result.errors.length ? "blocked" : "validated",
        promptPath: path.relative(project, promptPath).replaceAll(path.sep, "/"),
        promptHash: result.hash,
        shotCount: result.shotCount,
        missingReferences: result.missingReferences,
        errors: result.errors,
    };
    state.updatedAt = new Date().toISOString();
    writeJson(stateFile, state);
    if (result.errors.length) fail(result.errors.join("; "));
    console.log(`视频提示词交接有效：${result.shotCount} 个镜头`);
    process.exit(0);
}

if (command === "validate") {
    const state = readState();
    const errors = [];
    if (![1, 2, 3].includes(state.schemaVersion)) {
        errors.push("schemaVersion 只支持 1、2（旧版兼容）或 3");
    }
    const videoPromptHandoff = state.videoPromptHandoff;
    if (state.schemaVersion >= 3 || videoPromptHandoff !== undefined) {
        validateVideoPromptHandoff(videoPromptHandoff, errors);
    }
    const canvas = state.canvas;
    if (canvas !== undefined) validateCanvasState(canvas, errors);
    const videoSegmentChain = state.videoSegmentChain;
    if (state.schemaVersion >= 3 || videoSegmentChain !== undefined) {
        validateVideoSegmentChain(videoSegmentChain, errors);
    }
    const intake = state.intake;
    if (state.schemaVersion >= 2 || intake !== undefined) {
        validateIntake(intake, errors);
    }
    const allowed = {
        storyStatus: ["draft", "confirmed"],
        preproductionStatus: ["draft", "ready_for_confirmation", "confirmed", "in_production", "completed", "failed"],
        characterDesignSheetStatus: ["not_started", "reused", "planned", "in_production", "generated", "resolution_invalid", "failed"],
        scenePlateStatus: ["not_started", "reused", "planned", "in_production", "generated", "resolution_invalid", "failed"],
        characterSketchStatus: ["not_started", "pending_confirmation", "approved"],
        characterTurnaroundStatus: ["not_started", "pending_confirmation", "approved"],
        keyframeStatus: ["not_started", "planned", "in_production", "generated", "resolution_invalid", "approved"],
        videoGenerationStatus: ["not_started", "prepared", "awaiting_video_confirmation", "submitted", "completed", "blocked", "failed"],
    };
    for (const [field, values] of Object.entries(allowed)) {
        if (!values.includes(state[field])) errors.push(`${field} 的值无效`);
    }
    if (!state.characterReferencePresent && state.characterTurnaroundStatus !== "not_started" && state.characterSketchStatus !== "approved" && state.characterDesignSheetStatus === undefined) {
        errors.push("角色三视图需要已批准的角色草图");
    }
    if (["confirmed", "in_production", "completed"].includes(state.preproductionStatus)) {
        if (!state.designReportPath) errors.push("已确认的前期制作需要 designReportPath");
        if (!state.productionConfirmation || state.productionConfirmation.status === "pending") {
            errors.push("已确认的前期制作需要 productionConfirmation");
        }
    }
    if (state.videoGenerationStatus === "submitted" || state.videoGenerationStatus === "completed") {
        if (!state.activeBatchId) errors.push("已提交或已完成的视频需要 activeBatchId");
        if (!Array.isArray(state.videoReferenceIds) || state.videoReferenceIds.length < 3) errors.push("角色视频至少需要三个参考节点 ID");
    }
    if (intake?.status === "needs_user_input" && state.preproductionStatus === "in_production") {
        errors.push("intake 仍有阻塞问题时不能进入生产");
    }
    if (["ready_for_confirmation", "confirmed", "in_production", "completed"].includes(state.preproductionStatus)) {
        if (!["ready", "routed"].includes(intake?.status)) {
            errors.push("进入确认或生产阶段前需要完成 intake 路由");
        }
        if (Array.isArray(intake?.blockingQuestions) && intake.blockingQuestions.length > 0) {
            errors.push("进入确认或生产阶段前不能保留阻塞问题");
        }
        if (videoPromptHandoff?.status !== "validated") {
            errors.push("进入确认或生产阶段前需要通过视频提示词交接校验");
        }
    }
    if (videoPromptHandoff?.status === "blocked" || videoPromptHandoff?.missingReferences?.length > 0) {
        if (["confirmed", "in_production", "completed"].includes(state.preproductionStatus)
            || ["submitted", "completed"].includes(state.videoGenerationStatus)) {
            errors.push("视频提示词交接阻塞时不能确认或提交视频");
        }
    }
    if (videoSegmentChain?.status === "awaiting_tail_frame"
        && ["confirmed", "in_production", "completed"].includes(state.preproductionStatus)) {
        errors.push("片段链等待真实尾帧时不能进入确认或生产");
    }
    if (videoSegmentChain?.status === "in_progress"
        && videoSegmentChain.segments.some((segment) => segment.index > 1
            && segment.startFrameSource === "actual-tail-frame"
            && !segment.startFrameRef)) {
        errors.push("后续片段必须记录上一片段提取的真实尾帧");
    }
    if (canvas?.requirement === "not_required" && canvas.status === "mismatch") {
        errors.push("not_required 的 Canvas 状态不能标记为 mismatch");
    }
    if (canvas?.requirement === "required"
        && canvas.status !== "connected"
        && ["draft", "failed"].includes(state.preproductionStatus) === false) {
        errors.push("Canvas required 且未连接时不能进入后续生产阶段");
    }
    if (errors.length) fail(errors.join("; "));
    console.log("工作流状态有效");
    process.exit(0);
}

fail(`未知命令：${command}`);

function ensureDirectories() {
    fs.mkdirSync(path.join(project, ".short-drama", "production-batches"), { recursive: true });
    fs.mkdirSync(path.join(project, ".short-drama", "manifests"), { recursive: true });
}

function readState() {
    if (!fs.existsSync(stateFile)) fail(`工作流状态缺失：${stateFile}；请先运行 init`);
    try {
        return JSON.parse(fs.readFileSync(stateFile, "utf8"));
    } catch (error) {
        fail(`工作流状态不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
    }
}

function writeJson(file, value) {
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temp, file);
}

function validateIntake(intake, errors) {
    if (!intake || typeof intake !== "object" || Array.isArray(intake)) {
        errors.push("schemaVersion=2 需要 intake 对象");
        return;
    }
    const statuses = ["not_started", "in_progress", "needs_user_input", "ready", "routed"];
    const detailLevels = ["brief", "partial", "detailed", "production_ready", "continuation"];
    if (!statuses.includes(intake.status)) errors.push("intake.status 的值无效");
    if (intake.requestDetailLevel !== null && !detailLevels.includes(intake.requestDetailLevel)) {
        errors.push("intake.requestDetailLevel 的值无效");
    }
    if (!["end_to_end", "stage_only"].includes(intake.executionScope)) {
        errors.push("intake.executionScope 的值无效");
    }
    if (!Array.isArray(intake.requestedStages)) errors.push("intake.requestedStages 必须是数组");
    if (intake.executionScope === "stage_only" && intake.requestedStages.length === 0) {
        errors.push("stage_only 需要至少一个 requestedStages");
    }
    if (intake.executionScope === "end_to_end" && intake.requestedStages.length > 0) {
        errors.push("end_to_end 不应保留 requestedStages");
    }
    for (const field of ["blockingQuestions", "missingInputs", "reusableInputs", "route"]) {
        if (!Array.isArray(intake[field])) errors.push(`intake.${field} 必须是数组`);
    }
    if (intake.lastAssessedAt !== null && typeof intake.lastAssessedAt !== "string") {
        errors.push("intake.lastAssessedAt 必须是 ISO 时间字符串或 null");
    }
    if (Array.isArray(intake.route)) {
        for (const [index, item] of intake.route.entries()) {
            if (!item || typeof item !== "object") {
                errors.push(`intake.route[${index}] 必须是对象`);
                continue;
            }
            if (typeof item.owner !== "string" || !item.owner) errors.push(`intake.route[${index}].owner 缺失`);
            if (typeof item.reason !== "string" || !item.reason) errors.push(`intake.route[${index}].reason 缺失`);
            if (!["create", "revise", "reuse", "skip"].includes(item.action)) {
                errors.push(`intake.route[${index}].action 的值无效`);
            }
            if (!["pending", "active", "complete", "blocked"].includes(item.status)) {
                errors.push(`intake.route[${index}].status 的值无效`);
            }
        }
    }
}

function validateVideoPromptHandoff(handoff, errors) {
    if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) {
        errors.push("schemaVersion=3 需要 videoPromptHandoff 对象");
        return;
    }
    const statuses = ["not_started", "requested", "draft", "blocked", "validated", "superseded"];
    if (!statuses.includes(handoff.status)) errors.push("videoPromptHandoff.status 的值无效");
    if (handoff.sourceSkill !== "short-drama-video-prompts") {
        errors.push("videoPromptHandoff.sourceSkill 必须为 short-drama-video-prompts");
    }
    for (const field of ["missingReferences", "errors"]) {
        if (!Array.isArray(handoff[field])) errors.push(`videoPromptHandoff.${field} 必须是数组`);
    }
    if (!Number.isInteger(handoff.shotCount) || handoff.shotCount < 0) {
        errors.push("videoPromptHandoff.shotCount 必须是非负整数");
    }
    if (handoff.status === "validated") {
        if (!handoff.promptPath) errors.push("已校验的视频提示词需要 promptPath");
        if (!handoff.promptHash) errors.push("已校验的视频提示词需要 promptHash");
        if (handoff.errors?.length || handoff.missingReferences?.length) {
            errors.push("validated 的视频提示词不能保留错误或缺失参考图");
        }
    }
}

function validateVideoSegmentChain(chain, errors) {
    if (!chain || typeof chain !== "object" || Array.isArray(chain)) {
        errors.push("schemaVersion=3 需要 videoSegmentChain 对象");
        return;
    }
    const statuses = ["not_started", "planned", "awaiting_tail_frame", "in_progress", "blocked", "completed"];
    if (!statuses.includes(chain.status)) errors.push("videoSegmentChain.status 的值无效");
    if (!Number.isInteger(chain.segmentCount) || chain.segmentCount < 0) {
        errors.push("videoSegmentChain.segmentCount 必须是非负整数");
    }
    if (!Array.isArray(chain.segments)) {
        errors.push("videoSegmentChain.segments 必须是数组");
        return;
    }
    if (chain.segmentCount !== chain.segments.length) {
        errors.push("videoSegmentChain.segmentCount 与 segments 数量不一致");
    }
    if (chain.maxSegmentSeconds !== null
        && (!Number.isFinite(chain.maxSegmentSeconds) || chain.maxSegmentSeconds <= 0)) {
        errors.push("videoSegmentChain.maxSegmentSeconds 必须是正数或 null");
    }
    const defaultModelCaps = {
        "minimax-h3": 15,
        "seedance-2.0": 30,
        "seedance-2.5": 30,
    };
    const modelCap = defaultModelCaps[String(chain.model).toLowerCase()];
    if (modelCap && chain.maxSegmentSeconds !== null && chain.maxSegmentSeconds > modelCap) {
        errors.push(`${chain.model} 的 maxSegmentSeconds 不能超过 ${modelCap} 秒`);
    }
    if (chain.targetDurationSeconds !== null
        && (!Number.isFinite(chain.targetDurationSeconds) || chain.targetDurationSeconds <= 0)) {
        errors.push("videoSegmentChain.targetDurationSeconds 必须是正数或 null");
    }
    let totalDuration = 0;
    for (const [index, segment] of chain.segments.entries()) {
        if (!segment || typeof segment !== "object") {
            errors.push(`videoSegmentChain.segments[${index}] 必须是对象`);
            continue;
        }
        if (segment.index !== index + 1) {
            errors.push(`videoSegmentChain.segments[${index}].index 必须连续递增`);
        }
        if (!Number.isFinite(segment.durationSeconds) || segment.durationSeconds <= 0) {
            errors.push(`videoSegmentChain.segments[${index}].durationSeconds 必须是正数`);
        } else {
            totalDuration += segment.durationSeconds;
        }
        if (chain.maxSegmentSeconds !== null
            && Number.isFinite(segment.durationSeconds)
            && segment.durationSeconds > chain.maxSegmentSeconds) {
            errors.push(`videoSegmentChain.segments[${index}] 超过单次时长上限`);
        }
        if (index === 0 && segment.startFrameSource !== "frozen-keyframe") {
            errors.push("片段 1 必须使用 frozen-keyframe 作为起始帧来源");
        }
        if (index > 0) {
            if (segment.startFrameSource !== "actual-tail-frame") {
                errors.push(`片段 ${index + 1} 必须使用 actual-tail-frame`);
            }
            const requiresRealTail = !["planned", "awaiting_previous_output"].includes(segment.status);
            if (!segment.previousSegmentId || (requiresRealTail && !segment.startFrameRef)) {
                errors.push(`片段 ${index + 1} 缺少上一片段或真实尾帧引用`);
            }
        }
    }
    if (chain.targetDurationSeconds !== null
        && chain.segments.length
        && Math.abs(totalDuration - chain.targetDurationSeconds) > 0.001) {
        errors.push("片段总时长必须等于目标总时长");
    }
}

function validateCanvasState(canvas, errors) {
    if (!canvas || typeof canvas !== "object" || Array.isArray(canvas)) {
        errors.push("canvas 必须是对象");
        return;
    }
    if (!["not_required", "optional", "required"].includes(canvas.requirement)) {
        errors.push("canvas.requirement 的值无效");
    }
    if (!["not_evaluated", "connected", "unavailable", "degraded", "mismatch"].includes(canvas.status)) {
        errors.push("canvas.status 的值无效");
    }
    if (canvas.lastCheckedAt !== null && typeof canvas.lastCheckedAt !== "string") {
        errors.push("canvas.lastCheckedAt 必须是 ISO 时间字符串或 null");
    }
    if (canvas.projectId !== null && typeof canvas.projectId !== "string") {
        errors.push("canvas.projectId 必须是字符串或 null");
    }
    if (canvas.lastIssue !== null && typeof canvas.lastIssue !== "string") {
        errors.push("canvas.lastIssue 必须是字符串或 null");
    }
    if (canvas.status === "connected" && !canvas.projectId) {
        errors.push("canvas.status=connected 时需要 projectId");
    }
}

function validateVideoPromptDocument(promptPath) {
    const result = {
        hash: null,
        shotCount: 0,
        missingReferences: [],
        errors: [],
    };
    if (!fs.existsSync(promptPath)) {
        result.errors.push(`视频提示词文件不存在：${promptPath}`);
        return result;
    }
    const text = fs.readFileSync(promptPath, "utf8");
    result.hash = `sha256:${crypto.createHash("sha256").update(text, "utf8").digest("hex")}`;
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)) result.errors.push("视频提示词包含不可见控制字符");
    if (text.includes("...") || text.includes("待补参考图")) result.errors.push("视频提示词包含占位或待补参考图");

    const headings = [...text.matchAll(/^##\s+(MOTION-[^\r\n]+)/gim)];
    result.shotCount = headings.length;
    if (!result.shotCount) {
        result.errors.push("未找到 MOTION 镜头");
        return result;
    }
    const allowedUses = "身份|造型状态|地理|构图|尺度|效果|起始帧|结束帧|风格";
    for (let index = 0; index < headings.length; index += 1) {
        const start = headings[index].index;
        const end = headings[index + 1]?.index ?? text.length;
        const block = text.slice(start, end);
        const label = headings[index][1].trim();
        for (const field of ["分镜", "时长", "生成方式", "输入参考图", "静态视觉锚点", "起始帧", "状态链", "终点"]) {
            if (!new RegExp(`^\\s*-\\s*${field}：`, "m").test(block)) {
                result.errors.push(`${label} 缺少字段：${field}`);
            }
        }
        if (!/生成方式：\s*(图生视频|文生视频)\s*$/m.test(block)) {
            result.errors.push(`${label} 的生成方式无效`);
        }
        const referenceLinePattern = new RegExp(
            `REF-[^\\s（]+（顺序：\\d+）·\\s*[^\\r\\n《]+《[^》]+》\\（用途：(?:${allowedUses})；控制：[^；]+；不得控制：[^）]+）`,
            "g",
        );
        const referenceLines = [...block.matchAll(referenceLinePattern)];
        const explicitTextToVideo = /输入参考图：\s*无（创作者已明确选择文生视频）/m.test(block);
        if (!referenceLines.length && !explicitTextToVideo) {
            result.missingReferences.push(label);
            result.errors.push(`${label} 缺少有效 REF 参考图或明确文生视频声明`);
        }
        if (/输入参考图：\s*无\s*$/m.test(block)) {
            result.errors.push(`${label} 不能用普通“无”代替文生视频声明`);
        }
        if (!/###\s*可复制提示词/m.test(block)) {
            result.errors.push(`${label} 缺少可复制提示词正文`);
        }
    }
    return result;
}

function fail(message) {
    console.error(`工作流状态：${message}`);
    process.exit(1);
}
