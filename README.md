# Claude Code to Feishu Bot

A lightweight bridge that lets a Feishu bot talk to your local Claude Code CLI.

The design goal is intentionally simple:

- Feishu receives a message
- the bridge forwards it to your local Claude CLI
- Claude replies
- the bridge sends the reply back into the same Feishu chat

This project does not try to build a complex agent platform. It is a small, practical bridge for people who want to use Claude Code from Feishu with minimal moving parts.

## What It Can Do

- Receive Feishu messages through the official long connection event mode
- Forward each message to your local `claude` CLI
- Keep one Claude session per Feishu chat
- Support `/new` and `/reset` to start a fresh chat session
- Support `/status` to inspect the current bound Claude session
- Stream assistant replies back as normal Feishu text messages
- Work in private chats or group chats

## What It Does Not Do

- No extra memory layer outside Claude
- No transcript database
- No image or file handling
- No custom cards
- No bot-to-bot orchestration

## Requirements

- Node.js 20 or newer
- A working local `claude` CLI
- Claude Code already authenticated on the local machine
- A Feishu bot app with event subscription enabled
- Windows, macOS, or Linux

## How It Works

Each Feishu chat is mapped to a single Claude session id.

That means:

- one private chat keeps its own Claude context
- one group chat keeps its own Claude context
- `/reset` or `/new` clears the bound Claude session for that chat

The bridge itself stays intentionally stateless apart from that small chat-to-session mapping.

## Feishu Setup

Create a Feishu bot app and make sure these are configured:

1. Enable bot capability
2. Publish the app so configuration changes take effect
3. Subscribe to the event `im.message.receive_v1`
4. Use long connection mode for events

You will need:

- `App ID`
- `App Secret`

Put them into `config.env`.

## Local Setup

Clone the repository:

```bash
git clone https://github.com/citarreikee/claudecode2feishubot.git
cd claudecode2feishubot
```

Install dependencies:

```bash
npm install
```

Create your config:

```bash
cp config.env.example config.env
```

On Windows PowerShell:

```powershell
Copy-Item config.env.example config.env
```

Edit `config.env` and fill at least:

```env
CFB_FEISHU_APP_ID=cli_xxx
CFB_FEISHU_APP_SECRET=xxx
CFB_CLAUDE_WORKDIR=C:\Users\yourname
```

Then build:

```bash
npm run build
```

## Config Reference

### Required

- `CFB_FEISHU_APP_ID`
- `CFB_FEISHU_APP_SECRET`
- `CFB_CLAUDE_WORKDIR`

### Common

- `CFB_FEISHU_REQUIRE_MENTION=true`
  In group chats, the bot only responds when truly mentioned.

- `CFB_FEISHU_ALLOWED_USERS=`
  Optional allowlist. You can put user ids or chat ids separated by commas.

- `CFB_CLAUDE_EXECUTABLE=claude`
  Path or command name for the Claude CLI.

- `CFB_CLAUDE_MODEL=claude-sonnet-4-6`
  Claude model to use.

- `CFB_CLAUDE_SKIP_PERMISSIONS=true`
  Passes `--dangerously-skip-permissions` to the Claude CLI.

- `CFB_NO_EVENT_TIMEOUT_MS=600000`
  Kill a turn if Claude produces no events for too long.

- `CFB_HARD_TIMEOUT_MS=5400000`
  Absolute timeout for one turn.

- `CFB_REPLY_MAX_CHARS=3500`
  Maximum characters per Feishu text message chunk.

## Run It

### Simple local run

```bash
npm run dev
```

Or run the built daemon:

```bash
node dist/daemon.mjs
```

## Windows Convenience Commands

This repository includes two Windows wrapper scripts:

- `claude-feishu-bridge.ps1`
- `claude-feishu-bridge.cmd`

They support:

- `start`
- `stop`
- `status`
- `logs`

Example:

```powershell
.\claude-feishu-bridge.ps1 start
.\claude-feishu-bridge.ps1 status
.\claude-feishu-bridge.ps1 logs 100
```

Or:

```cmd
claude-feishu-bridge.cmd start
```

Before using them, edit the `$AppDir` path inside the PowerShell script if you place the repo somewhere else.

## In-Chat Commands

- `/help`
- `/status`
- `/new`
- `/reset`

## Typical Usage

### Private chat

Send a message directly to the bot.

### Group chat

If `CFB_FEISHU_REQUIRE_MENTION=true`, you must truly mention the bot first.

Example:

```text
@your-bot summarize this repository
```

## Troubleshooting

### The bot does not reply

Check:

- the Feishu app is published
- `im.message.receive_v1` is subscribed
- long connection mode is enabled
- your `App ID` and `App Secret` are correct
- the local machine can run `claude`
- Claude CLI is already authenticated

### Claude command is not found

Set:

```env
CFB_CLAUDE_EXECUTABLE=C:\full\path\to\claude.cmd
```

### Group chat does not trigger replies

Make sure:

- the bot was truly mentioned
- `CFB_FEISHU_REQUIRE_MENTION` matches your intended behavior

### The bridge starts but immediately fails

Run:

```powershell
.\claude-feishu-bridge.ps1 logs 100
```

or:

```bash
node dist/daemon.mjs
```

and inspect the error output.

## Security Notes

- Never commit your real `config.env`
- Never share your Feishu app secret
- Treat the machine running this bridge as trusted
- If `CFB_CLAUDE_SKIP_PERMISSIONS=true`, Claude gets a much less restricted execution path

## Project Structure

- `src/` bridge source code
- `scripts/build.js` build script
- `claude-feishu-bridge.ps1` Windows process wrapper
- `claude-feishu-bridge.cmd` Windows launcher
- `config.env.example` config template

## License

Add your preferred open source license before wider public distribution.
