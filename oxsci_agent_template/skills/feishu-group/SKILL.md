# feishu-group Skill

Feishu 群组操作工具。

## 脚本

### get_members.sh
获取群成员列表。

**用法**：
```bash
./scripts/get_members.sh <chat_id>
```

**示例**：
```bash
./scripts/get_members.sh oc_f21bbd10bb614f130cccf0fef6accc4a
```

## 注意

- 需要配置好 `OPENCLAW_CONFIG_PATH` 环境变量
- 会自动从配置中读取 appId 和 appSecret
- 只能获取人类成员，bot 成员需要用其他 API
