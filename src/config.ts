import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Config {
  homeDir: string;
  dataDir: string;
  runtimeDir: string;
  logsDir: string;
  feishuAppId: string;
  feishuAppSecret: string;
  feishuDomain: 'feishu' | 'lark';
  feishuAllowedUsers: string[];
  feishuRequireMention: boolean;
  claudeWorkDir: string;
  claudeExecutable: string;
  claudeModel: string;
  claudeSkipPermissions: boolean;
  defaultSessionId?: string;
  noEventTimeoutMs: number;
  hardTimeoutMs: number;
  replyMaxChars: number;
}

export const BRIDGE_HOME = process.env.CFB_HOME || path.join(os.homedir(), '.claude-feishu-bridge');
export const CONFIG_PATH = path.join(BRIDGE_HOME, 'config.env');

function parseEnvFile(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries.set(key, value);
  }
  return entries;
}

function loadEnvEntries(): Map<string, string> {
  const entries = new Map<string, string>();
  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    for (const [key, value] of parseEnvFile(content)) {
      entries.set(key, value);
    }
  } catch {
    // Allow pure process.env usage during local development.
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      entries.set(key, value);
    }
  }
  return entries;
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function toNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function required(entries: Map<string, string>, key: string): string {
  const value = entries.get(key);
  if (!value) {
    throw new Error(`Missing required config: ${key}`);
  }
  return value;
}

function resolveClaudeExecutable(entries: Map<string, string>): string {
  const configured = entries.get('CFB_CLAUDE_EXECUTABLE');
  if (configured) return configured;

  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'claude.cmd'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'claude.ps1'),
    path.join(path.dirname(process.execPath), 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'claude';
}

export function loadConfig(): Config {
  const entries = loadEnvEntries();
  const homeDir = BRIDGE_HOME;
  const feishuDomain = entries.get('CFB_FEISHU_DOMAIN') === 'lark' ? 'lark' : 'feishu';

  const config: Config = {
    homeDir,
    dataDir: path.join(homeDir, 'data'),
    runtimeDir: path.join(homeDir, 'runtime'),
    logsDir: path.join(homeDir, 'logs'),
    feishuAppId: required(entries, 'CFB_FEISHU_APP_ID'),
    feishuAppSecret: required(entries, 'CFB_FEISHU_APP_SECRET'),
    feishuDomain,
    feishuAllowedUsers: splitCsv(entries.get('CFB_FEISHU_ALLOWED_USERS')),
    feishuRequireMention: toBoolean(entries.get('CFB_FEISHU_REQUIRE_MENTION'), true),
    claudeWorkDir: entries.get('CFB_CLAUDE_WORKDIR') || process.cwd(),
    claudeExecutable: resolveClaudeExecutable(entries),
    claudeModel: entries.get('CFB_CLAUDE_MODEL') || 'claude-sonnet-4-6',
    claudeSkipPermissions: toBoolean(entries.get('CFB_CLAUDE_SKIP_PERMISSIONS'), true),
    defaultSessionId: entries.get('CFB_DEFAULT_SESSION_ID') || undefined,
    noEventTimeoutMs: toNumber(entries.get('CFB_NO_EVENT_TIMEOUT_MS'), 10 * 60 * 1000),
    hardTimeoutMs: toNumber(entries.get('CFB_HARD_TIMEOUT_MS'), 90 * 60 * 1000),
    replyMaxChars: toNumber(entries.get('CFB_REPLY_MAX_CHARS'), 3500),
  };

  if (!fs.existsSync(config.claudeWorkDir)) {
    throw new Error(`Configured workdir does not exist: ${config.claudeWorkDir}`);
  }

  if (config.claudeExecutable !== 'claude' && !fs.existsSync(config.claudeExecutable)) {
    throw new Error(`Configured claude executable does not exist: ${config.claudeExecutable}`);
  }

  return config;
}

export function ensureBridgeDirs(config: Config): void {
  for (const dir of [config.homeDir, config.dataDir, config.runtimeDir, config.logsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
