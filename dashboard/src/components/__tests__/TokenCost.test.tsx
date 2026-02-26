import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TokenCost from '../TokenCost';
import type { TokenCostResponse } from '../../lib/types';

const useTokenCostMock = vi.fn();
const useFilterOptionalMock = vi.fn();

vi.mock('../../lib/hooks', () => ({
  useTokenCost: (scenario?: string) => useTokenCostMock(scenario),
}));

vi.mock('../../lib/FilterContext', () => ({
  useFilterOptional: () => useFilterOptionalMock(),
}));

const tokenCostData: TokenCostResponse = {
  scenario: 'Early Fact Recall',
  availableScenarios: ['Early Fact Recall', 'State Change Tracking'],
  strategies: [
    {
      name: 'RLM(8)',
      steps: [
        {
          step: 1,
          inputTokens: 900,
          outputTokens: 120,
          overhead: 80,
          latency: 1400,
        },
      ],
    },
  ],
};

describe('TokenCost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chart controls and scenario options', async () => {
    useTokenCostMock.mockReturnValue({
      data: tokenCostData,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    useFilterOptionalMock.mockReturnValue(null);

    render(<TokenCost />);

    expect(screen.getByText('Token Cost per Step')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Input Tokens' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overhead Tokens' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Latency (ms)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Early Fact Recall' })).toBeInTheDocument();

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await waitFor(() => {
      expect(select.value).toBe('Early Fact Recall');
    });
  });
});
