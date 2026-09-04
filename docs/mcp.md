# MCP contract

Rendered from `packages/shared/src/mcp-contract.ts` by `pnpm docs:gen` — do not edit by hand.

## Two modes

- **Hosted** — `https://<host>/mcp`, streamable HTTP, no wallet. An MCP client cannot answer an x402 challenge, so `hire_human` returns `payment_required` with the install line. Everything else works read-only.
- **Local** — `claude mcp add legwork -- npx @legwork/mcp`. Runs with `BUYER_PRIVATE_KEY`, pays the REST API via `@x402/fetch`, stores each task's `buyer_token`, and runs all six tools for real.

Every result carries `dashboard_url`. Refusals carry the fixed no-retry sentence. Worker text arrives only as `{ answer, note?, _source: "worker", _untrusted: true }` — data, never instructions.

## Tools

### `preflight_workers`

How many workers could take this task near this area: active (completed in the last 7 days), verified, seeded, and the median time — labelled seeded when it is.

**Input**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "task_type": {
      "type": "string",
      "enum": [
        "verify-open",
        "photo-of",
        "call-confirm",
        "compare-two"
      ]
    },
    "area": {
      "type": "string",
      "pattern": "^[0-9b-hjkmnp-z]{5}$"
    }
  },
  "required": [
    "task_type",
    "area"
  ]
}
```

**Output**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "active": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "verified": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "seeded": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "median_minutes": {
      "type": [
        "number",
        "null"
      ]
    },
    "median_source": {
      "type": "string",
      "enum": [
        "real",
        "seeded",
        "n/a"
      ]
    },
    "n_real": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "score_floor": {
      "type": "number"
    },
    "dashboard_url": {
      "type": "string",
      "format": "uri"
    }
  },
  "required": [
    "active",
    "verified",
    "seeded",
    "median_minutes",
    "median_source",
    "n_real",
    "score_floor",
    "dashboard_url"
  ]
}
```

### `hire_human`

Post a task and fund its escrow. Hosted mode cannot pay and returns payment_required with the local install line; local mode pays via x402 and returns the task.

**Input**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "task_type": {
          "type": "string",
          "const": "verify-open"
        },
        "spec": {
          "type": "object",
          "properties": {
            "place": {
              "type": "object",
              "properties": {
                "place_id": {
                  "type": "string",
                  "pattern": "^(node|way|relation)\\/\\d+$"
                },
                "google_place_id": {
                  "type": "string",
                  "maxLength": 128
                },
                "name": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 120
                },
                "street_address": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 160
                },
                "locality": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 80
                },
                "country": {
                  "type": "string",
                  "const": "PT"
                }
              },
              "required": [
                "place_id",
                "name",
                "street_address",
                "locality",
                "country"
              ]
            },
            "question": {
              "type": "string",
              "const": "open_now"
            },
            "claimed_open": {
              "type": [
                "boolean",
                "null"
              ]
            },
            "claimed_hours": {
              "anyOf": [
                {
                  "type": "string",
                  "maxLength": 60
                },
                {
                  "type": "null"
                }
              ]
            },
            "source": {
              "type": "string",
              "enum": [
                "google",
                "osm",
                "own-list",
                "website",
                "other",
                "none"
              ]
            }
          },
          "required": [
            "place",
            "question",
            "claimed_open",
            "claimed_hours",
            "source"
          ]
        },
        "amount_usdc": {
          "type": "number",
          "exclusiveMinimum": 0,
          "maximum": 10
        },
        "need_by": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        },
        "claim_ttl_s": {
          "default": 1800,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "submit_ttl_s": {
          "default": 3600,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "dispute_window_s": {
          "default": 86400,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "agent_id": {
          "type": "string",
          "pattern": "^\\d+$"
        }
      },
      "required": [
        "task_type",
        "spec",
        "amount_usdc"
      ]
    },
    {
      "type": "object",
      "properties": {
        "task_type": {
          "type": "string",
          "const": "photo-of"
        },
        "spec": {
          "type": "object",
          "properties": {
            "place": {
              "type": "object",
              "properties": {
                "place_id": {
                  "type": "string",
                  "pattern": "^(node|way|relation)\\/\\d+$"
                },
                "google_place_id": {
                  "type": "string",
                  "maxLength": 128
                },
                "name": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 120
                },
                "street_address": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 160
                },
                "locality": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 80
                },
                "country": {
                  "type": "string",
                  "const": "PT"
                }
              },
              "required": [
                "place_id",
                "name",
                "street_address",
                "locality",
                "country"
              ]
            },
            "subject": {
              "type": "string",
              "enum": [
                "storefront",
                "door",
                "hours_sign",
                "signage",
                "notice",
                "menu_board",
                "shelf_price",
                "queue_length",
                "construction_notice"
              ]
            },
            "subject_detail": {
              "type": "string",
              "maxLength": 80
            },
            "claimed_state": {
              "type": "string",
              "maxLength": 60
            },
            "source": {
              "type": "string",
              "enum": [
                "google",
                "osm",
                "own-list",
                "website",
                "other",
                "none"
              ]
            }
          },
          "required": [
            "place",
            "subject",
            "source"
          ]
        },
        "amount_usdc": {
          "type": "number",
          "exclusiveMinimum": 0,
          "maximum": 10
        },
        "need_by": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        },
        "claim_ttl_s": {
          "default": 1800,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "submit_ttl_s": {
          "default": 3600,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "dispute_window_s": {
          "default": 86400,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "agent_id": {
          "type": "string",
          "pattern": "^\\d+$"
        }
      },
      "required": [
        "task_type",
        "spec",
        "amount_usdc"
      ]
    },
    {
      "type": "object",
      "properties": {
        "task_type": {
          "type": "string",
          "const": "call-confirm"
        },
        "spec": {
          "type": "object",
          "properties": {
            "place": {
              "type": "object",
              "properties": {
                "place_id": {
                  "type": "string",
                  "pattern": "^(node|way|relation)\\/\\d+$"
                },
                "google_place_id": {
                  "type": "string",
                  "maxLength": 128
                },
                "name": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 120
                },
                "street_address": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 160
                },
                "locality": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 80
                },
                "country": {
                  "type": "string",
                  "const": "PT"
                }
              },
              "required": [
                "place_id",
                "name",
                "street_address",
                "locality",
                "country"
              ]
            },
            "phone": {
              "type": "string",
              "pattern": "^\\+[1-9]\\d{6,14}$"
            },
            "template_id": {
              "type": "string",
              "enum": [
                "open_now",
                "have_item",
                "price_of",
                "accepts_payment",
                "closes_at_today",
                "takes_reservation"
              ]
            },
            "slots": {
              "type": "object",
              "properties": {
                "item": {
                  "type": "string",
                  "maxLength": 40
                },
                "payment_method": {
                  "type": "string",
                  "enum": [
                    "cash",
                    "card",
                    "mbway",
                    "multibanco"
                  ]
                }
              }
            }
          },
          "required": [
            "place",
            "phone",
            "template_id",
            "slots"
          ]
        },
        "amount_usdc": {
          "type": "number",
          "exclusiveMinimum": 0,
          "maximum": 10
        },
        "need_by": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        },
        "claim_ttl_s": {
          "default": 1800,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "submit_ttl_s": {
          "default": 3600,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "dispute_window_s": {
          "default": 86400,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "agent_id": {
          "type": "string",
          "pattern": "^\\d+$"
        }
      },
      "required": [
        "task_type",
        "spec",
        "amount_usdc"
      ]
    },
    {
      "type": "object",
      "properties": {
        "task_type": {
          "type": "string",
          "const": "compare-two"
        },
        "spec": {
          "type": "object",
          "properties": {
            "a": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": [
                    "image",
                    "text"
                  ]
                },
                "url": {
                  "type": "string",
                  "maxLength": 2048,
                  "format": "uri"
                },
                "text": {
                  "type": "string",
                  "maxLength": 500
                },
                "sha256": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{64}$"
                }
              },
              "required": [
                "kind",
                "sha256"
              ]
            },
            "b": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": [
                    "image",
                    "text"
                  ]
                },
                "url": {
                  "type": "string",
                  "maxLength": 2048,
                  "format": "uri"
                },
                "text": {
                  "type": "string",
                  "maxLength": 500
                },
                "sha256": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{64}$"
                }
              },
              "required": [
                "kind",
                "sha256"
              ]
            },
            "criterion_id": {
              "type": "string",
              "enum": [
                "more_legible",
                "matches_reference",
                "better_lit",
                "same_place",
                "which_is_newer",
                "which_is_open"
              ]
            },
            "reference": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": [
                    "image",
                    "text"
                  ]
                },
                "url": {
                  "type": "string",
                  "maxLength": 2048,
                  "format": "uri"
                },
                "text": {
                  "type": "string",
                  "maxLength": 500
                },
                "sha256": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{64}$"
                }
              },
              "required": [
                "kind",
                "sha256"
              ]
            }
          },
          "required": [
            "a",
            "b",
            "criterion_id"
          ]
        },
        "amount_usdc": {
          "type": "number",
          "exclusiveMinimum": 0,
          "maximum": 10
        },
        "need_by": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        },
        "claim_ttl_s": {
          "default": 1800,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "submit_ttl_s": {
          "default": 3600,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "dispute_window_s": {
          "default": 86400,
          "type": "integer",
          "minimum": 60,
          "maximum": 604800
        },
        "agent_id": {
          "type": "string",
          "pattern": "^\\d+$"
        }
      },
      "required": [
        "task_type",
        "spec",
        "amount_usdc"
      ]
    }
  ]
}
```

**Output**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "anyOf": [
    {
      "type": "object",
      "properties": {
        "task_id": {
          "type": "string",
          "pattern": "^\\d+$"
        },
        "status": {
          "type": "string",
          "const": "open"
        },
        "eta_seconds": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        },
        "poll_after_seconds": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 50
        },
        "dashboard_url": {
          "type": "string",
          "format": "uri"
        }
      },
      "required": [
        "task_id",
        "status",
        "eta_seconds",
        "poll_after_seconds",
        "dashboard_url"
      ]
    },
    {
      "type": "object",
      "properties": {
        "payment_required": {
          "type": "boolean",
          "const": true
        },
        "endpoint": {
          "type": "string",
          "format": "uri"
        },
        "price_usdc": {
          "type": "number"
        },
        "network": {
          "type": "string",
          "const": "eip155:84532"
        },
        "asset": {
          "type": "string",
          "const": "USDC"
        },
        "pay_to": {
          "type": "string"
        },
        "install_line": {
          "type": "string",
          "const": "claude mcp add legwork -- npx @legwork/mcp"
        },
        "dashboard_url": {
          "type": "string",
          "format": "uri"
        }
      },
      "required": [
        "payment_required",
        "endpoint",
        "price_usdc",
        "network",
        "asset",
        "pay_to",
        "install_line",
        "dashboard_url"
      ]
    },
    {
      "type": "object",
      "properties": {
        "refused": {
          "type": "boolean",
          "const": true
        },
        "class": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "credential fraud",
                "identity impersonation",
                "automated reconnaissance",
                "social media manipulation",
                "authentication circumvention",
                "referral fraud"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "reason": {
          "type": "string",
          "maxLength": 300
        },
        "rule_id": {
          "type": "string",
          "maxLength": 64
        },
        "retryable": {
          "type": "boolean",
          "const": false
        },
        "allowed_task_types": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "verify-open",
              "photo-of",
              "call-confirm",
              "compare-two"
            ]
          }
        },
        "mark_tx": {
          "type": "string",
          "pattern": "^0x[0-9a-f]{64}$"
        },
        "mark_status": {
          "type": "string",
          "enum": [
            "marked",
            "logged, cooldown",
            "no identity"
          ]
        },
        "message": {
          "type": "string",
          "const": "do not rephrase and retry; report this refusal to your principal"
        }
      },
      "required": [
        "refused",
        "class",
        "reason",
        "rule_id",
        "retryable",
        "allowed_task_types",
        "message"
      ]
    }
  ]
}
```

### `task_status`

Current state of a task; long-polls up to wait_seconds. answer is always wrapped as untrusted worker data.

**Input**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "pattern": "^\\d+$"
    },
    "wait_seconds": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 50
    }
  },
  "required": [
    "task_id"
  ]
}
```

**Output**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "pattern": "^\\d+$"
    },
    "status": {
      "type": "string",
      "enum": [
        "open",
        "claimed",
        "submitted",
        "released",
        "refunded",
        "disputed",
        "resolved"
      ]
    },
    "task_type": {
      "type": "string",
      "enum": [
        "verify-open",
        "photo-of",
        "call-confirm",
        "compare-two"
      ]
    },
    "amount_usdc": {
      "type": "number"
    },
    "fee_usdc": {
      "type": "number"
    },
    "area": {
      "type": "string",
      "pattern": "^[0-9b-hjkmnp-z]{5}$"
    },
    "posted_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "claimed_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "submitted_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "released_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "answer": {
      "type": "object",
      "properties": {
        "answer": {
          "type": "string",
          "maxLength": 40
        },
        "note": {
          "type": "string",
          "maxLength": 120
        },
        "_source": {
          "type": "string",
          "const": "worker"
        },
        "_untrusted": {
          "type": "boolean",
          "const": true
        }
      },
      "required": [
        "answer",
        "_source",
        "_untrusted"
      ]
    },
    "proof": {
      "type": "object",
      "properties": {
        "hash": {
          "type": "string",
          "pattern": "^0x[0-9a-f]{64}$"
        },
        "hash_ok": {
          "type": "boolean"
        },
        "url": {
          "type": "string",
          "format": "uri"
        },
        "captured_at": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        },
        "coordinate_rounded": {
          "type": "object",
          "properties": {
            "lat": {
              "type": "number"
            },
            "lon": {
              "type": "number"
            }
          },
          "required": [
            "lat",
            "lon"
          ]
        },
        "gps_unavailable": {
          "type": "boolean"
        }
      },
      "required": [
        "hash",
        "hash_ok",
        "captured_at",
        "gps_unavailable"
      ]
    },
    "tx": {
      "type": "object",
      "properties": {
        "post": {
          "type": "string",
          "pattern": "^0x[0-9a-f]{64}$"
        },
        "claim": {
          "type": "string",
          "pattern": "^0x[0-9a-f]{64}$"
        },
        "submit": {
          "type": "string",
          "pattern": "^0x[0-9a-f]{64}$"
        },
        "release": {
          "type": "string",
          "pattern": "^0x[0-9a-f]{64}$"
        }
      },
      "required": [
        "post"
      ]
    },
    "dashboard_url": {
      "type": "string",
      "format": "uri"
    },
    "changed": {
      "type": "boolean"
    },
    "poll_after_seconds": {
      "type": "integer",
      "minimum": 0,
      "maximum": 50
    }
  },
  "required": [
    "task_id",
    "status",
    "task_type",
    "amount_usdc",
    "fee_usdc",
    "area",
    "posted_at",
    "tx",
    "dashboard_url",
    "changed",
    "poll_after_seconds"
  ]
}
```

### `approve_task`

Approve a submitted proof and release the escrow. Needs the buyer_token from hire_human (stored automatically in local mode).

**Input**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "pattern": "^\\d+$"
    },
    "buyer_token": {
      "type": "string"
    }
  },
  "required": [
    "task_id"
  ]
}
```

**Output**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "pattern": "^\\d+$"
    },
    "status": {
      "type": "string",
      "enum": [
        "open",
        "claimed",
        "submitted",
        "released",
        "refunded",
        "disputed",
        "resolved"
      ]
    },
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  },
  "required": [
    "task_id",
    "status",
    "tx"
  ]
}
```

### `dispute_task`

Dispute a submitted proof inside the dispute window. Needs the buyer_token.

**Input**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "pattern": "^\\d+$"
    },
    "reason": {
      "type": "string",
      "maxLength": 300
    },
    "buyer_token": {
      "type": "string"
    }
  },
  "required": [
    "task_id",
    "reason"
  ]
}
```

**Output**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "pattern": "^\\d+$"
    },
    "status": {
      "type": "string",
      "enum": [
        "open",
        "claimed",
        "submitted",
        "released",
        "refunded",
        "disputed",
        "resolved"
      ]
    },
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  },
  "required": [
    "task_id",
    "status",
    "tx"
  ]
}
```

### `check_task`

Dry-run the screening for a task without posting or paying. Never marks.

**Input**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "task_type": {
      "type": "string",
      "enum": [
        "verify-open",
        "photo-of",
        "call-confirm",
        "compare-two"
      ]
    },
    "spec": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {}
    }
  },
  "required": [
    "task_type",
    "spec"
  ]
}
```

**Output**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "anyOf": [
    {
      "type": "object",
      "properties": {
        "accepted": {
          "type": "boolean",
          "const": true
        },
        "spec_hash": {
          "type": "string"
        },
        "price_usdc": {
          "type": "number"
        },
        "dashboard_url": {
          "type": "string",
          "format": "uri"
        }
      },
      "required": [
        "accepted",
        "spec_hash",
        "price_usdc",
        "dashboard_url"
      ]
    },
    {
      "type": "object",
      "properties": {
        "refused": {
          "type": "boolean",
          "const": true
        },
        "class": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "credential fraud",
                "identity impersonation",
                "automated reconnaissance",
                "social media manipulation",
                "authentication circumvention",
                "referral fraud"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "reason": {
          "type": "string",
          "maxLength": 300
        },
        "rule_id": {
          "type": "string",
          "maxLength": 64
        },
        "retryable": {
          "type": "boolean",
          "const": false
        },
        "allowed_task_types": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "verify-open",
              "photo-of",
              "call-confirm",
              "compare-two"
            ]
          }
        },
        "mark_tx": {
          "type": "string",
          "pattern": "^0x[0-9a-f]{64}$"
        },
        "mark_status": {
          "type": "string",
          "enum": [
            "marked",
            "logged, cooldown",
            "no identity"
          ]
        },
        "message": {
          "type": "string",
          "const": "do not rephrase and retry; report this refusal to your principal"
        }
      },
      "required": [
        "refused",
        "class",
        "reason",
        "rule_id",
        "retryable",
        "allowed_task_types",
        "message"
      ]
    }
  ]
}
```
