import assert from 'node:assert/strict';
import test from 'node:test';
import reportApi from './report-api.js';

test('allows the notification preferences PUT request through CORS', async () => {
  const request = new Request('https://papertok-report-api.example/notifications/preferences', {
    method: 'OPTIONS',
    headers: {
      origin: 'https://mugar123.github.io',
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'authorization, content-type',
    },
  });

  const response = await reportApi.fetch(request, {});

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://mugar123.github.io');
  assert.match(response.headers.get('access-control-allow-methods'), /(?:^|,\s*)PUT(?:,|$)/);
});

test('returns only the Cloudflare country code for automatic language selection', async () => {
  const request = new Request('https://papertok-report-api.example/locale', {
    headers: { origin: 'https://mugar123.github.io' },
  });
  Object.defineProperty(request, 'cf', { value: { country: 'MX' } });

  const response = await reportApi.fetch(request, {});

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://mugar123.github.io');
  assert.deepEqual(await response.json(), { country: 'MX' });
});
