# Claude Code Feishu Bridge

A lightweight bridge that lets a Feishu bot talk to your local Claude Code CLI.

The easiest path is now:

1. Download the release binary for your operating system.
2. Run `setup`.
3. Run `start`.
4. Talk to your Feishu bot.

The setup wizard configures Claude Code to use **DeepSeek v4 pro** with **xhigh thinking effort** by default. Users do not need to choose a model.

## Download

Download the latest binary from GitHub Releases:

- Windows: `windows-x64-claude-feishu-bridge.exe`
- macOS Apple Silicon: `macos-arm64-claude-feishu-bridge`
- macOS Intel: `macos-x64-claude-feishu-bridge`
- Linux: `linux-x64-claude-feishu-bridge`

If your operating system blocks the downloaded file, allow it once in system security settings, then run it again. Current binaries are not code-signed.

Node single-executable builds may print a warning about embedded `require()` support on startup. This is a Node SEA runtime warning and does not affect normal bridge usage.

## Quick Start

### Windows

Open PowerShell in the folder containing the downloaded file:

```powershell
.\windows-x64-claude-feishu-bridge.exe setup
.\windows-x64-claude-feishu-bridge.exe start
```

### macOS / Linux

Open Terminal in the folder containing the downloaded file:

```bash
chmod +x ./macos-arm64-claude-feishu-bridge
./macos-arm64-claude-feishu-bridge setup
./macos-arm64-claude-feishu-bridge start
```

Use the matching file name for your platform.

## What Setup Asks For

The setup wizard asks for:

- Feishu App ID
- Feishu App Secret
- DeepSeek / Anthropic-compatible API key
- Anthropic-compatible base URL
- Claude Code work directory

It then writes config to:

```text
~/.claude-feishu-bridge/config.env
```

It also writes a Claude settings helper file to:

```text
~/.claude-feishu-bridge/claude-settings.json
```

Secrets are stored locally on your machine. Do not share these files.

## Default Model

The bridge defaults to:

```env
CFB_CLAUDE_MODEL=deepseek-v4-pro
CFB_CLAUDE_EFFORT=xhigh
CLAUDE_CODE_EFFORT_LEVEL=xhigh
```

This means every Feishu message is sent to local Claude Code with:

```bash
claude --model deepseek-v4-pro --effort xhigh
```

Important: Claude Code expects an Anthropic-compatible API shape. If you use DeepSeek, your base URL must be an Anthropic-compatible gateway or adapter, not a plain OpenAI-compatible DeepSeek endpoint.

## Feishu Bot Setup

Create a Feishu bot app and configure:

1. Enable bot capability.
2. Subscribe to `im.message.receive_v1`.
3. Enable event long connection mode.
4. Publish the app after changing permissions or events.

You need:

- App ID
- App Secret

Enter both during `setup`.

## Commands

```bash
claude-feishu-bridge setup
claude-feishu-bridge start
claude-feishu-bridge stop
claude-feishu-bridge restart
claude-feishu-bridge status
claude-feishu-bridge logs 100
claude-feishu-bridge run
```

Command behavior:

- `setup`: interactive wizard. Installs Claude Code if missing and writes config.
- `start`: starts the bridge in the background.
- `stop`: stops the background bridge.
- `restart`: restarts the background bridge.
- `status`: shows whether the bridge is running.
- `logs 100`: shows recent logs.
- `run`: runs the bridge in the foreground for debugging.

## In-Chat Commands

Send these to the Feishu bot:

- `/help`
- `/status`
- `/new`
- `/reset`

## What It Can Do

- Receive Feishu messages through official long connection events.
- Forward each message to local Claude Code.
- Keep one Claude session per Feishu chat.
- Stream assistant replies back to Feishu text messages.
- Work in private chats and group chats.

## What It Does Not Do

- No extra memory layer outside Claude Code.
- No transcript database.
- No image or file handling.
- No custom Feishu cards.
- No bot-to-bot orchestration.

## Developer Setup

If you want to run from source:

```bash
git clone https://github.com/citarreikee/claudecode2feishubot.git
cd claudecode2feishubot
npm install
npm run build
npm run cli -- setup
npm run cli -- start
```

Run type checks:

```bash
npm run typecheck
```

Build local release binary:

```bash
npm run release:local
```

Release binaries are written to:

```text
releases/
```

## Manual Config Reference

`setup` writes this automatically, but advanced users can edit:

```text
~/.claude-feishu-bridge/config.env
```

Common variables:

```env
CFB_FEISHU_APP_ID=cli_xxx
CFB_FEISHU_APP_SECRET=xxx
CFB_FEISHU_DOMAIN=feishu
CFB_FEISHU_REQUIRE_MENTION=true
CFB_CLAUDE_WORKDIR=/Users/yourname
CFB_CLAUDE_EXECUTABLE=claude
CFB_CLAUDE_MODEL=deepseek-v4-pro
CFB_CLAUDE_EFFORT=xhigh
CFB_CLAUDE_SKIP_PERMISSIONS=true
ANTHROPIC_AUTH_TOKEN=sk_xxx
ANTHROPIC_BASE_URL=https://your-anthropic-compatible-gateway.example
ANTHROPIC_SMALL_FAST_MODEL=deepseek-v4-pro
CLAUDE_CODE_EFFORT_LEVEL=xhigh
```

## Troubleshooting

### The bot does not reply

Check:

- The bridge is running: `claude-feishu-bridge status`.
- Logs do not show auth errors: `claude-feishu-bridge logs 100`.
- The Feishu app is published.
- `im.message.receive_v1` is subscribed.
- Long connection mode is enabled.
- App ID and App Secret are correct.
- The local machine can run `claude --version`.

### Claude Code is missing

Run:

```bash
claude-feishu-bridge setup
```

The wizard will try to install `@anthropic-ai/claude-code` with npm.

### DeepSeek connection fails

Check:

- API key is correct.
- `ANTHROPIC_BASE_URL` points to an Anthropic-compatible gateway.
- The gateway exposes the model name `deepseek-v4-pro`.
- The gateway supports or ignores Claude Code effort level `xhigh`.

## Security Notes

- Never commit `~/.claude-feishu-bridge/config.env`.
- Never share your Feishu App Secret or API key.
- Treat the machine running this bridge as trusted.
- `CFB_CLAUDE_SKIP_PERMISSIONS=true` gives Claude Code a less restricted execution path.

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.
