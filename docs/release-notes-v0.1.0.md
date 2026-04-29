# Claude Code to Feishu Bot v0.1.0

Initial public release of a lightweight Feishu bridge for local Claude Code.

## Highlights

- Connect a Feishu bot directly to your local Claude Code CLI
- Keep one Claude session per Feishu chat
- Support `/help`, `/status`, `/new`, and `/reset`
- Work in both private chats and group chats
- Respect true mention requirements in group conversations
- Stream Claude replies back as normal Feishu text messages

## Included in This Release

- Core Feishu websocket event bridge
- Claude CLI stream-json runner
- Windows wrapper scripts
- macOS/Linux daemon management script
- Config template and setup documentation
- Apache 2.0 license

## Requirements

- Node.js 20+
- Local Claude CLI installed and authenticated
- Feishu bot app configured with `im.message.receive_v1`
- Long connection mode enabled in Feishu

## Quick Start

```bash
git clone https://github.com/citarreikee/claudecode2feishubot.git
cd claudecode2feishubot
npm install
cp config.env.example config.env
npm run build
./claude-feishu-bridge start
```

On Windows:

```powershell
git clone https://github.com/citarreikee/claudecode2feishubot.git
cd claudecode2feishubot
npm install
Copy-Item config.env.example config.env
npm run build
.\claude-feishu-bridge.ps1 start
```

## Notes

- Do not commit your real `config.env`
- If you enable `CFB_CLAUDE_SKIP_PERMISSIONS=true`, Claude runs with fewer local restrictions
- This bridge is intentionally minimal and does not add a separate memory layer
