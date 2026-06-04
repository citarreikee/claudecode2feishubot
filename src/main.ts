import { ClaudeCliBridge } from './claude-cli.js';
import { ensureBridgeDirs, loadConfig } from './config.js';
import { FeishuBot } from './feishu-bot.js';
import { StateStore } from './state-store.js';

const FINAL_REPLY_MARKER = '---- Final Answer ----';

export async function runBridge(): Promise<void> {
  const config = loadConfig();
  ensureBridgeDirs(config);

  const store = new StateStore(config.dataDir);
  const feishu = new FeishuBot(config);
  const claude = new ClaudeCliBridge(config, store);

  await feishu.start();

  let shuttingDown = false;
  const shutdown = async (signal?: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[bridge] Shutting down${signal ? ` (${signal})` : ''}`);
    await feishu.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGHUP', () => void shutdown('SIGHUP'));
  process.on('unhandledRejection', (error) => {
    console.error('[bridge] unhandledRejection:', error);
  });
  process.on('uncaughtException', (error) => {
    console.error('[bridge] uncaughtException:', error.stack || error.message);
  });
  process.on('beforeExit', (code) => {
    console.log(`[bridge] beforeExit code=${code}`);
  });
  process.on('exit', (code) => {
    console.log(`[bridge] exit code=${code}`);
  });

  setInterval(() => undefined, 45_000);

  while (!shuttingDown) {
    const inbound = await feishu.consumeOne();
    if (!inbound) break;

    void handleInbound(inbound, feishu, claude).catch(async (error) => {
      console.error(
        '[bridge] Failed to handle inbound message:',
        error instanceof Error ? error.stack || error.message : error,
      );
      try {
        await feishu.sendStatusCard(inbound.chatId, 'Bridge Execution Failed', toUserError(error), 'danger');
      } catch (sendError) {
        console.error('[bridge] Failed to send error reply:', sendError);
      }
    });
  }
}

async function handleInbound(
  inbound: { chatId: string; text: string },
  feishu: FeishuBot,
  claude: ClaudeCliBridge,
): Promise<void> {
  const { chatId, text } = inbound;
  const trimmed = text.trim();

  if (trimmed === '/new' || trimmed === '/reset') {
    claude.reset(chatId);
    await feishu.sendStatusCard(chatId, 'Session Reset', 'Cleared the current Claude session for this chat. The next message will start fresh.', 'success');
    return;
  }

  if (trimmed === '/status') {
    const sessionId = claude.getSessionId(chatId);
    await feishu.sendStatusCard(
      chatId,
      'Bridge Status',
      sessionId
        ? `Current Claude session: ${sessionId}${claude.isBusy(chatId) ? '\nStatus: busy' : ''}`
        : 'No Claude session is currently bound to this chat.',
      claude.isBusy(chatId) ? 'warning' : 'info',
    );
    return;
  }

  if (trimmed === '/help') {
    await feishu.sendStatusCard(
      chatId,
      'Claude Code Feishu Bridge',
      [
        'This is a lightweight Feishu <-> Claude Code bridge.',
        '/new or /reset: clear the current Claude session for this chat',
        '/status: show the Claude session currently bound to this chat',
      ].join('\n'),
      'info',
    );
    return;
  }

  await feishu.onMessageStart(chatId);
  await feishu.sendStatusCard(chatId, 'Claude Code Running', 'Request received. Claude Code is working on it.', 'warning');
  try {
    const result = await claude.runTurn(chatId, trimmed, {
      onAssistantMessage: async (message) => {
        await feishu.sendAssistantCard(chatId, message);
      },
      onFinal: async () => {
        await feishu.sendStatusCard(chatId, 'Final Answer', FINAL_REPLY_MARKER, 'success');
      },
    });
    if (result.messageCount === 0) {
      await feishu.sendStatusCard(chatId, 'No Text Output', '(Claude returned no text output in this turn)', 'warning');
      await feishu.sendStatusCard(chatId, 'Final Answer', FINAL_REPLY_MARKER, 'success');
    }
  } finally {
    await feishu.onMessageEnd(chatId);
  }
}

function toUserError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
