import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { BRIDGE_HOME, CONFIG_PATH } from './config.js';

const DEFAULT_MODEL = 'deepseek-v4-pro';
const DEFAULT_EFFORT = 'xhigh';
const DEFAULT_BASE_URL = 'https://code.ppchat.vip';

export interface SetupOptions {
  assumeYes?: boolean;
}

export async function runSetup(options: SetupOptions = {}): Promise<void> {
  fs.mkdirSync(BRIDGE_HOME, { recursive: true });
  const rl = readline.createInterface({ input, output });
  try {
    console.log('Claude Code Feishu Bridge setup');
    console.log('This wizard will configure DeepSeek v4 pro with xhigh thinking by default.');
    console.log('');

    await ensureClaudeCode(options);

    const existing = readEnvFile(CONFIG_PATH);
    const feishuAppId = await ask(rl, 'Feishu App ID', existing.CFB_FEISHU_APP_ID);
    const feishuAppSecret = await askSecret(rl, 'Feishu App Secret', existing.CFB_FEISHU_APP_SECRET);
    const apiKey = await askSecret(
      rl,
      'DeepSeek / Anthropic-compatible API key',
      existing.ANTHROPIC_AUTH_TOKEN || existing.ANTHROPIC_API_KEY,
    );
    const baseUrl = await ask(rl, 'Anthropic-compatible base URL', existing.ANTHROPIC_BASE_URL || DEFAULT_BASE_URL);
    const workDir = await ask(rl, 'Claude Code work directory', existing.CFB_CLAUDE_WORKDIR || os.homedir());

    const config = {
      CFB_FEISHU_APP_ID: feishuAppId,
      CFB_FEISHU_APP_SECRET: feishuAppSecret,
      CFB_FEISHU_DOMAIN: existing.CFB_FEISHU_DOMAIN || 'feishu',
      CFB_FEISHU_ALLOWED_USERS: existing.CFB_FEISHU_ALLOWED_USERS || '',
      CFB_FEISHU_REQUIRE_MENTION: existing.CFB_FEISHU_REQUIRE_MENTION || 'true',
      CFB_CLAUDE_WORKDIR: workDir,
      CFB_CLAUDE_EXECUTABLE: existing.CFB_CLAUDE_EXECUTABLE || 'claude',
      CFB_CLAUDE_MODEL: DEFAULT_MODEL,
      CFB_CLAUDE_EFFORT: DEFAULT_EFFORT,
      CFB_CLAUDE_SKIP_PERMISSIONS: existing.CFB_CLAUDE_SKIP_PERMISSIONS || 'true',
      CFB_DEFAULT_SESSION_ID: existing.CFB_DEFAULT_SESSION_ID || '',
      CFB_NO_EVENT_TIMEOUT_MS: existing.CFB_NO_EVENT_TIMEOUT_MS || String(10 * 60 * 1000),
      CFB_HARD_TIMEOUT_MS: existing.CFB_HARD_TIMEOUT_MS || String(90 * 60 * 1000),
      CFB_REPLY_MAX_CHARS: existing.CFB_REPLY_MAX_CHARS || '3500',
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_API_KEY: apiKey,
      ANTHROPIC_MODEL: DEFAULT_MODEL,
      ANTHROPIC_DEFAULT_OPUS_MODEL: DEFAULT_MODEL,
      ANTHROPIC_DEFAULT_SONNET_MODEL: DEFAULT_MODEL,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: DEFAULT_MODEL,
      ANTHROPIC_SMALL_FAST_MODEL: DEFAULT_MODEL,
      CLAUDE_CODE_SUBAGENT_MODEL: DEFAULT_MODEL,
      CLAUDE_CODE_EFFORT_LEVEL: DEFAULT_EFFORT,
    };

    writeEnvFile(CONFIG_PATH, config);
    writeClaudeSettings(config);
    console.log('');
    console.log(`Config written to ${CONFIG_PATH}`);
    console.log(`Model: ${DEFAULT_MODEL}`);
    console.log(`Thinking effort: ${DEFAULT_EFFORT}`);
  } finally {
    rl.close();
  }
}

async function ensureClaudeCode(options: SetupOptions): Promise<void> {
  const existing = spawnSync('claude', ['--version'], { encoding: 'utf-8', shell: process.platform === 'win32' });
  if (existing.status === 0) {
    console.log(`Claude Code found: ${(existing.stdout || existing.stderr).trim()}`);
    return;
  }

  const npmCheck = spawnSync('npm', ['--version'], { encoding: 'utf-8', shell: process.platform === 'win32' });
  if (npmCheck.status !== 0) {
    throw new Error('npm was not found. Please install Node.js 20+ first, then rerun setup.');
  }

  if (!options.assumeYes) {
    console.log('Claude Code was not found. Installing @anthropic-ai/claude-code globally with npm...');
  }
  const install = spawnSync('npm', ['install', '-g', '@anthropic-ai/claude-code'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (install.status !== 0) {
    throw new Error('Failed to install Claude Code with npm.');
  }
}

async function ask(rl: readline.Interface, label: string, fallback = ''): Promise<string> {
  const suffix = fallback ? ` [${maskIfSecret(label, fallback)}]` : '';
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || fallback;
}

async function askSecret(rl: readline.Interface, label: string, fallback = ''): Promise<string> {
  return ask(rl, label, fallback);
}

function maskIfSecret(label: string, value: string): string {
  if (!/secret|key|token/i.test(label)) return value;
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function readEnvFile(filePath: string): Record<string, string> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const result: Record<string, string> = {};
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const index = line.indexOf('=');
      if (index === -1) continue;
      result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    return result;
  } catch {
    return {};
  }
}

function writeEnvFile(filePath: string, values: Record<string, string>): void {
  const lines = [
    '# Generated by claude-feishu-bridge setup.',
    '# Do not commit this file. It contains secrets.',
    '',
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
    '',
  ];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

function writeClaudeSettings(values: Record<string, string>): void {
  const settingsPath = path.join(BRIDGE_HOME, 'claude-settings.json');
  const settings = {
    env: {
      ANTHROPIC_AUTH_TOKEN: values.ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_API_KEY: values.ANTHROPIC_API_KEY,
      ANTHROPIC_BASE_URL: values.ANTHROPIC_BASE_URL,
      ANTHROPIC_MODEL: values.ANTHROPIC_MODEL,
      ANTHROPIC_DEFAULT_OPUS_MODEL: values.ANTHROPIC_DEFAULT_OPUS_MODEL,
      ANTHROPIC_DEFAULT_SONNET_MODEL: values.ANTHROPIC_DEFAULT_SONNET_MODEL,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: values.ANTHROPIC_DEFAULT_HAIKU_MODEL,
      ANTHROPIC_SMALL_FAST_MODEL: values.ANTHROPIC_SMALL_FAST_MODEL,
      CLAUDE_CODE_SUBAGENT_MODEL: values.CLAUDE_CODE_SUBAGENT_MODEL,
      CLAUDE_CODE_EFFORT_LEVEL: values.CLAUDE_CODE_EFFORT_LEVEL,
    },
  };
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
}
