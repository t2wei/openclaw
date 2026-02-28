# Knowledge Ingestion — Processing SOP

## Source Types

| Source                       | Tools                                   | Flow                                             |
| ---------------------------- | --------------------------------------- | ------------------------------------------------ |
| Lark doc/wiki                | `feishu_doc`, `feishu_wiki` (built-in)  | Read → classify → archive → extract → push KB    |
| Lark minutes                 | `feishu-minutes` (custom skill)         | Fetch → archive to meetings/ → extract → push KB |
| External notes/meeting tools | `browser-extract` (URL) / direct (text) | Archive to meetings/ → extract → push KB         |
| Claude Code session          | Direct `.jsonl` parse                   | Filter → extract → daily log                     |

---

## Lark Doc/Wiki SOP

1. Extract token from URL, read via `feishu_wiki` or `feishu_doc`
2. Classify → archive:
   - Meeting notes → `memory/meetings/YYYY-MM-DD-{topic}.md`
   - Technical document → `memory/docs/{source}-{topic}.md`
   - Ephemeral → daily log only
3. Extract reusable knowledge → `oxsci-knowledge`
4. Reply: archive location + what was extracted

## Lark Minutes / External Notes SOP

1. Lark minutes → `feishu-minutes`; external URL → `browser-extract`; plain text → process directly
2. Archive: `memory/meetings/YYYY-MM-DD-{topic}.md`
3. Extract reusable knowledge → `oxsci-knowledge`
4. Reply: archive location + what was extracted

## Claude Code Session SOP

1. Parse `.jsonl`: only `role: "user"` and `role: "assistant"` messages, skip tool messages
2. Identify high-value segments → extract to daily log or push to KB
3. Reply: summarize valuable content found
