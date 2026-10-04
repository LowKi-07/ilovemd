---
title: AI prompt brief
description: Give a model the role, context, constraints and examples it needs to get the answer right the first time.
category: AI
icon: ✨
tags: prompts, LLM, context
order: 6
---
# <Task name> - prompt brief

> Use this as the full prompt, or paste it as context before your request. Delete any section you do not need.

## Role

You are <a specific expert, e.g. "a senior technical writer for developer tools">.

## Goal

<What you want produced, in one sentence. Name the deliverable, e.g. "a 300-word product announcement".>

## Context

- **Audience:** <who will read or use the output>
- **Background:** <facts the model cannot know - product details, decisions already made>
- **Source material:** <paste or summarise the documents to work from>

## Requirements

1. <Must include ...>
2. <Must follow ...>
3. <Must be no longer than ...>

## Constraints

- Do not <invent facts, figures or quotes>.
- Do not <use a particular tone, term or format>.
- If something is missing, <ask / leave a placeholder / state the assumption>.

## Output format

<Describe the exact shape: headings, a table with named columns, JSON with these keys, or a single paragraph.>

```markdown
# <Title>
## <Section>
<content>
```

## Examples

**Good:** <a short example of the output you want>

**Avoid:** <a short example of what you do not want, and why>

## Quality check

Before answering, check that the output meets every requirement above and contains nothing that was not in the context.
