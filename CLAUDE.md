- 本仓库是fork自https://github.com/openclaw/openclaw进行定制开发的.
- 通过aws cli profile=t2wei 可以管理aws
- 开发规范参考[DEV Guide](AGENTS.md)
- lark app(聊天机器人) 分别为生产appid: cli_a91957dbe1e19e1a 开发appid: cli_a91f558927b89e19
- 不要提交本文件(CLAUDE.md),保留原来的软链.

## 部署架构（详见 [DEPLOY.md](DEPLOY.md)）

| 实例 | 运行环境 | State Dir | Gateway Port | Feishu Webhook Port | Lark Bot |
|------|----------|-----------|--------------|---------------------|----------|
| 开发 | EC2 systemd user服务 | `/opt/openclaw/`（EFS挂载） | 18789 | 3000 | dev: `cli_a91f558927b89e19` |
| 生产 | AWS ECS（Docker容器） | EFS挂载 | - | - | prod: `cli_a91957dbe1e19e1a` |

本地挂载(通过EC2跳板) ./.local/openclaw-efs, 注意不要修改日志和session

**EC2开发环境：**
- 通过 `ssh AWS_REVERSE_PROXY` 登录
- 服务名：`openclaw-gateway.service`
- 配置文件：`/opt/openclaw/config-dev.json`
- Nginx Proxy Manager 反代到 `https://openclaw-dev.oxsci.ai/`
- Control UI首次访问：`https://openclaw-dev.oxsci.ai/overview?token=<gateway-token>`

**生产环境（ECS）：**
- 配置文件：`config-prod.json`（待配置）
- 通过 Docker 镜像部署到 ECS
- 接入生产 Lark bot

关键配置要点（Nginx Docker反代场景必须）：
- `gateway.bind: "lan"` + `gateway.controlUi.dangerouslyDisableDeviceAuth: true`
- 这是Nginx Docker反代的正确配置，非workaround（原因见DEPLOY.md）
- Nginx proxy host必须开启Websockets Support
- Feishu webhook通过Custom Location `/feishu`单独路由到webhook port

## 迭代开发流程

```
本地开发(feat分支) → push fork → EC2 dev git pull+build+重启 → dev Lark app测试 → 合并main → 构建Docker镜像 → 部署到ECS(prod)
```

**EC2 dev部署（SSH后执行）：**

```bash
cd /opt/app_data/openclaw-dev
git pull && pnpm install && pnpm build && pnpm ui:build
systemctl --user restart openclaw-gateway.service
```

**生产部署（ECS）：**

```bash
# 构建Docker镜像并推送到ECR，然后更新ECS服务（待完善）
```

**同步upstream：**

```bash
git fetch upstream && git checkout main && git merge upstream/main && git push origin main
```

详见 [DEPLOY.md](DEPLOY.md)。
