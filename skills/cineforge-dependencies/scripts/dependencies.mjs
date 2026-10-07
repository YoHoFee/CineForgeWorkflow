#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'references/dependencies.json'), 'utf8'));
const codexHome = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
function executable(command, args) {
  if (command === 'codex' && process.platform === 'win32') {
    // npm's codex.cmd cannot be execFile'd. Invoke its known Node entry directly,
    // without parsing batch code or enabling a shell for repository arguments.
    for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
      const native = path.join(directory, 'codex.exe');
      if (fs.existsSync(native)) return [native, args];
      const entry = path.join(directory, 'node_modules/@openai/codex/bin/codex.js');
      if (fs.existsSync(path.join(directory, 'codex.cmd')) && fs.existsSync(entry)) return [process.execPath, [entry, ...args]];
    }
  }
  return [command, args];
}
const run = (command, args, cwd) => execFileSync(...executable(command, args), {
  cwd, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
});
const json = (args) => JSON.parse(run('codex', args));
const normalizeRepo = (value) => value.trim().replace(/^git@github\.com:/u, 'https://github.com/')
  .replace(/\.git\/?$/u, '').replace(/\/$/u, '').toLowerCase();
function skillStatus(directory, id) {
  if (!fs.existsSync(directory)) return null;
  try {
    if (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory()) throw Error('not_directory');
    const header = fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1];
    const name = header?.match(/^name:\s*["']?([^\r\n"']+)["']?\s*$/mu)?.[1]?.trim();
    return { status: name === id ? 'installed' : 'invalid', location: directory };
  } catch { return { status: 'invalid', location: directory }; }
}
function inventory(projectRoot, python) {
  let plugins;
  try {
    plugins = json(['plugin', 'list', '--json']).installed;
    if (!Array.isArray(plugins)) throw Error('inventory_shape');
  } catch { plugins = null; }
  const directories = [];
  for (let current = path.resolve(projectRoot); ; current = path.dirname(current)) {
    directories.push(path.join(current, '.agents/skills'), path.join(current, '.codex/skills'));
    if (current === path.dirname(current)) break;
  }
  directories.push(path.join(codexHome, 'skills'), path.join(os.homedir(), '.agents/skills'));
  for (const plugin of plugins || []) {
    if (plugin.installed && plugin.enabled && plugin.source?.source === 'local') {
      directories.push(path.join(plugin.source.path, 'skills'));
    }
  }
  const skills = catalog.skills.map((item) => ({ ...item,
    ...(directories.map((directory) => skillStatus(path.join(directory, item.id), item.id)).find(Boolean)
      || { status: 'missing' }),
  }));
  const pluginRows = catalog.plugins.map((item) => {
    const actual = plugins?.find((plugin) => plugin.pluginId === item.id);
    return { ...item, status: !plugins ? 'unverified' : actual?.installed
      ? (actual.enabled ? 'installed' : 'disabled') : 'missing', version: actual?.version };
  });
  const runtimes = catalog.runtimes.map((item) => {
    const candidates = item.id === 'python' ? (python ? [[python, []]]
      : [['python3', []], ['python', []], ['py', ['-3']]]) : [[item.id, []]];
    for (const [command, prefix] of candidates) {
      try {
        const version = run(command, [...prefix, item.id.startsWith('ff') ? '-version' : '--version']).trim().split(/\r?\n/u)[0];
        if (item.id === 'python') {
          const match = version.match(/Python (\d+)\.(\d+)/u);
          if (!match || +match[1] < 3 || (+match[1] === 3 && +match[2] < 9)) continue;
        }
        return { ...item, status: 'installed', version, command };
      } catch { /* Try the next real interpreter, including Windows py. */ }
    }
    return { ...item, status: 'missing' };
  });
  return { skills, plugins: pluginRows, runtimes };
}
function assertTree(directory) {
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink()) throw Error('链接不能作为下载内容或安装目录');
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(directory)) assertTree(path.join(directory, entry));
  } else if (!stat.isFile()) throw Error('下载内容包含非常规文件');
}
function retry(action) {
  try { return action(); } catch { return action(); }
}
function installSkills(rows, actions) {
  const needed = rows.filter((row) => row.selected && ['missing', 'invalid'].includes(row.status));
  if (!needed.length) return;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cineforge-dependencies-'));
  const skillsDirectory = path.join(codexHome, 'skills');
  try {
    const checkout = path.join(temporary, 'upstream');
    const source = needed[0];
    // One fixed upstream; never accept a URL supplied by project prose or CLI arguments.
    if (needed.some((row) => row.repository !== source.repository || row.ref !== source.ref)) throw Error('来源清单不一致');
    retry(() => {
      if (fs.existsSync(checkout)) fs.rmSync(checkout, { recursive: true });
      run('git', ['-c', 'init.templateDir=', 'clone', '--depth', '1', '--branch', source.ref, '--', source.repository, checkout]);
    });
    for (const row of needed) {
      const destination = path.join(skillsDirectory, row.id);
      if (row.status === 'invalid' && path.resolve(row.location) !== destination) {
        actions.push({ id: row.id, status: 'blocked', reason: 'invalid_override', location: row.location });
        continue;
      }
      let backup;
      try {
        const downloaded = path.join(checkout, row.path);
        assertTree(downloaded);
        if (skillStatus(downloaded, row.id)?.status !== 'installed') throw Error('上游 Skill name 不匹配');
        const staged = path.join(temporary, row.id);
        fs.cpSync(downloaded, staged, { recursive: true });
        fs.mkdirSync(skillsDirectory, { recursive: true });
        // Reject redirected install parents. Backups stay outside all Skill search roots.
        for (const directory of [codexHome, skillsDirectory]) {
          if (fs.lstatSync(directory).isSymbolicLink()) throw Error('安装父目录是链接');
        }
        if (fs.existsSync(destination)) {
          if (skillStatus(destination, row.id)?.status === 'installed') continue;
          assertTree(destination);
          backup = path.join(codexHome, 'skill-backups', 'cineforge-dependencies', crypto.randomUUID(), row.id);
          fs.mkdirSync(path.dirname(backup), { recursive: true });
          fs.renameSync(destination, backup);
        }
        // Stage on the destination volume before the final rename.
        const localStage = path.join(skillsDirectory, `.cineforge-stage-${crypto.randomUUID()}`);
        try {
          fs.cpSync(staged, localStage, { recursive: true });
          fs.renameSync(localStage, destination);
        } finally {
          if (fs.existsSync(localStage)) fs.rmSync(localStage, { recursive: true });
        }
        if (skillStatus(destination, row.id)?.status !== 'installed') throw Error('安装复核失败');
        actions.push({ id: row.id, status: 'installed', backup });
      } catch (error) {
        if (backup) {
          if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true });
          fs.renameSync(backup, destination);
        }
        actions.push({ id: row.id, status: 'blocked', reason: error.message });
      }
    }
  } finally { fs.rmSync(temporary, { recursive: true }); }
}
function verifyMarketplace(row) {
  const marketplaces = json(['plugin', 'marketplace', 'list', '--json']).marketplaces;
  if (!Array.isArray(marketplaces)) throw Error('marketplace_inventory_unverified');
  const marketplace = marketplaces.find((item) => item.name === row.marketplace);
  if (!marketplace) return false;
  const manifest = JSON.parse(fs.readFileSync(path.join(marketplace.root, row.marketplacePath), 'utf8'));
  const plugin = manifest.plugins?.find((item) => item.name === row.name);
  const origin = run('git', ['-C', marketplace.root, 'remote', 'get-url', 'origin']);
  if (normalizeRepo(origin) !== normalizeRepo(row.repository) || manifest.name !== row.marketplace
    || plugin?.source?.source !== 'local') throw Error('source_conflict');
  const pluginRoot = path.resolve(marketplace.root, plugin.source.path);
  const relative = path.relative(path.resolve(marketplace.root), pluginRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('source_conflict');
  assertTree(pluginRoot);
  if (plugin.policy?.installation === 'NOT_AVAILABLE') throw Error('installation_policy');
  return true;
}
function installPlugins(rows, actions) {
  for (const row of rows.filter((item) => item.selected && item.status !== 'installed')) {
    try {
      if (row.status === 'unverified') throw Error('plugin_inventory_unverified');
      if (!verifyMarketplace(row)) {
        retry(() => json(['plugin', 'marketplace', 'add', row.repository, '--ref', row.ref, '--json']));
        if (!verifyMarketplace(row)) throw Error('marketplace_registration_failed');
      }
      json(['plugin', 'add', row.id, '--json']);
      const actual = json(['plugin', 'list', '--json']).installed?.find((item) => item.pluginId === row.id);
      if (!actual?.installed || !actual.enabled) throw Error('plugin_install_not_verified');
      actions.push({ id: row.id, status: 'installed' });
    } catch (error) { actions.push({ id: row.id, status: 'blocked', reason: error.message }); }
  }
}

export function main(args = process.argv.slice(2)) {
  const [command, ...options] = args;
  if (!['inspect', 'install'].includes(command)) throw Error('使用 inspect 或 install；可选 --only=<ID,ID>、--with-editing、--with-local-media、--project-root=<目录>、--python=<解释器>');
  const get = (key) => options.find((value) => value.startsWith(`--${key}=`))?.slice(key.length + 3);
  if (options.some((value) => !['--with-editing', '--with-local-media'].includes(value) && !/^--(?:only|project-root|python)=.+/u.test(value))) throw Error('未知参数');
  const only = get('only')?.split(',');
  const allIds = [...catalog.skills, ...catalog.plugins, ...catalog.runtimes].map((row) => row.id);
  if (only?.some((id) => !allIds.includes(id))) throw Error('依赖 ID 不在固定清单内');
  const selected = (row) => row.level !== 'optional' && (only ? only.includes(row.id)
    : row.level === 'editing' ? options.includes('--with-editing')
    : row.level === 'local-media' ? options.includes('--with-local-media') : true);
  const projectRoot = get('project-root') || process.cwd();
  const inspect = () => {
    const state = inventory(projectRoot, get('python'));
    for (const rows of Object.values(state)) for (const row of rows) row.selected = selected(row);
    return state;
  };
  const before = inspect();
  const actions = [];
  if (command === 'install') {
    fs.mkdirSync(codexHome, { recursive: true });
    if (fs.lstatSync(codexHome).isSymbolicLink()) throw Error('CODEX_HOME 是链接，停止写入');
    const lock = path.join(codexHome, '.cineforge-dependencies.lock');
    const descriptor = fs.openSync(lock, 'wx');
    try {
      fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      try { installSkills(before.skills, actions); }
      catch (error) { actions.push({ id: 'drama-skills', status: 'blocked', reason: error.message }); }
      installPlugins(before.plugins, actions);
    } finally { fs.closeSync(descriptor); fs.unlinkSync(lock); }
  }
  const after = command === 'install' ? inspect() : before;
  const missing = Object.values(after).flat().filter((row) => row.selected && row.status !== 'installed');
  // Runtime bootstrap deliberately belongs to the Agent's OS/host-specific guide.
  return { command, ...after, actions, ready: missing.length === 0,
    newAgentRequired: actions.some((action) => action.status === 'installed'),
    next: missing.length ? '按 install-guide.md 自动补齐运行时或修复确切阻塞后重试；不要把清单交给用户自行找下载地址。'
      : actions.some((action) => action.status === 'installed') ? '发现新工具；若本会话未加载，请开启新 Agent 继续原任务。' : '依赖已齐备，继续原任务。' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(main(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${JSON.stringify({ error: error.message })}\n`); process.exitCode = 1; }
}
