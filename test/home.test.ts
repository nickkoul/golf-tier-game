import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('home route', () => {
  it('renders the Golf Tiers tournament standings shell', async () => {
    const response = await SELF.fetch('http://example.com/');

    expect(response.status).toBe(200);

    const document = await response.text();
    expect(document).toContain('Golf Tiers');
    expect(document).toContain('Standings');
    expect(document).toContain('Lineup Lock');
  });
});
