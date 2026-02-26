import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

function mockResponse({
  ok,
  status,
  statusText,
  jsonData,
}: {
  ok: boolean;
  status: number;
  statusText: string;
  jsonData?: unknown;
}): Response {
  return {
    ok,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(jsonData),
  } as unknown as Response;
}

describe('api runtime validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws a descriptive API error for non-2xx responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse({ ok: false, status: 503, statusText: 'Service Unavailable' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.leaderboard()).rejects.toThrow('API error: 503 Service Unavailable');
    expect(fetchMock).toHaveBeenCalledWith('/api/leaderboard');
  });

  it('throws a validation error that includes endpoint and path context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        statusText: 'OK',
        jsonData: {
          scenario: 's1',
          availableScenarios: ['s1'],
          strategies: [
            {
              name: 'RLM(8)',
              steps: [{ step: 1, inputTokens: 10, outputTokens: 2, overhead: 'bad', latency: 100 }],
            },
          ],
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.tokenCost()).rejects.toThrow(
      'API validation failed for /api/token-cost at strategies.0.steps.0.overhead'
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/token-cost');
  });
});
