# Claude Code Feishu Bridge

A lightweight bridge that lets a Feishu bot talk to your local Claude Code CLI.

The easiest path is now:

1. Download the release binary for your operating system.
2. Double-click it or run it once.
3. Follow the interactive prompts.
4. The bridge starts automatically.
5. Talk to your Feishu bot.

The wizard can configure either **Anthropic native subscription** or **DeepSeek v4 pro**. DeepSeek uses **xhigh thinking effort** by default. DeepSeek users only need to enter their key; Anthropic users enter both key and base URL.

## Download

Download the latest binary from GitHub Releases:

- Windows: `windows-x64-claude-feishu-bridge.exe`
- macOS Apple Silicon: `macos-arm64-claude-feishu-bridge`
- macOS Intel: `macos-x64-claude-feishu-bridge`
- Linux: `linux-x64-claude-feishu-bridge`

If your operating system blocks the downloaded file, allow it once in system security settings, then run it again. Current binaries are not code-signed.

Node single-executable builds may print a warning about embedded `require()` support on startup. This is a Node SEA runtime warning and does not affect normal bridge usage.

## One-Click Start

### Windows

Double-click:

```text
windows-x64-claude-feishu-bridge.exe
```

Or run it from PowerShell:

```powershell
.\windows-x64-claude-feishu-bridge.exe
```

### macOS / Linux

Open Terminal in the folder containing the downloaded file:

```bash
chmod +x ./macos-arm64-claude-feishu-bridge
./macos-arm64-claude-feishu-bridge
```

Use the matching file name for your platform.

## What Setup Asks For

The setup wizard asks for:

- Whether to use Anthropic native subscription or DeepSeek.
- Anthropic API key or DeepSeek/gateway API key.
- Anthropic-compatible Base URL, only when Anthropic is selected.
- Feishu App ID.
- Feishu App Secret.

It then writes config to:

```text
~/.claude-feishu-bridge/config.env
```

It also writes a Claude settings helper file to:

```text
~/.claude-feishu-bridge/claude-settings.json
```

Secrets are stored locally on your machine. Do not share these files.

The Claude Code work directory is automatically set to the current user's home directory.

After setup is complete, the bridge starts automatically and prints:

```text
Bridge connected. You can now talk to your Feishu bot.
```

## Message Style

By default, replies are sent as plain text for a cleaner chat experience.

To enable Feishu interactive cards:

```env
CFB_FEISHU_USE_CARDS=true
```

When cards are enabled, the bridge sends:

- A yellow running card when Claude Code starts working.
- Blue assistant answer cards for Claude Code output.
- A green final card when the turn is complete.
- A red error card if bridge execution fails.

If the bot app does not have card/message permissions or card sending fails, the bridge automatically falls back to plain text.

## Model Defaults

If the user chooses DeepSeek, the bridge writes:

```env
CFB_CLAUDE_MODEL=deepseek-v4-pro
CFB_CLAUDE_EFFORT=xhigh
CLAUDE_CODE_EFFORT_LEVEL=xhigh
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
```

This means every Feishu message is sent to local Claude Code with:

```bash
claude --model deepseek-v4-pro --effort xhigh
```

If the user chooses Anthropic native subscription, the bridge asks for both API key and Base URL. This supports native Anthropic and third-party Anthropic-compatible providers without hard-coding any private gateway.

Important: Claude Code expects an Anthropic-compatible API shape. The DeepSeek option uses DeepSeek's default Anthropic-compatible URL automatically.

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
claude-feishu-bridge
claude-feishu-bridge setup
claude-feishu-bridge setup --start
claude-feishu-bridge start
claude-feishu-bridge stop
claude-feishu-bridge restart
claude-feishu-bridge status
claude-feishu-bridge logs 100
claude-feishu-bridge run
```

Command behavior:

- `setup`: interactive wizard. Installs Claude Code if missing and writes config.
- `setup --start`: runs setup and starts the bridge immediately.
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
- Recover partial context from local Claude transcripts when an old session fails to resume.
- Stream assistant replies back to Feishu text messages.
- Send card-based status and answer messages with plain-text fallback.
- Work in private chats and group chats.

## What It Does Not Do

- No full transcript database outside Claude Code.
- No cross-machine memory sync.
- No image or file handling.
- No bot-to-bot orchestration.

File and image messages are not supported yet. The bridge currently accepts `text` and `post` messages only. Feishu/Lark itself supports file messages, but this project does not yet download attachments or pass local file paths into Claude Code.

## Developer Setup

If you want to run from source:

```bash
git clone https://github.com/citarreikee/claudecode2feishubot.git
cd claudecode2feishubot
npm install
npm run build
npm run cli
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
CFB_FEISHU_USE_CARDS=false
CFB_CLAUDE_WORKDIR=/Users/yourname
CFB_CLAUDE_EXECUTABLE=claude
CFB_CLAUDE_MODEL=deepseek-v4-pro
CFB_CLAUDE_EFFORT=xhigh
CFB_CLAUDE_SKIP_PERMISSIONS=true
CFB_RESUME_RECOVERY_ENABLED=true
CFB_RESUME_RECOVERY_MAX_CHARS=12000
CFB_RESUME_RECOVERY_MAX_MESSAGES=24
ANTHROPIC_AUTH_TOKEN=sk_xxx
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_SMALL_FAST_MODEL=deepseek-v4-pro
CLAUDE_CODE_EFFORT_LEVEL=xhigh
```

## Resume Recovery

The bridge normally resumes one Claude Code session per Feishu chat. If Claude Code cannot resume an old session, the bridge:

1. Looks for the local Claude transcript file for that session under `~/.claude/projects`.
2. Extracts a bounded summary from recent user/assistant messages.
3. Saves that recovery summary in the bridge's local `chats.json`.
4. Starts a fresh Claude session and injects the recovery summary into the first fresh prompt.

This restores partial continuity without blocking the chat on a broken `--resume`.

Limits:

- It only works when the old Claude transcript exists on the same machine.
- It is a bounded recent-message recovery, not full session replay.
- It does not upload or sync memory across machines.
- The user's latest message remains authoritative if recovered context is stale.

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
