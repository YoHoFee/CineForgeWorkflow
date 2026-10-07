#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPOSITORY = "https://github.com/YoHoFee/CineForgeWorkflow.git";
export const BRANCH = "main";
export const SKILL_NAME = "short-video-workflow";
const RECEIPT = ".skill-install.json";
const MANAGED = ["SKILL.md", "agents", "references", "scripts", "skills/cineforge-dependencies", "README.md", "CHANGELOG.md", "LICENSE"];
const TEXT_EXTENSIONS = new Set([".md", ".mjs", ".js", ".json", ".yaml", ".yml", ".txt", ".py", ".ps1", ".sh"]);

function managed(relativePath) {
    return MANAGED.some((entry) => relativePath === entry || relativePath.startsWith(`${entry}/`));
}

function normalizedBytes(file) {
    const bytes = fs.readFileSync(file);
    return TEXT_EXTENSIONS.has(path.extname(file)) || path.basename(file) === "LICENSE"
        ? Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n")) : bytes;
}

function blobHash(file) {
    const bytes = normalizedBytes(file);
    return crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function fileMap(root, onlyManaged = true) {
    const files = {};
    function walk(directory, prefix = "") {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (onlyManaged && !managed(relativePath)
                && !(entry.isDirectory() && MANAGED.some((item) => item.startsWith(`${relativePath}/`)))) continue;
            const absolutePath = path.join(directory, entry.name);
            if (entry.isSymbolicLink()) throw new Error(`目录含链接，停止覆盖：${relativePath}`);
            if (entry.isDirectory()) walk(absolutePath, relativePath);
            else if (entry.isFile()) files[relativePath] = blobHash(absolutePath);
            else throw new Error(`目录含非常规文件，停止覆盖：${relativePath}`);
        }
    }
    walk(root);
    return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b, "en")));
}

function equal(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function assertSkill(root) {
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Skill 目录必须是实际目录，不能是链接");
    const text = fs.readFileSync(path.join(root, "SKILL.md"), "utf8");
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1];
    if (!frontmatter || !/^name:\s*(?:short-video-workflow|"short-video-workflow"|'short-video-workflow')\s*$/mu.test(frontmatter)) {
        throw new Error("目录不是 short-video-workflow Skill");
    }
    for (const directory of ["agents", "references", "scripts"]) {
        if (!fs.statSync(path.join(root, directory)).isDirectory()) throw new Error(`Skill 缺少 ${directory}/`);
    }
}

export function runGit(args, cwd) {
    return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "init.templateDir=", ...args], {
        cwd, encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024,
        windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function commitFiles(commit, checkout, git) {
    const files = {};
    for (const record of git(["ls-tree", "-r", "-z", commit], checkout).split("\0").filter(Boolean)) {
        const match = record.match(/^(\d+) (\S+) ([a-f0-9]+)\t([\s\S]+)$/u);
        if (!match) throw new Error("无法解析仓库文件清单");
        const [, mode, type, hash, relativePath] = match;
        if (!managed(relativePath)) continue;
        if (type !== "blob" || !["100644", "100755"].includes(mode)
            || relativePath.split("/").some((part) => !part || part === ".." || part === ".")
            || relativePath.includes("\\")) throw new Error(`远端包含不支持的文件：${relativePath}`);
        files[relativePath] = hash;
    }
    return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b, "en")));
}

function readReceipt(root) {
    const file = path.join(root, RECEIPT);
    if (!fs.existsSync(file)) return null;
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (value.schemaVersion !== 1 || value.repository !== REPOSITORY || value.branch !== BRANCH
        || !/^[a-f0-9]{40}$/u.test(value.commit ?? "")) {
        throw new Error("安装收据无效或来源不是固定影铸仓库");
    }
    return value;
}

function receipt(commit, files) {
    return { schemaVersion: 1, skill: SKILL_NAME, repository: REPOSITORY, branch: BRANCH,
        commit, installedAt: new Date().toISOString(), files };
}

function writeReceipt(root, commit, files) {
    const temporary = path.join(root, `${RECEIPT}.tmp-${crypto.randomUUID()}`);
    fs.writeFileSync(temporary, `${JSON.stringify(receipt(commit, files), null, 2)}\n`, "utf8");
    fs.renameSync(temporary, path.join(root, RECEIPT));
}

function ancestor(first, second, checkout, git) {
    try { git(["merge-base", "--is-ancestor", first, second], checkout); return true; }
    catch (error) { if (error.status === 1) return false; throw error; }
}

export function updateSkill({ installDir, checkOnly = false, git = runGit } = {}) {
    const root = path.resolve(installDir ?? fileURLToPath(new URL("../", import.meta.url)));
    if (path.basename(root) !== SKILL_NAME) throw new Error("目标目录名必须为 short-video-workflow；从维护仓库调用时请指定 --install-dir");
    assertSkill(root);
    if (fs.existsSync(path.join(root, ".git"))) throw new Error("拒绝覆盖 Git checkout，请使用 Skill 安装目录");
    const originalFiles = fileMap(root);
    const originalAllFiles = fileMap(root, false);
    const installed = readReceipt(root);
    const lock = path.join(path.dirname(root), `.${SKILL_NAME}.update-lock`);
    let locked = false;
    let temporary = null;
    let staging = null;
    let backup = null;
    let backupRoot = null;
    let moved = false;
    let activated = false;
    try {
        if (!checkOnly) {
            fs.mkdirSync(lock);
            locked = true;
        }
        temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cineforge-update-"));
        const checkout = path.join(temporary, "checkout");
        git(["clone", "--single-branch", "--branch", BRANCH, "--", REPOSITORY, checkout], temporary);
        const remoteCommit = git(["rev-parse", "HEAD"], checkout).trim();
        if (!/^[a-f0-9]{40}$/u.test(remoteCommit)) throw new Error("远端提交 SHA 无效");
        assertSkill(checkout);
        const remoteFiles = commitFiles(remoteCommit, checkout, git);
        if (!equal(fileMap(checkout), remoteFiles)) throw new Error("下载文件与远端 Git 内容不一致");
        let localCommit = installed?.commit ?? null;
        if (!localCommit) {
            const commits = git(["rev-list", "HEAD"], checkout).trim().split(/\r?\n/u);
            localCommit = commits.find((commit) => equal(originalFiles, commitFiles(commit, checkout, git))) ?? null;
        }
        const result = { skill: SKILL_NAME, repository: REPOSITORY, branch: BRANCH,
            localCommit, remoteCommit, installed: false, newAgentRequired: false };
        if (!localCommit) return { ...result, status: "version_unproven", message: "本地内容不匹配远端历史，可能是定制或未发布版本；保留原安装" };
        if (localCommit === remoteCommit) {
            if (!equal(originalFiles, remoteFiles)) return { ...result, status: "local_modified", message: "提交相同但本地文件有修改；没有上游新版，保留本地内容" };
            if (!checkOnly && !installed) {
                if (!equal(fileMap(root, false), originalAllFiles)) throw new Error("检查期间安装目录发生变化，停止写入");
                writeReceipt(root, remoteCommit, remoteFiles);
            }
            return { ...result, status: "up_to_date", message: "影铸工作流已是最新版本" };
        }
        try { git(["cat-file", "-e", `${localCommit}^{commit}`], checkout); }
        catch { return { ...result, status: "version_unproven", message: "远端历史无法核验本地提交；保留原安装" }; }
        if (ancestor(remoteCommit, localCommit, checkout, git)) return { ...result, status: "local_ahead", message: "本地版本比远端新，不降级" };
        if (!ancestor(localCommit, remoteCommit, checkout, git)) return { ...result, status: "version_unproven", message: "版本历史分叉，不能自动判定新版；保留原安装" };
        if (checkOnly) return { ...result, status: "update_available", message: "发现影铸工作流新版；按仅检查要求未安装" };

        backupRoot = path.resolve(root, "..", "..", "skill-backups", SKILL_NAME);
        fs.mkdirSync(backupRoot, { recursive: true });
        backup = path.join(backupRoot, `${new Date().toISOString().replace(/[:.]/gu, "-")}-${crypto.randomUUID()}`);
        staging = fs.mkdtempSync(path.join(path.dirname(root), `.${SKILL_NAME}.staging-`));
        fs.cpSync(root, staging, { recursive: true, errorOnExist: false });
        for (const entry of MANAGED) {
            const destination = path.join(staging, entry);
            fs.rmSync(destination, { recursive: true, force: true });
            const source = path.join(checkout, entry);
            if (fs.existsSync(source)) {
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.cpSync(source, destination, { recursive: true });
            }
        }
        if (!equal(fileMap(staging), remoteFiles)) throw new Error("暂存文件不完整，停止安装");
        writeReceipt(staging, remoteCommit, remoteFiles);
        if (!equal(fileMap(root, false), originalAllFiles)) throw new Error("下载期间安装目录发生变化，停止覆盖");
        fs.renameSync(root, backup);
        moved = true;
        fs.renameSync(staging, root);
        activated = true;
        staging = null;
        assertSkill(root);
        if (!equal(fileMap(root), remoteFiles)) throw new Error("安装后文件指纹校验失败");
        return { ...result, status: "updated", installed: true, backupPath: backup, newAgentRequired: true,
            message: "已更新影铸工作流。请开启新的 Agent 来启用新版；当前 Agent 不继续执行新版流程。" };
    } catch (error) {
        if (moved) {
            try {
                if (activated) {
                    const rejected = path.join(backupRoot, `failed-install-${crypto.randomUUID()}`);
                    fs.renameSync(root, rejected);
                }
                fs.renameSync(backup, root);
            } catch {
                throw new Error(`更新失败且目录恢复未完成；旧版完整备份：${backup}`, { cause: error });
            }
        }
        throw error;
    } finally {
        if (staging) fs.rmSync(staging, { recursive: true, force: true });
        if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
        if (locked) fs.rmdirSync(lock);
    }
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes("--help")) {
        console.log("影铸更新：node update-skill.mjs [--check] [--install-dir=<short-video-workflow目录>]\n固定来源：https://github.com/YoHoFee/CineForgeWorkflow.git，main 分支");
        return;
    }
    const installArgs = args.filter((arg) => arg.startsWith("--install-dir="));
    if (installArgs.length > 1 || args.some((arg) => arg !== "--check" && !arg.startsWith("--install-dir="))
        || installArgs.some((arg) => !arg.slice("--install-dir=".length))) throw new Error("仅支持 --check 和 --install-dir=<目录>；仓库与分支固定");
    console.log(JSON.stringify(updateSkill({ installDir: installArgs[0]?.slice("--install-dir=".length),
        checkOnly: args.includes("--check") }), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(); }
    catch (error) {
        console.error(JSON.stringify({ status: "failed", skill: SKILL_NAME,
            message: error instanceof Error ? error.message : String(error) }, null, 2));
        process.exitCode = 1;
    }
}
