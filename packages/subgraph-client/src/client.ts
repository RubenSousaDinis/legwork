/**
 * The transport. Everything else in this package is a document and a shape; this is the
 * only thing that touches the network, and it takes its `fetch` as an argument so a test
 * can hand it a fixture and never open a socket.
 */

export interface SubgraphClientOptions {
  /** The Studio or gateway query URL. Publishable — it is not a secret. */
  url: string;
  /**
   * `GRAPH_API_KEY`, when the gateway needs one. The caller reads it from
   * `process.env` and passes it here; this package never reaches for the environment,
   * so the key cannot end up in a client bundle by accident.
   */
  apiKey?: string;
  /** Injected for tests. Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
}

export interface SubgraphClient {
  /**
   * Send a GraphQL document. The document and variables go through unchanged — no
   * rewriting, no fragment injection — so a caller can run a query this package has
   * never heard of. T-26 builds its dashboard queries on exactly this.
   */
  query<T>(document: string, variables?: Record<string, unknown>): Promise<T>;
  readonly url: string;
}

interface GraphQLError {
  message: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export function createSubgraphClient(options: SubgraphClientOptions): SubgraphClient {
  const { url, apiKey } = options;
  const doFetch = options.fetch ?? globalThis.fetch;

  async function query<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    // No key, no header. An empty `Authorization: Bearer` is worse than none: it reads
    // like an expired credential and sends the caller looking in the wrong place.
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    const response = await doFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: document, variables: variables ?? {} }),
    });

    if (!response.ok) {
      throw new Error(`subgraph HTTP ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as GraphQLResponse<T>;
    if (body.errors && body.errors.length > 0) {
      // A 200 with an `errors` body is the normal GraphQL failure. Surfacing it as a
      // thrown error is what stops a caller reducing `undefined` into a confident number.
      throw new Error(`subgraph query failed: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    if (body.data === undefined) {
      throw new Error('subgraph query returned no data');
    }
    return body.data;
  }

  return { query, url };
}
