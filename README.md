# Christmas Particle Experience · 截图地台与水平旋转版

本项目在原工程上升级，保留 Three.js、MediaPipe、本地 Worker、ParticleSystem、ParticleText、ParticleMorph 和可取消动画状态机。

## 当前构图

地台恢复到截图版本：完整的三层金色圆环、直边六芒星、柔光盘和少量辅助星尘；外圈独立慢转。撤回大地台、半月前沿及圆角六芒星。保留当前1.17倍树组、增强的金色光晕与树底贴台位置。

鼠标及单指触屏只控制左右（Y轴）旋转，上下拖动不再让树倾斜。保留松手惯性及空闲后缓慢自转；手势、文字、数字与全树聚合规则保持当前行为。

## 双击打开

解压完整工程后，在工程根目录双击 `启动源码版.bat`，会自动启动源码开发服务并打开浏览器；首次缺少依赖时自动执行 `npm ci`。保存源码修改后网页自动更新，使用期间保留启动窗口。

也可以双击 `创建桌面快捷方式.bat`，在当前电脑桌面生成“圣诞粒子体验”入口。此入口打开随包附带的 `release/site` 成品网页，自动启动或复用本地 8080 服务；修改源码后如需更新成品，需要重新构建并同步成品目录。解压或移动工程后请在新位置重新创建快捷方式。不要直接双击 HTML，也不要在压缩包内直接运行启动文件。

## 运行

建议 Node.js 22.12+、支持 WebGL 的 Chrome / Edge。进入本项目目录执行：

```bash
npm ci
npm run dev
```

打开终端中的 localhost 地址。网页加载后自动申请摄像头权限，允许后自动开始本地手势识别；页面不再提供摄像头启动/停止按钮。首次权限由浏览器确认，已授权时直接启动；模型/WASM/字体均本地加载。拒绝权限可继续键盘操作；可在浏览器站点设置中允许摄像头后刷新。离开页面释放摄像头，浏览器缓存恢复页面时自动重新连接。部署使用 `npm run build` 生成的 dist，放在 HTTPS 站点根路径；不要直接双击 HTML。

## 分发（不提供源码）

`release/` 是免源码发布包，`site/` 只有构建产物（压缩后的 JS/CSS、字体、MediaPipe WASM 与手部模型），不含 `src/`、sourcemap 或工程配置：

- `start.bat`：本机起服务，同一 WiFi 下的手机/平板用 `https://局域网IP:8443` 访问；首次需接受一次自签证书警告，之后摄像头可授权。
- `share-public.bat`：cloudflared quick tunnel 生成临时 `https://*.trycloudflare.com` 链接，任何网络都能用，关窗口即失效。
- 永久托管：只上传 `release/site/` 到 Cloudflare Pages / Netlify / Vercel / GitHub Pages。构建已用 `base: "./"`，放在子路径（如 `用户名.github.io/仓库名/`）也能加载模型与字体。

详细步骤与常见问题见 `release/使用说明.md`；可移交的压缩包为 `../Christmas-Experience-Web.zip`。


## 操作

| 输入 | 键盘 | 结果 |
|---|---|---|
| 单指 | 1 | 数字 1 |
| 两指 | 2 | 数字 2 |
| 三指 | 3 | 独立数字 3，识别后 1 秒切换圣诞快乐 |
| OK（拇食指接近，其他手指任意） | O | 同三指：数字 3 → 圣诞快乐 |
| 握拳 | F / R | 从当前粒子位置连续汇聚恢复树 |
| 五指展开 | 空格 | 天天开心，停留后回树 |
| 独立祝福按钮 | T | 圣诞快乐 |
| 鼠标左键 / 单指拖动 | — | 水平转 Y，垂直不改变倾角；释放惯性衰减，约 3 秒后平滑恢复慢速自转 |

数字拥有独立的 2,400 点粒子层，不借用树体粒子。数字模式持续支持拖动与惯性，输入和渲染互不阻塞；树体、飘带、树顶星共享文字轮廓并同时开始聚合；中文通过逆树组矩阵保持朝向，树组旋转不会带动文字。标题、星空、六芒星地台及飘雪不在树组内。仅允许绕Y轴水平旋转，垂直倾角固定为0。

## 本次视觉升级

- 截图版直边实体六芒星内阵、三层慢转圆环、半透明柔光盘与少量辅助星尘，地台轮廓完整可见。
- 5,200颗星独立慢闪，带少量星芒；260点稀疏GPU飘雪。
- 树点略大、金白色更亮，三层银白粒子带加宽；立体粒子顶星配柔光，树体增大6%并加强分层枝冠。
- 数字恢复直接平滑变换，数字与中文均为直立新字体，保留完整笔画与金白光晕。
- 宽屏操作区移到右侧，中央地台完整展示。

## 保留架构与实现

- `gestureConfig.ts`：160ms 确认、0.75 投票比例、200ms 冷却、至少 3 独立帧，上限 30Hz。该置信度为时间窗投票比例，不是假造的模型概率。
- `classifier.ts`：掌宽归一化 OK 优先；连续投票、边沿检测、稳定释放重置、异常时间戳与重复帧过滤。
- `HandTracker.ts`：requestVideoFrameCallback 视频新帧调度，独立 timer 回退；单帧在途，不在渲染循环推理；移除识别前会累积延迟的坐标 EMA。
- `AnimationStateMachine.ts`：OK/三指统一 NUMBER_3，事件发出 1 秒后切换圣诞快乐；新输入会取消旧定时。五指显示天天开心，握拳直接连续回树。
- `ParticleNumbers.ts`：独立缓冲与光晕 Shader；0.8 秒凝聚、0.35 秒淡入；数字切换带受控弧线舒展（X方向最大0.38世界单位，Y/Z更小），结束准确落回目标，数字切换捕捉当前坐标保持连续；不会旋转树体。
- `ChristmasTree.ts`：金/香槟金完整三维圆锥，外壳与体积粒子混合，金色螺旋装饰；没有红色云团。
- `ParticleRibbon.ts`：12,000 点，核心 25%、银白宽层 50%、浮尘 25%。宽度来自真实 XYZ 分布，非放大单点。GPU 沿 3.7 圈螺旋连续流动；独立速度、相位、厚度、端点淡出与缓慢飘移。所有层都在 ParticleTreeGroup，无实体丝带几何体。
- `SceneManager.ts`：独立 ParticleTreeGroup、Pointer Capture、惯性与阻尼、自转恢复、树体呼吸、清理监听器。FPS 使用实际帧时间而非截断的动画步长，粒子统计包括树体、独立数字、丝带与星空；缩放及降画质不再取消动画。
- `StarField.ts`：每颗星独立 phase/frequency/min/max，约 12–39 秒周期及少量慢闪光，GPU 计算亮度。
- `ParticleText.ts`：本地Noto Sans SC Variable 600直立中文与正体数字、逐字回退检测、Canvas alpha 阈值 100、4px 采样、确定性浮雕点分布；Shader 径向核/光晕、金/白金色、轻漂浮与闪烁。
- `PostProcessing.ts`：保留 UnrealBloomPass，文字与树模式平滑调整 Bloom。

## 可调参数

`src/config/gestureConfig.ts`：gestureConfirmMs、gestureConfidenceThreshold、gestureCooldownMs、gestureStableFrames。

`src/config/particleConfig.ts`：textParticleSpacing（Canvas采样步长）、textParticleDensity（可见粒子比例）、textParticleSize、textGlowIntensity、textBloomStrength。默认分别为 4、0.34、3.6、2.0、0.72。15k/20k/26k 原粒子池保留，文字通过确定性抽样控制疏密；目标只在形态变化时更新。

## 验证

```bash
npm test
npm run build
npm run test:e2e
# Bash：生产构建验证
E2E_PRODUCTION=1 npm run test:e2e
```

Playwright 使用本机 Edge；摄像头测试是虚拟视频流，模型和 WASM 推理器真实初始化。截图在 artifacts，完整结果见 VALIDATION.md。

真实手势准确率与摄像头端到端延迟需真人在实际光照下验收。原始演示视频未包含在本次压缩包中，本次没有据此宣称逐帧复刻或主观电影级验收。字体授权及依赖许可保留于原工程。
