import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { BRIDGE_HOME, CONFIG_PATH } from './config.js';

const DEFAULT_MODEL = 'deepseek-v4-pro';
const DEFAULT_EFFORT = 'xhigh';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_MODEL = 'sonnet';
const ANTHROPIC_EFFORT = 'xhigh';

export interface SetupOptions {
  assumeYes?: boolean;
}

export interface SetupResult {
  configPath: string;
  provider: 'anthropic' | 'deepseek';
  model: string;
  effort: string;
}

export async function runSetup(options: SetupOptions = {}): Promise<SetupResult> {
  fs.mkdirSync(BRIDGE_HOME, { recursive: true });
  const rl = readline.createInterface({ input, output });
  try {
    console.log('Claude Code Feishu Bridge setup');
    console.log('This wizard will check dependencies, configure Claude Code, and connect your Feishu bot.');
    console.log('');

    await ensureEnvironmentDependencies();
    await ensureClaudeCode(options);

    const existing = readEnvFile(CONFIG_PATH);
    const provider = await askProvider(rl, existing.ANTHROPIC_BASE_URL);
    const providerDefaults = getProviderDefaults(provider);
    const apiKey = await askSecret(rl, providerDefaults.keyLabel, existing.ANTHROPIC_AUTH_TOKEN || existing.ANTHROPIC_API_KEY);
    const baseUrl = provider === 'anthropic'
      ? await askRequired(rl, 'Anthropic-compatible Base URL', existing.ANTHROPIC_BASE_URL || ANTHROPIC_BASE_URL)
      : providerDefaults.baseUrl;
    const feishuAppId = await askRequired(rl, 'Feishu App ID', existing.CFB_FEISHU_APP_ID);
    const feishuAppSecret = await askRequiredSecret(rl, 'Feishu App Secret', existing.CFB_FEISHU_APP_SECRET);
    const workDir = os.homedir();

    const config = {
      CFB_FEISHU_APP_ID: feishuAppId,
      CFB_FEISHU_APP_SECRET: feishuAppSecret,
      CFB_FEISHU_DOMAIN: existing.CFB_FEISHU_DOMAIN || 'feishu',
      CFB_FEISHU_ALLOWED_USERS: existing.CFB_FEISHU_ALLOWED_USERS || '',
      CFB_FEISHU_REQUIRE_MENTION: existing.CFB_FEISHU_REQUIRE_MENTION || 'true',
      CFB_FEISHU_USE_CARDS: existing.CFB_FEISHU_USE_CARDS || 'true',
      CFB_CLAUDE_WORKDIR: workDir,
      CFB_CLAUDE_EXECUTABLE: existing.CFB_CLAUDE_EXECUTABLE || 'claude',
      CFB_CLAUDE_MODEL: providerDefaults.model,
      CFB_CLAUDE_EFFORT: providerDefaults.effort,
      CFB_CLAUDE_SKIP_PERMISSIONS: existing.CFB_CLAUDE_SKIP_PERMISSIONS || 'true',
      CFB_DEFAULT_SESSION_ID: existing.CFB_DEFAULT_SESSION_ID || '',
      CFB_NO_EVENT_TIMEOUT_MS: existing.CFB_NO_EVENT_TIMEOUT_MS || String(10 * 60 * 1000),
      CFB_HARD_TIMEOUT_MS: existing.CFB_HARD_TIMEOUT_MS || String(90 * 60 * 1000),
      CFB_REPLY_MAX_CHARS: existing.CFB_REPLY_MAX_CHARS || '3500',
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_API_KEY: apiKey,
      ANTHROPIC_MODEL: providerDefaults.model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: providerDefaults.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: providerDefaults.model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: providerDefaults.model,
      ANTHROPIC_SMALL_FAST_MODEL: providerDefaults.model,
      CLAUDE_CODE_SUBAGENT_MODEL: providerDefaults.model,
      CLAUDE_CODE_EFFORT_LEVEL: providerDefaults.effort,
    };

    writeEnvFile(CONFIG_PATH, config);
    writeClaudeSettings(config);
    console.log('');
    console.log(`Config written to ${CONFIG_PATH}`);
    console.log(`Provider: ${provider}`);
    console.log(`Model: ${providerDefaults.model}`);
    console.log(`Thinking effort: ${providerDefaults.effort}`);
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Claude Code work directory: ${workDir}`);
    return {
      configPath: CONFIG_PATH,
      provider,
      model: providerDefaults.model,
      effort: providerDefaults.effort,
    };
  } finally {
    rl.close();
  }
}

async function ensureEnvironmentDependencies(): Promise<void> {
  console.log('Checking local dependencies...');
  const nodeVersion = process.versions.node;
  const major = Number(nodeVersion.split('.')[0]);
  if (!Number.isFinite(major) || major < 20) {
    throw new Error(`Node.js 20+ is required. Current Node.js version: ${nodeVersion}`);
  }
  console.log(`Node.js found: ${nodeVersion}`);

  const npmCheck = spawnSync('npm', ['--version'], { encoding: 'utf-8', shell: process.platform === 'win32' });
  if (npmCheck.status !== 0) {
    throw new Error('npm was not found. Please install Node.js 20+ from https://nodejs.org, then run this file again.');
  }
  console.log(`npm found: ${(npmCheck.stdout || npmCheck.stderr).trim()}`);
}

async function ensureClaudeCode(options: SetupOptions): Promise<void> {
  const existing = spawnSync('claude', ['--version'], { encoding: 'utf-8', shell: process.platform === 'win32' });
  if (existing.status === 0) {
    console.log(`Claude Code found: ${(existing.stdout || existing.stderr).trim()}`);
    return;
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

async function askProvider(rl: readline.Interface, existingBaseUrl = ''): Promise<'anthropic' | 'deepseek'> {
  const fallback = existingBaseUrl && existingBaseUrl !== DEEPSEEK_BASE_URL ? '1' : '2';
  while (true) {
    console.log('');
    console.log('Choose model provider:');
    console.log('  1) Anthropic native subscription');
    console.log('  2) DeepSeek v4 pro via Anthropic-compatible gateway');
    const answer = (await rl.question(`Provider [${fallback}]: `)).trim() || fallback;
    if (answer === '1') return 'anthropic';
    if (answer === '2') return 'deepseek';
    console.log('Please enter 1 or 2.');
  }
}

function getProviderDefaults(provider: 'anthropic' | 'deepseek'): {
  baseUrl: string;
  effort: string;
  keyLabel: string;
  model: string;
} {
  if (provider === 'anthropic') {
    return {
      baseUrl: ANTHROPIC_BASE_URL,
      effort: ANTHROPIC_EFFORT,
      keyLabel: 'Anthropic API key',
      model: ANTHROPIC_MODEL,
    };
  }
  return {
    baseUrl: DEEPSEEK_BASE_URL,
    effort: DEFAULT_EFFORT,
    keyLabel: 'DeepSeek / gateway API key',
    model: DEFAULT_MODEL,
  };
}

async function askRequired(rl: readline.Interface, label: string, fallback = ''): Promise<string> {
  while (true) {
    const value = await ask(rl, label, fallback);
    if (value) return value;
    console.log(`${label} is required.`);
  }
}

async function askRequiredSecret(rl: readline.Interface, label: string, fallback = ''): Promise<string> {
  return askRequired(rl, label, fallback);
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
