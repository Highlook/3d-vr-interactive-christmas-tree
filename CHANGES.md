# 手机端修复与诊断 · 最新修改

- src/gestures/HandTracker.ts：摄像头 `<video>` 从“不在 DOM + display:none”改为挂到 body 上的 2px 不可见元素。移动端 Safari/部分 Android 对隐藏或分离的视频不产帧，导致 rVFC 不回调、`currentTime` 不前进、手势永远不出结果——这是“手机能授权摄像头但没反应”的根因。
- 取帧泵：`requestVideoFrameCallback` 加 1.5s 看门狗，没回调就降级为 `setInterval`（`pump: rvfc → interval`）；`createImageBitmap(video)` 失败（Safari 常见）自动改走 2D canvas 抓帧再转 bitmap。
- 新增 src/gestures/diagnostics.ts 与 src/components/Diagnostics.tsx：网址加 `?diag=1` 显示 mode/delegate/pump/frames/hands/fps/video/error 与浏览器能力位，供远端手机自查。
- release/fix-firewall.bat：系统里存在 `Node.js JavaScript Runtime` 的**入站 Block** 规则（Block 优先于 Allow），手机因此连不上 `https://局域网IP:8443`；脚本以管理员权限放行 8080/8443 并禁用该 Block 规则。
- release/serve.mjs 默认端口 8080/8443 与 start.bat 保持一致；此前测试用的 8099/8449 不再使用。
- 验证：本地 HTTPS 下 `?diag=1` 显示 `mode worker / delegate GPU / frames 222 → 222 / fps 21`，控制台零错误；Cloudflare 隧道返回的 index 与本次构建哈希一致。

以下为历史记录。

---

# 可移植发布包 · 最新修改

- vite.config.ts：`base: "./"`，构建产物使用相对资源地址，可直接部署在站点根目录、任意子路径（GitHub Pages 项目页）或局域网静态服务器。
- src/config/gestureConfig.ts：`wasmPath`/`modelPath` 去掉前导斜杠，`src/gestures/HandTracker.ts` 的 worker URL 同步改相对路径，使模型与 WASM 随页面路径解析而不是固定站点根。
- release/：新增免源码发布包。`site/` 为构建产物（无 src、无 sourcemap），`serve.mjs` 为零依赖静态服务器，同时监听 HTTP 8080 与自签 HTTPS 8443（摄像头必须安全上下文），`make-cert.ps1` 按当前局域网 IP 生成证书，`share-public.bat` 用 cloudflared quick tunnel 生成临时公网 HTTPS 链接，`使用说明.md` 记录三种分发方式。
- 打包：`christmas-upgrade/Christmas-Experience-Web.zip`，仅含 `site/`、启动脚本、证书脚本、说明与 licenses，不含源码、tools、certs。
- 验证：`npm run build` 通过；HTTPS 与 `/site/` 子路径下 Playwright 载入均无控制台错误，WebGL 画布正常，手势 worker 以 GPU 委托初始化，MediaPipe WASM 与模型均返回 200 且 MIME 正确。

以下为历史记录。

---

# 自动申请摄像头 · 最新修改

- src/components/Experience.tsx：删除启动/停止摄像头大按钮；组件加载后自动申请权限，授权后自动启动本地识别。保留状态提示、键盘说明和圣诞快乐独立按钮。
- 使用可取消的组件生命周期和微任务调度，避免StrictMode探测挂载重复请求；离开页面停止摄像头/推理，缓存恢复时重新连接；过期异步结果不更新页面。
- 拒绝权限或设备不可用时显示键盘回退与站点权限提示，不循环请求。
- src/gestures/HandTracker.ts：修正调用说明，识别算法保持不变。
- e2e/experience.spec.ts：验证无需点击的单次申请、模型初始化、按钮移除、pagehide结束视频轨道与Worker、缓存恢复重连，以及自动申请被拒绝后的键盘回退。
- scripts/visual-review.mjs：用虚拟摄像头检查自动启动后的实际页面。
- README.md、VALIDATION.md、scripts/package-delivery.py：更新行为、验证与交付名称。

以下为历史记录。

---

# 数字节奏与切换幅度微调 · 最新修改

- src/three/ParticleNumbers.ts：凝聚时长0.55秒→0.8秒，增加0.25秒。可见数字切换时，粒子沿独立弧线舒展后归位，最大附加偏移X=0.38、Y=0.2204、Z=0.19世界单位；随迁移距离自适应缩小。首次显示保持直接凝聚。
- 弧线包络sin²(π×progress)在首尾归零，落定后停止位置更新；打断时从当前坐标连续接续；复用位置、目标与偏移数组。
- tests/numbers.test.ts：验证800ms时长、首次直接凝聚、切换有界幅度、目标精确落定、中途打断和不同帧率的一致性，共6项。
- scripts/visual-review.mjs：数字切换截图改在400ms中段捕捉。
- README.md、VALIDATION.md、scripts/package-delivery.py：同步当前行为、验证与交付文件名。
- 保留当前地台、仅Y轴旋转、字形、全树聚合和手势映射；数字3/OK到圣诞快乐的1秒定时保持原规则。

以下为历史修改记录。

---

# 截图地台恢复与仅水平旋转 · 最新修改

- src/three/Planet.ts：从正体字与全树聚合备份恢复截图版地台，原比例(1.3,1,1.3)，三层圆环、六条直边六芒星、半透明柔光盘与3960辅助星尘，撤回半月前沿和画外放大。
- src/three/SceneManager.ts：拖动只使用横向位移；惯性改为单一Y轴速度，每帧保持X轴为零。保留最新树体大小、落台高度、金色光晕和镜头构图。
- tests/atmosphere.test.ts：恢复地台形态断言。
- e2e/spatial.spec.ts：增加斜向鼠标拖动X为零、纯上下拖动不改变Y、触屏X为零且Y可旋转的检查。
- e2e/ornaments.spec.ts：改为检查地台可见轮廓完整入画与树底贴台。

以下为历史修改记录，当前状态以本节为准。

---

# 大地台、树体落台与增强光晕 · 最新修改

| 文件 | 本次变化 |
|---|---|
| src/three/Planet.ts | 地台X比例1.48→2.95，Z比例1.20→1.60，主动延伸画外；72个刻度共用两份几何，释放去重 |
| src/three/SceneManager.ts | 树组1.06→1.17；相机抬高取景；按树底坐标与X倾角补偿落台高度；低幅呼吸；两层金色柔光随镜头定向 |
| src/three/ParticleSystem.ts | 树形粒子径向光晕0.18→0.40，文字保持0.18 |
| src/three/PostProcessing.ts | 树形Bloom强度0.65→0.95，文字仍用独立参数 |
| tests/atmosphere.test.ts | 更新地台比例断言 |
| e2e/ornaments.spec.ts | 增加左右及底缘出画、树底落台的实际WebGL检查 |

下列是历史修改记录，“地台完整可见”为旧构图目标，已由本次画外延伸取代。

---

# 半月形地台与圆润六芒星修订

最新修改：`src/three/Planet.ts` 将地台再加宽约14%，增加前沿中央外凸的半月形柔光带；六芒星改成圆角闭合曲线，刻度改圆头。`tests/atmosphere.test.ts` 更新形态断言。生产构建和78项单元测试通过，Edge实际画面与控制台检查通过。

以下保留上一版修改清单。

# 正体字、扩大地台与全树文字聚合修订

保留已验收的手势分类和摄像头调度，不改手势定义与一秒定时。

| 文件 | 修改 |
|---|---|
| src/three/ParticleNumbers.ts | 撤回展开凝聚，恢复0.55秒当前坐标到目标的平滑插值 |
| src/three/ParticleText.ts | 数字正体、中文更换直立字体，去除剪切倾斜与波浪基线 |
| src/three/Planet.ts | 放大地台，实体发光六芒星与慢转圆环、薄雾、少量星尘 |
| src/three/ChristmasTree.ts | 多层枝冠粒子与明暗层次，保留真实三维体积 |
| src/three/SceneManager.ts | 树组增大6%，接入统一装饰文字目标，统计实际点数 |
| src/three/DecorationMorph.ts | 新增装饰变形缓冲，支持中断快照与世界空间目标补偿 |
| src/three/ParticleRibbon.ts | 三层飘带点真正移入文字位置，文字阶段保持可见 |
| src/three/TreeTopper.ts | 1200点立体五角星，全部星点加入文字而非淡出 |
| src/three/AnimationStateMachine.ts | 同时采样树体与装饰完整文字，统一起止时刻，握拳一同回树 |
| src/styles/global.css | 上移标题，给略增大的树顶留白 |
| tests/ | 更新数字、字体、地台、顶星测试，新增装饰连续性及状态机耦合测试 |
| e2e/ornaments.spec.ts | 真实WebGL验证飘带/星点可见并到达文字、握拳复原及截图 |
| e2e/experience.spec.ts | 实际点数统计更新 |
| scripts/package-delivery.py / README.md / VALIDATION.md | 工程包和说明更新 |

原始ZIP与先前交付包保留。当前目录直接修改，最终源码与生产构建一同交付。
