# API contract

Rendered from `packages/shared/src/api-contract.ts` by `pnpm docs:gen` — do not edit by hand.

Auth classes: `public` · `x402` (`PAYMENT-SIGNATURE`) · `buyer-token` (`X-Buyer-Token`) · `worker-session` (cookie) · `idkit-session` (cookie) · `admin-key` (`X-Admin-Key`) · `signed-header` (`X-Buyer-Signature` + `X-Buyer-Timestamp`, direct mode only).

Money on public surfaces: `price_usdc` is the worker rate (3.00) with `fee_usdc` (0.45) alongside; the agent's total (3.45) appears only on buyer-authenticated responses.

## Routes

| Method | Path | Auth | Summary | Responses |
|---|---|---|---|---|
| POST | `/tasks` | x402 | Post a task; x402 PAYMENT-SIGNATURE header; price = amount × 1.15 | 201, 400, 402, 422, 429 |
| GET | `/tasks/:id` | public | Task status; long-poll with ?wait ≤ 50; X-Buyer-Token reveals proof.url; ETag supported | 200, 404 |
| POST | `/tasks/:id/approve` | buyer-token | Approve a submitted proof; relayer executes onchain | 200, 409 |
| POST | `/tasks/:id/dispute` | buyer-token | Dispute inside the window | 200, 409 |
| POST | `/tasks/:id/refund` | buyer-token | Expire and refund if eligible | 200, 409 |
| POST | `/check` | public | Dry-run screening; never posts, never marks | 200, 400, 422 |
| POST | `/idkit/request` | public | RP-signed rp_context for IDKit v4 | 200 |
| POST | `/idkit/verify` | public | Forward the IDKit result to World v4 verify; sets idkit-session cookie | 200, 409 |
| GET | `/session/nonce` | public | SIWE nonce | 200 |
| POST | `/session` | public | walletAuth (verifySiweMessage over a single-use nonce + the stored nullifier binding; no cookie needed) or idkit mode (requires the idkit-session cookie) → worker-session cookie + the same JWT as `token`; isWorker checked onchain in both modes; dev path for seeded workers only | 200, 401, 403 |
| POST | `/register` | idkit-session | EIP-712 attestation (deadline now+600) then relayed registerFor | 200, 409, 500 |
| GET | `/tasks` | worker-session | Open + lazily-expirable tasks near the worker | 200 |
| POST | `/tasks/:id/claim` | worker-session | Relayed claimFor | 200, 409 |
| POST | `/tasks/:id/release-claim` | worker-session | Relayed releaseClaimFor | 200, 409 |
| POST | `/proofs` | worker-session | multipart ≤ 8 MB; keccak of raw bytes; EXIF stripped; private bucket | 200, 413 |
| POST | `/tasks/:id/submit` | worker-session | Submit-time checks (reuse, geofence, GPS downgrade) then relayed submitFor | 200, 409 |
| POST | `/tasks/:id/report` | worker-session | Worker reports a task (optional feature) | 200 |
| GET | `/me/earnings` | worker-session | Earned-only: sums TaskReleased to this worker | 200 |
| GET | `/tasks/:id/spec` | worker-session | Spec fields, claimant only — the one route that shows spec to a human | 200, 403 |
| GET | `/public/feed` | public | Last 20; never spec text, coordinate, buyer token or payer | 200 |
| GET | `/public/task/:id` | public | TaskView minus proof.url, plus seeded + coordinate_rounded | 200 |
| GET | `/public/refusals` | public | Counts by class + recent; never payer or agent_id | 200 |
| GET | `/public/posters` | public | External demand | 200 |
| GET | `/public/preflight` | public | The MCP preflight_workers shape | 200 |
| GET | `/public/proofs/:hash/verify` | public | Re-hash check | 200 |
| GET | `/public/observations` | public | Optional (T-40) | 200 |
| POST | `/admin/pause` | admin-key | Pause post/claim | 200 |
| POST | `/admin/unpause` | admin-key | Unpause | 200 |
| POST | `/admin/resolve` | admin-key | Resolve a dispute | 200 |
| POST | `/admin/reset-demo` | admin-key | Reset demo state; body must confirm | 200 |
| POST | `/admin/reset-worker` | admin-key | resetWorker(nullifier) | 200 |
| POST | `/admin/sweep` | admin-key | Expire + autoRelease pass (GitHub Actions cron every 5 min) | 200 |
| POST | `/admin/seed-demo` | admin-key | Seed demo rows | 200 |
| GET | `/openapi.json` | public | OpenAPI 3.1 rendered from this contract (T-35) | 200 |
| GET | `/healthz` | public | Liveness plus the four facts an operator asks first; never an address derived from a key | 200 |
| POST | `/tasks` | signed-header | Direct mode: X-Buyer-Signature (EIP-191 over `${spec_hash}:${timestamp}`) + X-Buyer-Timestamp (±300 s) → quote | 202 |
| POST | `/tasks/:id/confirm` | signed-header | Direct mode: after TaskPosted with that spec_hash is observed | 200 |

## Shapes

### `postTasks` — POST `/tasks`

**Request**

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

**201**

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
      "type": "string",
      "minLength": 32
    },
    "status": {
      "type": "string",
      "const": "open"
    },
    "spec_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "price_usdc": {
      "type": "number"
    },
    "eta_seconds": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "poll_after_seconds": {
      "type": "integer",
      "minimum": 0,
      "maximum": 50
    },
    "dashboard_url": {
      "type": "string",
      "format": "uri"
    }
  },
  "required": [
    "task_id",
    "buyer_token",
    "status",
    "spec_hash",
    "price_usdc",
    "eta_seconds",
    "poll_after_seconds",
    "dashboard_url"
  ]
}
```

**400**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "error": {
      "type": "string",
      "const": "invalid_request"
    },
    "field": {
      "type": "string",
      "maxLength": 120
    },
    "reason": {
      "type": "string",
      "maxLength": 300
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
    "suggested_task_type": {
      "type": "string",
      "enum": [
        "verify-open",
        "photo-of",
        "call-confirm",
        "compare-two"
      ]
    }
  },
  "required": [
    "error",
    "field",
    "reason"
  ]
}
```

**402**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "error": {
      "type": "string",
      "const": "payment_required"
    },
    "price_usdc": {
      "type": "number"
    },
    "accepts": {
      "type": "array",
      "items": {
        "type": "object",
        "propertyNames": {
          "type": "string"
        },
        "additionalProperties": {}
      }
    },
    "remaining_budget": {
      "type": "object",
      "properties": {
        "open_tasks": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        },
        "daily_usdc": {
          "type": "number"
        }
      },
      "required": [
        "open_tasks",
        "daily_usdc"
      ]
    }
  },
  "required": [
    "error",
    "price_usdc",
    "accepts",
    "remaining_budget"
  ]
}
```

**422**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
```

**429**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "error": {
      "type": "string",
      "const": "cap_exceeded"
    },
    "open_tasks": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "daily_usdc": {
      "type": "number"
    }
  },
  "required": [
    "error",
    "open_tasks",
    "daily_usdc"
  ]
}
```


### `getTask` — GET `/tasks/:id`

**Query**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "wait": {
      "default": 0,
      "type": "integer",
      "minimum": 0,
      "maximum": 50
    }
  }
}
```

**200**

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

**404**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `approve` — POST `/tasks/:id/approve`

**200**

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

**409**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `dispute` — POST `/tasks/:id/dispute`

**Request**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reason": {
      "type": "string",
      "maxLength": 300
    }
  },
  "required": [
    "reason"
  ]
}
```

**200**

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

**409**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `refund` — POST `/tasks/:id/refund`

**200**

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

**409**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `check` — POST `/check`

**Request**

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

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "accepted": {
      "type": "boolean",
      "const": true
    },
    "spec_hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "price_usdc": {
      "type": "number"
    }
  },
  "required": [
    "accepted",
    "spec_hash",
    "price_usdc"
  ]
}
```

**400**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "error": {
      "type": "string",
      "const": "invalid_request"
    },
    "field": {
      "type": "string",
      "maxLength": 120
    },
    "reason": {
      "type": "string",
      "maxLength": 300
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
    "suggested_task_type": {
      "type": "string",
      "enum": [
        "verify-open",
        "photo-of",
        "call-confirm",
        "compare-two"
      ]
    }
  },
  "required": [
    "error",
    "field",
    "reason"
  ]
}
```

**422**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
```


### `idkitRequest` — POST `/idkit/request`

**Request**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "action": {
      "type": "string"
    }
  },
  "required": [
    "action"
  ]
}
```

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "rp_context": {
      "type": "object",
      "properties": {
        "rp_id": {
          "type": "string"
        },
        "nonce": {
          "type": "string"
        },
        "created_at": {
          "type": "number"
        },
        "expires_at": {
          "type": "number"
        },
        "signature": {
          "type": "string"
        }
      },
      "required": [
        "rp_id",
        "nonce",
        "created_at",
        "expires_at",
        "signature"
      ]
    }
  },
  "required": [
    "rp_context"
  ]
}
```


### `idkitVerify` — POST `/idkit/verify`

**Request**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "propertyNames": {
    "type": "string"
  },
  "additionalProperties": {}
}
```

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "verified": {
      "type": "boolean",
      "const": true
    },
    "nullifier": {
      "type": "string"
    },
    "level": {
      "type": "string"
    }
  },
  "required": [
    "verified",
    "nullifier",
    "level"
  ]
}
```

**409**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `sessionNonce` — GET `/session/nonce`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "nonce": {
      "type": "string"
    }
  },
  "required": [
    "nonce"
  ]
}
```


### `session` — POST `/session`

**Request**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "mode": {
          "type": "string",
          "const": "walletAuth"
        },
        "payload": {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {}
        },
        "nonce": {
          "type": "string"
        }
      },
      "required": [
        "mode",
        "payload",
        "nonce"
      ]
    },
    {
      "type": "object",
      "properties": {
        "mode": {
          "type": "string",
          "const": "idkit"
        },
        "worker_address": {
          "type": "string",
          "pattern": "^0x[0-9a-fA-F]{40}$"
        }
      },
      "required": [
        "mode",
        "worker_address"
      ]
    }
  ]
}
```

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "worker": {
      "type": "string",
      "pattern": "^0x[0-9a-fA-F]{40}$"
    },
    "nullifier": {
      "type": "string"
    },
    "mode": {
      "type": "string",
      "enum": [
        "walletAuth",
        "idkit",
        "dev"
      ]
    },
    "token": {
      "type": "string"
    }
  },
  "required": [
    "worker",
    "nullifier",
    "mode",
    "token"
  ]
}
```

**401**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```

**403**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `register` — POST `/register`

**Request**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "worker_address": {
      "type": "string",
      "pattern": "^0x[0-9a-fA-F]{40}$"
    },
    "area": {
      "type": "string",
      "pattern": "^[0-9b-hjkmnp-z]{5}$"
    },
    "task_types": {
      "minItems": 1,
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
    }
  },
  "required": [
    "worker_address",
    "area",
    "task_types"
  ]
}
```

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "worker": {
      "type": "string",
      "pattern": "^0x[0-9a-fA-F]{40}$"
    }
  },
  "required": [
    "tx",
    "worker"
  ]
}
```

**409**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```

**500**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `listTasks` — GET `/tasks`

**Query**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "area": {
      "type": "string",
      "pattern": "^[0-9b-hjkmnp-z]{5}$"
    },
    "lat": {
      "type": "number"
    },
    "lon": {
      "type": "number"
    }
  },
  "required": [
    "area"
  ]
}
```

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "tasks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "task_id": {
            "type": "string",
            "pattern": "^\\d+$"
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
          "title": {
            "type": "string"
          },
          "price_usdc": {
            "type": "number"
          },
          "distance_m": {
            "type": "number"
          },
          "claim_expires_in_s": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991
          },
          "state": {
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
          "seeded": {
            "type": "boolean"
          }
        },
        "required": [
          "task_id",
          "task_type",
          "title",
          "price_usdc",
          "state",
          "seeded"
        ]
      }
    }
  },
  "required": [
    "tasks"
  ]
}
```


### `claim` — POST `/tasks/:id/claim`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "claim_expires_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "submit_deadline": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "tx",
    "claim_expires_at",
    "submit_deadline"
  ]
}
```

**409**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `releaseClaim` — POST `/tasks/:id/release-claim`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  },
  "required": [
    "tx"
  ]
}
```

**409**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `proofs` — POST `/proofs`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "proofHash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "url": {
      "type": "string",
      "format": "uri"
    },
    "captured_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "proofHash",
    "url",
    "captured_at"
  ]
}
```

**413**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `submit` — POST `/tasks/:id/submit`

**Request**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "proofHash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "answer": {
      "type": "string",
      "maxLength": 40
    },
    "note": {
      "type": "string",
      "maxLength": 120
    }
  },
  "required": [
    "answer"
  ],
  "additionalProperties": {}
}
```

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "status": {
      "type": "string",
      "enum": [
        "submitted",
        "disputed"
      ]
    },
    "auto_dispute_reason": {
      "type": "string"
    }
  },
  "required": [
    "tx",
    "status"
  ]
}
```

**409**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `report` — POST `/tasks/:id/report`

**Request**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "class": {
      "type": "string",
      "enum": [
        "credential fraud",
        "identity impersonation",
        "automated reconnaissance",
        "social media manipulation",
        "authentication circumvention",
        "referral fraud"
      ]
    }
  },
  "required": [
    "class"
  ]
}
```

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "recorded": {
      "type": "boolean",
      "const": true
    }
  },
  "required": [
    "recorded"
  ]
}
```


### `earnings` — GET `/me/earnings`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "released_usdc": {
      "type": "number"
    },
    "completed": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "score": {
      "type": "number"
    },
    "distinct_raters": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "released_usdc",
    "completed",
    "score",
    "distinct_raters"
  ]
}
```


### `taskSpec` — GET `/tasks/:id/spec`

**200**

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

**403**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "rate_limited"
        },
        "retry_after_s": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "retry_after_s"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "payload_too_large"
        },
        "max_bytes": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "error",
        "max_bytes"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "origin_not_allowed"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "unauthorized"
        },
        "reason": {
          "type": "string",
          "enum": [
            "nonce_used"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "forbidden"
        },
        "reason": {
          "type": "string",
          "enum": [
            "not_registered"
          ]
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "not_found"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "enum": [
            "bad_state",
            "not_eligible",
            "dispute_window_closed",
            "chain_revert",
            "worker_already_bound",
            "nullifier_already_registered",
            "InCooldown",
            "AlreadyClaimed",
            "SeededCannotClaimExternal"
          ]
        },
        "detail": {
          "type": "string"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "attestation_rejected"
        }
      },
      "required": [
        "error"
      ]
    },
    {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "const": "chain_unavailable"
        }
      },
      "required": [
        "error"
      ]
    }
  ]
}
```


### `publicFeed` — GET `/public/feed`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "tasks": {
      "type": "array",
      "items": {
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
          "title": {
            "type": "string"
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
          "seeded": {
            "type": "boolean"
          },
          "spec_hash": {
            "type": "string",
            "pattern": "^0x[0-9a-f]{64}$"
          },
          "buyer_agent_id": {
            "type": "string"
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
          "seeded",
          "spec_hash",
          "tx"
        ]
      }
    }
  },
  "required": [
    "tasks"
  ]
}
```


### `publicTask` — GET `/public/task/:id`

**200**

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
    },
    "seeded": {
      "type": "boolean"
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
    "poll_after_seconds",
    "seeded"
  ]
}
```


### `publicRefusals` — GET `/public/refusals`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "counts": {
      "type": "object",
      "propertyNames": {
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
      "additionalProperties": {
        "type": "integer",
        "minimum": -9007199254740991,
        "maximum": 9007199254740991
      },
      "required": [
        "credential fraud",
        "identity impersonation",
        "automated reconnaissance",
        "social media manipulation",
        "authentication circumvention",
        "referral fraud"
      ]
    },
    "total": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "recent": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "at": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
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
          "class": {
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
          "reason": {
            "type": "string"
          },
          "rule_id": {
            "type": "string"
          },
          "spec_hash": {
            "type": "string",
            "pattern": "^0x[0-9a-f]{64}$"
          },
          "marked": {
            "type": "boolean"
          },
          "mark_tx": {
            "type": "string",
            "pattern": "^0x[0-9a-f]{64}$"
          },
          "mark_status": {
            "type": "string"
          }
        },
        "required": [
          "at",
          "task_type",
          "class",
          "reason",
          "rule_id",
          "spec_hash",
          "marked"
        ]
      }
    }
  },
  "required": [
    "counts",
    "total",
    "recent"
  ]
}
```


### `publicPosters` — GET `/public/posters`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "distinct_external_buyers": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "external_tasks": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "distinct_external_buyers",
    "external_tasks"
  ]
}
```


### `publicPreflight` — GET `/public/preflight`

**Query**

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

**200**

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


### `publicProofVerify` — GET `/public/proofs/:hash/verify`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "hash": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    },
    "hash_ok": {
      "type": "boolean"
    },
    "captured_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "hash",
    "hash_ok",
    "captured_at"
  ]
}
```


### `publicObservations` — GET `/public/observations`

**Query**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "place_id": {
      "type": "string"
    }
  },
  "required": [
    "place_id"
  ]
}
```

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "observations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "observation_id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64
          },
          "place_key": {
            "type": "string",
            "pattern": "^(node|way|relation)\\/\\d+$"
          },
          "claim": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "open_now",
                  "hours",
                  "item_in_stock",
                  "price",
                  "payment",
                  "reservation",
                  "photo"
                ]
              },
              "value": {
                "type": "string",
                "maxLength": 120
              }
            },
            "required": [
              "type",
              "value"
            ]
          },
          "evidence_hash": {
            "anyOf": [
              {
                "type": "string",
                "pattern": "^0x[0-9a-f]{64}$"
              },
              {
                "type": "null"
              }
            ]
          },
          "observed_at": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
          },
          "confidence": {
            "anyOf": [
              {
                "anyOf": [
                  {
                    "type": "number",
                    "const": 0.9
                  },
                  {
                    "type": "number",
                    "const": 0.6
                  },
                  {
                    "type": "number",
                    "const": 0.5
                  },
                  {
                    "type": "number",
                    "const": 0
                  }
                ]
              },
              {
                "type": "null"
              }
            ]
          },
          "task_id": {
            "type": "string",
            "minLength": 1
          },
          "seeded": {
            "type": "boolean"
          }
        },
        "required": [
          "observation_id",
          "place_key",
          "claim",
          "evidence_hash",
          "observed_at",
          "confidence",
          "task_id",
          "seeded"
        ]
      }
    },
    "delta": {
      "type": "object",
      "properties": {
        "checked": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        },
        "listing_wrong": {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "checked",
        "listing_wrong"
      ]
    }
  },
  "required": [
    "observations"
  ]
}
```


### `adminPause` — POST `/admin/pause`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "ok": {
      "type": "boolean",
      "const": true
    },
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  },
  "required": [
    "ok"
  ]
}
```


### `adminUnpause` — POST `/admin/unpause`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "ok": {
      "type": "boolean",
      "const": true
    },
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  },
  "required": [
    "ok"
  ]
}
```


### `adminResolve` — POST `/admin/resolve`

**Request**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "pattern": "^\\d+$"
    },
    "to_buyer": {
      "type": "boolean"
    }
  },
  "required": [
    "task_id",
    "to_buyer"
  ]
}
```

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "ok": {
      "type": "boolean",
      "const": true
    },
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  },
  "required": [
    "ok"
  ]
}
```


### `adminResetDemo` — POST `/admin/reset-demo`

**Request**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "confirm": {
      "type": "string",
      "const": "reset-demo"
    }
  },
  "required": [
    "confirm"
  ]
}
```

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "ok": {
      "type": "boolean",
      "const": true
    },
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  },
  "required": [
    "ok"
  ]
}
```


### `adminResetWorker` — POST `/admin/reset-worker`

**Request**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "nullifier": {
      "type": "string"
    }
  },
  "required": [
    "nullifier"
  ]
}
```

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "ok": {
      "type": "boolean",
      "const": true
    },
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  },
  "required": [
    "ok"
  ]
}
```


### `adminSweep` — POST `/admin/sweep`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "ok": {
      "type": "boolean",
      "const": true
    },
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  },
  "required": [
    "ok"
  ]
}
```


### `adminSeedDemo` — POST `/admin/seed-demo`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "ok": {
      "type": "boolean",
      "const": true
    },
    "tx": {
      "type": "string",
      "pattern": "^0x[0-9a-f]{64}$"
    }
  },
  "required": [
    "ok"
  ]
}
```


### `openapi` — GET `/openapi.json`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "propertyNames": {
    "type": "string"
  },
  "additionalProperties": {}
}
```


### `healthz` — GET `/healthz`

**200**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "ok": {
      "type": "boolean",
      "const": true
    },
    "db": {
      "type": "string",
      "enum": [
        "ok",
        "error"
      ]
    },
    "chain_id": {
      "type": "number",
      "const": 84532
    },
    "payment_mode": {
      "type": "string",
      "enum": [
        "x402",
        "direct"
      ]
    },
    "data_mode": {
      "type": "string",
      "enum": [
        "live",
        "demo"
      ]
    },
    "version": {
      "type": "string"
    }
  },
  "required": [
    "ok",
    "db",
    "chain_id",
    "payment_mode",
    "data_mode",
    "version"
  ]
}
```


### `directQuote` — POST `/tasks`

**Request**

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

**202**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "quote": {
      "type": "object",
      "properties": {
        "spec_hash": {
          "type": "string",
          "pattern": "^0x[0-9a-f]{64}$"
        },
        "post_params": {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {}
        },
        "total_units": {
          "type": "string"
        },
        "escrow": {
          "type": "string",
          "pattern": "^0x[0-9a-fA-F]{40}$"
        },
        "deadline": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        }
      },
      "required": [
        "spec_hash",
        "post_params",
        "total_units",
        "escrow",
        "deadline"
      ]
    }
  },
  "required": [
    "quote"
  ]
}
```


### `directConfirm` — POST `/tasks/:id/confirm`

**200**

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
    "task_id",
    "buyer_token"
  ]
}
```

