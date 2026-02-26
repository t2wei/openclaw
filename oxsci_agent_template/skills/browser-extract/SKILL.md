---
name: browser-extract
description: "Extract content from JavaScript-rendered pages (SPA, dynamic content) via headless browser HTTP service. Use when web_fetch returns empty or incomplete content."
---

# Browser Extract Skill

提取 JavaScript 渲染页面内容。用于 SPA、动态内容、需要浏览器渲染的页面。

**重要**: 这是独立的 HTTP 服务，不是 OpenClaw 内置的 `browser` 工具！使用 `exec` + `curl` 调用。

## 使用场景

- Granola 会议纪要 (`notes.granola.ai`)
- React/Vue/Next.js 应用
- 需要 JS 执行才能显示内容的页面
- `web_fetch` 返回空内容或不完整时

## 服务端点

```
http://mcp-browser.oxsci.internal:8066
```

内网 DNS 已注册，DEV 和 PROD 身体均可访问。

## 如何调用

**必须用 `exec` + `curl`**，不要用 OpenClaw 的 `browser` 工具：

```bash
curl -s -X POST http://mcp-browser.oxsci.internal:8066/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://notes.granola.ai/t/xxx"}'
```

### 请求参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `url` | string | ✅ | 要提取的 URL |
| `wait_for` | string | ❌ | 等待特定 CSS 选择器 |
| `extract` | string | ❌ | 格式: `text`, `html`, `markdown` (默认) |
| `selector` | string | ❌ | 只提取特定元素 |

### 响应示例

```json
{
  "success": true,
  "url": "原始URL",
  "final_url": "最终URL",
  "title": "页面标题",
  "content": "提取的内容",
  "content_type": "markdown"
}
```

## 健康检查

```bash
curl -s http://mcp-browser.oxsci.internal:8066/health
```

## 注意事项

1. 提取时间约 5-10 秒（需等待 JS 渲染）
2. 服务跑在 EC2 dev 机器上
3. **不要用 OpenClaw 的 `browser` 工具**，那是 Chrome Extension Relay 模式

## 服务管理 (在 EC2 dev 上)

```bash
sudo systemctl status mcp-browser
sudo systemctl restart mcp-browser
journalctl -u mcp-browser -f
```

## 文件位置

- 服务代码: `/opt/app_data/mcp-browser/`
- systemd unit: `/etc/systemd/system/mcp-browser.service`
