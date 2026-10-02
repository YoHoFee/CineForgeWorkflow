#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [command = "validate", projectArg = process.cwd(), ...args] = process.argv.slice(2);
const project = path.resolve(projectArg);
const stateFile = path.join(project, ".short-drama", "workflow-state.json");

const emptyState = {
    schemaVersion: 1,
    projectId: null,
    currentCanvasProjectId: null,
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

if (command === "validate") {
    const state = readState();
    const errors = [];
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

function fail(message) {
    console.error(`工作流状态：${message}`);
    process.exit(1);
}
