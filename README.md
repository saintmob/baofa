# VAD Baofa Multi-screen（4303）

这个仓库是现场演出的 baofa 多屏模块。它固定运行于 `4303`，负责原生多屏特效、屏幕布局、树形/烟花视觉模式，以及与 4300 总控协作完成 20 台屏幕的路由。

## 它在整套系统里的位置

| 模块 | 端口 | 关系 |
| --- | --- | --- |
| 4300 总控 API | `http://localhost:4300` | baofa 的路由、菜单、debug、视觉模式控制来源 |
| 4301 DJ | `http://localhost:4301` | 音乐源，经 4300 影响 VJ |
| 4302 VJ | `http://localhost:4302` | 与 baofa 分屏共存 |
| 4303 baofa | `http://localhost:4303` | 当前模块 |

核心链路：

```text
4300 Multi-screen Interaction -> control.command -> baofa 4303
baofa 4303 -> module.statePatch -> 4300 Dashboard
4300 /screen/<screenId> -> 自动跳转到 4302 或 4303
```

## 启动

```bash
npm install
npm run dev
```

打开 baofa：

```text
http://localhost:4303
```

打开某个 baofa 屏幕：

```text
http://localhost:4303/screen/B1
http://localhost:4303/screen/R2
```

生产模式：

```bash
npm run build
npm run start
```

类型检查：

```bash
npm run lint
```

## 局域网联调

如果要让 4303 在局域网里跟 4300 / 4302 联调，请显式指定主机 IP，而不是依赖 `.env` 里的 `localhost` 示例值：

```bash
VITE_LAN_HOST=192.168.1.10 npm run dev
```

也可以设置为 `SHOW_LAN_HOST`。代码会优先使用这个主机 IP；如果不设置，则回退到当前浏览器访问到的主机名。

如果你确实需要覆盖后端或屏幕跳转地址，也可以继续用 `VITE_SHOW_BACKEND_URL` / `VITE_SHOW_WS_URL` / `VITE_VJ_SCREEN_BASE_URL` / `VITE_BAOFA_NATIVE_URL`，但值为 `localhost`、`127.0.0.1`、`0.0.0.0` 时会被视为本地默认值并忽略。

## 固定端口

baofa 固定使用：

- 服务端口：`4303`
- Vite HMR：关闭
- 4300 总控：`http://localhost:4300`
- VJ screen base：`http://localhost:4302/screen`

端口不要自动漂移。若 4303 被占用，应先释放端口。

## 20 屏布局

现场屏幕布局：

```text
        A1

   B1 B2 B3 B4 B5 B6
 C1 C2           C3 C4
      D1   D2   D3
          E1
          F1

L1                    R1
L2                    R2
```

baofa 的菜单布局、4300 的 Multi-screen Interaction 布局、4300 的路由状态应保持一致。

## 与 4300 的关系

baofa 接收 4300 的命令：

- `setMode`
- `setInteractionMode`
- `setIntensity`
- `resetTree`
- `pulseScreen`
- `setScreen`
- `setVisualMode`

其中 `setVisualMode` 支持：

- `tree`
- `firework`

当 4300 从 `firework` 切到任意 `idle / interaction / flow / climax` 模式时，baofa 会回到 `tree`，避免烟花模式锁住其它效果。

## 屏幕路由

现场推荐每台屏幕只打开 4300：

```text
http://localhost:4300/screen/<screenId>
```

4300 会根据 owner 自动跳转：

- owner 为 `baofa`：跳到 `http://localhost:4303/screen/<screenId>`
- owner 为 `vj`：跳到 `http://localhost:4302/screen/<screenId>`
- owner 为 `off` 或 `diagnostic`：停留在 4300 状态页

baofa 自身也会轮询 4300 路由状态。如果当前 baofa screen 被切给 VJ，并且 `autoRedirect` 开启，它会自动跳到 VJ screen URL。

## 菜单与 debug

4300 可以控制：

- `Show menus`
- `Show debug`
- `Auto redirect`

现场演出默认应隐藏菜单和 debug。需要调试时从 4300 打开，不建议在每台屏幕上手动操作。

## 与 VJ 共存

baofa 不嵌入 VJ，也不采集 VJ 视频。共存方式是 URL 路由：

```text
VJ 屏幕    -> http://localhost:4302/screen/<screenId>
baofa 屏幕 -> http://localhost:4303/screen/<screenId>
```

4300 负责在演出中切换 owner。

## Token 说明

如果 4300 设置了 `CONTROL_TOKEN`，baofa 可配置 `VITE_CONTROL_TOKEN`。注意：

- `VITE_` 变量会暴露给浏览器，不是秘密。
- 本地/LAN 演出时可作为共享口令。
- 公网部署时不要把真实高权限 token 放到前端变量中。

## Vercel / 远程部署

baofa 默认连接本地 4300、4302。部署到公网后，`localhost` 会指向访问者自己的机器，因此不会自动连接现场总控。现场演出推荐本地或 LAN 运行。

## 开发注意

- 不要恢复“点击开始”遮罩，否则路由切换后屏幕可能无法自动播放。
- 不要重新引入旧屏幕 ID：`G1/G2/H1/H2`。
- `tasks/` 和 `docs/` 不提交。
- 修改布局时，同时确认 4300 Multi-screen Interaction 布局。
