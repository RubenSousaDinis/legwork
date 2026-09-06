/**
 * The OpenAPI 3.1 document, generated from `api-contract.ts`.
 *
 * It exists for one consumer we do not control: the Bazantic gateway imports an OpenAPI
 * document to expose this REST API to agents that do not speak MCP. Generating it from the
 * same zod the routes validate with is the only way it cannot drift — nothing here hand-types
 * a route, a field or a status code. What *is* written by hand is prose: operation
 * descriptions, the money note, and the `x-legwork` extension.
 *
 * `buildOpenApi` is pure: no clock, no env, no randomness. Two calls with the same options
 * serialise to the same bytes, so a diff in the served document is always a contract change.
 */
import { z } from 'zod';
import {
  API_ROUTES,
  CallConfirmProof,
  CallConfirmSpec,
  CompareTwoProof,
  CompareTwoSpec,
  Envelope,
  HEADERS,
  MAX_TASK_AMOUNT_USDC,
  NO_RETRY_SENTENCE,
  PRICE_FLOOR_USDC,
  Place,
  PhotoOfProof,
  PhotoOfSpec,
  PublicTaskView,
  RefusalPayload,
  TaskId,
  TxHash,
  VerifyOpenProof,
  VerifyOpenSpec,
  WorkerAnswer,
  feeOn,
  fromUsdcUnits,
  priceWithFee,
  toUsdcUnits,
  type Auth,
  type Route,
} from '@legwork/shared';
import { IDKIT_COOKIE, WORKER_COOKIE } from './session';

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };
export interface OpenApiDocument extends JsonObject {
  openapi: string;
  info: JsonObject;
  servers: JsonObject[];
  paths: JsonObject;
  components: JsonObject;
}

export interface BuildOpenApiOptions {
  serverUrl: string;
  includeAdmin?: boolean;
}

/** The document's own version. A constant, because a timestamp would break determinism. */
const DOCUMENT_VERSION = '1.0.0';

/** Which direction a named schema travels, so `.default()` is optional on the way in. */
type Io = 'input' | 'output';

/**
 * The shared schemas that appear once, by name, under `components.schemas`; every route that
 * uses one references it. Specs and proofs are things a caller sends, so they convert as
 * input; the two payloads the API returns convert as output.
 */
const NAMED_SCHEMAS: ReadonlyArray<readonly [string, z.ZodType, Io]> = [
  ['CallConfirmProof', CallConfirmProof, 'input'],
  ['CallConfirmSpec', CallConfirmSpec, 'input'],
  ['CompareTwoProof', CompareTwoProof, 'input'],
  ['CompareTwoSpec', CompareTwoSpec, 'input'],
  ['Envelope', Envelope, 'input'],
  ['PhotoOfProof', PhotoOfProof, 'input'],
  ['PhotoOfSpec', PhotoOfSpec, 'input'],
  ['Place', Place, 'input'],
  // Not in the brief's list, but it is a contract export shared by `/public/task/{id}` and
  // `/public/feed`; without a name it would be hoisted under the first route's generated id.
  ['PublicTaskView', PublicTaskView, 'output'],
  ['RefusalPayload', RefusalPayload, 'output'],
  ['VerifyOpenProof', VerifyOpenProof, 'input'],
  ['VerifyOpenSpec', VerifyOpenSpec, 'input'],
  ['WorkerAnswer', WorkerAnswer, 'output'],
];

/** `:id` and `:hash` carry no schema in the route table; these are the contract's own. */
const PATH_PARAM_SCHEMAS: Record<string, z.ZodType> = { id: TaskId, hash: TxHash };

const SECURITY_SCHEME_BY_AUTH: Record<Auth, string | null> = {
  public: null,
  x402: 'x402',
  'buyer-token': 'buyerToken',
  'worker-session': 'workerSession',
  'idkit-session': 'idkitSession',
  'admin-key': 'adminKey',
  'signed-header': 'buyerSignature',
};

const STATUS_DESCRIPTIONS: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  400: 'Invalid request — a schema or shape error. A 400 never marks the agent.',
  401: 'Unauthorized',
  402: 'Payment required — the x402 requirements are in `accepts`.',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  422: 'Refused — one of the six abuse classes. A refused task moves no money.',
  429: 'Cap exceeded',
  500: 'Internal error',
  503: 'The chain or the relayer did not answer; the call is worth retrying.',
};

/** T-01's promise, repeated on every surface a stranger can read. */
const PUBLIC_PROMISE =
  'A public surface: never raw spec text, never an exact coordinate, never a buyer token, never a requester identity.';

const AGENT_ID_NOTE =
  'a claim; the API verifies it against the ERC-8004 IdentityRegistry and never trusts it from the body';

// ------------------------------------------------------------------ helpers

function pascal(segment: string): string {
  return segment
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/** `POST /tasks/:id/approve` → `postTasksByIdApprove`. */
export function operationIdFor(method: string, path: string): string {
  const tail = path
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith(':') ? `By${pascal(segment.slice(1))}` : pascal(segment)))
    .join('');
  return method.toLowerCase() + tail;
}

/** `/tasks/:id/approve` → `/tasks/{id}/approve`. */
export function templatePath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function pathParamNames(path: string): string[] {
  return path
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1));
}

/** Object keys sorted everywhere; array order is left alone, because it carries meaning. */
function sortKeys<T extends Json>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => sortKeys(item)) as T;
  if (value === null || typeof value !== 'object') return value;
  const out: JsonObject = {};
  for (const key of Object.keys(value as JsonObject).sort()) {
    out[key] = sortKeys((value as JsonObject)[key]!);
  }
  return out as T;
}

/** Ascending, so the document does not depend on the order the contract happens to list them. */
function statusesOf(route: Route): number[] {
  return Object.keys(route.responses).map(Number).sort((a, b) => a - b);
}

function isEmptySchema(schema: JsonObject): boolean {
  return Object.keys(schema).length === 0;
}

/** Sets `description` on every `properties.<name>` this subtree carries, at any depth. */
function describeProperty(node: Json, property: string, description: string): void {
  if (Array.isArray(node)) {
    for (const item of node) describeProperty(item, property, description);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const object = node as JsonObject;
  const properties = object.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    const target = (properties as JsonObject)[property];
    if (target && typeof target === 'object' && !Array.isArray(target)) {
      (target as JsonObject).description = description;
    }
  }
  for (const child of Object.values(object)) describeProperty(child, property, description);
}

// ------------------------------------------------------------ zod → JSON Schema

/**
 * zod 4 emits JSON Schema 2020-12 natively, which is what OpenAPI 3.1 speaks — no converter
 * dependency, and no second definition of the shapes to keep in step.
 *
 * The conversion runs over a *registry*: every schema registered under an id comes back by
 * that id, and any registered schema nested inside another comes back as a `$ref`. That is
 * what makes `Envelope` appear once under `components.schemas` and be referenced everywhere
 * else instead of copied.
 *
 * It runs twice because a registry converts in one direction at a time, and the two
 * directions genuinely differ: `claim_ttl_s` has a default, so it is optional on the way in
 * and always present on the way out. Requests and query strings convert as input, responses
 * as output.
 */
function refUri(id: string): string {
  return `#/components/schemas/${id}`;
}

type SchemaDocuments = Record<string, JsonObject>;

const IO_DIRECTIONS = ['input', 'output'] as const;

/** Every `#/components/schemas/<id>` this subtree points at. */
function referencedIds(node: Json, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) referencedIds(item, into);
    return into;
  }
  if (node === null || typeof node !== 'object') return into;
  const object = node as JsonObject;
  if (typeof object.$ref === 'string' && object.$ref.startsWith('#/components/schemas/')) {
    into.add(object.$ref.slice('#/components/schemas/'.length));
  }
  for (const value of Object.values(object)) referencedIds(value, into);
  return into;
}

class SchemaConverter {
  /** One id per distinct schema object; a named schema keeps its name. */
  private readonly ids = new Map<z.ZodType, string>();
  private readonly named = new Set<string>();
  private readonly documents: Record<Io, SchemaDocuments>;

  constructor(routes: readonly Route[]) {
    const inputRegistry = z.registry<{ id: string }>();
    const outputRegistry = z.registry<{ id: string }>();
    const registries: Record<Io, typeof inputRegistry> = { input: inputRegistry, output: outputRegistry };

    for (const [name, schema, io] of NAMED_SCHEMAS) {
      this.ids.set(schema, name);
      this.named.add(name);
      registries[io].add(schema, { id: name });
    }

    // Anonymous ids are scratch: every one of them is inlined back into its path item, so
    // none of these names reaches the document.
    for (const route of routes) {
      const base = operationIdFor(route.method, route.path);
      if (route.request) this.register(registries, route.request, `${base}Request`, 'input');
      if (route.query) this.register(registries, route.query, `${base}Query`, 'input');
      for (const status of statusesOf(route)) {
        this.register(registries, route.responses[status]!, `${base}Response${status}`, 'output');
      }
    }

    this.documents = {
      input: z.toJSONSchema(inputRegistry, { target: 'draft-2020-12', io: 'input', uri: refUri })
        .schemas as SchemaDocuments,
      output: z.toJSONSchema(outputRegistry, { target: 'draft-2020-12', io: 'output', uri: refUri })
        .schemas as SchemaDocuments,
    };
  }

  private register(
    registries: Record<Io, ReturnType<typeof z.registry<{ id: string }>>>,
    schema: z.ZodType,
    id: string,
    io: Io,
  ): void {
    const existing = this.ids.get(schema);
    const finalId = existing ?? id;
    if (!existing) this.ids.set(schema, finalId);
    if (!registries[io].has(schema)) registries[io].add(schema, { id: finalId });
  }

  /**
   * A primitive converted on its own, outside the registry. `:id` and `:hash` reuse the
   * contract's `TaskId` and `TxHash`, which are also *fields* of half the schemas here —
   * registering them would turn every one of those fields into a `$ref` to a path parameter.
   */
  standalone(schema: z.ZodType, io: Io): JsonObject {
    const converted = z.toJSONSchema(schema, { target: 'draft-2020-12', io }) as JsonObject;
    delete converted.$schema;
    delete converted.$id;
    return converted;
  }

  /** A named schema is referenced; anything else is inlined where it is used. */
  convert(schema: z.ZodType, io: Io): JsonObject {
    const id = this.ids.get(schema);
    if (id === undefined) throw new Error(`schema was not registered before conversion`);
    if (this.named.has(id)) return { $ref: refUri(id) };
    return this.body(id, io);
  }

  /**
   * `components.schemas` — every named schema once under its own name, plus any anonymous one
   * that another schema references.
   *
   * The second group is not decoration. `PublicTaskView` is the body of `/public/task/{id}`
   * *and* an element of `/public/feed`'s array, so the conversion emits a `$ref` to it from
   * inside the feed; if it were only inlined at its own route, that `$ref` would dangle.
   */
  components(): JsonObject {
    const schemas: JsonObject = {};
    for (const [name, , io] of NAMED_SCHEMAS) schemas[name] = this.body(name, io);

    const sources = new Map<string, Io>();
    for (const io of IO_DIRECTIONS) {
      for (const body of Object.values(this.documents[io])) {
        for (const id of referencedIds(body)) {
          if (this.named.has(id)) continue;
          const first = sources.get(id);
          if (first === undefined) sources.set(id, io);
          else if (first !== io && JSON.stringify(this.body(id, first)) !== JSON.stringify(this.body(id, io))) {
            throw new Error(`${id} is referenced as both input and output and the two differ`);
          }
        }
      }
    }
    for (const id of [...sources.keys()].sort()) schemas[id] = this.body(id, sources.get(id)!);

    describeProperty(schemas.Envelope!, 'agent_id', AGENT_ID_NOTE);
    describeProperty(schemas.RefusalPayload!, 'message', `the constant \`${NO_RETRY_SENTENCE}\``);
    return schemas;
  }

  /** A fresh copy, so annotating one site never reaches a schema shared with another. */
  private body(id: string, io: Io): JsonObject {
    const converted = this.documents[io][id];
    if (converted === undefined) throw new Error(`${id} was not converted as ${io}`);
    const copy = structuredClone(converted) as JsonObject;
    delete copy.$schema;
    delete copy.$id;
    return copy;
  }
}

// ------------------------------------------------------------------ the document

function securitySchemes(): JsonObject {
  return {
    x402: {
      type: 'apiKey',
      in: 'header',
      name: HEADERS.paymentSignature,
      description: 'x402 exact-EVM payment authorization; an unpaid call returns 402 with `accepts`',
    },
    buyerToken: {
      type: 'apiKey',
      in: 'header',
      name: HEADERS.buyerToken,
      description: 'The token `POST /tasks` handed back; it is the only thing that reveals a proof URL.',
    },
    adminKey: {
      type: 'apiKey',
      in: 'header',
      name: HEADERS.adminKey,
      description: 'Operator only. The routes behind it are not part of the served document.',
    },
    buyerSignature: {
      type: 'apiKey',
      in: 'header',
      name: HEADERS.buyerSignature,
      description: 'PAYMENT_MODE=direct only: EIP-191 over `${spec_hash}:${timestamp}`, with X-Buyer-Timestamp alongside.',
    },
    workerSession: {
      type: 'apiKey',
      in: 'cookie',
      name: WORKER_COOKIE,
      description: 'The worker session cookie set by `POST /session`.',
    },
    idkitSession: {
      type: 'apiKey',
      in: 'cookie',
      name: IDKIT_COOKIE,
      description: 'The short-lived World ID cookie set by `POST /idkit/verify`.',
    },
  };
}

/** The money, taken from the constants rather than typed again. */
function moneyExample(): { agent_pays: number; escrow_locked: number; worker_receives: number; fee: number } {
  const workerUnits = toUsdcUnits(PRICE_FLOOR_USDC['verify-open']);
  return {
    agent_pays: fromUsdcUnits(priceWithFee(workerUnits)),
    escrow_locked: fromUsdcUnits(priceWithFee(workerUnits)),
    worker_receives: fromUsdcUnits(workerUnits),
    fee: fromUsdcUnits(feeOn(workerUnits)),
  };
}

function infoDescription(): string {
  const money = moneyExample();
  const pays = money.agent_pays.toFixed(2);
  const worker = money.worker_receives.toFixed(2);
  const fee = money.fee.toFixed(2);
  return [
    'Legwork hires a verified human for a small errand in the physical world and pays on proof.',
    `The fee is charged on top and there is no deducted figure anywhere: the agent pays ${pays} USDC for a ${worker} task; escrow locks ${pays}; the worker receives ${worker}; the fee is ${fee} on top.`,
    `A task may be at most ${MAX_TASK_AMOUNT_USDC} USDC.`,
    'Screening happens before any money moves, and a refused task moves no money.',
    `Refusals carry a fixed sentence: refusals return \`${NO_RETRY_SENTENCE}\`.`,
    'Payment settles in testnet USDC — not spendable.',
    'Administrative routes are operator-only and are deliberately absent from this document.',
  ].join('\n\n');
}

function responsesFor(route: Route, convert: SchemaConverter): JsonObject {
  const responses: JsonObject = {};
  for (const status of statusesOf(route)) {
    const schema = convert.convert(route.responses[status]!, 'output');
    const response: JsonObject = {
      description: STATUS_DESCRIPTIONS[status] ?? `Status ${status}`,
    };
    // `z.any()` converts to the empty schema — a body this contract does not shape (the
    // stripped image). Documenting `{}` as JSON would be a lie; the description carries it.
    if (!isEmptySchema(schema)) response.content = { 'application/json': { schema } };
    responses[String(status)] = response;
  }
  return responses;
}

function parametersFor(route: Route, convert: SchemaConverter): JsonObject[] {
  const parameters: JsonObject[] = [];
  for (const name of pathParamNames(route.path)) {
    const schema = PATH_PARAM_SCHEMAS[name];
    parameters.push({
      name,
      in: 'path',
      required: true,
      schema: schema ? convert.standalone(schema, 'input') : { type: 'string' },
    });
  }
  if (route.query) {
    const query = convert.convert(route.query, 'input');
    const properties = (query.properties ?? {}) as JsonObject;
    const required = new Set((query.required as string[] | undefined) ?? []);
    for (const name of Object.keys(properties).sort()) {
      parameters.push({
        name,
        in: 'query',
        required: required.has(name),
        schema: properties[name] as JsonObject,
      });
    }
  }
  return parameters;
}

function operationFor(route: Route, convert: SchemaConverter): JsonObject {
  const operation: JsonObject = {
    operationId: operationIdFor(route.method, route.path),
    summary: route.summary,
  };

  const description = route.auth === 'public' ? `${route.summary}\n\n${PUBLIC_PROMISE}` : route.summary;
  operation.description = description;

  const parameters = parametersFor(route, convert);
  if (parameters.length > 0) operation.parameters = parameters;

  if (route.request) {
    operation.requestBody = {
      required: true,
      content: { 'application/json': { schema: convert.convert(route.request, 'input') } },
    };
  }

  const scheme = SECURITY_SCHEME_BY_AUTH[route.auth];
  if (scheme) operation.security = [{ [scheme]: [] }];

  operation.responses = responsesFor(route, convert);

  if (route.path === '/tasks' && route.method === 'POST' && route.auth === 'x402') {
    operation['x-legwork'] = {
      price_rule: 'amount_usdc × 1.15',
      money_example: moneyExample(),
    };
  }
  return operation;
}

/**
 * Two contract rows share `POST /tasks`: the x402 row and the direct-mode quote. OpenAPI has
 * one operation per method and path, so they become one operation that documents both — the
 * union of their statuses, and a `security` list the caller may satisfy either way.
 */
function mergeOperations(existing: JsonObject, incoming: JsonObject): JsonObject {
  const merged: JsonObject = { ...existing };
  merged.description = `${existing.description as string}\n\n${incoming.description as string}`;
  merged.responses = { ...(existing.responses as JsonObject), ...(incoming.responses as JsonObject) };
  const security = [
    ...((existing.security as JsonObject[] | undefined) ?? []),
    ...((incoming.security as JsonObject[] | undefined) ?? []),
  ];
  if (security.length > 0) merged.security = security;
  if (!merged.parameters && incoming.parameters) merged.parameters = incoming.parameters;
  if (!merged.requestBody && incoming.requestBody) merged.requestBody = incoming.requestBody;
  return merged;
}

/**
 * The document. `includeAdmin` is off by default: `/admin/*` is operator-only and the gateway
 * must not list it.
 */
export function buildOpenApi(opts: BuildOpenApiOptions): OpenApiDocument {
  const includeAdmin = opts.includeAdmin ?? false;
  const routes = (Object.values(API_ROUTES) as readonly Route[]).filter(
    (route) => includeAdmin || !route.path.startsWith('/admin'),
  );
  const convert = new SchemaConverter(routes);
  const paths: JsonObject = {};

  for (const route of routes) {
    const path = templatePath(route.path);
    const method = route.method.toLowerCase();
    const item = (paths[path] as JsonObject | undefined) ?? {};
    const operation = operationFor(route, convert);
    const existing = item[method] as JsonObject | undefined;
    item[method] = existing ? mergeOperations(existing, operation) : operation;
    paths[path] = item;
  }

  const document: OpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title: 'Legwork API',
      version: DOCUMENT_VERSION,
      description: infoDescription(),
    },
    servers: [{ url: opts.serverUrl }],
    paths,
    components: {
      schemas: convert.components(),
      securitySchemes: securitySchemes(),
    },
  };

  return sortKeys(document);
}
