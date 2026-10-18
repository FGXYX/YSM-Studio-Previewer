# AGENT.md — YSM Studio Previewer

This document is the working guide for coding agents modifying this repository.
It describes the architecture, data flow, invariants, and known traps. Read it
together with `README.md` and `README.zh-CN.md`.

## 1. What this project is

A Windows 11 desktop viewer for **Yes Steve Model** (`.ysm`) files.

- Electron 33 + Vite 6 + React 18 + TypeScript.
- Three.js 0.180 for 3D rendering; molangjs for animation expressions.
- Howler.js for OGG sound effects and the voice board.
- YSMParser compiled to WebAssembly for `.ysm` V1/V2/V3 parsing.
- Supports encrypted `.ysm` and unencrypted folder layouts.
- **Preview only.** Decryption/unpacking happen in WASM memory; there is no
  export or asset-extraction feature.

The app is not a Minecraft launcher, mod, or model converter. It reconstructs a
local preview of the model, animations, textures, and sounds.

## 2. Repository map

```text
.
├─ electron/
│  ├─ main.cjs              # BrowserWindow, ysm:// protocol, native dialogs, IPC
│  └─ preload.cjs           # contextBridge window.ysmNative API
├─ src/
│  ├─ main.tsx              # React entry
│  ├─ App.tsx               # top-level composition and viewer lifecycle
│  ├─ styles.css            # all UI styling and both themes
│  ├─ types.ts              # ParsedProject / animation / UI types
│  ├─ parser/
│  │  ├─ wasmParser.ts      # .ysm bytes → Emscripten MEMFS → ImportedFile[]
│  │  ├─ projectParser.ts   # ImportedFile[] → ParsedProject
│  │  └─ importers.ts       # files, folders, drag/drop, demo, native bridge
│  ├─ viewer/
│  │  ├─ YsmViewer.ts       # scene, skeleton, materials, camera, animation loop
│  │  └─ animation.ts       # keyframe sampling, Molang variables, sound events
│  ├─ audio/AudioEngine.ts  # Howler soundboard and timeline events
│  ├─ store/studio.ts       # zustand UI state (single source of UI truth)
│  └─ components/
│     ├─ TitleBar.tsx
│     ├─ LeftSidebar.tsx
│     ├─ RightSidebar.tsx
│     ├─ Stage.tsx
│     ├─ BottomBar.tsx
│     ├─ BoneTree.tsx
│     ├─ ConfigPanel.tsx
│     ├─ CardPreview.tsx
│     ├─ ModelHoverPreview.tsx
│     ├─ DragOverlay.tsx
│     └─ Toasts.tsx
├─ public/
│  ├─ wasm/                 # checked-in YSMParser.js + .wasm
│  └─ samples/default/      # bundled CC0 demo model + one CC BY-NC-SA cue
├─ scripts/                  # WASM build, sample sync, smoke/WASM tests
├─ docs/preview.png          # README screenshot
├─ test-fixtures/            # test-only V1 fixture
├─ LICENSE
├─ THIRD_PARTY_NOTICES.md
├─ CONTRIBUTING.md
└─ package.json
```

Generated and external folders that must not be committed:

```text
node_modules/  dist/  release/  shots/  .electron-profile/
public/samples/*.ysm  public/samples/**/*.ysm
```

## 3. Development commands

```powershell
npm install
npm run dev            # Vite browser preview, http://127.0.0.1:5173
npm run electron:dev   # Vite + Electron
npm run typecheck      # tsc --noEmit
npm run build          # typecheck + Vite production build
npm run wasm:build     # rebuild public/wasm from sibling ../YSMParser
```

`electron:dev` intentionally adds:

```text
--no-sandbox --user-data-dir=.electron-profile
```

On restricted Windows accounts, direct double-clicking the packaged exe can
still fail before app code runs. The distributed ZIP therefore has a
`启动 YSM Studio.cmd` launcher that passes the same switches and a local data
directory. Do not remove that launcher from release instructions.

## 4. Main data flow

```text
file/folder/drag-drop
        │
        ▼
 src/parser/importers.ts
        │  Uint8Array or ImportedFile[]
        ▼
 src/parser/wasmParser.ts        (encrypted .ysm only)
        │  Emscripten MEMFS
        │  ysm_parse_bytes(..., rawMeshes=1)
        ▼
 decrypted files in MEMFS
        │  readTree() copies them to JS Uint8Array[]
        │  removeTree() frees MEMFS output
        ▼
 src/parser/projectParser.ts
        │  parses ysm.json, models/*.json, animations/*.json,
        │  textures, sounds, language, config_forms
        ▼
 ParsedProject
        │
        ▼
 src/viewer/YsmViewer.ts load(project, texture)
        │
        ▼
 Three.js scene + animation loop
```

### Important parser facts

- `parseYsmBytes()` writes the encrypted bytes into Emscripten MEMFS, calls
  `ysm_parse_bytes`, reads the output tree, then deletes the virtual output.
- No decrypted model files are written to the Windows filesystem.
- `parseYsmBytes()` calls the parser with raw meshes enabled. V3 geometry
  arrives as `raw_meshes` (positions/normals/uvs/indices).
- V1/V2 and unencrypted cuboid models use the normal Bedrock geometry path.
- `readTree()` returns copied `Uint8Array` data, so freeing MEMFS afterwards is
  safe.
- `detectYsmVersion()` is only for UI/diagnostics; the native parser decides
  the actual decryption path.

## 5. ParsedProject and animation data

`src/types.ts` is the best reference for the exact shape. The most important
parts are:

- `project.animations`: name → parsed animation clip.
- `project.animationSources`: name → source file.
- `project.properties`: `ysm.json` properties.
- `project.configGroups` / `project.configDefaults`: wheel model settings.
- `project.textures`, `project.sounds`, `project.allFiles`.
- `project.bones`, `project.cubes`: counts for the library detail view.

### Animation file name collision

Animation files are merged by animation name. Helper files such as
`animations/arrow.animation.json` sometimes declare empty `parallel1..7`
layers. A flat “last file wins” merge would replace the real config layers from
`main.animation.json` with empty clips.

`projectParser.ts` intentionally skips an incoming clip when:

```text
existing clip has bones  AND  incoming clip has no bones
```

Do not remove this guard without checking models such as the FireFly and
Kanami samples.

### Runtime layer order

`YsmViewer.setAllAnimationClips()` builds:

- `preLayerClips`: `pre_parallel0..7`, in numeric order.
- `parallelLayerClips`: `parallel0..7`, excluding `fp.arm`.
- base clip: preferred `idle`, otherwise the first animation.

`applyCurrentPose()` currently merges in this order:

```text
reset bind pose
→ pre_parallel layers   (Runtime only)
→ base clip
→ parallel layers       (Runtime only)
→ extra clip
```

Each bone channel (`rotation`, `position`, `scale`) is independently overridden
by the most recent layer that supplies it.

## 6. Coordinate and geometry rules

These are high-risk invariants. Read this before touching rendering.

### V1/V2 and unencrypted cuboids

`YsmViewer` applies a mirror to the viewer-side model:

- bone/cube pivot and geometry X → negated;
- bone/cube rotation `(x, y, z)` → `(-x, -y, z)`;
- per-face U axis → reversed.

### V3 raw meshes

V3 `raw_meshes` are already exported in the mirrored YSM engine space by
`YSMParserV3.cpp`. The viewer sets:

```ts
mirrorX = !geometry.raw_mesh_format;
```

Do **not** apply a second mirror to V3 bind poses or raw geometry. A second
mirror causes hands/limbs to flip inward or parts to separate.

### Animation channels

Every animation format is converted in `applyCurrentPose()`:

```text
rotation: (x, y, z) → (-x, -y, z)
position: X → -X
```

Bind rotations use `ZYX` Euler order. The root group is scaled by `1 / 16`.
Bedrock units remain Blockbench units inside that group.

## 7. Molang and config forms

### Variable aliasing

`makeMolangVariables()` exposes UI/config values as `v.*` and
`variable.*`. molangjs rewrites `v.foo` to `variable.foo` and lowercases
variable paths. YSM packs commonly use camel-case names such as:

```text
v.roaming.Dress
v.roaming.BreastCloth
v.roaming.player_size
```

For each config key the function registers both the original and lowercase
spellings:

```text
v.roaming.Dress
variable.roaming.Dress
variable.roaming.dress
```

This is required for model settings to work. Do not simplify it back to only
`variable.${path}`.

### Wheel settings

`buildConfigGroups()` reads:

```text
properties.extra_animation_buttons[].config_forms
```

It supports:

- `checkbox` → `0/1`
- `range` → numeric value
- `radio` → label assignments, including multiple statements such as
  `v.roaming.pupil=1;v.roaming.fc=0;`

`buildExtras()` converts `extra_animation` entries whose value starts with `#`
into config buttons. The label should come from the matching config group name,
not from the raw `extraN` key.

`ConfigPanel.tsx` applies changes to `configValues`. Hovering radio options uses
a temporary preview and restores the previous value on leave; clicking commits.

### Runtime vs Studio

- **Studio** skips `pre_parallel*` / `parallel*` and shows all geometry assets.
  This is why configurable models look “exploded” in Studio.
- **Runtime** applies those layers, locks manual bone visibility, and uses the
  model’s own config/visibility logic.
- Model settings only visibly change the assembled model in Runtime. The config
  panel shows a hint/button when the user is in Studio.

## 8. Viewer module

`src/viewer/YsmViewer.ts` is the only long-lived Three.js owner for the main
stage.

Key public methods:

```ts
load(project, texture)
unload()
setTexture(texture)
setConfigValues(values)
setMolangState(state)
setRuntimeMode(enabled)
setBaseClip(name)
playExtra(name)
playPreview(name?)
setPaused(bool)
setSpeed(number)
setFrameLimit(fps)
setSuspended(bool)
setPreviewMode(bool)
setShowGrid(bool)
setTheme('light' | 'dark')
setBoneVisibility(name, state)
clearBoneVisibilityOverrides()
seek(seconds)
resetView()
dispose()
```

Notes:

- Main view uses one `WebGLRenderer`, one scene, one canvas.
- Card hover previews share one persistent renderer via `CardPreview.tsx`;
  they are suspended when hidden and run at 15 FPS.
- `renderer.forceContextLoss()` is called on dispose.
- `setTheme()` replaces the GridHelper colors and adjusts contact-shadow opacity.
  The stage background itself is CSS-driven.
- `setShowGrid()` toggles grid and contact shadow visibility.

## 9. UI state

`src/store/studio.ts` is a zustand store and the single source of UI truth.
Important state:

```text
projects, activeProjectId, texturePath
baseAction, extraAction, extraNonce
paused, speed, stats
settings (grid/rotate/pixel/headFollow/wireframe/showMolang)
molang, configValues
mode ('studio' | 'runtime')
theme ('light' | 'dark')
uiScale
tab ('actions' | 'extras' | 'sounds' | 'bones')
loading, toasts, volume, muted
```

Persisted values:

```text
ysm.theme
ysm.uiScale
```

Do not store decrypted model data in localStorage.

## 10. UI components and layout

- `TitleBar.tsx`: brand, author GitHub link, zoom control, Studio/Runtime switch,
  folder picker.
- `LeftSidebar.tsx`: model library, search, selected model details, textures,
  data source.
- `Stage.tsx`: preview header, toolbar, canvas, FPS overlay, empty/loading states.
  The FPS overlay is intentionally the only stage statistic.
- `BottomBar.tsx`: play/pause, seek, speed, Molang drawer, reset view.
- `RightSidebar.tsx`: tabs for actions, wheel, sounds, bones. ConfigPanel is
  rendered from the wheel/config entries.
- `BoneTree.tsx`: right-side bone hierarchy, search, common-part expansion,
  parent/child visibility overrides.
- `CardPreview.tsx`: persistent hover preview renderer.
- `ModelHoverPreview.tsx`: portal positioning/visibility for card previews.

Themes are controlled by `document.documentElement.dataset.theme`:

```text
(no attribute) or light  → sakura light
dark                     → copper dark
```

All new UI must be checked in both themes. Dark-specific overrides are scoped
with `:root[data-theme="dark"] ...` at the end of `styles.css`.

UI scale:

- Electron uses `window.ysmNative.setZoomFactor()` → `webContents.setZoomFactor`.
- Browser fallback uses `document.documentElement.style.zoom`.
- Range: 80–140%.
- Keyboard: Ctrl +, Ctrl -, Ctrl 0.

## 11. Electron layer

`main.cjs`:

- Creates a 1500×960 window, minimum 1180×760.
- Loads Vite URL in dev, otherwise `ysm://app/index.html`.
- Registers `ysm://` as a privileged custom scheme.
- Uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`.
- Hides the menu bar.
- Uses title-bar overlay and updates its colors when the theme changes.

IPC exposed in `preload.cjs`:

```text
dialog:open-files
dialog:open-directory
fs:read-file
fs:scan-directory
fs:read-directory-files
app:set-zoom-factor
app:set-theme
app:open-external
app:show-in-folder
```

Main process reads user files; renderer performs parsing/rendering. No model
write IPC exists.

## 12. Build and packaging

Frontend build:

```powershell
npm run build
```

The output goes to `dist/` (ignored by Git).

Electron-builder config lives in `package.json`:

```json
"asar": false,
"appId": "rip.ysm.studio",
"productName": "YSM Studio Previewer"
```

Observed release workflow:

```powershell
npm run build
npx electron-builder --win --x64 --dir --config.win.signAndEditExecutable=false
```

Then copy `release/win-unpacked` to a distributable folder, add:

```text
启动 YSM Studio.cmd
启动说明.txt
```

and ZIP it. The portable single-exe build can fail on restricted Windows
accounts, so the launcher-based ZIP is the supported distribution.

Do not commit `release/`, `dist/`, or any ZIP.

## 13. Testing

Minimum before committing:

```powershell
npm run typecheck
npm run build
```

Useful tests:

```powershell
node scripts/smoke.mjs       # needs Vite + Chrome
node scripts/wasm-test.mjs   # WASM V1/V2/V3 end-to-end
node scripts/v2-test.mjs     # set YSM_TEST_FILE
node scripts/v3-test.mjs     # set YSM_TEST_FILE
```

`test-fixtures/default-v1.ysm` is the only test model committed. Do not commit
real third-party V2/V3 packs.

When changing parser or animation behavior, test at least:

1. bundled `default` demo;
2. one V3 model with raw meshes;
3. one model with `config_forms` and `pre_parallel*` / `parallel*` layers;
4. Studio and Runtime modes;
5. light and dark themes.

## 14. Performance notes

The current main bottleneck is usually draw calls, not triangle count.

- The viewer creates one Three.js mesh per geometry-bearing bone.
- Large models can have hundreds of meshes.
- `MeshStandardMaterial`, three directional lights, 2048 PCFSoft shadows,
  transparency, and DoubleSide all add cost.
- Animation sampling and Molang evaluation run every frame.
- `pre_parallel*` / `parallel*` layers can add many bones and expressions.

Do not “optimize” by changing coordinate/mirror logic. If optimizing, start with:

1. verify Electron is using the discrete GPU;
2. batch/merge bone meshes;
3. cache static config layers;
4. reduce shadow/material cost;
5. reduce per-frame allocations.

## 15. Known limits

- Animation controllers are not a full OpenYSM state machine.
- Physics bones follow authored keyframes; no full physics solver.
- `hold_on_last_frame` clips keep their final pose until stopped.
- Large archives are constrained by WASM heap.
- Camera framing does not automatically refit when a config changes
  `player_size`; users may need to zoom out.
- Model settings are runtime visibility/config effects; Studio intentionally
  shows all assets.
- The repository currently has no CI workflow.

## 16. Agent workflow and rules

When making changes:

1. Read `README.md` / this file first.
2. Inspect the relevant components and store before editing.
3. Keep model parsing and rendering invariants intact; do not “fix” mirrored
   geometry by guessing.
4. Make focused edits; do not mass-reformat unrelated files.
5. Run `npm run typecheck`; run `npm run build` for release-affecting changes.
6. Test both themes and both Studio/Runtime modes when UI or visibility changes.
7. Do not commit:
   - `node_modules/`, `dist/`, `release/`, `shots/`, `.electron-profile/`
   - third-party `.ysm` model packs
   - decrypted model data or test assets you do not have rights to redistribute
8. Do not expose local absolute paths, tokens, or user data in committed files.
9. If a model setting fails, inspect:
   - whether the variable is used in an animation file;
   - whether duplicate animation names were overwritten;
   - whether the expression variable name has uppercase letters
     (molangjs lowercases paths);
   - whether the UI is in Studio (all assets) rather than Runtime.
10. Update the English and Chinese READMEs together when user-facing behavior
    changes.

## 17. License and security

- Original source: MIT (`LICENSE`).
- Third-party components/assets: see `THIRD_PARTY_NOTICES.md`.
- Bundled demo audio is CC BY-NC-SA 4.0; replace for commercial distribution.
- Decryption/unpacking are in-memory only; the app does not export plaintext
  assets to disk.
- Never add telemetry, network uploads of model data, or hidden asset extraction
  without explicit project-owner approval.
