param([string]$Blender = 'blender')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$toolDir = Join-Path $repo '.tools/mpfb'
New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
$commit = '3edf9df0551765be43563d047888cf7877eb89b4'
$source = Join-Path $toolDir 'source-pinned.zip'
if (-not (Test-Path (Join-Path $toolDir 'mpfb2-master/src/mpfb'))) {
  Invoke-WebRequest "https://github.com/makehumancommunity/mpfb2/archive/$commit.zip" -OutFile $source
  Expand-Archive -LiteralPath $source -DestinationPath $toolDir -Force
  Move-Item -LiteralPath (Join-Path $toolDir "mpfb2-$commit") -Destination (Join-Path $toolDir 'mpfb2-master')
}
$assets = Join-Path $toolDir 'assets.zip'
if (-not (Test-Path $assets)) {
  Invoke-WebRequest 'https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip' -OutFile $assets
}
if ((Get-FileHash $assets -Algorithm SHA256).Hash -ne 'B542127A8E25547C7C29C19F2D1D2ADB9A664C80396ECD694095DBC8028A0107') { throw 'Core asset archive changed; review provenance before rebuilding.' }
if (-not (Test-Path (Join-Path $toolDir 'assets/skins'))) { Expand-Archive -LiteralPath $assets -DestinationPath (Join-Path $toolDir 'assets') }
Push-Location $repo
try { & $Blender --background --python-exit-code 1 --python scripts/character-lab/realistic/build.py; if ($LASTEXITCODE -ne 0) { throw 'Character export failed' } } finally { Pop-Location }
