# YSM Studio Previewer

[English](README.md) · **简体中文**

> [!IMPORTANT]
> **AI 生成内容免责声明**
>
> 本项目（包括源代码、文档和配置）有相当一部分由 AI 辅助生成，可能存在错误、遗漏、不安全的实现或未经证实的假设。项目按 **“现状”** 提供，不附带任何明示或暗示的担保。在用于生产环境或分发前，请自行审查、测试并确认安全性与授权合规性。维护者不对因使用本项目造成的任何损失或损害承担责任。
>
> 第三方模型、贴图、音频及其他素材的权利归各自作者所有，并受其各自许可证约束。

独立的 Windows 11 桌面预览器，用于 **Yes Steve Model**（`.ysm`）。它在内存中读取并解析模型，然后渲染、播放动画和试听语音，无需启动 Minecraft。

**仅用于预览：** 解密和解包是内部的纯内存步骤，应用不提供导出解密包或提取资源的功能。

![YSM Studio](docs/preview.png)

## 功能

| 功能 | 状态 |
| --- | --- |
| `.ysm` V1（AES-CBC + zlib） | ✅ 已完成端到端验证 |
| `.ysm` V2（AES-CBC + JavaRandom + zlib） | ✅ 已验证，包含旧版扁平目录结构 |
| `.ysm` V3（`YSGP`、XChaCha20/MT19937_64/CityHash64） | ✅ 已用真实 V3 模型验证 |
| V3 烘焙几何（`raw_meshes`） | ✅ 跳过方块重建，100% 保留原始网格 |
| Bedrock 方块几何 | ✅ Box UV + 逐面 UV + inflate + 方块 pivot/rotation |
| Three.js 骨架与绑定姿态 | ✅ 绝对 pivot 转为局部层级 |
| 动画混合 | ✅ 基础移动动画 + Extra 叠加 + idle 底层 |
| Molang 表达式 | ✅ 使用 `molangjs`，每帧注入 query/ysm/v 变量 |
| 动画时间轴音效 | ✅ 跨帧检测，包含循环回绕 |
| OGG 语音板 | ✅ Howler.js，支持进度、音量、静音 |
| PNG / WebP / AVIF / JPG 贴图 | ✅ 最近邻/线性过滤切换 |
| 自发光 `_e` 贴图配对 | ✅ 自动附加 `emissiveMap` |
| 骨骼树部件显隐 | ✅ 自动层级、搜索、父子覆盖 |
| 轮盘模型设置 | ✅ `config_forms` 的 checkbox / range / radio → Molang `v.*` |
| 编辑 / 模拟模式 | ✅ 模拟模式应用 `pre_parallel*` / `parallel*`，锁定部件树 |
| 卡片悬停预览 | ✅ 在 15 FPS 浮层中播放 `preview_animation` |
| 文件夹导入 | ✅ 递归查找 `.ysm`、`ysm.json`、旧版 `main.json` 模型 |
| 大型模型库 | ✅ 搜索/筛选，离屏卡片使用 `content-visibility` |
| 界面缩放 | ✅ 80–140%，自动记忆；Ctrl +/-/0 |
| 亮色 / 暗色主题 | ✅ 樱花亮色与铜色暗色，自动记忆 |
| 纯内存 VFS | ✅ WASM MEMFS，不将解密文件写入磁盘 |
| Electron 桌面外壳 | ✅ 自定义 `ysm://` 协议、原生文件/文件夹对话框 |
| 浏览器模式 | ✅ 支持拖放、文件/文件夹选择 |

## 快速开始

```powershell
git clone https://github.com/FGXYX/YSM-Studio-Previewer.git
cd YSM-Studio-Previewer
npm install
npm run dev            # 浏览器预览：http://127.0.0.1:5173
npm run electron:dev   # Windows 桌面窗口
```

应用启动时会载入内置 CC0 示例模型。可以把 `.ysm` 直接拖进窗口，或点击 **选择模型文件夹**。文件夹选择器支持：

- 包含一个或多个 `.ysm` 文件的文件夹；
- 包含一个或多个未加密模型（`ysm.json`）的文件夹；
- 旧版扁平模型（`main.json` / `models/main.json`）；
- 包含多个模型子文件夹的父目录。

模型较多时，左侧有搜索框；离屏卡片使用 `content-visibility: auto`，避免一次性绘制整个模型库。

`electron:dev` 会有意使用以下参数启动 Electron：

```text
--no-sandbox --user-data-dir=.electron-profile
```

在部分 Windows 环境中，Chromium 沙箱可能无法初始化（`0x80000003` / 退出码 `2147483651`），或者默认 `%APPDATA%` 配置目录不可写（`0xC0000005`），此时需要这些参数。配置目录保留在项目内，并已被 Git 忽略。正常的桌面账户可以移除这两个参数。

> 如果 Windows AppData 权限仍然阻止 Electron 启动，可以使用独立配置目录：
> `electron . --user-data-dir=D:\path\to\profile`

如果 Electron 立即以 `2147483651` / `0x80000003` 退出，请结束残留进程后重新运行：

```powershell
taskkill /IM electron.exe /F
npm run electron:dev
```

## 生产构建

```powershell
npm run build
npm run electron:build
```

`electron:build` 默认构建 portable 可执行文件，并关闭可执行文件签名和资源编辑，避免在受限 Windows 账户上触发 NSIS/7-Zip 符号链接问题。`release/win-unpacked/` 中就是完整应用，可以直接压缩成 ZIP。

构建产物位于 `release/`：

- `YSM-Studio-0.1.0-win-x64.zip` — **推荐**：解压后运行 `YSM Studio Previewer.exe`，无需安装。
- `YSM Studio Previewer 0.1.0.exe` — 单文件 portable 包装器，会自解压到临时目录。
- `win-unpacked/` — 用于生成 ZIP 的未压缩应用。

桌面外壳通过自定义 `ysm://app/` 协议提供 `dist/` 文件，使 `fetch()` 和 WebAssembly 能在类似 `file://` 的隔离环境中正常工作。`asar` 被有意关闭，这样协议处理器可以直接读取安装目录中的文件，无需额外解包。

## 重新编译 WASM 解析器

仓库中的 `public/wasm/YSMParser.js` 和 `YSMParser.wasm` 由修改过的 `../YSMParser` 源码编译而来。

```powershell
# 一次性工具链：emsdk 6.x（emcc/em++）、Python 3，以及 YSMParser/external 中的 zlib/zstd 源码
$env:EMSDK = 'D:\path\to\emsdk'
powershell -ExecutionPolicy Bypass -File scripts\build-wasm.ps1
```

脚本直接使用 `emcc`/`em++` 编译 C++20/WebAssembly，避免 CMake preset 需要写入源码树 `zconf.h` 的限制。也可以继续使用 CMake：

```powershell
cmake --preset wasm-web-release
cmake --build --preset wasm-web-release
```

## 架构

```text
ysm-studio/
├─ electron/
│  ├─ main.cjs              # 窗口、ysm:// 协议、原生对话框
│  └─ preload.cjs           # contextBridge API
├─ src/
│  ├─ parser/
│  │  ├─ wasmParser.ts       # MEMFS 桥接 + ysm_parse_bytes
│  │  ├─ projectParser.ts    # ysm.json / 几何 / 贴图 / 语言 / 轮盘
│  │  └─ importers.ts        # .ysm、文件夹、拖放、示例、原生对话框
│  ├─ viewer/
│  │  ├─ YsmViewer.ts        # Three.js 场景、骨架、材质、控制
│  │  └─ animation.ts        # 关键帧采样、Molang、音效事件
│  ├─ audio/AudioEngine.ts   # Howler.js 音效 + 语音板
│  ├─ store/studio.ts        # zustand UI 状态
│  ├─ components/            # Win11 风格面板、轮盘、时间轴、Molang
│  └─ styles.css
├─ public/
│  ├─ wasm/                  # YSMParser.js + .wasm
│  └─ samples/default/       # 内置示例（CC0 模型 + 一段 CC BY-NC-SA 音效）
└─ scripts/                  # WASM 构建、示例同步、冒烟测试
```

三条数据路径最终都会生成同一个 `ParsedProject`：

1. **加密 `.ysm`** → `parseYsmBytes()` 将字节流写入 Emscripten MEMFS → `ysm_parse_bytes()` 调用修改过的 V1/V2/V3 解析器 → 读取 `/ysm/out-*` 目录树。
2. **未加密文件夹** → 浏览器目录选择 / Electron 对话框 / 拖放 → 文件映射。
3. **内置示例** → `public/samples/default/manifest.json` → 文件映射。

解密后的资源不会写入用户磁盘。

## 坐标处理

YSM 使用镜像 X 坐标渲染 Blockbench 资产。处理错误时，双臂会向内旋转并在两腿之间交汇，尤其是在常见 `LeftArm Z=-18° / RightArm Z=+18°` 绑定姿态的模型上非常明显。

- **V1/V2 和未加密方块资产**由查看器转换：
  - 骨骼/方块 pivot 和几何 X 取反；
  - 骨骼/方块旋转 `(x, y, z)` → `(-x, -y, z)`；
  - 每个面的 U 轴反向，与 OpenYSM 的 `u0/u1` 交换一致。
- **V3 `raw_meshes`** 已由 `YSMParserV3.cpp` 导出到镜像空间，因此查看器不会再次镜像绑定姿态或几何。
- **所有格式的动画通道都会转换**：旋转 `(x, y, z)` → `(-x, -y, z)`，位置 X 取反。OpenYSM 的 `RotationValue.convert()` 和 `RenderUtils.translateMatrixToBone()` 也是同样处理；否则手臂和腿的摆动相位会相反。
- Bedrock 单位在 `1/16` 缩放根节点内仍保持 Blockbench 单位。
- 绝对骨骼 pivot 会转换为相对父 pivot 的局部位置。
- 绑定旋转使用 **ZYX** 顺序，与 OpenYSM 的 `RotateZYX` 渲染路径一致。
- UV 使用左上角归一化空间；配合 Three.js 默认 `flipY` 上传应用 `1 - v`。

## 部件显隐

右侧的 **骨骼** 标签会根据模型真实的 `parent` 关系生成骨骼树，而不是使用固定部件列表。把它从狭窄的左侧模型库移出后，层级有足够空间展开。

- 只显示有几何体或可见后代的骨骼，空定位器链会被省略。
- 搜索会过滤骨骼树，同时保留祖先路径。
- “展开常用”会展开常见部件的路径（`Hair`、`Head`、`Face`、手臂、手、腿、裙子、披风、尾巴、翅膀等）。
- 显隐以显式覆盖保存，最近一级的覆盖优先，因此可以显示被隐藏父级下的子部件。
- 隐藏部件只改变网格可见性，动画仍会继续计算；重新显示时会立即恢复当前姿态。
- 覆盖只作用于当前模型，切换模型后重置。

## 轮盘模型设置

YSM 轮盘中，值以 `#` 开头的条目是设置页，而不是动画。例如：

```json
"extra_animation": {
  "自定义模型": "#自定义模型",
  "表情设置": "#表情设置"
}
```

应用现在会：

- 将这些条目保留在轮盘中，作为带齿轮图标的设置入口；
- 读取 `extra_animation_buttons[].config_forms`；
- 支持 `checkbox`、`range` 和 `radio`；
- 从模型语言文件本地化标题、描述和单选标签；
- 通过 `v.roaming.face`、`v.roaming.Player_zoom` 等 Molang 变量实时影响模型；
- 单选项支持 **悬停预览**：悬停时临时应用该选项，移出后恢复，点击后才正式应用。

`radio` 标签可以包含多个赋值（`v.roaming.pupil=1;v.roaming.fc=0;`），所有赋值会一起应用。配置值每帧重新计算，切换模型后不会保留。

旧版 `extra_animation_classify` 子菜单仍会展开到轮盘列表中，而带配置组的 `#...` 条目会打开设置面板。

## 编辑与模拟模式

标题栏可以在两种模式之间切换。

**编辑（Studio）** 是制作视图：

- 骨骼树显示全部部件；
- 可手动编辑部件显隐；
- 未声明的兜底动画会出现在“调试动作”下。

**模拟（Runtime）** 模拟游戏内状态：

- 在基础动作周围应用模型的 `pre_parallel*` / `parallel*` 层，并计算其中的 Molang 缩放/显隐表达式；
- 使用默认游戏状态（站在地面、无装备）作为 Molang 输入；
- 手动部件显隐被锁定并重置，显隐完全遵循模型自身的动画/配置逻辑；
- 未声明的兜底动画从轮盘中隐藏；
- 舞台标题旁显示 `SIMULATION` 标记。

**编辑** 模式会有意跳过这些运行时层，因此可配置部件的两种形态都会显示。“显示全部资产”指的是：基础动画仍会播放，但 `pre_parallel*` 的缩放表达式不会隐藏未选择的脸型或配色部件。

模拟模式不会猜测哪些骨骼是“眼睛”或“衣服”。这些由模型自身的 `v.*` 配置和 `pre_parallel*` 缩放表达式控制，避免覆盖作者的意图。

## 默认外观从哪里来

YSM 包中没有单独的 `default.json` / `visibility.json`。模型包通常包含 `ysm.json`、`models/`、`animations/`、`controller/`、`textures/`、`sounds/` 和 `avatar/`。

游戏内默认外观由以下内容共同组成：

- `properties.default_texture` — 默认贴图；
- `properties.preview_animation` — GUI 预览动画（不是游戏内 idle）；
- `properties.extra_animation_buttons[].config_forms` — 配置变量默认值；
- `animations/*.animation.json` — `idle`、`pre_parallel0..7`、`parallel0..7`；
- `controller/*.controllers.json` — 控制器状态机。

例如，在测试过的模型中，`pre_parallel1` 有 310 根骨骼和 309 个缩放通道；`v.roaming.face == 0`、`v.roaming.colour == 1` 等表达式会隐藏未选择的脸型/配色变体。`pre_parallel6/7` 控制漂浮表情图标，`parallel0` 是第一人称手臂层（第三人称预览中跳过）。

`v.*` 值会以 `variable.*` 暴露给 molangjs，因为 molangjs 会把 `v.foo` 重写为 `variable.foo`。

## 卡片悬停预览

模型卡片保留静态头像缩略图。悬停时打开一个 220×260 的 3D 浮层：

- 使用 `default_texture` 加载该模型；
- 播放 `properties.preview_animation`（`gui`、`Menu` 等），找不到时回退到 `idle`；
- 应用默认配置值和 `pre_parallel*` 层；
- 隐藏地面网格、接触阴影和实时阴影；
- 以 15 FPS 运行，鼠标离开后暂停渲染；
- 所有卡片共用同一个持久 WebGL 上下文，而不是每次悬停创建一个上下文。

同一时间只有一个卡片预览存在，因此 800 根骨骼的大型模型不会在模型库中复制出大量场景。

## 回归测试

```powershell
# 从内置示例构建一个可用的 V1 压缩包（仅用于测试）
node scripts/make-test-ysm.mjs

# 浏览器冒烟测试（需要先运行 `npm run dev`，并安装 Chrome）
node scripts/smoke.mjs

# V1/V2/V3 加密格式端到端检查
node scripts/wasm-test.mjs
$env:YSM_TEST_FILE = 'D:\path\to\sample-v2.ysm'; node scripts/v2-test.mjs
$env:YSM_TEST_FILE = 'D:\path\to\sample-v3.ysm'; node scripts/v3-test.mjs
```

开发期间使用的测试 `.ysm` 文件不会随项目分发。请将 `YSM_TEST_FILE` 指向你自己合法获得的 V2/V3 模型。生成的 `default-v1.ysm` 来自 CC0 默认模型，可以用 `node scripts/make-test-ysm.mjs` 重新生成。

## 已知限制

- 动画控制器不会作为完整状态机执行；预览器有意使用相同的视觉分层模型（基础移动动画 + Extra 叠加 + idle 底层），而不是模拟 OpenYSM 的每一个控制器条件。
- 物理骨骼按照作者制作的关键帧播放；尚未实现完整的一阶/二阶物理求解器。
- `hold_on_last_frame` 动画会保持最后一帧，直到用户手动停止。
- 超大模型包受 WASM 堆限制（已启用 `ALLOW_MEMORY_GROWTH`，初始堆为 16 MB）。
- 显示时会去除 Minecraft 格式代码（`§6`、`&a`）。

## 开源协议

本仓库中原创的源代码使用 **MIT License** 开源，详见 [LICENSE](LICENSE)。

第三方组件、Electron/Chromium 运行时以及内置示例素材有各自的许可条款。分发构建产物前请阅读 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。特别注意：

- 内置示例音效 `sounds/chime.ogg` 使用 **CC BY-NC-SA 4.0**，商业分发前必须替换；
- 开发过程中使用的第三方模型包不包含在本仓库中，未经作者许可不得再分发。

## 致谢

- **YSMParser** / **OpenYSM** — 上游 C++ 解析器与 GeckoLib 数据模型。
- **Three.js**、**molangjs**、**Howler.js**、**React**、**Vite**、**Tailwind CSS**、**lucide-react**。
- 内置默认模型：CC0，来自 OpenYSM `builtin/default`。
- 内置示例音效 `sounds/chime.ogg`：CC BY-NC-SA 4.0，来自 OpenYSM Wine Fox `14_momo/sounds/fly_on.ogg`，仅用于本地示例。商业分发前请替换。
- YSM 与 Yes Steve Model 是其各自作者的项目；本工具是独立预览器。
