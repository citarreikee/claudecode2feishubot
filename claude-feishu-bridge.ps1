$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BridgeHome = if ($env:CFB_HOME) { $env:CFB_HOME } else { Join-Path $HOME '.claude-feishu-bridge' }
$RuntimeDir = Join-Path $BridgeHome 'runtime'
$LogDir = Join-Path $BridgeHome 'logs'
$PidFile = Join-Path $RuntimeDir 'bridge.pid'
$LogFile = Join-Path $LogDir 'bridge.log'
$ErrFile = Join-Path $LogDir 'bridge.err.log'
$NodeExe = (Get-Command node).Source
$EntryPoint = Join-Path $RepoRoot 'dist\daemon.mjs'

function Ensure-Dirs {
  foreach ($dir in @($BridgeHome, (Join-Path $BridgeHome 'data'), $RuntimeDir, $LogDir)) {
    if (-not (Test-Path $dir)) {
      New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
  }
}

function Read-Pid {
  if (Test-Path $PidFile) {
    return (Get-Content $PidFile -Raw).Trim()
  }
  return $null
}

function Get-BridgeProcess {
  $bridgePid = Read-Pid
  if (-not $bridgePid) { return $null }
  try {
    return Get-Process -Id ([int]$bridgePid) -ErrorAction Stop
  } catch {
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    return $null
  }
}

function Ensure-Built {
  if (-not (Test-Path $EntryPoint)) {
    Push-Location $RepoRoot
    try {
      npm run build | Out-Host
    } finally {
      Pop-Location
    }
  }
}

function Start-Bridge {
  Ensure-Dirs
  Ensure-Built

  $running = Get-BridgeProcess
  if ($running) {
    Write-Output "Bridge already running (PID: $($running.Id))"
    return
  }

  $process = Start-Process `
    -FilePath $NodeExe `
    -ArgumentList @($EntryPoint) `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError $ErrFile `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -Path $PidFile -Value $process.Id -NoNewline
  Start-Sleep -Seconds 1

  $running = Get-BridgeProcess
  if ($running) {
    Write-Output "Bridge started (PID: $($running.Id))"
    return
  }

  Write-Output "Bridge failed to start"
  Show-Logs 50
  exit 1
}

function Stop-Bridge {
  $running = Get-BridgeProcess
  if (-not $running) {
    Write-Output 'Bridge is not running'
    return
  }

  Stop-Process -Id $running.Id -Force
  Remove-Item $PidFile -ErrorAction SilentlyContinue
  Write-Output 'Bridge stopped'
}

function Show-Status {
  $running = Get-BridgeProcess
  if ($running) {
    Write-Output "Bridge running (PID: $($running.Id))"
  } else {
    Write-Output 'Bridge not running'
  }
}

function Show-Logs([int]$Lines = 80) {
  if (Test-Path $LogFile) {
    Write-Output '== stdout =='
    Get-Content $LogFile -Tail $Lines
  }
  if (Test-Path $ErrFile) {
    Write-Output '== stderr =='
    Get-Content $ErrFile -Tail $Lines
  }
}

$Command = if ($args.Count -gt 0) { $args[0] } else { 'help' }

switch ($Command) {
  'start' { Start-Bridge }
  'stop' { Stop-Bridge }
  'status' { Show-Status }
  'logs' {
    $Lines = if ($args.Count -gt 1) { [int]$args[1] } else { 80 }
    Show-Logs $Lines
  }
  default {
    Write-Output 'Usage: claude-feishu-bridge {start|stop|status|logs [N]}'
  }
}
