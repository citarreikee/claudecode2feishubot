import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import type { Config } from './config.js';
import { buildResumeRecoverySummary, withRecoveryContext } from './resume-recovery.js';
import { StateStore } from './state-store.js';

const BRIDGE_INSTRUCTION = [
  'You are replying through a Feishu bridge.',
  'Anything you output as assistant text will be sent back into the current Feishu chat.',
  'Do not claim that you cannot send messages into the chat when the user is asking you to reply in chat.',
].join('\n');

export interface ClaudeTurnResult {
  sessionId: string;
  text: string;
  resumed: boolean;
  messageCount: number;
}

export interface ClaudeTurnHooks {
  onAssistantMessage?: (text: string) => Promise<void>;
  onFinal?: () => Promise<void>;
}

class NoEventTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoEventTimeoutError';
  }
}

export class ClaudeCliBridge {
  private readonly config: Config;
  private readonly store: StateStore;
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(config: Config, store: StateStore) {
    this.config = config;
    this.store = store;
  }

  isBusy(chatId: string): boolean {
    return this.chains.has(chatId);
  }

  reset(chatId: string): void {
    this.store.clearSession(chatId);
  }

  getSessionId(chatId: string): string | undefined {
    return this.store.getSessionId(chatId);
  }

  runTurn(chatId: string, prompt: string, hooks: ClaudeTurnHooks = {}): Promise<ClaudeTurnResult> {
    return this.enqueue(chatId, async () => {
      const savedSessionId = this.store.getSessionId(chatId) || this.config.defaultSessionId;
      const existingRecoverySummary = this.store.getRecoverySummary(chatId);
      const initialPrompt = savedSessionId
        ? prompt
        : withRecoveryContext(prompt, existingRecoverySummary);
      try {
        const result = await this.invoke(initialPrompt, savedSessionId, hooks);
        this.store.setSessionId(chatId, result.sessionId);
        return result;
      } catch (error) {
        if (savedSessionId && shouldRetryFresh(error)) {
          console.warn('[bridge] Resume failed, retrying fresh session for chat', chatId);
          const recoverySummary = this.config.resumeRecoveryEnabled
            ? buildResumeRecoverySummary(savedSessionId, this.config)
            : '';
          if (recoverySummary) {
            this.store.setRecoverySummary(chatId, savedSessionId, recoverySummary);
          }
          this.store.clearSession(chatId);
          const result = await this.invoke(withRecoveryContext(prompt, recoverySummary || existingRecoverySummary), undefined, hooks);
          this.store.setSessionId(chatId, result.sessionId);
          return result;
        }
        throw error;
      }
    });
  }

  private enqueue<T>(chatId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(chatId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.chains.set(chatId, current);
    current.finally(() => {
      if (this.chains.get(chatId) === current) {
        this.chains.delete(chatId);
      }
    });
    return current;
  }

  private invoke(prompt: string, sessionId?: string, hooks: ClaudeTurnHooks = {}): Promise<ClaudeTurnResult> {
    const resumed = Boolean(sessionId);
    const claudeArgs: string[] = [
      '--print',
      '--verbose',
      '--output-format',
      'stream-json',
      '--model',
      this.config.claudeModel,
      '--append-system-prompt',
      BRIDGE_INSTRUCTION,
    ];

    if (this.config.claudeEffort) {
      claudeArgs.push('--effort', this.config.claudeEffort);
    }

    if (this.config.claudeSkipPermissions) {
      claudeArgs.push('--dangerously-skip-permissions');
    }

    if (sessionId) {
      claudeArgs.push('--resume', sessionId);
    }

    claudeArgs.push(prompt);

    const spawnSpec = resolveClaudeSpawn(this.config.claudeExecutable, claudeArgs);

    return new Promise((resolve, reject) => {
      const child = spawn(spawnSpec.command, spawnSpec.args, {
        cwd: this.config.claudeWorkDir,
        env: {
          ...process.env,
          ...this.config.claudeEnv,
        },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let activeSessionId = sessionId ?? '';
      let sawResult = false;
      const messages: string[] = [];
      const stderrLines: string[] = [];
      let messageCount = 0;
      let settled = false;

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(noEventTimer);
        clearTimeout(hardTimer);
        reject(error);
      };

      const finish = async (): Promise<void> => {
        if (settled) return;
        settled = true;
        clearTimeout(noEventTimer);
        clearTimeout(hardTimer);
        if (!activeSessionId) {
          reject(new Error('Claude did not return a session id.'));
          return;
        }
        try {
          if (hooks.onFinal && messageCount > 0) {
            await hooks.onFinal();
          }
          resolve({
            sessionId: activeSessionId,
            text: messages.join('\n\n').trim(),
            resumed,
            messageCount,
          });
        } catch (error) {
          reject(error);
        }
      };

      const resetNoEventTimeout = (): void => {
        clearTimeout(noEventTimer);
        noEventTimer = setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
          fail(new NoEventTimeoutError(`Claude produced no events for ${this.config.noEventTimeoutMs}ms.`));
        }, this.config.noEventTimeoutMs);
        noEventTimer.unref();
      };

      let noEventTimer = setTimeout(() => undefined, this.config.noEventTimeoutMs);
      const hardTimer = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
        fail(new Error(`Claude exceeded hard timeout of ${this.config.hardTimeoutMs}ms.`));
      }, this.config.hardTimeoutMs);
      hardTimer.unref();
      resetNoEventTimeout();

      child.on('error', (error) => {
        fail(error);
      });

      const stdoutReader = readline.createInterface({ input: child.stdout });
      stdoutReader.on('line', (line) => {
        resetNoEventTimeout();
        if (!line.trim()) return;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }

        if (event.type === 'system' && typeof event.session_id === 'string') {
          activeSessionId = event.session_id;
          return;
        }

        if (event.type === 'assistant') {
          const msg = event.message as { content?: Array<{ type: string; text?: string }> } | undefined;
          const text = (msg?.content ?? [])
            .filter((block) => block.type === 'text')
            .map((block) => block.text ?? '')
            .join('')
            .trim();
          if (text) {
            messages.push(text);
            messageCount += 1;
            if (hooks.onAssistantMessage) {
              stdoutReader.pause();
              Promise.resolve(hooks.onAssistantMessage(text))
                .then(() => {
                  stdoutReader.resume();
                })
                .catch((error) => {
                  fail(error instanceof Error ? error : new Error(String(error)));
                });
            }
          }
          return;
        }

        if (event.type === 'result') {
          sawResult = true;
          if (typeof event.session_id === 'string' && !activeSessionId) {
            activeSessionId = event.session_id;
          }
          if (event.subtype === 'error' || event.is_error === true) {
            const message = formatClaudeErrorResult(event);
            fail(new Error(message));
            return;
          }
          void finish();
          return;
        }

        if (event.type === 'error') {
          fail(new Error(typeof event.error === 'string' ? event.error : 'Claude returned an error event.'));
        }
      });

      const stderrReader = readline.createInterface({ input: child.stderr });
      stderrReader.on('line', (line) => {
        resetNoEventTimeout();
        if (!line.trim()) return;
        stderrLines.push(line);
      });

      child.on('close', (code) => {
        if (settled) return;
        if (code !== 0) {
          fail(new Error(stderrLines.join('\n') || `Claude exited with code ${code}`));
          return;
        }
        if (!sawResult) {
          fail(new Error(stderrLines.join('\n') || 'Claude exited without a result event.'));
          return;
        }
        void finish();
      });
    });
  }
}

function shouldRetryFresh(error: unknown): boolean {
  if (error instanceof NoEventTimeoutError) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('resume') ||
    message.includes('session') ||
    message.includes('thread') ||
    message.includes('result event') ||
    message.includes('error result')
  );
}

function formatClaudeErrorResult(event: Record<string, unknown>): string {
  const directMessage = typeof event.result === 'string'
    ? event.result
    : typeof event.error === 'string'
      ? event.error
      : '';
  if (directMessage) return directMessage;

  const summary: Record<string, unknown> = {};
  for (const key of ['subtype', 'is_error', 'api_error_status', 'session_id', 'terminal_reason']) {
    if (event[key] !== undefined) {
      summary[key] = event[key];
    }
  }

  return `Claude returned an error result: ${JSON.stringify(summary)}`;
}

function resolveClaudeSpawn(
  executable: string,
  args: string[],
): { command: string; args: string[] } {
  if (process.platform !== 'win32') {
    return { command: executable, args };
  }

  const lowered = executable.toLowerCase();
  if (lowered.endsWith('.ps1')) {
    return {
      command: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', executable, ...args],
    };
  }

  if (lowered === 'claude') {
    const ps1Path = path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'claude.ps1');
    return {
      command: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1Path, ...args],
    };
  }

  return { command: executable, args };
}
