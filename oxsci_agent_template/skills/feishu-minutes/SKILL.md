---
name: feishu-minutes
description: "Query Lark Minutes (妙记) to get meeting recording metadata, transcript text, and statistics by minute_token. Use when processing minutes links shared by colleagues."
---

# feishu-minutes Skill

Lark Minutes (妙记) 查询工具。

## 脚本

### get_minutes.sh

获取妙记元信息（标题、时长、创建者、URL 等）。

**用法**：

```bash
./scripts/get_minutes.sh <minute_token> [user_id_type]
```

**参数**：

- `minute_token`: 妙记链接最后一段 24 位字符
- `user_id_type`: 默认 `open_id`，可选 `union_id`、`user_id`

**返回字段**：

- `token` — 妙记 token
- `owner_id` — 创建者 ID
- `create_time` — 创建时间
- `title` — 标题
- `duration` — 时长
- `url` — 妙记链接

### get_transcript.sh

导出妙记转写文本（对话记录）。返回纯文本流。

**用法**：

```bash
./scripts/get_transcript.sh <minute_token> [--speaker|--no-speaker] [--timestamp] [--format txt|srt]
```

**参数**：

- `minute_token`: 妙记 24 位 token
- `--speaker` / `--no-speaker`: 是否包含说话人（默认包含）
- `--timestamp`: 包含时间戳
- `--format`: `txt`（默认）或 `srt`

### get_statistics.sh

获取妙记统计数据。

**用法**：

```bash
./scripts/get_statistics.sh <minute_token> [user_id_type]
```

## 注意

- 需要 `OPENCLAW_CONFIG_PATH` 环境变量
- 自动从配置中读取 Lark appId 和 appSecret
- 使用国际版 Lark 域名 (`open.larksuite.com`)
- 需要权限：`minutes:minute:download` 或 `minutes:minutes.transcript:export`
