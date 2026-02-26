# OxSci Archive Skill

Archive completed work documents to the company knowledge base. This is the **historical record** layer — research reports, meeting summaries, decision logs, and other task/time-based artifacts.

## When to Use

After completing a task that produced documents worth preserving as historical record (not live knowledge — use `oxsci-knowledge` for that).

Examples:
- Meeting summary → archive
- Research report → archive
- Technical decision record → archive
- Best practice guide → `oxsci-knowledge` (live, needs updates)

## Scenario

- **Scenario name:** `oxsci-archive`
- **Backend:** Same Data Service API as `oxsci-knowledge`

## Scripts

### 1. archive.sh — One-step archive (most common)

Creates a snippet, uploads content, and links it to an existing Knowledge category. Default priority: 9999.

```bash
./archive.sh <knowledge_name> <title> <file_path> [tags]
```

**Examples:**

```bash
# Archive a meeting summary
./archive.sh archived-meeting-notes \
  "Product Roadmap Meeting 2026-03-01" \
  /opt/openclaw/workspace/docs/meeting-2026-03-01.md \
  "meeting,product,roadmap"

# Archive a research report
./archive.sh archived-research \
  "LLM Cost Analysis Q1 2026" \
  /opt/openclaw/workspace/docs/llm-cost-analysis.md \
  "research,cost,llm"
```

### 2. manage.sh — Manage Knowledge categories

```bash
# Create a new Knowledge category under oxsci-archive
./manage.sh create_knowledge <name> <title>

# Link an existing snippet to a Knowledge category
./manage.sh link_snippet <knowledge_name> <snippet_id>

# List Knowledge categories in oxsci-archive
./manage.sh list
```

**Examples:**

```bash
# Create a new category for research reports
./manage.sh create_knowledge archived-research "Archived Research Reports"

# Link an existing snippet to it
./manage.sh link_snippet archived-research d734223c-ecec-4880-bb5c-8b5e4b0d9fac
```

## Existing Knowledge Categories

| Knowledge Name | Purpose |
|----------------|---------|
| `archived-meeting-notes` | Meeting summaries and notes |

_(Add new categories as needed via `manage.sh create_knowledge`)_

## Architecture

```
oxsci-archive (Scenario)
  ├── archived-meeting-notes (Knowledge)
  │     ├── snippet-1 (meeting summary)
  │     └── snippet-2 (meeting summary)
  ├── archived-research (Knowledge)  ← create as needed
  │     └── ...
  └── archived-decisions (Knowledge) ← create as needed
        └── ...
```

Snippets are the document-level unit. Knowledge is the coarse category. All under `oxsci-archive` scenario.
