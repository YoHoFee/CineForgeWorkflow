#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [command = "validate", projectArg = process.cwd(), ...args] = process.argv.slice(2);
const project = path.resolve(projectArg);
const stateFile = path.join(project, ".short-drama", "workflow-state.json");
const projectProfileFile = path.join(project, "short-drama.json");

const emptyState = {
    schemaVersion: 4,
    projectId: null,
    currentCanvasProjectId: null,
    canvas: {
        requirement: "required",
        status: "not_evaluated",
        lastCheckedAt: null,
        origin: null,
        projectId: null,
        routePath: null,
        clientId: null,
        title: null,
        lastIssue: null,
        videoConfigNodeId: null,
        videoMotionId: null,
        referenceBindings: [],
        nodes: [],
        connections: [],
    },
    videoPromptHandoff: {
        status: "not_started",
        sourceSkill: "short-drama-video-prompts",
        referenceMode: "reference",
        promptPath: null,
        promptHash: null,
        shotCount: 0,
        referencePaths: [],
        referenceSlots: [],
        planReferenceSlots: [],
        audioReferenceSlots: [],
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
    assetTargets: [],
    storyStatus: "draft",
    preproductionStatus: "draft",
    designReportPath: null,
    productionConfirmation: { status: "pending", reportHash: null, confirmedAt: null },
    characterReferencePresent: false,
    characterDesignSheetStatus: "not_started",
    sceneDesignSheetStatus: "not_started",
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

if (command === "migrate") {
    const state = readState();
    const version = state.schemaVersion;
    if (![1, 2, 3, 4].includes(version)) {
        fail("只能迁移 schemaVersion=1、2、3 或 4 的状态");
    }
    if (version === 4) {
        console.log("工作流状态已经是 schemaVersion=4");
        process.exit(0);
    }
    const migrated = upgradeStateToV4(state);
    writeJson(stateFile, migrated);
    console.log(`工作流状态已从 schemaVersion=${version} 迁移到 4`);
    process.exit(0);
}

if (command === "record-canvas") {
    let state = readState();
    if (state.schemaVersion !== 4) {
        if (![1, 2, 3].includes(state.schemaVersion)) {
            fail("record-canvas 只支持 schemaVersion=1、2、3 或 4");
        }
        state = upgradeStateToV4(state);
    }
    const projectId = getOption(args, "--project-id");
    const clientId = getOption(args, "--client-id");
    const originArg = getOption(args, "--origin");
    const origin = normalizeCanvasOrigin(originArg ?? state.canvas?.origin);
    const routePath = getOption(args, "--route-path") ?? (projectId ? `/canvas/${projectId}` : null);
    const title = getOption(args, "--title");
    const checkedAt = getOption(args, "--checked-at") ?? new Date().toISOString();
    const errors = [];
    const normalizedClientId = clientId?.trim() ?? "";

    if (!projectId || !/^[^\s/?#]+$/u.test(projectId)) {
        errors.push("--project-id 必须是非空 Canvas projectId");
    }
    if (!normalizedClientId) errors.push("--client-id 必须是非空共享 clientId");
    if (!origin) errors.push("--origin 必须是没有路径、查询或片段的 http(s) origin");
    if (state.canvas?.origin && origin && state.canvas.origin !== origin) {
        errors.push(`Canvas origin 已锁定为 ${state.canvas.origin}，不能静默切换到 ${origin}`);
    }
    if (!routePath || !/^\/canvas\/[^\s/?#]+$/u.test(routePath)) {
        errors.push("--route-path 必须匹配 /canvas/<projectId>");
    } else if (projectId && routePath !== `/canvas/${projectId}`) {
        errors.push("--route-path 必须与 --project-id 一致");
    }
    if (!title || !title.trim()) {
        errors.push("--title 必须是非空生产语义画布名称");
    }
    const switchingCanvasProject = Boolean(
        state.currentCanvasProjectId
        && state.currentCanvasProjectId !== projectId,
    );
    const changingCanvasClient = Boolean(
        state.currentCanvasProjectId === projectId
        && state.canvas?.clientId
        && state.canvas.clientId !== normalizedClientId,
    );
    if ((switchingCanvasProject || changingCanvasClient)
        && (state.activeBatchId
            || ["ready_for_confirmation", "confirmed", "in_production", "completed"].includes(state.preproductionStatus)
            || ["submitted", "completed"].includes(state.videoGenerationStatus))) {
        errors.push("当前工作流仍有活动或已确认的 Canvas 批次；先完成旧项目恢复或关闭，再切换 Canvas 项目或共享会话");
    }
    if (!isValidDateString(checkedAt)) errors.push("--checked-at 必须是有效 ISO 时间字符串");
    if (errors.length) fail(errors.join("; "));

    const canvasIdentityChanged = switchingCanvasProject || changingCanvasClient;
    if (canvasIdentityChanged) clearCanvasDerivedBindings(state);
    state.projectId = projectId;
    state.currentCanvasProjectId = projectId;
    state.canvas = {
        ...(state.canvas ?? {}),
        requirement: "required",
        status: "connected",
        lastCheckedAt: checkedAt,
        origin,
        projectId,
        routePath,
        clientId: normalizedClientId,
        title: title.trim(),
        lastIssue: null,
        videoConfigNodeId: canvasIdentityChanged ? null : (state.canvas?.videoConfigNodeId ?? null),
        videoMotionId: canvasIdentityChanged ? null : (state.canvas?.videoMotionId ?? null),
        referenceBindings: canvasIdentityChanged
            ? []
            : (Array.isArray(state.canvas?.referenceBindings)
            ? state.canvas.referenceBindings
            : []),
        nodes: canvasIdentityChanged
            ? []
            : (Array.isArray(state.canvas?.nodes) ? state.canvas.nodes : []),
        connections: canvasIdentityChanged
            ? []
            : (Array.isArray(state.canvas?.connections) ? state.canvas.connections : []),
    };
    state.updatedAt = new Date().toISOString();
    writeJson(stateFile, state);
    console.log(`Canvas connection recorded: ${projectId}`);
    process.exit(0);
}

if (command === "record-canvas-snapshot") {
    let state = readState();
    if (state.schemaVersion !== 4) {
        if (![1, 2, 3].includes(state.schemaVersion)) {
            fail("record-canvas-snapshot 只支持 schemaVersion=1、2、3 或 4");
        }
        state = upgradeStateToV4(state);
    }
    const snapshotArg = args.find((arg) => arg.startsWith("--path="));
    if (!snapshotArg) fail("缺少 Canvas 原始快照路径：请提供 --path=<project-relative-json>");
    const snapshotErrors = [];
    const snapshotPath = resolveProjectPath(
        snapshotArg.slice("--path=".length),
        "Canvas 原始快照路径",
        snapshotErrors,
    );
    if (!snapshotPath) fail(snapshotErrors.join("; ") || "Canvas 原始快照路径必须是项目内相对路径");
    if (!fs.existsSync(snapshotPath) || !fs.statSync(snapshotPath).isFile()) {
        fail(`Canvas 原始快照文件不存在或不是文件：${snapshotArg.slice("--path=".length)}`);
    }
    let rawSnapshot;
    try {
        rawSnapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    } catch (error) {
        fail(`Canvas 原始快照不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
    }
    const requestedMotionId = getOption(args, "--motion-id") ?? getCurrentMotionId(state);
    const requestedConfigNodeId = getOption(args, "--config-node-id")
        ?? state.canvas?.videoConfigNodeId
        ?? null;
    if (requestedMotionId && !/^MOTION-[A-Z0-9-]+$/u.test(requestedMotionId)) {
        fail("--motion-id 必须匹配 MOTION-*");
    }
    const normalized = normalizeCanvasSnapshot(rawSnapshot, {
        motionId: requestedMotionId,
        configNodeId: requestedConfigNodeId,
    });
    if (normalized.errors.length) fail(normalized.errors.join("; "));
    const expectedProjectId = state.currentCanvasProjectId ?? state.canvas?.projectId;
    if (!expectedProjectId) {
        fail("请先使用 record-canvas 登记实时 projectId、clientId 和画布标题");
    }
    if (normalized.projectId !== expectedProjectId) {
        fail(`Canvas 原始快照 projectId 与当前状态不一致：${normalized.projectId} != ${expectedProjectId}`);
    }
    if (state.canvas?.clientId && normalized.clientId !== state.canvas.clientId) {
        fail(`Canvas 原始快照 clientId 与当前状态不一致：${normalized.clientId} != ${state.canvas.clientId}`);
    }
    const defaultTitleReadModelStale = normalized.title
        && isDefaultCanvasTitle(normalized.title)
        && state.canvas?.title
        && !isDefaultCanvasTitle(state.canvas.title)
        && normalized.projectId === state.canvas.projectId
        && normalized.clientId === state.canvas.clientId;
    const snapshotHasWrites = normalized.nodes.length > 0
        || normalized.connections.length > 0
        || normalized.referenceBindings.length > 0;
    if (normalized.title
        && isDefaultCanvasTitle(normalized.title)
        && !defaultTitleReadModelStale
        && snapshotHasWrites) {
        fail("Canvas 原始快照仍使用默认占位画布名称；先在实时项目中重命名");
    }
    const staleDefaultTitle = state.canvas?.title
        && normalized.title
        && normalized.title !== state.canvas.title
        && isDefaultCanvasTitle(normalized.title)
        && !isDefaultCanvasTitle(state.canvas.title);
    if (state.canvas?.title && normalized.title
        && normalized.title !== state.canvas.title
        && !staleDefaultTitle) {
        fail(`Canvas 原始快照标题与当前状态不一致：${normalized.title} != ${state.canvas.title}`);
    }
    state.schemaVersion = 4;
    state.projectId = normalized.projectId;
    state.currentCanvasProjectId = normalized.projectId;
    state.canvas = {
        ...(state.canvas ?? {}),
        requirement: "required",
        status: "connected",
        lastCheckedAt: normalized.lastCheckedAt,
        projectId: normalized.projectId,
        routePath: `/canvas/${normalized.projectId}`,
        clientId: normalized.clientId,
        title: staleDefaultTitle
            ? state.canvas.title
            : (normalized.title ?? state.canvas?.title ?? null),
        lastIssue: null,
        videoConfigNodeId: normalized.videoConfigNodeId,
        videoMotionId: normalized.videoMotionId,
        referenceBindings: normalized.referenceBindings,
        nodes: normalized.nodes,
        connections: normalized.connections,
    };
    state.updatedAt = new Date().toISOString();
    writeJson(stateFile, state);
    console.log(
        `Canvas snapshot recorded: ${normalized.projectId} `
        + `(${normalized.nodes.length} nodes, ${normalized.connections.length} connections)`,
    );
    process.exit(0);
}

if (command === "audit-canvas-snapshot") {
    const expectedArg = getOption(args, "--expected");
    const actualArg = getOption(args, "--actual");
    if (!expectedArg || !actualArg) {
        fail("audit-canvas-snapshot 需要 --expected=<project-relative-json> 和 --actual=<project-relative-json>");
    }
    const expectedPathErrors = [];
    const actualPathErrors = [];
    const expectedPath = resolveProjectPath(expectedArg, "期望 Canvas 快照路径", expectedPathErrors);
    const actualPath = resolveProjectPath(actualArg, "实时 Canvas 快照路径", actualPathErrors);
    if (!expectedPath || !actualPath) {
        fail([...expectedPathErrors, ...actualPathErrors].join("; "));
    }
    const readJsonFile = (filePath, label) => {
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            fail(`${label}不存在或不是文件：${filePath}`);
        }
        try {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (error) {
            fail(`${label}不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
        }
    };
    const expectedRaw = readJsonFile(expectedPath, "期望 Canvas 快照");
    const actualRaw = readJsonFile(actualPath, "实时 Canvas 快照");
    const state = readState();
    const motionId = getOption(args, "--motion-id") ?? state.canvas?.videoMotionId ?? getCurrentMotionId(state);
    const configNodeId = getOption(args, "--config-node-id")
        ?? state.canvas?.videoConfigNodeId
        ?? null;
    const expected = normalizeCanvasSnapshot(expectedRaw, { motionId, configNodeId });
    const actual = normalizeCanvasSnapshot(actualRaw, { motionId, configNodeId });
    const errors = [
        ...expected.errors.map((error) => `期望快照：${error}`),
        ...actual.errors.map((error) => `实时快照：${error}`),
    ];

    const compareScalar = (field, expectedValue, actualValue) => {
        if (expectedValue !== actualValue) {
            errors.push(`Canvas ${field} 不一致：${String(expectedValue)} != ${String(actualValue)}`);
        }
    };
    compareScalar("projectId", expected.projectId, actual.projectId);
    compareScalar("clientId", expected.clientId, actual.clientId);
    if (expected.title && actual.title && !isDefaultCanvasTitle(expected.title)
        && !isDefaultCanvasTitle(actual.title)) {
        compareScalar("title", expected.title, actual.title);
    }

    const expectedNodes = new Map(expected.nodes.map((node) => [node.id, node]));
    const actualNodes = new Map(actual.nodes.map((node) => [node.id, node]));
    const expectedNodeIds = [...expectedNodes.keys()].sort();
    const actualNodeIds = [...actualNodes.keys()].sort();
    if (JSON.stringify(expectedNodeIds) !== JSON.stringify(actualNodeIds)) {
        errors.push(
            `Canvas 节点集合不一致：expected=${expectedNodeIds.join(",")} actual=${actualNodeIds.join(",")}`,
        );
    }
    const nodeFields = [
        "type",
        "mediaAvailable",
        "naturalWidth",
        "naturalHeight",
        "status",
        "mimeType",
        "shortDramaAssetRole",
        "assetId",
        "motionId",
        "generationMode",
        "modality",
        "referencePolicy",
        "autoRun",
    ];
    for (const nodeId of new Set([...expectedNodeIds, ...actualNodeIds])) {
        const expectedNode = expectedNodes.get(nodeId);
        const actualNode = actualNodes.get(nodeId);
        if (!expectedNode || !actualNode) continue;
        for (const field of nodeFields) {
            const expectedValue = field === "mediaAvailable"
                ? expectedNode.mediaAvailable
                : expectedNode.metadata?.[field];
            const actualValue = field === "mediaAvailable"
                ? actualNode.mediaAvailable
                : actualNode.metadata?.[field];
            if (expectedValue !== actualValue) {
                errors.push(
                    `Canvas 节点 ${nodeId} 的 ${field} 不一致：`
                    + `${String(expectedValue)} != ${String(actualValue)}`,
                );
            }
        }
    }

    const edgeKey = (edge) => `${edge.fromNodeId}->${edge.toNodeId}`;
    const expectedEdges = expected.connections.map(edgeKey).sort();
    const actualEdges = actual.connections.map(edgeKey).sort();
    if (JSON.stringify(expectedEdges) !== JSON.stringify(actualEdges)) {
        errors.push(
            `Canvas 连线集合不一致：expected=${expectedEdges.join(",")} actual=${actualEdges.join(",")}`,
        );
    }

    const expectedBindings = expected.referenceBindings
        .map((binding) => `${binding.sourceNodeId}->${binding.targetNodeId}:${binding.role}`)
        .sort();
    const actualBindings = actual.referenceBindings
        .map((binding) => `${binding.sourceNodeId}->${binding.targetNodeId}:${binding.role}`)
        .sort();
    if (JSON.stringify(expectedBindings) !== JSON.stringify(actualBindings)) {
        errors.push(
            `Canvas 参考绑定不一致：expected=${expectedBindings.join(",")} actual=${actualBindings.join(",")}`,
        );
    }
    for (const binding of actual.referenceBindings) {
        const source = actualNodes.get(binding.sourceNodeId);
        if (!source || source.type !== "image" || source.mediaAvailable !== true) {
            errors.push(`实时 Canvas 参考节点缺少真实媒体：${binding.sourceNodeId}`);
        }
    }
    if (configNodeId && actualNodes.has(configNodeId)) {
        const config = actualNodes.get(configNodeId);
        if (config.type !== "config") errors.push(`实时 Canvas 当前 config 节点类型错误：${configNodeId}`);
    }
    if (errors.length) fail(errors.join("; "));
    console.log(JSON.stringify({
        status: "passed",
        projectId: actual.projectId,
        clientId: actual.clientId,
        nodeCount: actual.nodes.length,
        connectionCount: actual.connections.length,
        referenceBindingCount: actual.referenceBindings.length,
    }, null, 2));
    process.exit(0);
}

if (command === "approve-design-sheet") {
    if (!args.includes("--confirmation=USER_CONFIRMED_DESIGN_SHEET") && !args.includes("USER_CONFIRMED_DESIGN_SHEET")) {
        fail("缺少明确确认 token：USER_CONFIRMED_DESIGN_SHEET");
    }
    const state = readState();
    const assetId = getOption(args, "--asset-id");
    const nodeId = getOption(args, "--node-id");
    const target = Array.isArray(state.assetTargets)
        ? state.assetTargets.find((item) => item?.assetId === assetId)
        : null;
    const node = Array.isArray(state.canvas?.nodes)
        ? state.canvas.nodes.find((item) => nodeIdentity(item) === nodeId)
        : null;
    if (!assetId || !target) fail("approve-design-sheet 需要已登记的 --asset-id");
    if (!nodeId || !node) fail("approve-design-sheet 需要状态中可核对的 --node-id");
    if (target.assetType !== "character-design-sheet") {
        fail("approve-design-sheet 的 assetId 必须是 character-design-sheet");
    }
    if (node.type !== "image" || node.mediaAvailable !== true) {
        fail("approve-design-sheet 需要真实可读取的 Canvas 图片节点");
    }
    if (node.metadata?.shortDramaAssetRole !== "character-design-sheet") {
        fail("approve-design-sheet 的 Canvas 图片节点 role 必须是 character-design-sheet");
    }
    target.nodeId = nodeId;
    target.status = "generated";
    target.validationStatus = "accepted";
    state.characterDesignSheetStatus = "generated";
    state.characterReferencePresent = true;
    state.updatedAt = new Date().toISOString();
    writeJson(stateFile, state);
    console.log("characterDesignSheetStatus=generated");
    process.exit(0);
}

if (command === "approve-sketch") {
    fail("旧版草图确认命令已停用：新流程只使用 character-design-sheet");
}

if (command === "validate-video-prompts") {
    const state = readState();
    const promptPathArg = args.find((arg) => arg.startsWith("--path="));
    let promptPath = null;
    if (promptPathArg) {
        const pathErrors = [];
        promptPath = resolveProjectPath(promptPathArg.slice("--path=".length), "视频提示词路径", pathErrors);
        if (!promptPath) fail(pathErrors.join("; ") || "视频提示词路径必须是项目内相对路径");
    } else if (state.videoPromptHandoff?.promptPath) {
        const pathErrors = [];
        promptPath = resolveProjectPath(state.videoPromptHandoff.promptPath, "状态中的视频提示词路径", pathErrors);
        if (!promptPath) fail(pathErrors.join("; ") || "状态中的视频提示词路径必须是项目内相对路径");
    }
    if (!promptPath) fail("缺少视频提示词路径：请提供 --path=<project-relative-path>");
    const allowUnresolvedReferences = state.intake?.executionScope === "stage_only"
        && !["ready_for_confirmation", "confirmed", "in_production", "completed"].includes(
            state.preproductionStatus,
        );
    const result = validateVideoPromptDocument(promptPath, {
        allowUnresolvedReferences,
        state,
    });
    const previousReferenceSlots = Array.isArray(state.videoPromptHandoff?.referenceSlots)
        ? state.videoPromptHandoff.referenceSlots
        : [];
    const referenceSlots = result.referenceSlots.map((slot) => {
        const previous = previousReferenceSlots.find((item) => item?.id === slot.id);
        return previous?.canvasNodeId
            ? { ...slot, canvasNodeId: previous.canvasNodeId }
            : slot;
    });
    state.videoPromptHandoff = {
        ...(state.videoPromptHandoff ?? {}),
        sourceSkill: "short-drama-video-prompts",
        status: result.errors.length
            ? "blocked"
            : result.unresolvedReferences.length
                ? "draft"
                : "validated",
        referenceMode: result.referenceMode,
        promptPath: path.relative(project, promptPath).replaceAll(path.sep, "/"),
        promptHash: result.hash,
        shotCount: result.shotCount,
        referencePaths: result.referencePaths,
        referenceSlots,
        planReferenceSlots: result.planReferenceSlots,
        audioReferenceSlots: result.audioReferenceSlots,
        missingReferences: result.missingReferences,
        errors: result.errors,
    };
    state.updatedAt = new Date().toISOString();
    writeJson(stateFile, state);
    if (result.errors.length) fail(result.errors.join("; "));
    if (result.unresolvedReferences.length) {
        console.log(`视频提示词已记录为 draft，等待参考图：${result.shotCount} 个镜头`);
    } else {
        console.log(`视频提示词交接有效：${result.shotCount} 个镜头`);
    }
    process.exit(0);
}

if (command === "validate") {
    const state = readState();
    const errors = [];
    const projectProfile = readProjectProfile(errors);
    if (![1, 2, 3, 4].includes(state.schemaVersion)) {
        errors.push("schemaVersion 只支持 1、2、3（旧版兼容）或 4");
    }
    const videoPromptHandoff = state.videoPromptHandoff;
    if (state.schemaVersion >= 3 || videoPromptHandoff !== undefined) {
        validateVideoPromptHandoff(videoPromptHandoff, state, errors);
    }
    const canvas = state.canvas;
    if (canvas !== undefined) {
        validateCanvasState(canvas, errors, state.schemaVersion, state.preproductionStatus);
    }
    validateProjectCanvasContract(projectProfile, state, errors);
    validateAssetTargets(state, errors);
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
        sceneDesignSheetStatus: ["not_started", "reused", "planned", "in_production", "generated", "resolution_invalid", "failed"],
        keyframeStatus: ["not_started", "planned", "in_production", "generated", "resolution_invalid", "approved"],
        videoGenerationStatus: ["not_started", "prepared", "awaiting_video_confirmation", "submitted", "completed", "blocked", "failed"],
    };
    for (const [field, values] of Object.entries(allowed)) {
        if (!values.includes(state[field])) errors.push(`${field} 的值无效`);
    }
    if (state.characterDesignSheetStatus === undefined) {
        if (state.schemaVersion >= 4) errors.push("schemaVersion=4 需要 characterDesignSheetStatus");
    }
    if (state.sceneDesignSheetStatus === undefined) {
        if (state.schemaVersion >= 4) errors.push("schemaVersion=4 需要 sceneDesignSheetStatus");
    }
    if (state.scenePlateStatus !== undefined && state.schemaVersion >= 4) {
        errors.push("schemaVersion=4 不得写入旧字段 scenePlateStatus；请改用 sceneDesignSheetStatus");
    }
    if (["confirmed", "in_production", "completed"].includes(state.preproductionStatus)) {
        if (!state.designReportPath) errors.push("已确认的前期制作需要 designReportPath");
        if (!state.productionConfirmation || !["confirmed", "consumed"].includes(state.productionConfirmation.status)) {
            errors.push("已确认的前期制作需要 productionConfirmation");
        }
    }
    if (state.videoGenerationStatus === "submitted" || state.videoGenerationStatus === "completed") {
        if (!state.activeBatchId) errors.push("已提交或已完成的视频需要 activeBatchId");
        if (!isExplicitTextToVideoBatch(state)
            && (!Array.isArray(state.videoReferenceIds) || state.videoReferenceIds.length < 1)) {
            errors.push("已提交视频需要至少一个参考节点 ID");
        }
    }
    if (intake?.status === "needs_user_input" && state.preproductionStatus === "in_production") {
        errors.push("intake 仍有阻塞问题时不能进入生产");
    }
    if (["ready_for_confirmation", "confirmed", "in_production", "completed"].includes(state.preproductionStatus)) {
        if (videoPromptHandoff?.referenceMode === "mixed") {
            errors.push("mixed 参考模式必须拆分为独立批次后才能进入确认或生产");
        }
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
    if (state.preproductionStatus === "ready_for_confirmation"
        || state.videoGenerationStatus === "awaiting_video_confirmation") {
        const providerTaskIds = collectProviderTaskIds(state);
        if (providerTaskIds.length > 0) {
            errors.push("视频确认闸口前状态树不得包含 provider task ID；必须先回收或清理旧任务状态");
        }
    }
    if (videoPromptHandoff?.status === "blocked" || videoPromptHandoff?.missingReferences?.length > 0) {
        if (["confirmed", "in_production", "completed"].includes(state.preproductionStatus)
            || ["submitted", "completed"].includes(state.videoGenerationStatus)) {
            errors.push("视频提示词交接阻塞时不能确认或提交视频");
        }
    }
    if (videoSegmentChain?.status === "awaiting_previous_output"
        && ["confirmed", "in_production", "completed"].includes(state.preproductionStatus)) {
        errors.push("片段链等待真实尾帧时不能进入确认或生产");
    }
    if (["ready", "in_production", "generated", "tail_frame_extracted"].includes(videoSegmentChain?.status)
        && Array.isArray(videoSegmentChain?.segments)
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
        && !isRecordedFailureState(state)) {
        errors.push("Canvas required 且未连接时不能继续短视频工作流；先完成冷启动连接并更新实时状态");
    }
    validateProductionState(state, errors);
    if (errors.length) fail(errors.join("; "));
    console.log("工作流状态有效");
    process.exit(0);
}

fail(`未知命令：${command}`);

function ensureDirectories() {
    fs.mkdirSync(path.join(project, ".short-drama", "production-batches"), { recursive: true });
    fs.mkdirSync(path.join(project, ".short-drama", "manifests"), { recursive: true });
}

function clearCanvasDerivedBindings(state) {
    if (Array.isArray(state.assetTargets)) {
        for (const target of state.assetTargets) {
            if (!target || typeof target !== "object") continue;
            delete target.nodeId;
            delete target.nodeIds;
        }
    }
    if (state.videoPromptHandoff && typeof state.videoPromptHandoff === "object") {
        if (Array.isArray(state.videoPromptHandoff.referenceSlots)) {
            for (const slot of state.videoPromptHandoff.referenceSlots) {
                if (slot && typeof slot === "object") delete slot.canvasNodeId;
            }
        }
    }
    state.videoReferenceIds = [];
}

function upgradeStateToV4(state) {
    const upgraded = mergeStateDefaults(emptyState, state);
    upgraded.schemaVersion = 4;
    upgraded.canvas = {
        ...emptyState.canvas,
        ...(state.canvas ?? {}),
        requirement: "required",
        referenceBindings: Array.isArray(state.canvas?.referenceBindings)
            ? state.canvas.referenceBindings
            : [],
        nodes: Array.isArray(state.canvas?.nodes) ? state.canvas.nodes : [],
        connections: Array.isArray(state.canvas?.connections) ? state.canvas.connections : [],
    };
    if (upgraded.sceneDesignSheetStatus === "not_started" && state.scenePlateStatus) {
        upgraded.sceneDesignSheetStatus = state.scenePlateStatus;
    }
    return upgraded;
}

function mergeStateDefaults(defaults, current) {
    if (Array.isArray(defaults)) return Array.isArray(current) ? current : [...defaults];
    if (!defaults || typeof defaults !== "object") {
        return current === undefined ? defaults : current;
    }
    const result = {};
    for (const [key, defaultValue] of Object.entries(defaults)) {
        result[key] = current && Object.prototype.hasOwnProperty.call(current, key)
            ? mergeStateDefaults(defaultValue, current[key])
            : mergeStateDefaults(defaultValue, undefined);
    }
    if (current && typeof current === "object" && !Array.isArray(current)) {
        for (const [key, value] of Object.entries(current)) {
            if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = value;
        }
    }
    return result;
}

function normalizeCanvasSnapshot(rawSnapshot, { motionId = null, configNodeId = null } = {}) {
    const result = {
        projectId: null,
        clientId: null,
        title: null,
        lastCheckedAt: null,
        videoConfigNodeId: null,
        videoMotionId: null,
        nodes: [],
        connections: [],
        referenceBindings: [],
        errors: [],
    };
    if (!rawSnapshot || typeof rawSnapshot !== "object" || Array.isArray(rawSnapshot)) {
        result.errors.push("Canvas 原始快照必须是 JSON 对象");
        return result;
    }

    const containers = [
        rawSnapshot,
        rawSnapshot.canvas,
        rawSnapshot.state,
        rawSnapshot.data,
    ].filter((value) => value && typeof value === "object" && !Array.isArray(value));
    const firstValue = (keys) => {
        for (const container of containers) {
            for (const key of keys) {
                if (container[key] !== undefined && container[key] !== null) return container[key];
            }
        }
        return null;
    };
    const firstArray = (keys) => {
        const value = firstValue(keys);
        return Array.isArray(value) ? value : null;
    };

    result.projectId = firstValue(["projectId", "canvasProjectId"]);
    result.clientId = firstValue(["clientId", "sessionId", "clientSessionId"]);
    result.title = firstValue(["title", "name"]);
    if (typeof result.projectId === "string") result.projectId = result.projectId.trim();
    if (typeof result.clientId === "string") result.clientId = result.clientId.trim();
    if (typeof result.title === "string") result.title = result.title.trim();
    result.lastCheckedAt = firstValue(["lastCheckedAt", "checkedAt", "updatedAt"]);
    if (!result.lastCheckedAt) result.lastCheckedAt = new Date().toISOString();
    if (!isValidDateString(result.lastCheckedAt)) {
        result.errors.push("Canvas 原始快照的 lastCheckedAt 必须是有效 ISO 时间字符串");
    }
    if (typeof result.projectId !== "string" || !result.projectId.trim()) {
        result.errors.push("Canvas 原始快照缺少 projectId");
    }
    if (typeof result.clientId !== "string" || !result.clientId.trim()) {
        result.errors.push("Canvas 原始快照缺少共享 clientId");
    }
    if (result.title !== null && typeof result.title !== "string") {
        result.errors.push("Canvas 原始快照 title 必须是字符串");
    }

    const rawNodes = firstArray(["nodes"]);
    if (!rawNodes) {
        result.errors.push("Canvas 原始快照缺少 nodes 数组");
    } else {
        const seen = new Set();
        for (const [index, node] of rawNodes.entries()) {
            const id = nodeIdentity(node);
            const type = typeof node?.type === "string" && node.type
                ? node.type
                : (typeof node?.nodeType === "string" ? node.nodeType : null);
            if (!id) {
                result.errors.push(`Canvas 原始快照 nodes[${index}] 缺少 id/nodeId`);
                continue;
            }
            if (seen.has(id)) {
                result.errors.push(`Canvas 原始快照存在重复节点：${id}`);
                continue;
            }
            seen.add(id);
            if (!type) {
                result.errors.push(`Canvas 原始快照 nodes[${index}] 缺少 type`);
                continue;
            }
            const metadata = node.metadata && typeof node.metadata === "object"
                ? { ...node.metadata }
                : {};
            const status = metadata.status ?? metadata.generationStatus ?? node.status ?? null;
            const content = metadata.content ?? metadata.imageData ?? node.content ?? null;
            const storageKey = metadata.storageKey ?? node.storageKey ?? null;
            const mimeType = metadata.mimeType ?? metadata.mime ?? node.mimeType ?? null;
            const naturalWidth = Number(
                metadata.naturalWidth ?? node.naturalWidth ?? node.natural_size?.width ?? NaN,
            );
            const naturalHeight = Number(
                metadata.naturalHeight ?? node.naturalHeight ?? node.natural_size?.height ?? NaN,
            );
            const hasMediaEvidence = typeof content === "string" && content.trim().length > 0
                || typeof storageKey === "string" && storageKey.trim().length > 0;
            const intrinsicDimensions = getImageDataDimensions(content);
            if (intrinsicDimensions
                && (intrinsicDimensions.width !== naturalWidth
                    || intrinsicDimensions.height !== naturalHeight)) {
                result.errors.push(
                    `Canvas 原始快照 nodes[${index}] 的图片自然尺寸与媒体内容不一致：`
                    + `${naturalWidth}x${naturalHeight} != `
                    + `${intrinsicDimensions.width}x${intrinsicDimensions.height}`,
                );
            }
            const mediaAvailable = type === "image"
                && status === "success"
                && hasMediaEvidence
                && typeof mimeType === "string"
                && mimeType.toLowerCase().startsWith("image/")
                && Number.isInteger(naturalWidth)
                && naturalWidth > 0
                && Number.isInteger(naturalHeight)
                && naturalHeight > 0;
            delete metadata.content;
            delete metadata.imageData;
            delete metadata.storageKey;
            metadata.status = status;
            metadata.mimeType = mimeType;
            if (Number.isInteger(naturalWidth) && naturalWidth > 0) metadata.naturalWidth = naturalWidth;
            if (Number.isInteger(naturalHeight) && naturalHeight > 0) metadata.naturalHeight = naturalHeight;
            const normalizedNode = { id, type, metadata };
            if (type === "image") normalizedNode.mediaAvailable = mediaAvailable;
            result.nodes.push(normalizedNode);
        }
    }

    const rawConnections = firstArray(["connections", "edges"]);
    if (!rawConnections) {
        result.errors.push("Canvas 原始快照缺少 connections/edges 数组");
    } else {
        for (const [index, edge] of rawConnections.entries()) {
            const fromNodeId = edge?.fromNodeId
                ?? edge?.sourceNodeId
                ?? edge?.sourceId
                ?? edge?.from
                ?? edge?.source;
            const toNodeId = edge?.toNodeId
                ?? edge?.targetNodeId
                ?? edge?.targetId
                ?? edge?.to
                ?? edge?.target;
            if (typeof fromNodeId !== "string" || typeof toNodeId !== "string"
                || !fromNodeId || !toNodeId) {
                result.errors.push(`Canvas 原始快照 connections[${index}] 缺少端点`);
                continue;
            }
            result.connections.push({ fromNodeId, toNodeId });
        }
    }

    const rawBindings = firstArray(["referenceBindings", "bindings"]);
    const configNodes = result.nodes.filter((node) => node.type === "config");
    const explicitConfigNodeId = firstValue(["videoConfigNodeId", "configNodeId"]);
    const explicitMotionId = firstValue(["videoMotionId", "motionId"]);
    if (typeof explicitMotionId === "string" && /^MOTION-[A-Z0-9-]+$/u.test(explicitMotionId.trim())) {
        result.videoMotionId = explicitMotionId.trim().toUpperCase();
    }
    const motionConfigNodes = motionId
        ? configNodes.filter((node) => node.metadata?.motionId === motionId)
        : [];
    const preferredConfigNodeId = typeof explicitConfigNodeId === "string" && explicitConfigNodeId.trim()
        ? explicitConfigNodeId.trim()
        : (typeof configNodeId === "string" && configNodeId.trim() ? configNodeId.trim() : null);
    const preferredConfig = preferredConfigNodeId
        ? result.nodes.find((node) => node.id === preferredConfigNodeId)
        : null;
    const preferredConfigMatchesMotion = preferredConfig
        && (!motionId || preferredConfig.metadata?.motionId === motionId);
    if (typeof explicitConfigNodeId === "string" && explicitConfigNodeId.trim()) {
        result.videoConfigNodeId = explicitConfigNodeId.trim();
    } else if (preferredConfigMatchesMotion) {
        result.videoConfigNodeId = preferredConfigNodeId;
    } else if (motionConfigNodes.length === 1) {
        result.videoConfigNodeId = motionConfigNodes[0].id;
    } else if (motionConfigNodes.length > 1) {
        result.errors.push(`Canvas 原始快照存在多个当前 MOTION config 节点：${motionId}`);
    } else if (configNodes.length === 1) {
        result.videoConfigNodeId = configNodes[0].id;
    }
    if (rawBindings) {
        for (const [index, binding] of rawBindings.entries()) {
            const sourceNodeId = binding?.sourceNodeId ?? binding?.fromNodeId ?? binding?.source;
            const targetNodeId = binding?.targetNodeId ?? binding?.toNodeId ?? binding?.target;
            const role = binding?.role ?? binding?.assetRole;
            if (![sourceNodeId, targetNodeId, role].every((value) =>
                typeof value === "string" && value)) {
                result.errors.push(`Canvas 原始快照 referenceBindings[${index}] 字段不完整`);
                continue;
            }
            result.referenceBindings.push({
                sourceNodeId,
                targetNodeId,
                role,
                direction: "image->video-config",
            });
        }
        const targetNodeIds = [...new Set(result.referenceBindings.map((binding) => binding.targetNodeId))];
        if (targetNodeIds.length === 1) {
            if (result.videoConfigNodeId && result.videoConfigNodeId !== targetNodeIds[0]) {
                result.errors.push(
                    `Canvas 原始快照 videoConfigNodeId 与 referenceBindings 目标不一致：`
                    + `${result.videoConfigNodeId} != ${targetNodeIds[0]}`,
                );
            }
            result.videoConfigNodeId = targetNodeIds[0];
        } else if (targetNodeIds.length > 1) {
            result.errors.push("Canvas 原始快照 referenceBindings 必须属于同一个视频 config");
        }
    } else {
        const nodeMap = new Map(result.nodes.map((node) => [node.id, node]));
        if (result.videoConfigNodeId) {
            for (const connection of result.connections) {
                const source = nodeMap.get(connection.fromNodeId);
                if (source?.type !== "image" || connection.toNodeId !== result.videoConfigNodeId) continue;
                const role = source.metadata?.shortDramaAssetRole;
                if (!role) {
                    result.errors.push(
                        `无法从 Canvas 连接推导图片语义 role：${connection.fromNodeId}`,
                    );
                    continue;
                }
                result.referenceBindings.push({
                    sourceNodeId: connection.fromNodeId,
                    targetNodeId: connection.toNodeId,
                    role,
                    direction: "image->video-config",
                });
            }
        }
    }
    const selectedConfig = result.nodes.find((node) => node.id === result.videoConfigNodeId);
    if (result.videoConfigNodeId && !selectedConfig) {
        result.errors.push(`Canvas 原始快照 videoConfigNodeId 引用了不存在的节点：${result.videoConfigNodeId}`);
    } else if (selectedConfig && selectedConfig.type !== "config") {
        result.errors.push(`Canvas 原始快照 videoConfigNodeId 不是 config 节点：${result.videoConfigNodeId}`);
    } else if (selectedConfig) {
        const configMotionId = selectedConfig.metadata?.motionId;
        if (!/^MOTION-[A-Z0-9-]+$/u.test(String(configMotionId ?? ""))) {
            result.errors.push("Canvas 当前视频 config 缺少有效的 metadata.motionId");
        } else if (result.videoMotionId && result.videoMotionId !== configMotionId) {
            result.errors.push(
                `Canvas 原始快照 videoMotionId 与 config metadata.motionId 不一致：`
                + `${result.videoMotionId} != ${configMotionId}`,
            );
        } else {
            result.videoMotionId = configMotionId;
        }
    }
    return result;
}

function getImageDataDimensions(content) {
    if (typeof content !== "string") return null;
    const match = content.trim().match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/iu);
    if (!match) return null;
    let bytes;
    try {
        bytes = Buffer.from(match[2].replace(/\s+/gu, ""), "base64");
    } catch {
        return null;
    }
    if (match[1].toLowerCase() === "png"
        && bytes.length >= 24
        && bytes.toString("ascii", 1, 4) === "PNG"
        && bytes.toString("ascii", 12, 16) === "IHDR") {
        return {
            width: bytes.readUInt32BE(16),
            height: bytes.readUInt32BE(20),
        };
    }
    if (!["jpeg", "jpg"].includes(match[1].toLowerCase()) || bytes.length < 4) return null;
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
    let offset = 2;
    while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xFF) {
            offset += 1;
            continue;
        }
        const marker = bytes[offset + 1];
        offset += 2;
        if (marker === 0xD8 || marker === 0xD9) continue;
        if (offset + 2 > bytes.length) return null;
        const segmentLength = bytes.readUInt16BE(offset);
        if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
        const isStartOfFrame = marker >= 0xC0 && marker <= 0xC3
            || marker >= 0xC5 && marker <= 0xC7
            || marker >= 0xC9 && marker <= 0xCB
            || marker >= 0xCD && marker <= 0xCF;
        if (isStartOfFrame && segmentLength >= 7) {
            return {
                width: bytes.readUInt16BE(offset + 5),
                height: bytes.readUInt16BE(offset + 3),
            };
        }
        offset += segmentLength;
    }
    return null;
}

function readState() {
    if (!fs.existsSync(stateFile)) fail(`工作流状态缺失：${stateFile}；请先运行 init`);
    try {
        const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
        if (!state || typeof state !== "object" || Array.isArray(state)) {
            fail("工作流状态必须是 JSON 对象");
        }
        return state;
    } catch (error) {
        fail(`工作流状态不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
    }
}

function readProjectProfile(errors) {
    if (!fs.existsSync(projectProfileFile)) return null;
    try {
        const profile = JSON.parse(fs.readFileSync(projectProfileFile, "utf8"));
        if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
            errors.push("short-drama.json 必须是 JSON 对象");
            return null;
        }
        return profile;
    } catch (error) {
        errors.push(`short-drama.json 不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

function validateProjectCanvasContract(projectProfile, state, errors) {
    const backend = projectProfile?.production_profile?.backend;
    const canvas = state.canvas;
    const textToVideoBatch = isExplicitTextToVideoBatch(state);

    if (state.schemaVersion >= 4 && canvas?.requirement !== "required") {
        errors.push("schemaVersion=4 的短视频工作流必须使用 canvas.requirement=required");
    }
    if (backend === "infinite-canvas" && canvas?.requirement !== "required") {
        errors.push("short-drama.json 已选择 infinite-canvas 时，canvas.requirement 必须为 required");
    }
    if (state.schemaVersion >= 4) {
        if (!state.currentCanvasProjectId && !isRecordedFailureState(state)) {
            errors.push("schemaVersion=4 需要 currentCanvasProjectId");
        }
        if (state.projectId !== null
            && state.projectId !== undefined
            && typeof state.projectId !== "string") {
            errors.push("根 projectId 必须是字符串或 null");
        }
        if (state.projectId && state.currentCanvasProjectId
            && state.projectId !== state.currentCanvasProjectId) {
            errors.push("根 projectId 与 currentCanvasProjectId 不一致");
        }
        if (state.currentCanvasProjectId && canvas?.projectId
            && state.currentCanvasProjectId !== canvas.projectId) {
            errors.push("currentCanvasProjectId 与 canvas.projectId 不一致");
        }
    }
    if (["ready_for_confirmation", "confirmed", "in_production", "completed"].includes(state.preproductionStatus)) {
        if (state.videoPromptHandoff?.shotCount !== 1) {
            errors.push("当前 Canvas 确认批次必须只对应一个 MOTION-* 镜头；多镜头提示词请拆分批次");
        }
        validateCanvasSnapshot(canvas, state, errors);
        validateCanvasReferenceSemantics(state, canvas, errors);
        validateVideoReferenceIds(state, canvas, textToVideoBatch, errors);
        validateProjectTargetAspect(projectProfile, state, canvas, errors);
        if (!Array.isArray(canvas?.referenceBindings)) {
            errors.push("Canvas referenceBindings 必须是数组");
        } else if (textToVideoBatch && canvas.referenceBindings.length > 0) {
            errors.push("明确的 text-to-video 批次不得存在参考绑定");
        } else if (!textToVideoBatch && canvas.referenceBindings.length === 0) {
            errors.push("进入视频确认闸口前必须有实时参考绑定");
        } else if (Array.isArray(state.assetTargets)) {
            if (textToVideoBatch && state.assetTargets.some((target) =>
                ["generated", "reused"].includes(target?.status))) {
                errors.push("明确的 text-to-video 批次不能把图片资产标记为已完成并纳入当前批次");
            }
            const boundAssets = new Set(canvas.referenceBindings.map((binding) =>
                `${binding.sourceNodeId}:${binding.role}`));
            for (const [index, target] of state.assetTargets.entries()) {
                if (!["character-design-sheet", "scene-design-sheet", "keyframe", "ending-keyframe", "prop/state"].includes(target?.assetType)
                    || !["generated", "reused"].includes(target?.status)
                    || getAssetNodeIds(target).length === 0) {
                    continue;
                }
                if (!getAssetNodeIds(target).some((nodeId) => boundAssets.has(`${nodeId}:${target.assetType}`))) {
                    errors.push(`assetTargets[${index}] 已完成参考资产没有对应的实时 Canvas 绑定`);
                }
            }
        }
    }
}

function isExplicitTextToVideoBatch(state) {
    const handoff = state.videoPromptHandoff;
    return handoff?.status === "validated"
        && handoff.referenceMode === "text-to-video"
        && Array.isArray(handoff.referencePaths)
        && handoff.referencePaths.length === 0
        && Array.isArray(handoff.missingReferences)
        && handoff.missingReferences.length === 0;
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
        if (["ready", "routed"].includes(intake.status) && intake.route.length === 0) {
            errors.push("intake.ready/routed 需要至少一个路由项");
        }
        if (intake.status === "routed"
            && intake.route.some((item) => !["complete"].includes(item?.status))) {
            errors.push("intake.routed 不能保留 pending、active 或 blocked 路由项");
        }
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

function validateVideoPromptHandoff(handoff, state, errors) {
    if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) {
        errors.push("schemaVersion=3 需要 videoPromptHandoff 对象");
        return;
    }
    const statuses = ["not_started", "requested", "draft", "blocked", "validated", "superseded"];
    if (!statuses.includes(handoff.status)) errors.push("videoPromptHandoff.status 的值无效");
    if (handoff.sourceSkill !== "short-drama-video-prompts") {
        errors.push("videoPromptHandoff.sourceSkill 必须为 short-drama-video-prompts");
    }
    const referenceMode = handoff.referenceMode ?? "reference";
    if (!["reference", "text-to-video", "mixed"].includes(referenceMode)) {
        errors.push("videoPromptHandoff.referenceMode 的值无效");
    }
    for (const field of ["referencePaths", "missingReferences", "errors"]) {
        if (!Array.isArray(handoff[field])) errors.push(`videoPromptHandoff.${field} 必须是数组`);
    }
    if (handoff.referenceSlots !== undefined && !Array.isArray(handoff.referenceSlots)) {
        errors.push("videoPromptHandoff.referenceSlots 必须是数组");
    }
    if (handoff.planReferenceSlots !== undefined && !Array.isArray(handoff.planReferenceSlots)) {
        errors.push("videoPromptHandoff.planReferenceSlots 必须是数组");
    }
    if (handoff.audioReferenceSlots !== undefined && !Array.isArray(handoff.audioReferenceSlots)) {
        errors.push("videoPromptHandoff.audioReferenceSlots 必须是数组");
    }
    if (Array.isArray(handoff.referenceSlots)) {
        const allowedUses = new Set(["身份", "造型状态", "地理", "构图", "尺度", "效果", "起始帧", "结束帧", "风格"]);
        for (const [index, slot] of handoff.referenceSlots.entries()) {
            for (const field of ["id", "path", "use", "control", "notControl"]) {
                if (typeof slot?.[field] !== "string" || !slot[field].trim()) {
                    errors.push(`videoPromptHandoff.referenceSlots[${index}].${field} 缺失`);
                }
            }
            if (typeof slot?.id === "string" && !/^REF-\S+$/u.test(slot.id)) {
                errors.push(`videoPromptHandoff.referenceSlots[${index}].id 必须是 REF-*`);
            }
            if (typeof slot?.use === "string" && !allowedUses.has(slot.use)) {
                errors.push(`videoPromptHandoff.referenceSlots[${index}].use 不在允许的用途词表中`);
            }
            if (!Number.isInteger(slot?.order) || slot.order < 1) {
                errors.push(`videoPromptHandoff.referenceSlots[${index}].order 无效`);
            }
            if (slot?.canvasNodeId !== undefined
                && (typeof slot.canvasNodeId !== "string" || !slot.canvasNodeId.trim())) {
                errors.push(`videoPromptHandoff.referenceSlots[${index}].canvasNodeId 必须是非空字符串或省略`);
            }
        }
    }
    if (Array.isArray(handoff.planReferenceSlots)) {
        const allowedUses = new Set(["身份", "造型状态", "地理", "构图", "尺度", "效果", "起始帧", "结束帧", "风格"]);
        for (const [index, slot] of handoff.planReferenceSlots.entries()) {
            for (const field of ["id", "path", "use", "control", "notControl"]) {
                if (typeof slot?.[field] !== "string" || !slot[field].trim()) {
                    errors.push(`videoPromptHandoff.planReferenceSlots[${index}].${field} 缺失`);
                }
            }
            if (typeof slot?.id === "string" && !/^PLAN-\S+$/u.test(slot.id)) {
                errors.push(`videoPromptHandoff.planReferenceSlots[${index}].id 必须是 PLAN-*`);
            }
            if (typeof slot?.use === "string" && !allowedUses.has(slot.use)) {
                errors.push(`videoPromptHandoff.planReferenceSlots[${index}].use 不在允许的用途词表中`);
            }
            if (!Number.isInteger(slot?.order) || slot.order < 1) {
                errors.push(`videoPromptHandoff.planReferenceSlots[${index}].order 无效`);
            }
        }
    }
    if (Array.isArray(handoff.audioReferenceSlots)) {
        const audioGroups = new Map();
        for (const [index, slot] of handoff.audioReferenceSlots.entries()) {
            for (const field of ["id", "path", "title", "use", "character", "control", "notControl"]) {
                if (typeof slot?.[field] !== "string" || !slot[field].trim()) {
                    errors.push(`videoPromptHandoff.audioReferenceSlots[${index}].${field} 缺失`);
                }
            }
            if (typeof slot?.id === "string" && !/^REF-\S+$/u.test(slot.id)) {
                errors.push(`videoPromptHandoff.audioReferenceSlots[${index}].id 必须是 REF-*`);
            }
            if (slot?.use !== "音色") {
                errors.push(`videoPromptHandoff.audioReferenceSlots[${index}].use 必须为 音色`);
            }
            if (!Number.isInteger(slot?.order) || slot.order < 1) {
                errors.push(`videoPromptHandoff.audioReferenceSlots[${index}].order 无效`);
            }
            const group = typeof slot?.shotId === "string" && slot.shotId
                ? slot.shotId
                : "__legacy__";
            if (!audioGroups.has(group)) audioGroups.set(group, []);
            audioGroups.get(group).push(slot);
        }
        for (const [group, slots] of audioGroups.entries()) {
            const orders = slots.map((slot) => slot?.order).filter(Number.isInteger).sort((a, b) => a - b);
            if (new Set(orders).size !== orders.length
                || orders.some((order, index) => order !== index + 1)) {
                errors.push(`参考音频槽位${group === "__legacy__" ? "" : `[${group}]`} 的 order 必须从 1 连续且不重复`);
            }
            const ids = slots.map((slot) => slot?.id).filter(Boolean);
            if (new Set(ids).size !== ids.length) {
                errors.push(`参考音频槽位${group === "__legacy__" ? "" : `[${group}]`} 的 ID 不能重复`);
            }
        }
    }
    const allReferenceSlots = [
        ...(Array.isArray(handoff.referenceSlots) ? handoff.referenceSlots : []),
        ...(Array.isArray(handoff.planReferenceSlots) ? handoff.planReferenceSlots : []),
    ];
    const imageSlotIds = [
        ...allReferenceSlots,
    ];
    const imageSlotIdSet = new Set();
    for (const slot of imageSlotIds) {
        if (imageSlotIdSet.has(slot?.id)) errors.push(`视频提示词 REF/PLAN 槽位 ID 重复：${slot.id}`);
        imageSlotIdSet.add(slot?.id);
    }
    if (allReferenceSlots.length) {
        const groups = new Map();
        for (const slot of allReferenceSlots) {
            const group = typeof slot?.shotId === "string" && slot.shotId
                ? slot.shotId
                : "__legacy__";
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group).push(slot);
        }
        for (const [group, slots] of groups.entries()) {
            const orders = slots.map((slot) => slot?.order).filter(Number.isInteger).sort((a, b) => a - b);
            if (new Set(orders).size !== orders.length
                || orders.some((order, index) => order !== index + 1)) {
                errors.push(`视频提示词参考槽位${group === "__legacy__" ? "" : `[${group}]`} 的 order 必须从 1 连续且不重复`);
            }
        }
    }
    if (Array.isArray(handoff.referenceSlots)) {
        const slotPaths = new Set(handoff.referenceSlots.map((slot) => slot?.path).filter(Boolean));
        for (const referencePath of handoff.referencePaths ?? []) {
            if (!slotPaths.has(referencePath)) {
                errors.push(`videoPromptHandoff.referencePaths 缺少对应 REF 槽位：${referencePath}`);
            }
        }
        for (const slotPath of slotPaths) {
            if (!(handoff.referencePaths ?? []).includes(slotPath)) {
                errors.push(`videoPromptHandoff.referenceSlots 存在未登记的参考路径：${slotPath}`);
            }
        }
    }
    if (handoff.promptPath !== null && typeof handoff.promptPath !== "string") {
        errors.push("videoPromptHandoff.promptPath 必须是项目内相对路径或 null");
    }
    if (handoff.promptPath) {
        const promptPath = resolveProjectPath(handoff.promptPath, "videoPromptHandoff.promptPath", errors);
        if (promptPath) {
            if (!fs.existsSync(promptPath)) {
                errors.push(`视频提示词文件不存在：${handoff.promptPath}`);
            } else if (!fs.statSync(promptPath).isFile()) {
                errors.push(`视频提示词路径不是文件：${handoff.promptPath}`);
            } else if (handoff.promptHash) {
                const actualHash = `sha256:${crypto.createHash("sha256")
                    .update(fs.readFileSync(promptPath))
                    .digest("hex")}`;
                if (actualHash !== handoff.promptHash) {
                    errors.push("videoPromptHandoff.promptHash 与当前提示词文件不一致");
                }
            }
        }
    }
    if (!Number.isInteger(handoff.shotCount) || handoff.shotCount < 0) {
        errors.push("videoPromptHandoff.shotCount 必须是非负整数");
    }
    if (handoff.status === "validated") {
        if (handoff.shotCount < 1) errors.push("已校验的视频提示词至少需要一个 MOTION 镜头");
        if (!handoff.promptPath) errors.push("已校验的视频提示词需要 promptPath");
        if (!handoff.promptHash) errors.push("已校验的视频提示词需要 promptHash");
        if (handoff.errors?.length || handoff.missingReferences?.length) {
            errors.push("validated 的视频提示词不能保留错误或缺失参考图");
        }
        if (handoff.planReferenceSlots?.length) {
            errors.push("validated 的视频提示词不能保留 PLAN 参考槽位");
        }
        if (handoff.audioReferenceSlots?.length) {
            for (const slot of handoff.audioReferenceSlots) {
                errors.push(...validateAudioReferencePath(slot.path, state));
            }
        }
        if (referenceMode === "text-to-video" && (handoff.referencePaths?.length ?? 0) > 0) {
            errors.push("text-to-video 交接不能包含 REF 参考图");
        }
        if (referenceMode === "text-to-video"
            && Array.isArray(handoff.referenceSlots)
            && handoff.referenceSlots.length > 0) {
            errors.push("text-to-video 交接不能保留 REF 槽位");
        }
        if (referenceMode === "reference" && (handoff.referencePaths?.length ?? 0) === 0) {
            errors.push("reference 模式的已校验视频提示词至少需要一张真实参考图");
        }
        if (referenceMode === "mixed" && (handoff.referencePaths?.length ?? 0) === 0) {
            errors.push("mixed 模式的已校验视频提示词至少需要一张真实参考图");
        }
        if (referenceMode !== "text-to-video"
            && (!Array.isArray(handoff.referenceSlots) || handoff.referenceSlots.length === 0)) {
            errors.push("有参考图的视频提示词必须保留每个 REF 槽位的用途和控制语义");
        }
        for (const referencePath of handoff.referencePaths ?? []) {
            const pathErrors = [];
            const resolved = resolveProjectPath(referencePath, "videoPromptHandoff.referencePaths", pathErrors);
            if (pathErrors.length) {
                errors.push(...pathErrors);
                continue;
            }
            errors.push(...validateReferencePath(referencePath, state));
        }
    }
}

function validateReferencePath(referencePath, state) {
    const errors = [];
    const pathErrors = [];
    const resolved = resolveProjectPath(referencePath, "视频提示词参考图", pathErrors);
    if (pathErrors.length) return pathErrors;
    if (resolved && fs.existsSync(resolved)) {
        if (!fs.statSync(resolved).isFile()) {
            return [`视频提示词参考图路径不是文件：${referencePath}`];
        }
        if (!inspectImageFile(resolved)) {
            return [`视频提示词参考图不是可读取图片：${referencePath}`];
        }
        return errors;
    }
    const registered = Array.isArray(state.assetTargets) && state.assetTargets.some((target) => {
        if (target?.projectRelativePath !== referencePath
            || !["generated", "reused"].includes(target.status)
            || target.validationStatus !== "accepted") {
            return false;
        }
        return getAssetNodeIds(target).some((nodeId) => {
            const node = state.canvas?.nodes?.find((item) => nodeIdentity(item) === nodeId);
            return node?.type === "image" && node.mediaAvailable === true;
        });
    });
    if (!registered) {
        errors.push(`视频提示词参考图既不是可读取项目图片，也没有已验收 Canvas 图片节点登记：${referencePath}`);
    }
    return errors;
}

function validateAudioReferencePath(referencePath) {
    const pathErrors = [];
    const resolved = resolveProjectPath(referencePath, "视频提示词参考音频", pathErrors);
    if (pathErrors.length) return pathErrors;
    if (!/\.(?:wav|mp3|m4a|aac|flac|opus)$/iu.test(referencePath)) {
        return [`视频提示词参考音频格式不受支持：${referencePath}`];
    }
    if (!resolved || !fs.existsSync(resolved)) {
        return [`视频提示词参考音频不是可读取项目文件：${referencePath}`];
    }
    if (!fs.statSync(resolved).isFile()) {
        return [`视频提示词参考音频路径不是文件：${referencePath}`];
    }
    return [];
}

function validateVideoSegmentChain(chain, errors) {
    if (!chain || typeof chain !== "object" || Array.isArray(chain)) {
        errors.push("schemaVersion=3 需要 videoSegmentChain 对象");
        return;
    }
    const statuses = [
        "not_started",
        "planned",
        "awaiting_previous_output",
        "ready",
        "in_production",
        "generated",
        "tail_frame_extracted",
        "blocked",
        "completed",
    ];
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

function validateCanvasState(canvas, errors, schemaVersion = 4, preproductionStatus = "draft") {
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
    if (canvas.origin !== null && canvas.origin !== undefined
        && (typeof canvas.origin !== "string" || normalizeCanvasOrigin(canvas.origin) !== canvas.origin)) {
        errors.push("canvas.origin 必须是规范化的 http(s) origin 或 null");
    }
    if (canvas.projectId !== null && typeof canvas.projectId !== "string") {
        errors.push("canvas.projectId 必须是字符串或 null");
    }
    if (canvas.routePath !== null && typeof canvas.routePath !== "string") {
        errors.push("canvas.routePath 必须是字符串或 null");
    }
    if (canvas.clientId !== null && typeof canvas.clientId !== "string") {
        errors.push("canvas.clientId 必须是字符串或 null");
    }
    if (canvas.title !== null && typeof canvas.title !== "string") {
        errors.push("canvas.title 必须是字符串或 null");
    }
    if (canvas.videoConfigNodeId !== null
        && canvas.videoConfigNodeId !== undefined
        && (typeof canvas.videoConfigNodeId !== "string" || !canvas.videoConfigNodeId.trim())) {
        errors.push("canvas.videoConfigNodeId 必须是非空字符串或 null");
    }
    if (canvas.videoMotionId !== null
        && canvas.videoMotionId !== undefined
        && (typeof canvas.videoMotionId !== "string" || !/^MOTION-[A-Z0-9-]+$/u.test(canvas.videoMotionId))) {
        errors.push("canvas.videoMotionId 必须是 MOTION-* 字符串或 null");
    }
    if (canvas.lastIssue !== null && typeof canvas.lastIssue !== "string") {
        errors.push("canvas.lastIssue 必须是字符串或 null");
    }
    if (canvas.lastCheckedAt !== null && !isValidDateString(canvas.lastCheckedAt)) {
        errors.push("canvas.lastCheckedAt 必须是有效 ISO 时间字符串");
    }
    if (canvas.status === "connected" && !canvas.projectId) {
        errors.push("canvas.status=connected 时需要 projectId");
    }
    if (canvas.status === "connected" && !canvas.routePath) {
        errors.push("canvas.status=connected 时需要 routePath");
    }
    if (canvas.status === "connected" && !canvas.clientId) {
        errors.push("canvas.status=connected 时需要 clientId");
    }
    if (schemaVersion >= 4 && canvas.status === "connected" && !canvas.origin) {
        errors.push("schemaVersion=4 的已连接 Canvas 必须记录 origin");
    }
    if (canvas.status === "connected" && !canvas.title) {
        errors.push("canvas.status=connected 时需要 title");
    }
    if (canvas.status === "connected" && !canvas.lastCheckedAt) {
        errors.push("canvas.status=connected 时需要 lastCheckedAt");
    }
    if (canvas.routePath && canvas.projectId) {
        const routeMatch = canvas.routePath.match(/^\/canvas\/([^/?#]+)$/u);
        if (!routeMatch) {
            errors.push("canvas.routePath 必须匹配 /canvas/<projectId>");
        } else if (routeMatch[1] !== canvas.projectId) {
            errors.push("canvas.routePath 中的 projectId 与 canvas.projectId 不一致");
        }
    }
    if (canvas.status === "connected" && canvas.lastIssue) {
        errors.push("canvas.status=connected 时 lastIssue 必须为空");
    }
    const canvasHasWrites = (canvas.referenceBindings?.length ?? 0) > 0
        || (canvas.nodes?.length ?? 0) > 0
        || (canvas.connections?.length ?? 0) > 0;
    if (schemaVersion >= 4 && canvas.status === "connected"
        && canvas.title
        && isDefaultCanvasTitle(canvas.title)
        && (canvasHasWrites
            || ["ready_for_confirmation", "confirmed", "in_production", "completed"].includes(preproductionStatus))) {
        errors.push("Canvas 创建节点或进入确认前必须保存生产语义的画布标题");
    }
    if (["unavailable", "degraded", "mismatch"].includes(canvas.status) && !canvas.lastIssue) {
        errors.push(`canvas.status=${canvas.status} 时必须记录 lastIssue`);
    }
    if (schemaVersion >= 4 && canvas.requirement !== "required") {
        errors.push("schemaVersion=4 的 Canvas requirement 必须为 required");
    }
    if (canvas.referenceBindings === undefined && schemaVersion < 4) return;
    if (!Array.isArray(canvas.referenceBindings)) {
        errors.push("canvas.referenceBindings 必须是数组");
    } else {
        for (const [index, binding] of canvas.referenceBindings.entries()) {
            if (!binding || typeof binding !== "object") {
                errors.push(`canvas.referenceBindings[${index}] 必须是对象`);
                continue;
            }
            for (const field of ["sourceNodeId", "targetNodeId", "role", "direction"]) {
                if (typeof binding[field] !== "string" || !binding[field]) {
                    errors.push(`canvas.referenceBindings[${index}].${field} 缺失`);
                }
            }
            if (!["character-design-sheet", "scene-design-sheet", "keyframe", "ending-keyframe", "prop/state"].includes(binding.role)) {
                errors.push(`canvas.referenceBindings[${index}].role 无效`);
            }
            if (binding.direction !== "image->video-config") {
                errors.push(`canvas.referenceBindings[${index}] 必须使用 image->video-config`);
            }
            if (binding.sourceNodeId === binding.targetNodeId) {
                errors.push(`canvas.referenceBindings[${index}] sourceNodeId 与 targetNodeId 不能相同`);
            }
        }
        const bindingKeys = new Set();
        const targetNodeIds = new Set();
        const singletonRoles = new Set(["scene-design-sheet", "keyframe", "ending-keyframe"]);
        for (const binding of canvas.referenceBindings) {
            const key = `${binding.sourceNodeId}->${binding.targetNodeId}`;
            if (bindingKeys.has(key)) errors.push(`canvas.referenceBindings 存在重复连接：${key}`);
            bindingKeys.add(key);
            targetNodeIds.add(binding.targetNodeId);
            if (singletonRoles.has(binding.role)) {
                const roleKey = `${binding.targetNodeId}:${binding.role}`;
                if (bindingKeys.has(`role:${roleKey}`)) {
                    errors.push(`canvas.referenceBindings 不能重复使用语义角色：${binding.role}`);
                }
                bindingKeys.add(`role:${roleKey}`);
            }
        }
        const sourceNodeIds = canvas.referenceBindings.map((binding) => binding.sourceNodeId);
        if (new Set(sourceNodeIds).size !== sourceNodeIds.length) {
            errors.push("canvas.referenceBindings 不能让同一图片节点承担多个语义 role");
        }
        if (targetNodeIds.size > 1) {
            errors.push("canvas.referenceBindings 必须属于同一个视频配置节点");
        }
    }
    for (const field of ["nodes", "connections"]) {
        if (canvas[field] !== undefined && !Array.isArray(canvas[field])) {
            errors.push(`canvas.${field} 必须是数组`);
        }
    }
}

function validateCanvasSnapshot(canvas, state, errors) {
    if (!Array.isArray(canvas?.nodes) || !Array.isArray(canvas?.connections)) {
        errors.push("进入确认阶段必须保存实时 Canvas nodes 和 connections 快照");
        return;
    }
    const nodes = new Map();
    for (const [index, node] of canvas.nodes.entries()) {
        const id = nodeIdentity(node);
        if (!id) {
            errors.push(`canvas.nodes[${index}] 缺少 nodeId/id`);
            continue;
        }
        if (nodes.has(id)) errors.push(`canvas.nodes 存在重复节点：${id}`);
        nodes.set(id, node);
    }
    const configNodes = [...nodes.values()].filter((node) => node?.type === "config");
    const currentMotionId = getCurrentMotionId(state);
    if (!currentMotionId) {
        errors.push("进入确认阶段必须明确当前批次唯一的 MOTION-*");
    }
    const matchingConfigNodes = currentMotionId
        ? configNodes.filter((node) => node?.metadata?.motionId === currentMotionId)
        : [];
    const bindingTargetIds = [...new Set(
        (canvas.referenceBindings ?? []).map((binding) => binding?.targetNodeId).filter(Boolean),
    )];
    let currentConfigId = canvas.videoConfigNodeId
        || (bindingTargetIds.length === 1 ? bindingTargetIds[0] : null)
        || (matchingConfigNodes.length === 1 ? nodeIdentity(matchingConfigNodes[0]) : null);
    if (matchingConfigNodes.length > 1) {
        errors.push(`当前 MOTION 存在多个视频 config 节点：${currentMotionId ?? "unknown"}`);
    }
    if (currentConfigId && !nodes.has(currentConfigId)) {
        errors.push(`canvas.videoConfigNodeId 引用了不存在的节点：${currentConfigId}`);
        currentConfigId = null;
    }
    const config = currentConfigId ? nodes.get(currentConfigId) : null;
    if (!config || config.type !== "config") {
        errors.push("进入确认阶段必须能唯一定位当前 MOTION 的 Canvas 视频 config 节点");
    }
    if (config) {
        const metadata = config.metadata ?? {};
        if (metadata.modality !== "video") errors.push("Canvas config 节点 metadata.modality 必须为 video");
        if (metadata.generationMode !== "video") errors.push("Canvas config 节点 metadata.generationMode 必须为 video");
        if (metadata.autoRun !== false) {
            errors.push("Canvas 视频 config 必须明确设置 metadata.autoRun=false");
        }
        const textToVideo = isExplicitTextToVideoBatch(state);
        const expectedReferencePolicy = textToVideo ? "none" : "all-connected";
        if (metadata.referencePolicy !== expectedReferencePolicy) {
            errors.push(`Canvas config 节点 referencePolicy 必须为 ${expectedReferencePolicy}`);
        }
        if (!/^MOTION-[A-Z0-9-]+$/u.test(String(metadata.motionId ?? ""))) {
            errors.push("Canvas config 节点必须包含有效的 metadata.motionId");
        } else {
            if (currentMotionId && metadata.motionId !== currentMotionId) {
                errors.push(`Canvas config 节点 motionId 必须与当前唯一镜头一致：${currentMotionId}`);
            }
        }
    }
    const edgeKeys = new Set();
    for (const [index, edge] of canvas.connections.entries()) {
        const from = edge?.fromNodeId ?? edge?.sourceNodeId;
        const to = edge?.toNodeId ?? edge?.targetNodeId;
        if (!from || !to) {
            errors.push(`canvas.connections[${index}] 缺少真实端点`);
            continue;
        }
        const key = `${from}->${to}`;
        if (edgeKeys.has(key)) errors.push(`canvas.connections 存在重复连接：${key}`);
        edgeKeys.add(key);
        if (!nodes.has(from) || !nodes.has(to)) {
            errors.push(`canvas.connections[${index}] 引用了不存在的节点`);
        }
    }
    const textToVideo = isExplicitTextToVideoBatch(state);
    const bindingKeys = new Set(
        (canvas.referenceBindings ?? []).map((binding) =>
            `${binding.sourceNodeId}->${binding.targetNodeId}`),
    );
    if (config) {
        const configId = nodeIdentity(config);
        for (const [nodeId, node] of nodes.entries()) {
            if (nodeId === configId || node?.type !== "image") continue;
            const edgeKey = `${nodeId}->${configId}`;
            if (edgeKeys.has(edgeKey) && !bindingKeys.has(edgeKey)) {
                errors.push(`Canvas 视频 config 存在未登记的图片参考连接：${edgeKey}`);
            }
        }
    }
    for (const binding of canvas.referenceBindings ?? []) {
        const source = nodes.get(binding.sourceNodeId);
        const target = nodes.get(binding.targetNodeId);
        if (!source || !target) continue;
        if (source.type !== "image" || source.mediaAvailable !== true) {
            errors.push(`Canvas 参考节点不是可读取图片：${binding.sourceNodeId}`);
        }
        if (target.type !== "config") errors.push(`Canvas 参考目标不是 config：${binding.targetNodeId}`);
        if (currentConfigId && binding.targetNodeId !== currentConfigId) {
            errors.push(`Canvas 参考绑定指向的 config 不是当前 MOTION：${binding.targetNodeId}`);
        }
        if (!textToVideo && !edgeKeys.has(`${binding.sourceNodeId}->${binding.targetNodeId}`)) {
            errors.push(`Canvas referenceBinding 没有对应真实连接：${binding.sourceNodeId}`);
        }
        if (source.metadata?.shortDramaAssetRole !== binding.role) {
            errors.push(`Canvas 图片节点 role 与 referenceBinding 不一致：${binding.sourceNodeId}`);
        }
    }
    if (textToVideo && (canvas.referenceBindings?.length ?? 0) > 0) {
        errors.push("text-to-video 批次不得存在参考绑定");
    }
}

function validateVideoReferenceIds(state, canvas, textToVideo, errors) {
    const declared = Array.isArray(state.videoReferenceIds) ? state.videoReferenceIds : null;
    if (!declared) {
        errors.push("videoReferenceIds 必须是数组");
        return;
    }
    const actual = textToVideo
        ? []
        : (canvas.referenceBindings ?? []).map((binding) => binding.sourceNodeId);
    const declaredSet = new Set(declared);
    const actualSet = new Set(actual);
    if (declaredSet.size !== declared.length) {
        errors.push("videoReferenceIds 不能包含重复节点 ID");
    }
    if (actualSet.size !== actual.length) {
        errors.push("Canvas referenceBindings 不能重复声明图片节点");
    }
    if (declaredSet.size !== actualSet.size
        || [...declaredSet].some((nodeId) => !actualSet.has(nodeId))
        || [...actualSet].some((nodeId) => !declaredSet.has(nodeId))) {
        errors.push("videoReferenceIds 必须与实时 Canvas referenceBindings 的 sourceNodeId 集合完全一致");
    }
}

function validateProjectTargetAspect(projectProfile, state, canvas, errors) {
    const expectedRatio = getProjectAspectRatio(projectProfile);
    if (!expectedRatio) return;

    for (const [index, target] of (state.assetTargets ?? []).entries()) {
        if (!["keyframe", "ending-keyframe"].includes(target?.assetType)
            || !["generated", "reused"].includes(target?.status)) {
            continue;
        }
        const actualRatio = parseAspectRatio(target.aspectRatio);
        if (actualRatio && Math.abs(actualRatio - expectedRatio) > 0.01) {
            errors.push(`assetTargets[${index}] ${target.assetType} 的 aspectRatio 必须匹配项目目标画幅`);
        }
    }

    const currentMotionId = getCurrentMotionId(state);
    const configCandidates = (canvas.nodes ?? [])
        .filter((node) => node?.type === "config");
    const matchingConfigs = currentMotionId
        ? configCandidates.filter((node) => node?.metadata?.motionId === currentMotionId)
        : [];
    const bindingTargetIds = [...new Set(
        (canvas.referenceBindings ?? []).map((binding) => binding?.targetNodeId).filter(Boolean),
    )];
    const configId = canvas.videoConfigNodeId
        || (bindingTargetIds.length === 1 ? bindingTargetIds[0] : null)
        || (matchingConfigs.length === 1 ? nodeIdentity(matchingConfigs[0]) : null);
    const config = configId
        ? configCandidates.find((node) => nodeIdentity(node) === configId)
        : null;
    const configSize = parseSize(config?.metadata?.targetSize ?? config?.metadata?.size);
    if (configSize && Math.abs((configSize.width / configSize.height) - expectedRatio) > 0.01) {
        errors.push("Canvas 视频 config 的 targetSize/size 必须匹配项目目标画幅");
    }

    const nodesById = new Map((canvas.nodes ?? [])
        .map((node) => [nodeIdentity(node), node])
        .filter(([id]) => id));
    for (const binding of canvas.referenceBindings ?? []) {
        if (!["keyframe", "ending-keyframe"].includes(binding.role)) continue;
        const source = nodesById.get(binding.sourceNodeId);
        const width = Number(source?.metadata?.naturalWidth ?? source?.naturalWidth);
        const height = Number(source?.metadata?.naturalHeight ?? source?.naturalHeight);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            continue;
        }
        if (Math.abs((width / height) - expectedRatio) > 0.01) {
            errors.push(`Canvas ${binding.role} 节点的自然尺寸必须匹配项目目标画幅：${binding.sourceNodeId}`);
        }
    }
}

function getProjectAspectRatio(projectProfile) {
    return parseAspectRatio(
        projectProfile?.format?.aspect_ratio
        ?? projectProfile?.format?.aspectRatio
        ?? projectProfile?.production_profile?.aspect_ratio
        ?? projectProfile?.production_profile?.choices?.aspect_ratio,
    );
}

function validateCanvasReferenceSemantics(state, canvas, errors) {
    const handoff = state.videoPromptHandoff;
    if (!handoff || handoff.referenceMode === "text-to-video") return;
    if (!Array.isArray(handoff.referenceSlots) || !Array.isArray(state.assetTargets)) return;
    const bindings = Array.isArray(canvas?.referenceBindings) ? canvas.referenceBindings : [];
    const strongRoleMap = new Map([
        ["地理", "scene-design-sheet"],
        ["起始帧", "keyframe"],
        ["构图", "keyframe"],
        ["结束帧", "ending-keyframe"],
    ]);
    const expectedSourceNodeIds = new Set();
    for (const slot of handoff.referenceSlots) {
        const targets = state.assetTargets.filter((item) => item?.projectRelativePath === slot.path);
        if (targets.length === 0) {
            errors.push(`REF 槽位 ${slot.id} 未对应 assetTargets：${slot.path}`);
            continue;
        }
        if (targets.length > 1 && !slot.canvasNodeId) {
            errors.push(`REF 槽位 ${slot.id} 对应多个同路径资产，必须显式提供 canvasNodeId`);
            continue;
        }
        const target = targets.find((item) =>
            !slot.canvasNodeId || getAssetNodeIds(item).includes(slot.canvasNodeId))
            ?? targets[0];
        const targetNodeIds = getAssetNodeIds(target);
        const sourceNodeId = slot.canvasNodeId
            ?? (targetNodeIds.length === 1 ? targetNodeIds[0] : null);
        if (!sourceNodeId) {
            errors.push(`REF 槽位 ${slot.id} 对应资产有多个 Canvas nodeId，必须显式提供 canvasNodeId`);
            continue;
        }
        if (!targetNodeIds.includes(sourceNodeId)) {
            errors.push(`REF 槽位 ${slot.id} 的 canvasNodeId 不属于对应资产：${sourceNodeId}`);
            continue;
        }
        if (expectedSourceNodeIds.has(sourceNodeId)) {
            errors.push(`同一 MOTION 的参考槽位不能复用同一 Canvas 图片节点：${sourceNodeId}`);
        }
        expectedSourceNodeIds.add(sourceNodeId);
        const binding = bindings.find((item) => item?.sourceNodeId === sourceNodeId);
        if (!binding) {
            errors.push(`REF 槽位 ${slot.id} 未建立 Canvas 参考绑定：${sourceNodeId}`);
            continue;
        }
        const expectedRole = strongRoleMap.get(slot.use);
        if (expectedRole && binding.role !== expectedRole) {
            errors.push(`REF 槽位 ${slot.id} 的用途 ${slot.use} 必须绑定 ${expectedRole}`);
        }
        if (["身份", "造型状态"].includes(slot.use)
            && !["character-design-sheet", "prop/state"].includes(binding.role)) {
            errors.push(`REF 槽位 ${slot.id} 的用途 ${slot.use} 不能绑定 ${binding.role}`);
        }
        if (target.assetType === "character-design-sheet"
            && ["身份", "造型状态"].includes(slot.use)
            && binding.role !== "character-design-sheet") {
            errors.push(`REF 槽位 ${slot.id} 的角色设定图必须以 character-design-sheet 语义绑定`);
        }
        if (target.assetType === "scene-design-sheet"
            && slot.use === "地理"
            && binding.role !== "scene-design-sheet") {
            errors.push(`REF 槽位 ${slot.id} 的场景设定图必须以 scene-design-sheet 语义绑定`);
        }
        if (target.assetType === "keyframe"
            && ["起始帧", "构图"].includes(slot.use)
            && binding.role !== "keyframe") {
            errors.push(`REF 槽位 ${slot.id} 的关键帧必须以 keyframe 语义绑定`);
        }
        if (target.assetType === "ending-keyframe"
            && slot.use === "结束帧"
            && binding.role !== "ending-keyframe") {
            errors.push(`REF 槽位 ${slot.id} 的结束帧必须以 ending-keyframe 语义绑定`);
        }
    }
    const actualSourceNodeIds = new Set(bindings.map((binding) => binding.sourceNodeId));
    for (const sourceNodeId of actualSourceNodeIds) {
        if (!expectedSourceNodeIds.has(sourceNodeId)) {
            errors.push(`Canvas 参考绑定包含当前 MOTION 未声明的图片节点：${sourceNodeId}`);
        }
    }
    for (const sourceNodeId of expectedSourceNodeIds) {
        if (!actualSourceNodeIds.has(sourceNodeId)) {
            errors.push(`当前 MOTION 声明的参考图未建立 Canvas 绑定：${sourceNodeId}`);
        }
    }
}

function getCurrentMotionId(state) {
    const recordedMotionId = state.canvas?.videoMotionId;
    const promptPath = state.videoPromptHandoff?.promptPath;
    const recorded = typeof recordedMotionId === "string"
        && /^MOTION-[A-Z0-9-]+$/u.test(recordedMotionId)
        ? recordedMotionId.toUpperCase()
        : null;
    if (typeof promptPath !== "string" || !promptPath) return recorded;
    const resolved = resolveProjectPath(promptPath);
    if (!resolved || !fs.existsSync(resolved)) return recorded;
    const text = fs.readFileSync(resolved, "utf8");
    const motionIds = [...text.matchAll(/^##\s+(MOTION-[A-Z0-9-]+)/gim)]
        .map((match) => match[1].toUpperCase());
    if (motionIds.length === 1) return motionIds[0];
    if (recorded && motionIds.includes(recorded)) return recorded;
    return null;
}

function nodeIdentity(node) {
    if (!node || typeof node !== "object") return null;
    const value = node.nodeId ?? node.id;
    return typeof value === "string" && value.trim() ? value : null;
}

function isRecordedFailureState(state) {
    return state.preproductionStatus === "failed"
        || ["blocked", "failed"].includes(state.videoGenerationStatus);
}

function validateAssetTargets(state, errors) {
    if (!Array.isArray(state.assetTargets)) {
        if (state.schemaVersion >= 4) errors.push("schemaVersion=4 需要 assetTargets 数组");
        return;
    }
    const actions = ["reuse", "generate", "variant", "blocked"];
    const statuses = ["planned", "in_production", "generated", "reused", "failed", "blocked"];
    const ids = new Set();
    for (const [index, target] of state.assetTargets.entries()) {
        if (!target || typeof target !== "object") {
            errors.push(`assetTargets[${index}] 必须是对象`);
            continue;
        }
        for (const field of ["assetId", "assetType", "action", "status"]) {
            if (typeof target[field] !== "string" || !target[field]) {
                errors.push(`assetTargets[${index}].${field} 缺失`);
            }
        }
        if (ids.has(target.assetId)) errors.push(`assetTargets[${index}].assetId 重复`);
        ids.add(target.assetId);
        if (!["character-design-sheet", "scene-design-sheet", "keyframe", "ending-keyframe", "prop/state"].includes(target.assetType)) {
            errors.push(`assetTargets[${index}].assetType 无效`);
        }
        if (!actions.includes(target.action)) errors.push(`assetTargets[${index}].action 无效`);
        if (!statuses.includes(target.status)) errors.push(`assetTargets[${index}].status 无效`);
        if (target.action === "blocked" && target.status !== "blocked") {
            errors.push(`assetTargets[${index}] blocked 目标必须为 blocked 状态`);
        }
        if (["reuse", "generate", "variant"].includes(target.action)
            && ["ready_for_confirmation", "confirmed", "in_production", "completed"].includes(state.preproductionStatus)
            && !["generated", "reused"].includes(target.status)) {
            errors.push(`assetTargets[${index}] 在生产前必须完成或复用`);
        }
        if (target.validationStatus !== undefined
            && !["accepted", "pending", "invalid", "not_required"].includes(target.validationStatus)) {
            errors.push(`assetTargets[${index}].validationStatus 无效`);
        }
        if (["character-design-sheet", "scene-design-sheet", "keyframe", "ending-keyframe", "prop/state"].includes(target.assetType)
            && ["generated", "reused"].includes(target.status)
            && target.validationStatus !== "accepted") {
            errors.push(`assetTargets[${index}] 已完成但 validationStatus 不是 accepted`);
        }
        if (state.schemaVersion >= 4
            && ["generated", "reused"].includes(target.status)
            && (typeof target.projectRelativePath !== "string" || !target.projectRelativePath.trim())) {
            errors.push(`assetTargets[${index}] 已完成但缺少 projectRelativePath`);
        }
        if (target.nodeIds !== undefined
            && (!Array.isArray(target.nodeIds)
                || target.nodeIds.length === 0
                || target.nodeIds.some((nodeId) => typeof nodeId !== "string" || !nodeId.trim()))) {
            errors.push(`assetTargets[${index}].nodeIds 必须是非空字符串数组`);
        }
        if (Array.isArray(target.nodeIds) && target.nodeIds.length > 0
            && new Set(target.nodeIds).size !== target.nodeIds.length) {
            errors.push(`assetTargets[${index}].nodeIds 不能重复`);
        }
        if (target.nodeId !== undefined
            && (typeof target.nodeId !== "string" || !target.nodeId.trim())) {
            errors.push(`assetTargets[${index}].nodeId 必须是非空字符串或省略`);
        }
        if (typeof target.nodeId === "string"
            && Array.isArray(target.nodeIds)
            && target.nodeIds.includes(target.nodeId)) {
            errors.push(`assetTargets[${index}].nodeId 不能在 nodeIds 中重复`);
        }
        let assetPath = null;
        if (state.schemaVersion >= 4 && typeof target.projectRelativePath === "string" && target.projectRelativePath.trim()) {
            assetPath = resolveProjectPath(target.projectRelativePath, `assetTargets[${index}].projectRelativePath`, errors);
        }
        if (["reuse", "generate", "variant"].includes(target.action)
            && ["generated", "reused"].includes(target.status)) {
            validateAssetDimensions(target, index, errors);
            validateAssetMedia(target, assetPath, state, index, errors);
            if (["ready_for_confirmation", "confirmed", "in_production", "completed"].includes(state.preproductionStatus)
                && getAssetNodeIds(target).length === 0) {
                errors.push(`assetTargets[${index}] 进入确认阶段需要真实 Canvas nodeId`);
            }
        }
        if (target.status === "blocked"
            && ["ready_for_confirmation", "confirmed", "in_production", "completed"].includes(state.preproductionStatus)) {
            errors.push(`assetTargets[${index}] blocked 资产不能进入确认或生产阶段`);
        }
    }
}

function validateAssetMedia(target, assetPath, state, index, errors) {
    if (assetPath && fs.existsSync(assetPath)) {
        if (!fs.statSync(assetPath).isFile()) {
            errors.push(`assetTargets[${index}].projectRelativePath 不是文件`);
            return;
        }
        const image = inspectImageFile(assetPath);
        if (!image) {
            errors.push(`assetTargets[${index}] 的项目文件不是可读取图片`);
            return;
        }
        if (image.width !== target.naturalWidth || image.height !== target.naturalHeight) {
            errors.push(`assetTargets[${index}] 图片自然尺寸与文件实际尺寸不一致`);
        }
        return;
    }
    const nodeIds = getAssetNodeIds(target);
    const nodes = nodeIds.map((nodeId) =>
        state.canvas?.nodes?.find((item) => nodeIdentity(item) === nodeId));
    if (!nodeIds.length || nodes.some((node) => !node || node.type !== "image" || node.mediaAvailable !== true)) {
        errors.push(`assetTargets[${index}] 缺少真实图片文件或可读取 Canvas 图片节点`);
    }
}

function getAssetNodeIds(target) {
    if (!target || typeof target !== "object") return [];
    return [...new Set([
        ...(typeof target.nodeId === "string" && target.nodeId.trim() ? [target.nodeId.trim()] : []),
        ...(Array.isArray(target.nodeIds)
            ? target.nodeIds.filter((nodeId) => typeof nodeId === "string" && nodeId.trim())
            : []),
    ])];
}

function inspectImageFile(file) {
    const data = fs.readFileSync(file);
    if (data.length >= 24
        && data.readUInt32BE(0) === 0x89504e47
        && data.toString("ascii", 1, 4) === "PNG") {
        return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), format: "png" };
    }
    if (data.length >= 30 && data.toString("ascii", 0, 4) === "RIFF"
        && data.toString("ascii", 8, 12) === "WEBP") {
        if (data.toString("ascii", 12, 16) === "VP8X" && data.length >= 30) {
            return {
                width: 1 + data.readUIntLE(24, 3),
                height: 1 + data.readUIntLE(27, 3),
                format: "webp",
            };
        }
    }
    if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
        let offset = 2;
        while (offset + 9 < data.length) {
            if (data[offset] !== 0xff) {
                offset += 1;
                continue;
            }
            const marker = data[offset + 1];
            offset += 2;
            if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
            if (offset + 2 > data.length) break;
            const length = data.readUInt16BE(offset);
            if (length < 2 || offset + length > data.length) break;
            const isFrame = (marker >= 0xc0 && marker <= 0xc3)
                || (marker >= 0xc5 && marker <= 0xc7)
                || (marker >= 0xc9 && marker <= 0xcb)
                || (marker >= 0xcd && marker <= 0xcf);
            if (isFrame && length >= 7) {
                return {
                    width: data.readUInt16BE(offset + 5),
                    height: data.readUInt16BE(offset + 3),
                    format: "jpeg",
                };
            }
            offset += length;
        }
    }
    return null;
}

function validateAssetDimensions(target, index, errors) {
    for (const field of ["requestedSize", "actualSize"]) {
        if (typeof target[field] !== "string" || !parseSize(target[field])) {
            errors.push(`assetTargets[${index}].${field} 必须是可解析的宽x高`);
        }
    }
    for (const field of ["naturalWidth", "naturalHeight"]) {
        if (!Number.isInteger(target[field]) || target[field] <= 0) {
            errors.push(`assetTargets[${index}].${field} 必须是正整数`);
        }
    }
    const declaredRatio = parseAspectRatio(target.aspectRatio);
    if (!declaredRatio) {
        errors.push(`assetTargets[${index}].aspectRatio 必须是有效的 W:H 或正数`);
        return;
    }
    const actual = parseSize(target.actualSize);
    if (!actual) return;
    const actualRatio = actual.width / actual.height;
    const requested = parseSize(target.requestedSize);
    if (requested && (requested.width !== actual.width || requested.height !== actual.height)) {
        errors.push(`assetTargets[${index}] actualSize 必须与 requestedSize 一致`);
    }
    if (Math.abs(actualRatio - declaredRatio) > 0.01) {
        errors.push(`assetTargets[${index}] actualSize 与 aspectRatio 不一致`);
    }
    if (target.naturalWidth !== actual.width || target.naturalHeight !== actual.height) {
        errors.push(`assetTargets[${index}] naturalWidth/naturalHeight 必须与 actualSize 一致`);
    }
}

function parseAspectRatio(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value !== "string") return null;
    const match = value.trim().match(/^(\d+)\s*:\s*(\d+)$/u);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
    return width / height;
}

function validateProductionState(state, errors) {
    const gated = ["ready_for_confirmation", "confirmed", "in_production", "completed"];
    const confirmation = state.productionConfirmation;
    if (gated.includes(state.preproductionStatus) && state.storyStatus !== "confirmed") {
        errors.push("进入确认或生产阶段前需要 storyStatus=confirmed");
    }
    if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) {
        if (gated.includes(state.preproductionStatus)) {
            errors.push("进入确认或生产阶段需要 productionConfirmation 对象");
        }
    } else {
        if (!["pending", "confirmed", "consumed", "invalidated"].includes(confirmation.status)) {
            errors.push("productionConfirmation.status 的值无效");
        }
        if (confirmation.reportHash !== null && typeof confirmation.reportHash !== "string") {
            errors.push("productionConfirmation.reportHash 必须是字符串或 null");
        }
        if (confirmation.confirmedAt !== null
            && (!isValidDateString(confirmation.confirmedAt))) {
            errors.push("productionConfirmation.confirmedAt 必须是有效 ISO 时间字符串或 null");
        }
    }
    if (state.preproductionStatus === "ready_for_confirmation") {
        if (!isExplicitTextToVideoBatch(state)
            && (!Array.isArray(state.assetTargets) || state.assetTargets.length === 0)) {
            errors.push("ready_for_confirmation 至少需要一个资产目标");
        }
        if (confirmation?.status !== "pending") {
            errors.push("ready_for_confirmation 必须保持 productionConfirmation.status=pending");
        }
        if (!confirmation?.reportHash) errors.push("ready_for_confirmation 需要 productionConfirmation.reportHash");
        if (state.videoGenerationStatus !== "awaiting_video_confirmation") {
            errors.push("ready_for_confirmation 必须停在 awaiting_video_confirmation");
        }
        if (state.activeBatchId) errors.push("ready_for_confirmation 不能有 activeBatchId");
    }
    if (state.preproductionStatus === "confirmed") {
        if (confirmation?.status !== "confirmed") {
            errors.push("confirmed 前期状态需要 productionConfirmation.status=confirmed");
        }
        if (!confirmation?.reportHash || !confirmation?.confirmedAt) {
            errors.push("confirmed 前期状态需要 reportHash 和 confirmedAt");
        }
    }
    if (state.videoGenerationStatus === "awaiting_video_confirmation") {
        if (state.preproductionStatus !== "ready_for_confirmation") {
            errors.push("awaiting_video_confirmation 必须对应 ready_for_confirmation");
        }
        if (confirmation?.status !== "pending") {
            errors.push("awaiting_video_confirmation 必须保持确认未消费");
        }
        if (state.activeBatchId) errors.push("等待视频确认时不能存在活动批次");
    }
    if (gated.includes(state.preproductionStatus)) {
        validateDesignReport(state, errors);
    }
    if (["submitted", "completed"].includes(state.videoGenerationStatus)) {
        if (!state.activeBatchId) return;
        const batch = readJsonIfExists(path.join(project, ".short-drama", "production-batches", `${state.activeBatchId}.json`));
        if (!batch) {
            errors.push(`活动批次文件缺失：${state.activeBatchId}`);
        } else {
            validateBatchRecord(batch, state, errors);
        }
    }
    if (state.videoGenerationStatus === "submitted") {
        if (state.preproductionStatus !== "in_production") {
            errors.push("submitted 视频必须对应 preproductionStatus=in_production");
        }
        if (confirmation?.status !== "consumed") {
            errors.push("submitted 视频需要已消费的 productionConfirmation");
        }
    }
    if (state.videoGenerationStatus === "completed") {
        if (state.preproductionStatus !== "completed") {
            errors.push("completed 视频必须对应 preproductionStatus=completed");
        }
        const manifestPath = state.activeBatchId
            ? path.join(project, ".short-drama", "manifests", `${state.activeBatchId}.json`)
            : null;
        const manifest = manifestPath ? readJsonIfExists(manifestPath) : null;
        if (!manifest) {
            errors.push(`已完成视频缺少已验证 manifest：${state.activeBatchId ?? "unknown"}`);
        } else {
            validateManifest(manifest, state, errors);
        }
    }
}

function validateDesignReport(state, errors) {
    const reportPath = resolveProjectPath(state.designReportPath, "designReportPath", errors);
    if (!reportPath) return;
    if (!fs.existsSync(reportPath)) {
        errors.push(`designReportPath 文件不存在：${state.designReportPath}`);
        return;
    }
    if (!fs.statSync(reportPath).isFile()) {
        errors.push(`designReportPath 路径不是文件：${state.designReportPath}`);
        return;
    }
    const reportText = fs.readFileSync(reportPath, "utf8");
    const reportHash = state.productionConfirmation?.reportHash;
    if (!/^sha256:[a-f0-9]{64}$/iu.test(String(reportHash))) {
        errors.push("productionConfirmation.reportHash 必须是报告规范化内容的 SHA-256");
    } else {
        const actualHash = hashText(canonicalizeReport(reportText));
        if (actualHash !== reportHash.toLowerCase()) {
            errors.push("productionConfirmation.reportHash 与 designReportPath 实际内容不一致");
        }
    }
    const confirmationPhrases = [...reportText.matchAll(
        /CONFIRM PREPRODUCTION PACKAGE\s+(\S+)\s+(sha256:[a-f0-9]{64})/giu,
    )];
    if (confirmationPhrases.length !== 1) {
        errors.push("designReportPath 缺少唯一且带有效 SHA-256 的确认短语");
    } else if (confirmationPhrases[0][2].toLowerCase() !== String(reportHash).toLowerCase()) {
        errors.push("确认短语中的报告指纹必须与 productionConfirmation.reportHash 一致");
    }
}

function validateBatchRecord(batch, state, errors) {
    if (batch.schemaVersion !== 1) errors.push("活动批次 schemaVersion 必须为 1");
    if (batch.batchId !== state.activeBatchId) errors.push("activeBatchId 与批次文件 batchId 不一致");
    if (batch.modality !== "video") errors.push("影铸视频活动批次 modality 必须为 video");
    if (!batch.canvasProjectId || batch.canvasProjectId !== state.currentCanvasProjectId) {
        errors.push("活动批次必须绑定当前 Canvas projectId");
    }
    if (!batch.configNodeId || typeof batch.configNodeId !== "string") {
        errors.push("活动批次缺少 configNodeId");
    }
    if (state.canvas?.videoConfigNodeId
        && batch.configNodeId
        && state.canvas.videoConfigNodeId !== batch.configNodeId) {
        errors.push("活动批次 configNodeId 必须与当前 Canvas videoConfigNodeId 一致");
    }
    if (!Array.isArray(batch.referenceNodes)
        || (!isExplicitTextToVideoBatch(state) && batch.referenceNodes.length === 0)) {
        errors.push("活动批次缺少 referenceNodes");
    }
    if (Array.isArray(batch.referenceNodes) && Array.isArray(state.canvas?.referenceBindings)) {
        const batchNodeIds = new Set(batch.referenceNodes.map((item) => item?.nodeId).filter(Boolean));
        const bindingNodeIds = new Set(state.canvas.referenceBindings.map((binding) => binding.sourceNodeId));
        if (batchNodeIds.size !== state.canvas.referenceBindings.length) {
            errors.push("活动批次 referenceNodes 必须与实时 Canvas 参考绑定一一对应");
        }
        for (const binding of state.canvas.referenceBindings) {
            if (!batchNodeIds.has(binding.sourceNodeId)) {
                errors.push(`活动批次缺少 Canvas 参考节点：${binding.sourceNodeId}`);
            }
            if (batch.configNodeId !== binding.targetNodeId) {
                errors.push("活动批次 configNodeId 与 Canvas 参考绑定目标不一致");
            }
        }
        for (const nodeId of batchNodeIds) {
            if (!bindingNodeIds.has(nodeId)) {
                errors.push(`活动批次包含未在实时 Canvas 绑定中的参考节点：${nodeId}`);
            }
        }
        for (const binding of state.canvas.referenceBindings) {
            const batchReference = batch.referenceNodes.find((item) => item?.nodeId === binding.sourceNodeId);
            if (batchReference && batchReference.role !== binding.role) {
                errors.push(`活动批次 referenceNodes 的 role 与 Canvas 绑定不一致：${binding.sourceNodeId}`);
            }
        }
        const singletonRoles = new Set(["scene-design-sheet", "keyframe", "ending-keyframe"]);
        const roles = batch.referenceNodes
            .map((item) => item?.role)
            .filter((role) => role && singletonRoles.has(role));
        if (new Set(roles).size !== roles.length) {
            errors.push("活动批次 referenceNodes 不能重复使用同一单例语义 role");
        }
    }
    const taskIds = collectProviderTaskIds(batch);
    if (state.videoGenerationStatus === "submitted" && taskIds.length === 0) {
        errors.push("submitted 视频活动批次必须包含 provider task ID");
    }
    if (state.videoGenerationStatus === "completed" && taskIds.length === 0) {
        errors.push("completed 视频活动批次必须保留 provider task ID");
    }
}

function validateManifest(manifest, state, errors) {
    if (manifest.schemaVersion !== undefined && manifest.schemaVersion !== 1) {
        errors.push("manifest schemaVersion 必须为 1");
    }
    if (manifest.batchId !== state.activeBatchId) errors.push("manifest batchId 与 activeBatchId 不一致");
    if (!Array.isArray(manifest.outputs) || manifest.outputs.length === 0) {
        errors.push("manifest 必须包含 outputs");
        return;
    }
    for (const [index, output] of manifest.outputs.entries()) {
        if (!output || typeof output !== "object") {
            errors.push(`manifest.outputs[${index}] 必须是对象`);
            continue;
        }
        for (const field of ["nodeId", "mediaType", "relativePath", "sha256"]) {
            if (typeof output[field] !== "string" || !output[field]) {
                errors.push(`manifest.outputs[${index}].${field} 缺失`);
            }
        }
        const expectedHash = typeof output.sha256 === "string"
            ? output.sha256.replace(/^sha256:/iu, "").toLowerCase()
            : null;
        if (expectedHash && !/^[a-f0-9]{64}$/u.test(expectedHash)) {
            errors.push(`manifest.outputs[${index}].sha256 不是有效 SHA-256`);
        }
        if (output.relativePath && resolveProjectPath(output.relativePath, `manifest.outputs[${index}].relativePath`, errors) === null) {
            continue;
        }
        if (output.relativePath) {
            const outputPath = resolveProjectPath(output.relativePath, `manifest.outputs[${index}].relativePath`, errors);
            if (outputPath && !fs.existsSync(outputPath)) {
                errors.push(`manifest 输出文件不存在：${output.relativePath}`);
            } else if (outputPath) {
                const stat = fs.statSync(outputPath);
                if (output.byteCount !== undefined
                    && (!Number.isInteger(output.byteCount) || output.byteCount !== stat.size)) {
                    errors.push(`manifest.outputs[${index}].byteCount 与文件大小不一致`);
                }
                if (expectedHash && /^[a-f0-9]{64}$/u.test(expectedHash)) {
                    const actualHash = hashFile(outputPath);
                    if (actualHash !== expectedHash) {
                        errors.push(`manifest.outputs[${index}].sha256 与实际文件不一致`);
                    }
                }
            }
        }
    }
}

function collectProviderTaskIds(value, result = []) {
    if (!value || typeof value !== "object") return result;
    if (Array.isArray(value)) {
        for (const item of value) collectProviderTaskIds(item, result);
        return result;
    }
    for (const [key, item] of Object.entries(value)) {
        if (["providerTaskId", "provider_task_id", "taskId", "task_id"].includes(key)
            && typeof item === "string" && item) {
            result.push(item);
        } else if (item && typeof item === "object") {
            collectProviderTaskIds(item, result);
        }
    }
    return result;
}

function parseSize(value) {
    if (typeof value !== "string") return null;
    const match = value.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/iu);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
    return { width, height };
}

function isValidDateString(value) {
    return typeof value === "string"
        && Number.isFinite(Date.parse(value))
        && value.includes("T");
}

function normalizeCanvasOrigin(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
        const url = new URL(value.trim());
        if (!["http:", "https:"].includes(url.protocol)
            || url.username
            || url.password
            || url.pathname !== "/"
            || url.search
            || url.hash) {
            return null;
        }
        return url.origin;
    } catch {
        return null;
    }
}

function isDefaultCanvasTitle(value) {
    return /^(?:无限画布|画布|canvas|infinite canvas)(?:\s+\d+)?$/iu.test(value.trim())
        || /^untitled(?:\s+canvas)?(?:\s+\d+)?$/iu.test(value.trim());
}

function getOption(values, name) {
    const prefix = `${name}=`;
    const value = values.find((arg) => arg.startsWith(prefix));
    return value ? value.slice(prefix.length) : null;
}

function resolveProjectPath(input, label, errors = null) {
    if (typeof input !== "string" || !input.trim()) {
        if (errors) errors.push(`${label} 缺失`);
        return null;
    }
    const trimmed = input.trim();
    const unsafe = trimmed.includes("...")
        || trimmed.includes("\u0000")
        || path.isAbsolute(trimmed)
        || /^[A-Za-z]:[\\/]/u.test(trimmed)
        || trimmed.startsWith("\\\\");
    const resolved = path.resolve(project, trimmed);
    if (unsafe || !isInsideProject(resolved)) {
        if (errors) errors.push(`${label} 必须是项目内相对路径`);
        return null;
    }
    return resolved;
}

function isInsideProject(target) {
    const relative = path.relative(project, target);
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function readJsonIfExists(file) {
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

function hashFile(file) {
    const hash = crypto.createHash("sha256");
    const handle = fs.openSync(file, "r");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    try {
        let bytesRead = 0;
        do {
            bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null);
            if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
        } while (bytesRead > 0);
    } finally {
        fs.closeSync(handle);
    }
    return hash.digest("hex");
}

function hashText(text) {
    return `sha256:${crypto.createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function canonicalizeReport(text) {
    return text
        .replaceAll("\r\n", "\n")
        .replace(
            /(reportHash\s*[:：]\s*)sha256:[a-f0-9]{64}/giu,
            "$1sha256:<REPORT_HASH>",
        )
        .replace(
            /(CONFIRM PREPRODUCTION PACKAGE\s+\S+\s+)sha256:[a-f0-9]{64}/giu,
            "$1sha256:<REPORT_HASH>",
        );
}

function validateVideoPromptDocument(
    promptPath,
    { allowUnresolvedReferences = false, state = null } = {},
) {
    const result = {
        hash: null,
        shotCount: 0,
        referenceMode: "reference",
        referencePaths: [],
        referenceSlots: [],
        planReferenceSlots: [],
        audioReferenceSlots: [],
        missingReferences: [],
        unresolvedReferences: [],
        errors: [],
    };
    if (!fs.existsSync(promptPath)) {
        result.errors.push(`视频提示词文件不存在：${promptPath}`);
        return result;
    }
    const text = fs.readFileSync(promptPath, "utf8");
    result.hash = `sha256:${crypto.createHash("sha256").update(text, "utf8").digest("hex")}`;
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)) result.errors.push("视频提示词包含不可见控制字符");
    if (text.includes("...")) {
        result.errors.push("视频提示词包含省略号占位");
    }
    if (text.includes("待补参考图")) {
        if (allowUnresolvedReferences) {
            result.unresolvedReferences.push("文档包含待补参考图");
        } else {
            result.errors.push("视频提示词包含待补参考图");
        }
    }

    const headings = [...text.matchAll(/^##\s+(MOTION-[^\r\n]+)/gim)];
    result.shotCount = headings.length;
    if (!result.shotCount) {
        result.errors.push("未找到 MOTION 镜头");
        return result;
    }
    const motionIds = headings.map((heading) =>
        heading[1].trim().match(/^(MOTION-[A-Z0-9-]+)/iu)?.[1]?.toUpperCase());
    if (motionIds.some((id) => !id) || new Set(motionIds).size !== motionIds.length) {
        result.errors.push("MOTION 镜头 ID 缺失或重复");
    }
    const allowedUses = "身份|造型状态|地理|构图|尺度|效果|起始帧|结束帧|风格";
    let hasReferenceMode = false;
    let hasTextToVideoMode = false;
    for (let index = 0; index < headings.length; index += 1) {
        const start = headings[index].index;
        const end = headings[index + 1]?.index ?? text.length;
        const block = text.slice(start, end);
        const label = headings[index][1].trim();
        for (const field of ["分镜", "时长", "生成方式", "输入参考图", "静态视觉锚点", "起始帧", "状态链", "终点"]) {
            const fieldValue = readPromptField(block, field);
            if (fieldValue === null) {
                result.errors.push(`${label} 缺少字段：${field}`);
            } else if (!fieldValue.trim()) {
                result.errors.push(`${label} 字段为空：${field}`);
            }
        }
        const generationMode = readPromptField(block, "生成方式")?.trim() ?? "";
        if (!/^(图生视频|文生视频)$/u.test(generationMode)) {
            result.errors.push(`${label} 的生成方式无效`);
        }
        const duration = readPromptField(block, "时长");
        if (duration !== null && !/^\d+(?:\.\d+)?\s*秒$/u.test(duration.trim())) {
            result.errors.push(`${label} 的时长必须是可解析的秒数`);
        }
        const referenceLinePattern = new RegExp(
            `^\\s*-\\s*(REF|PLAN)-([^\\s（]+)（顺序：(\\d+)）·\\s*([^\\r\\n《]+)《([^》]+)》\\（用途：(${allowedUses})；控制：([^；]+)；不得控制：([^）]+)）\\s*$`,
            "gm",
        );
        const referenceLines = [...block.matchAll(referenceLinePattern)];
        const motionId = label.match(/^(MOTION-[A-Z0-9-]+)/iu)?.[1]?.toUpperCase() ?? null;
        const audioReferenceLines = block.split(/\r?\n/u)
            .map((line) => line.trim())
            .filter((line) => /^-\s*(?:\*\*)?参考音频(?:\*\*)?：/u.test(line));
        if (audioReferenceLines.length) {
            if (audioReferenceLines.length > 1) {
                result.errors.push(`${label} 不能重复声明参考音频字段`);
            }
            const audioValue = audioReferenceLines[0]
                .replace(/^-\s*(?:\*\*)?参考音频(?:\*\*)?：\s*/u, "")
                .trim();
            if (!/^无(?:（[^）\n]+）)?。?$/u.test(audioValue)) {
                const audioPattern = /(?:^|；)(REF-[A-Z0-9][A-Z0-9-]{0,79})（顺序：([1-9]\d*)）·\s*([^；\n]+?\.(?:wav|mp3|m4a|aac|flac|opus))《([^》\n]+)》（用途：(音色)；角色：([^；）\n]+)；控制：([^；）\n]+)；不得控制：([^）\n]+)）/giu;
                const audioSlots = [];
                let cursor = 0;
                let match;
                while ((match = audioPattern.exec(audioValue)) !== null) {
                    if (audioSlots.length === 0) {
                        if (match.index !== 0) break;
                    } else if (match.index !== cursor || !match[0].startsWith("；")) {
                        break;
                    }
                    audioSlots.push({
                        id: match[1],
                        shotId: motionId,
                        order: Number(match[2]),
                        path: match[3].trim(),
                        title: match[4].trim(),
                        use: match[5].trim(),
                        character: match[6].trim(),
                        control: match[7].trim(),
                        notControl: match[8].trim(),
                    });
                    cursor = match.index + match[0].length;
                }
                if (!audioSlots.length || audioValue.slice(cursor).replace(/。$/u, "").trim()) {
                    result.errors.push(`${label} 的参考音频格式无效`);
                } else {
                    for (const slot of audioSlots) {
                        result.audioReferenceSlots.push(slot);
                        const pathErrors = state ? validateAudioReferencePath(slot.path, state) : [];
                        if (pathErrors.length) {
                            result.missingReferences.push(`${label}：${slot.id}`);
                            if (allowUnresolvedReferences) {
                                result.unresolvedReferences.push(...pathErrors);
                            } else {
                                result.errors.push(...pathErrors);
                            }
                        }
                    }
                    const audioOrders = audioSlots.map((slot) => slot.order);
                    if (new Set(audioOrders).size !== audioOrders.length
                        || audioOrders.sort((a, b) => a - b).some((order, index) => order !== index + 1)) {
                        result.errors.push(`${label} 的参考音频顺序必须从 1 连续递增`);
                    }
                }
            }
        }
        const declaredReferenceLines = block.split(/\r?\n/u)
            .filter((line) => /^\s*-\s*(?:REF|PLAN)-/u.test(line));
        if (declaredReferenceLines.length !== referenceLines.length) {
            result.errors.push(`${label} 存在格式无效的 REF/PLAN 参考行`);
        }
        const slots = referenceLines.map((match) => ({
            kind: match[1].toUpperCase(),
            id: `${match[1].toUpperCase()}-${match[2]}`,
            shotId: motionId,
            order: Number(match[3]),
            path: match[4]?.trim(),
            title: match[5]?.trim(),
            use: match[6]?.trim(),
            control: match[7]?.trim(),
            notControl: match[8]?.trim(),
        }));
        if (new Set(slots.map((slot) => slot.id)).size !== slots.length) {
            result.errors.push(`${label} 的 REF/PLAN 槽位 ID 重复`);
        }
        if (slots.some((slot, slotIndex) => slot.order !== slotIndex + 1)) {
            result.errors.push(`${label} 的 REF/PLAN 顺序必须从 1 连续递增`);
        }
        for (const slot of slots) {
            if (slot.kind === "PLAN") {
                result.planReferenceSlots.push(slot);
                result.missingReferences.push(`${label}：${slot.id}`);
                if (allowUnresolvedReferences) {
                    result.unresolvedReferences.push(`${label} 包含 ${slot.id}，等待创作者挂载真实参考图`);
                } else {
                    result.errors.push(`${label} 包含未落地的 PLAN 参考槽位：${slot.id}`);
                }
            } else {
                const referencePath = slot.path;
                if (referencePath) result.referencePaths.push(referencePath);
                result.referenceSlots.push(slot);
                if (state && referencePath) {
                    const pathErrors = validateReferencePath(referencePath, state);
                    if (pathErrors.length) {
                        result.missingReferences.push(`${label}：${slot.id}`);
                        if (allowUnresolvedReferences) {
                            result.unresolvedReferences.push(...pathErrors);
                        } else {
                            result.errors.push(...pathErrors);
                        }
                    }
                }
            }
        }
        const planTokens = [...block.matchAll(/\bPLAN-[^\s（]+/gu)];
        if (planTokens.length > slots.filter((slot) => slot.kind === "PLAN").length) {
            result.errors.push(`${label} 存在未按规范保留用途、控制和不得控制语义的 PLAN 槽位`);
        }
        const explicitTextToVideo = /输入参考图：\s*无（创作者已明确选择文生视频）/m.test(block);
        if (explicitTextToVideo) {
            const textToVideoVisualFields = [
                readPromptField(block, "静态视觉锚点"),
                readPromptField(block, "起始帧"),
                readPromptField(block, "状态链"),
                readPromptField(block, "终点"),
            ].filter(Boolean).join("\n");
            if (containsPositiveCharacterCue(textToVideoVisualFields)) {
                result.errors.push(`${label} 明确文生视频但视觉字段仍包含角色主体，不能静默跳过角色参考图`);
            }
        }
        if (referenceLines.length && generationMode !== "图生视频") {
            result.errors.push(`${label} 有 REF 参考图时生成方式必须为图生视频`);
        }
        if (explicitTextToVideo && generationMode !== "文生视频") {
            result.errors.push(`${label} 明确选择文生视频时生成方式必须为文生视频`);
        }
        if (referenceLines.length && explicitTextToVideo) {
            result.errors.push(`${label} 不能同时声明 REF 参考图和无参考文生视频`);
        }
        if (!referenceLines.length && !explicitTextToVideo) {
            result.missingReferences.push(label);
            if (allowUnresolvedReferences) {
                result.unresolvedReferences.push(label);
            } else {
                result.errors.push(`${label} 缺少有效 REF 参考图或明确文生视频声明`);
            }
        }
        if (/^\s*-\s*输入参考图：\s*无\s*$/m.test(block)) {
            result.errors.push(`${label} 不能用普通“无”代替文生视频声明`);
        }
        if (!/###\s*可复制提示词/m.test(block)) {
            result.errors.push(`${label} 缺少可复制提示词正文`);
        }
        hasReferenceMode ||= slots.some((slot) => slot.kind === "REF");
        hasTextToVideoMode ||= explicitTextToVideo;
    }
    result.referenceMode = hasReferenceMode && hasTextToVideoMode
        ? "mixed"
        : hasTextToVideoMode
            ? "text-to-video"
            : "reference";
    result.referencePaths = [...new Set(result.referencePaths)];
    result.unresolvedReferences = [...new Set(result.unresolvedReferences)];
    const imageSlotIds = [
        ...result.referenceSlots.map((slot) => slot.id),
        ...result.planReferenceSlots.map((slot) => slot.id),
    ];
    if (new Set(imageSlotIds).size !== imageSlotIds.length) {
        result.errors.push("视频提示词的 REF/PLAN 槽位 ID 不能跨镜头重复");
    }
    const audioGroups = new Map();
    for (const slot of result.audioReferenceSlots) {
        const group = slot.shotId || "__legacy__";
        if (!audioGroups.has(group)) audioGroups.set(group, []);
        audioGroups.get(group).push(slot);
    }
    for (const [group, slots] of audioGroups.entries()) {
        const ids = slots.map((slot) => slot.id);
        if (new Set(ids).size !== ids.length) {
            result.errors.push(
                `参考音频槽位${group === "__legacy__" ? "" : `[${group}]`} 的 ID 不能重复`,
            );
        }
    }
    return result;
}

function readPromptField(block, field) {
    const fieldPattern = new RegExp(`^\\s*-\\s*${field}：\\s*(.*)$`, "m");
    const match = fieldPattern.exec(block);
    if (!match) return null;
    const rest = block.slice(match.index + match[0].length);
    const childLines = [];
    for (const line of rest.split(/\r?\n/u)) {
        if (/^\s*-\s*(?:分镜|时长|生成方式|输入参考图|静态视觉锚点|起始帧|状态链|终点)：/u.test(line)) {
            break;
        }
        if (/^\s*##?\s/u.test(line)) break;
        if (line.trim()) childLines.push(line.trim());
    }
    return [match[1], ...childLines].filter(Boolean).join("\n");
}

function containsPositiveCharacterCue(text) {
    const withoutExplicitAbsence = String(text)
        .replaceAll(/无人物|没有人物|不出现人物|无人影|无角色/gu, "");
    return /人物|角色|人影|脸部|面部|男孩|女孩|少年|少女|男人|女人|主角|演员/iu.test(withoutExplicitAbsence);
}

function fail(message) {
    console.error(`工作流状态：${message}`);
    process.exit(1);
}
