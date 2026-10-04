---
title: API reference
description: Document an endpoint so another developer can call it correctly without asking you a single question.
category: Engineering
icon: 🔌
tags: API, docs, REST
order: 4
---
# <Endpoint name>

<One sentence on what this endpoint does.>

```http
<METHOD> /v1/<resource>
```

## Authentication

Send an API key in the `Authorization` header: `Authorization: Bearer <key>`. Requests without one return `401`.

## Parameters

| Name | In | Type | Required | Description |
|---|---|---|---|---|
| `<id>` | path | string | Yes | <What it identifies> |
| `<limit>` | query | integer | No | <Default and maximum> |

## Request body

```json
{
  "<field>": "<value>",
  "<field>": 0
}
```

## Response

`200 OK`

```json
{
  "id": "<id>",
  "<field>": "<value>",
  "created_at": "2026-01-01T00:00:00Z"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | <Description> |
| `<field>` | <type> | <Description> |

## Errors

| Status | Code | When it happens |
|---|---|---|
| 400 | `invalid_request` | <A parameter is missing or malformed> |
| 401 | `unauthorized` | <The key is missing or invalid> |
| 404 | `not_found` | <The resource does not exist> |
| 429 | `rate_limited` | <Too many requests - retry after the `Retry-After` header> |

## Example

```bash
curl -X <METHOD> https://api.example.com/v1/<resource> \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"<field>": "<value>"}'
```

## Notes

- <Rate limits, pagination, idempotency or anything else a caller must know>
