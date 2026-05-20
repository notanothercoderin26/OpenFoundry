import type { Page, Route } from '@playwright/test';

/**
 * Mock a Server-Sent Events endpoint by intercepting requests to `pattern`
 * and returning a properly framed `text/event-stream` body.
 *
 * **Important caveat.** Playwright's `route.fulfill` delivers the whole
 * response body in a single write — bytes do not stream over time. The
 * browser's SSE / fetch decoder still emits each `data:` event as the
 * parser reaches it, so the UI's per-event handlers (e.g. `EventSource
 * .onmessage`, `fetch().body.getReader()` loops) see the same cadence a
 * real backend would produce. For mid-stream cancellation testing, use
 * `delayMs` to push the fulfill out and trigger the abort during the
 * wait — the in-flight fetch will be aborted before any byte arrives.
 *
 * See `apps/web/e2e/README.md` ("Mocking Server-Sent Events (SSE)") for
 * the documented pattern and a worked example.
 */
export interface SseMockOptions {
  /**
   * Terminator event appended after `chunks`. Defaults to `[DONE]` to
   * match the OpenAI-compatible gateway. Pass `null` to omit.
   */
  closeWith?: string | null;
  /**
   * Delay (ms) before `route.fulfill` returns the body. Use to test
   * mid-stream cancellation — submit, click Stop during the wait, the
   * browser aborts before the body arrives.
   */
  delayMs?: number;
  /**
   * HTTP status to return. Defaults to 200. Set to 429 / 503 to drive
   * the rate-limit or service-unavailable error paths.
   */
  status?: number;
  /**
   * Extra response headers to send. Merged on top of the SSE defaults
   * (`cache-control: no-cache`, `connection: keep-alive`).
   */
  headers?: Record<string, string>;
}

/**
 * Intercept `pattern` and reply with a `text/event-stream` body where
 * each entry of `chunks` becomes one `data: <chunk>\n\n` event.
 *
 * @example
 *   await mockSseStream(page, '** /api/v1/ai/assist/chat', [
 *     JSON.stringify({ delta: 'Hello' }),
 *     JSON.stringify({ delta: ' world' }),
 *   ]);
 *
 *   // Mid-stream cancellation:
 *   await mockSseStream(page, '** /api/v1/ai/assist/chat', chunks, {
 *     delayMs: 1_500,
 *   });
 *   await page.getByRole('button', { name: /ask/i }).click();
 *   await page.getByRole('button', { name: /stop/i }).click();
 */
export async function mockSseStream(
  page: Page,
  pattern: string | RegExp,
  chunks: string[],
  options: SseMockOptions = {},
): Promise<void> {
  const { closeWith = '[DONE]', delayMs, status = 200, headers } = options;
  await page.route(pattern, async (route: Route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const lines = chunks.map((chunk) => `data: ${chunk}\n\n`);
    if (closeWith !== null) lines.push(`data: ${closeWith}\n\n`);
    await route.fulfill({
      status,
      contentType: 'text/event-stream; charset=utf-8',
      headers: {
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        ...headers,
      },
      body: lines.join(''),
    });
  });
}
