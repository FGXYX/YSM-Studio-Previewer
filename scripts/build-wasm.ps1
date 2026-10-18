# Build the YSMParser WebAssembly module without CMake.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build-wasm.ps1 [-Clean]
param([switch]$Clean)
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repo = (Resolve-Path (Join-Path $root '..\YSMParser')).Path
$emsdk = $env:EMSDK
if (-not $emsdk) {
    $emsdk = (Resolve-Path (Join-Path $root '..\.tools\emsdk')).Path
}
$emcc = Join-Path $emsdk 'upstream\emscripten\emcc.exe'
$emxx = Join-Path $emsdk 'upstream\emscripten\em++.exe'
if (-not (Test-Path $emcc)) {
    throw "emcc.exe not found. Set EMSDK or install emsdk under .tools\emsdk."
}

$build = Join-Path $root '..\.tools\build\obj-studio'
$include = Join-Path $root '..\.tools\build\include'
$outDir = Join-Path $root 'public\wasm'
if ($Clean) {
    Remove-Item $build -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $build, $include, $outDir | Out-Null

# zlib expects a generated zconf.h; the checked-in .in file is an exact copy.
$zconf = Join-Path $include 'zconf.h'
if (-not (Test-Path $zconf)) {
    Copy-Item (Join-Path $repo 'external\zlib\zconf.h.in') $zconf
}

# These two are needed by the amalgamated zstd source.
$zstdHeader = Join-Path $root '..\.tools\zstd.h'
if (-not (Test-Path $zstdHeader)) {
    Copy-Item (Join-Path $repo 'external\zstd\lib\zstd.h') $zstdHeader
}
$zstdC = Join-Path $root '..\.tools\build\zstd.c'
if (-not (Test-Path $zstdC)) {
    Push-Location (Join-Path $repo 'external\zstd\build\single_file_libs')
    try {
        python .\combine.py -r ../../lib -x legacy/zstd_legacy.h -k zstd.h -o $zstdC zstd-in.c
    }
    finally {
        Pop-Location
    }
}

$includes = @(
    "-I$repo\YSMParser",
    "-I$repo\YSMParser\parsers",
    "-I$repo\external\zstd\lib",
    "-I$repo\external\cityhash\src",
    "-I$repo\external\xchacha20\src",
    "-I$repo\external\AES\src",
    "-I$repo\external\md5",
    "-I$repo\external\cpp-base64",
    "-I$repo\external\zlib",
    "-I$repo\external\json",
    "-I$repo\external\fpng\src",
    "-I$include"
)

$cxxSources = @(
    "$repo\YSMParser\main.cpp",
    "$repo\YSMParser\wasm_api.cpp",
    "$repo\YSMParser\parsers\YSMParser.cpp",
    "$repo\YSMParser\parsers\YSMParserV1.cpp",
    "$repo\YSMParser\parsers\YSMParserV2.cpp",
    "$repo\YSMParser\parsers\v3\YSMParserV3.cpp",
    "$repo\YSMParser\algorithms\CryptoAlgorithms.cpp",
    "$repo\external\AES\src\AES.cpp",
    "$repo\external\cityhash\src\city.cc",
    "$repo\external\cpp-base64\base64.cpp",
    "$repo\external\md5\md5.cpp",
    "$repo\external\xchacha20\src\xchacha20.cc",
    "$repo\external\fpng\src\fpng.cpp"
)

$cSources = @(
    "$repo\external\zlib\adler32.c",
    "$repo\external\zlib\compress.c",
    "$repo\external\zlib\crc32.c",
    "$repo\external\zlib\deflate.c",
    "$repo\external\zlib\infback.c",
    "$repo\external\zlib\inffast.c",
    "$repo\external\zlib\inflate.c",
    "$repo\external\zlib\inftrees.c",
    "$repo\external\zlib\trees.c",
    "$repo\external\zlib\uncompr.c",
    "$repo\external\zlib\zutil.c",
    $zstdC
)

$objects = @()
$script:objectIndex = 0
function Compile-One([string]$source, [bool]$isCpp) {
    $script:objectIndex += 1
    $name = ('{0:D4}_{1}.o' -f $script:objectIndex, [IO.Path]::GetFileNameWithoutExtension($source))
    $object = Join-Path $build $name
    if (Test-Path $object) {
        Write-Host "SKIP $([IO.Path]::GetFileName($source))"
        return $object
    }
    $emccArgs = @()
    if ($isCpp) { $emccArgs += '-std=c++20'; $emccArgs += '-fexceptions' }
    $emccArgs += @('-O2', '-DNDEBUG', '-DFPNG_NO_SSE=1', '-DYSM_PARSER_VERSION=\"0.0.0-studio\"', '-Wno-deprecated-declarations')
    $emccArgs += $includes
    $emccArgs += @('-c', $source, '-o', $object)
    Write-Host "CC $([IO.Path]::GetFileName($source))"
    $compiler = if ($isCpp) { $emxx } else { $emcc }
    & $compiler @emccArgs
    if ($LASTEXITCODE -ne 0) { throw "Compilation failed: $source" }
    return $object
}

foreach ($source in $cxxSources) { $objects += Compile-One $source $true }
foreach ($source in $cSources) { $objects += Compile-One $source $false }

$linkArgs = @(
    '-O2',
    '-fexceptions',
    '-sMODULARIZE=1',
    '-sEXPORT_NAME=YSMParserModule',
    '-sINVOKE_RUN=0',
    '-sENVIRONMENT=web',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sEXIT_RUNTIME=0',
    '-sFORCE_FILESYSTEM=1',
    "-sEXPORTED_FUNCTIONS=['_ysm_parse_bytes','_ysm_version','_malloc','_free']",
    "-sEXPORTED_RUNTIME_METHODS=['FS','ccall','cwrap','UTF8ToString','writeArrayToMemory']",
    '-sASSERTIONS=0',
    '-sSTACK_SIZE=8MB'
) + $objects + @('-o', (Join-Path $outDir 'YSMParser.js'))

Write-Host "Linking WASM..."
& $emxx @linkArgs
if ($LASTEXITCODE -ne 0) { throw 'WASM link failed.' }

Get-ChildItem $outDir | Select-Object Name, Length
