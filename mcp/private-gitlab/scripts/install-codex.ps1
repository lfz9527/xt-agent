$ErrorActionPreference = 'Stop'

$source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$codexHome = Join-Path $env:USERPROFILE '.codex'
$linkRoot = Join-Path $codexHome 'mcp'
$link = Join-Path $linkRoot 'private-gitlab'

if (-not (Test-Path $source -PathType Container)) {
  throw "MCP source directory does not exist: $source"
}

New-Item -ItemType Directory -Path $linkRoot -Force | Out-Null

if (Test-Path $link) {
  $item = Get-Item -Force $link
  $target = $item.Target
  if ($item.LinkType -ne 'Junction' -or ($target -and ((Resolve-Path $target).Path -ne $source))) {
    throw "Refusing to overwrite existing non-matching Codex path: $link"
  }
  Write-Host "Codex Junction already points to $source"
} else {
  & cmd.exe /c ('mklink /J "' + $link + '" "' + $source + '"') | Write-Host
}

Write-Host ""
Write-Host "已完成目录 Junction: $link -> $source"
Write-Host "请将 codex.mcp.toml.example 中的 mcp_servers.private_gitlab 片段合并到 $codexHome\config.toml。"
Write-Host "请在重启 Codex 前通过用户环境变量设置 GITLAB_URL 和 GITLAB_TOKEN。"
