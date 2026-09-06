/**
 * The three variables this middleware reads, and the only shape any guard here sees.
 *
 * `readEnv` in `edge.ts` is the one place `process.env` is touched; everything else takes a
 * `MiddlewareEnv` as an argument, which is what lets a test drive the admin gate with a key
 * without setting one on the process.
 */
export interface MiddlewareEnv {
  MINIAPP_URL?: string;
  DASHBOARD_URL?: string;
  ADMIN_API_KEY?: string;
}
