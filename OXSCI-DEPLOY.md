# OpenClaw 部署参考

> EC2（Ubuntu）+ Nginx Proxy Manager + Lark/Feishu 场景的部署参考。

---

## 核心概念

### Device（设备）

连接到 Gateway WebSocket 的客户端身份。每个客户端（浏览器、CLI、iOS/Android app）都有唯一的 Ed25519 keypair，派生出稳定的 `deviceId`。

- 首次连接需要 **device pairing**（配对审批）
- 审批后获得 device token，后续自动使用
- 可在 Control UI 的 **Nodes 页面** 审批或拒绝

### Channel（频道）

消息平台的集成插件：Feishu/Lark、WhatsApp、Telegram 等。

- **Channel ≠ Device**，channel 是独立的 transport，走自己的 webhook/WebSocket
- Channel 接收消息**不需要 device pairing**
- Channel 有自己的 **DM pairing**（`dmPolicy`）：控制谁可以给 bot 发私信

  | dmPolicy 值 | 行为 |
  |-------------|------|
  | `"pairing"` | 陌生人收到验证码，管理员用 CLI 批准 |
  | `"open"` | 任何人都可以（需同时配置 `allowFrom: ["*"]`） |
  | `"allowlist"` | 只有白名单用户 |

  **当前配置（生产 & 开发）均为 `"open"`**，访问控制交由 Lark 平台侧管理。

### Node（节点）

具备特殊能力的伴侣设备（iOS/Android app、macOS app node 模式）。

- Node 本质上也是 Device（走 device pairing），role 为 `"node"`
- 能力包括：canvas、camera、screen.record、location.get、sms.send、system.run
- Agent 通过 `node.invoke` 调用这些能力获取上下文

### Instance（实例）

Gateway Instances 页面显示的**当前在线连接**，TTL 5 分钟。

### Session（会话）

对话上下文容器，存储聊天历史、token 用量。

- 以 `sessionKey` 为键（如 `agent:main:main`、`agent:main:feishu:dm:ou_xxx`）
- 历史记录存为 JSONL 文件：`agents/<agentId>/sessions/`
- 默认每天凌晨 4 点自动重置；`/new` 或 `/reset` 可手动重置

### Device Pairing vs DM Pairing

| 类型 | 对象 | 场景 |
|------|------|------|
| **Device Pairing** | 连接 Gateway WS 的客户端 | Control UI、CLI、Node 接入 |
| **DM Pairing** | Channel 里给 bot 发消息的用户 | Lark 私信、WhatsApp 消息 |

两者完全独立，互不影响。

---

## 关键问题解答

### Q: `dangerouslyDisableDeviceAuth: true` 影响 Lark channel 吗？

**不影响。** 该配置只作用于 Control UI（web dashboard）连接：

```
浏览器 → Nginx → Gateway WebSocket
         ↑ dangerouslyDisableDeviceAuth 只影响这条路

Lark → Nginx /feishu → Feishu Webhook Server
         ↑ 完全独立，无 device pairing
```

### Q: 为什么需要 `dangerouslyDisableDeviceAuth: true`？

openclaw 的"自动配对"逻辑只对以下连接生效：

- 直接 loopback（`127.0.0.1`）连接
- Tailscale Serve（`*.ts.net` Host 头）连接

Nginx 通过 LAN IP 连接 Gateway，Host 头是自定义域名——两个条件都不满足，自动配对永远不触发。

`dangerouslyDisableDeviceAuth: true` 是官方为 Nginx 反代场景提供的正规配置，
安全性依赖 `gateway.auth.token`（token 够长够随机即可）。

### Q: 什么是 Tailscale Serve？

Tailscale Serve 是 Tailscale 提供的内网 HTTPS 反代，把本地端口暴露为 `https://machine.tail-xxx.ts.net`，仅 tailnet 内可访问。

Host 头是 `*.ts.net`，openclaw 视为可信本地连接，**自动配对，无需任何特殊配置**。

与 Nginx 可以并存，职责不同：

| 方案 | 访问方式 | 配对行为 |
|------|---------|---------|
| Tailscale Serve | tailnet 内（`*.ts.net`） | 自动配对 |
| Nginx 反代 | 公网域名 | 需要 `dangerouslyDisableDeviceAuth` |

### Q: Gateway Token 从哪来？

三种方式（优先级从高到低）：

1. 环境变量 `OPENCLAW_GATEWAY_TOKEN`
2. 配置文件 `gateway.auth.token`
3. `openclaw onboard` 向导自动生成

---

## 架构概览（EC2 Dev 环境）

```
Internet
    │
    ▼
Nginx Proxy Manager（Docker，443 HTTPS）
    │
    └── openclaw-dev.oxsci.ai  → EC2:18789  (Dev Gateway)
        └── /feishu            → EC2:3000   (Dev Feishu Webhook)
        └── /telegram          → EC2:8787   (Dev Telegram Webhook)

EC2 Host
    └── openclaw-gateway.service    port 18789
```

---

## 迭代开发流程

```
本地开发(oxsci 分支)
  → push 到 GitHub fork
  → EC2 dev: git pull + build + 重启 systemd 服务
  → dev Lark app 测试
  → 确认后部署 prod (ECS Docker)
```

### Dev 环境注意事项

- Lark webhook 需要公网可访问的持续在线服务
- 配置 Lark webhook URL 时 challenge 验证需要服务响应
- 使用 systemd user 服务，SSH 断开后服务不停

### 首次登录 Control UI

```
https://<domain>/overview?token=<gateway-token>
```

token 通过 URL 参数自动填入并存入 localStorage，之后无需重复输入。
