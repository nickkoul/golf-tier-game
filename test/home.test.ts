import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('home route', () => {
  it('redirects unauthenticated visitors to sign-in', async () => {
    const response = await SELF.fetch('http://example.com/', {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/sign-in');
  });
});
