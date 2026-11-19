# Build the Docker image and run it locally with variables from .env.
# Usage: ./run-local.ps1 [-Port 3000] [-NoBuild]
# MCP endpoint: http://localhost:<Port>/mcp   Health: http://localhost:<Port>/healthz
param(
    [int]$Port = 3000,
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$image = 'openwebninja-mcp:local'
$name = 'openwebninja-mcp'

Set-Location $PSScriptRoot

if (-not $NoBuild) {
    docker build -t $image .
    if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }
}

# Replace a container left over from a previous run.
if (docker ps -aq --filter "name=^${name}$") { docker rm -f $name | Out-Null }

# Bound to 127.0.0.1 so the local test server isn't reachable from the network.
# Ctrl+C stops the container (--rm removes it).
docker run --rm -it --name $name --env-file .env -p "127.0.0.1:${Port}:3000" $image
