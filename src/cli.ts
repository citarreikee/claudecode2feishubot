import fs from 'node:fs';

import { CONFIG_PATH } from './config.js';
import { runBridge } from './main.js';
import { currentStatus, readLogs, startDaemon, stopDaemon } from './process-manager.js';
import { runSetup } from './setup.js';

const command = process.argv[2] || 'help';

async function main(): Promise<void> {
  switch (command) {
    case 'setup':
      await runSetup({ assumeYes: process.argv.includes('--yes') || process.argv.includes('-y') });
      return;
    case 'start': {
      const result = startDaemon(...resolveRunCommand());
      console.log(result.message);
      return;
    }
    case 'stop':
      console.log(stopDaemon());
      return;
    case 'restart': {
      console.log(stopDaemon());
      const result = startDaemon(...resolveRunCommand());
      console.log(result.message);
      return;
    }
    case 'status': {
      const status = currentStatus();
      console.log(status.running ? `Bridge running (PID: ${status.pid})` : 'Bridge not running');
      console.log(`Config: ${CONFIG_PATH}`);
      return;
    }
    case 'logs': {
      const lines = Number(process.argv[3] || '80');
      console.log(readLogs(Number.isFinite(lines) ? lines : 80));
      return;
    }
    case 'run':
      await runBridge();
      return;
    case 'help':
    default:
      printHelp();
  }
}

function resolveRunCommand(): [string, string[]] {
  const current = process.argv[1] || '';
  if (fs.existsSync(current) && /\.(mjs|js)$/i.test(current)) {
    return [process.execPath, [current, 'run']];
  }
  return [process.execPath, ['run']];
}

function printHelp(): void {
  console.log([
    'Claude Code Feishu Bridge',
    '',
    'Commands:',
    '  setup       Interactive setup. Installs Claude Code if needed and configures DeepSeek v4 pro + xhigh.',
    '  start       Start the Feishu bridge in the background.',
    '  stop        Stop the background bridge.',
    '  restart     Restart the background bridge.',
    '  status      Show bridge status and config path.',
    '  logs [N]    Show recent bridge logs.',
    '  run         Run the bridge in the foreground.',
    '',
    'Typical first run:',
    '  claude-feishu-bridge setup',
    '  claude-feishu-bridge start',
  ].join('\n'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
