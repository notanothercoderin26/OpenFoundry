import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createNotificationSubscription,
  deleteNotificationSubscription,
  listEventDeliveries,
  listNotificationSubscriptions,
  submitNotificationEvent,
} from './notifications';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function lastCall(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls[mock.mock.calls.length - 1];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notifications B05 client', () => {
  it('listNotificationSubscriptions encodes event_type', async () => {
    const fetchMock = mockFetch(200, { data: [] });
    vi.stubGlobal('fetch', fetchMock);
    await listNotificationSubscriptions('action.scheduled.v1');
    const [url] = lastCall(fetchMock) as [string];
    expect(url).toContain('/notifications/subscriptions');
    expect(url).toContain('event_type=action.scheduled.v1');
  });

  it('createNotificationSubscription POSTs the body', async () => {
    const fetchMock = mockFetch(201, { id: 'sub-1' });
    vi.stubGlobal('fetch', fetchMock);
    await createNotificationSubscription({
      event_type: 'action.scheduled.v1',
      channel: 'webhook',
      target: 'https://example.com/hook',
      hmac_secret: 'topsecret',
    });
    const [url, init] = lastCall(fetchMock) as [string, RequestInit];
    expect(url).toContain('/notifications/subscriptions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({
      event_type: 'action.scheduled.v1',
      channel: 'webhook',
      hmac_secret: 'topsecret',
    });
  });

  it('submitNotificationEvent POSTs to /notifications/events', async () => {
    const fetchMock = mockFetch(202, { event: { id: 'e-1' }, deliveries: [] });
    vi.stubGlobal('fetch', fetchMock);
    await submitNotificationEvent({ event_type: 'foo', payload: { id: 1 } });
    const [url, init] = lastCall(fetchMock) as [string, RequestInit];
    expect(url).toContain('/notifications/events');
    expect(init.method).toBe('POST');
  });

  it('listEventDeliveries hits /events/{id}/deliveries', async () => {
    const fetchMock = mockFetch(200, { data: [] });
    vi.stubGlobal('fetch', fetchMock);
    await listEventDeliveries('e-1');
    const [url] = lastCall(fetchMock) as [string];
    expect(url).toContain('/notifications/events/e-1/deliveries');
  });

  it('deleteNotificationSubscription DELETEs the id', async () => {
    const fetchMock = mockFetch(200, {});
    vi.stubGlobal('fetch', fetchMock);
    await deleteNotificationSubscription('sub-1');
    const [url, init] = lastCall(fetchMock) as [string, RequestInit];
    expect(url).toContain('/notifications/subscriptions/sub-1');
    expect(init.method).toBe('DELETE');
  });
});
