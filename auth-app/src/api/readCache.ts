/**
 * What the console has read lately, kept apart from client.ts so the invalidation code can forget it without
 * depending on the client. See `api()` for how it is used.
 */

/** How long an answer to one of the widely-shared reads is reused. Short: a stale list is worse than a second request. */
export const READ_CACHE_MS = 3_000;
/** The reads many components ask for on opening a page. Anything else is only shared while it is in flight. */
export const SHARED_READS: readonly RegExp[] = [
  /^\/v1\/connections(\/|$)/,
  /^\/v1\/campaigns(\?|$)/,
  /^\/v1\/clients(\?|$)/,
  /^\/v1\/members(\?|$)/,
  /^\/v1\/contacts\/allowance(\?|$)/,
];
export const reads = new Map<string, { at: number; value: unknown }>();
export const flying = new Map<string, Promise<unknown>>();
export let readGeneration = 0;

/**
 * Forgets what was read: after any write, a workspace change, and whenever the console says views are stale
 * (invalidate.ts). A read already on its way still answers the ones who asked for it, but is neither shared with
 * a new asker nor kept, since it may have left before the change.
 */
export function dropReadCache(): void {
  readGeneration += 1;
  reads.clear();
  flying.clear();
}

