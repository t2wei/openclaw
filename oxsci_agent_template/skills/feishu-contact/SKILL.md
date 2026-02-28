---
name: feishu-contact
description: "Query Feishu/Lark contacts directory to look up user info (name, email, department, title) by open_id. Use when receiving messages from unknown users."
---

# feishu-contact Skill

Feishu 通讯录查询工具。用于识别新同事。

## 脚本

### get_user.sh

通过 open_id 获取飞书用户信息（姓名、邮箱、部门、职位等）。

**用法**：

```bash
./scripts/get_user.sh <open_id> [id_type]
```

**参数**：

- `open_id`: 用户 ID（如 `ou_xxx`）
- `id_type`: ID 类型，默认 `open_id`，可选 `union_id`、`user_id`

**示例**：

```bash
./scripts/get_user.sh ou_edc6f66e761b5706a3b47b38102f9630
```

**返回字段**（常用）：

- `name` — 用户名
- `email` — 邮箱
- `job_title` — 职位
- `department_ids` — 部门 ID 列表
- `open_id` — 飞书 open_id
- `union_id` — 跨应用 union_id

### search_user.sh

通过名字搜索用户（模糊匹配）。

**用法**：

```bash
./scripts/search_user.sh <name> [department_id]
```

**参数**：

- `name`: 要搜索的名字（支持部分匹配，不区分大小写）
- `department_id`: 部门 ID，默认 `0`（根部门，即全公司）

**示例**：

```bash
./scripts/search_user.sh 文浩
./scripts/search_user.sh "Tony"
./scripts/search_user.sh 张 od-xxx  # 在特定部门搜索
```

**返回**：匹配用户的 JSON 数组，包含 name、open_id、email、job_title 等字段。

## 使用场景

**场景 1**：收到未知 channel ID（`ou_xxx`）的消息

1. 用 `get_user.sh` 查询用户信息
2. 将结果添加到 `memory/COLLEAGUES.md`
3. 在当前 session 中正常响应

**场景 2**：需要查找某人但只有名字

1. 用 `search_user.sh` 按名字搜索
2. 从结果中获取 open_id 和其他信息
3. 继续后续操作

## 注意

- 需要 `OPENCLAW_CONFIG_PATH` 环境变量
- 自动从配置中读取 Feishu appId 和 appSecret
- 需要飞书应用有通讯录读取权限（`contact:user.base:readonly`）
