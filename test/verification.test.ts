import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('verification request route', () => {
  it('persists a verified request exactly once', async () => {
    const url = 'http://example.com/api/verification';
    const init = {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-verification-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ requestId: 'request-123' }),
    };

    const firstResponse = await SELF.fetch(url, init);
    expect(firstResponse.status).toBe(201);
    await expect(firstResponse.json()).resolves.toEqual({ verified: true });

    const duplicateResponse = await SELF.fetch(url, init);
    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toEqual({
      error: 'Request already verified',
    });
  });
});
