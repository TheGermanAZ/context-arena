import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Leaderboard from '../Leaderboard';
import type { LeaderboardEntry } from '../../lib/types';

const useLeaderboardMock = vi.fn();
const useFilterOptionalMock = vi.fn();

vi.mock('../../lib/hooks', () => ({
  useLeaderboard: () => useLeaderboardMock(),
}));

vi.mock('../../lib/FilterContext', () => ({
  useFilterOptional: () => useFilterOptionalMock(),
}));

const sampleRows: LeaderboardEntry[] = [
  {
    rank: 1,
    strategy: 'RLM(8)',
    accuracy: 0.875,
    accuracyFraction: '7/8',
    avgInputTokens: 1200,
    avgOverhead: 200,
    avgLatency: 1800,
    totalCost: 0.0123,
  },
  {
    rank: 2,
    strategy: 'Hybrid',
    accuracy: 1.0,
    accuracyFraction: '8/8',
    avgInputTokens: 1400,
    avgOverhead: 300,
    avgLatency: 2100,
    totalCost: 0.0154,
  },
];

describe('Leaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders leaderboard rows from hook data', () => {
    useLeaderboardMock.mockReturnValue({
      data: sampleRows,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    useFilterOptionalMock.mockReturnValue(null);

    render(<Leaderboard />);

    expect(screen.getByText('Strategy Leaderboard')).toBeInTheDocument();
    expect(screen.getByText('RLM(8)')).toBeInTheDocument();
    expect(screen.getByText('Hybrid')).toBeInTheDocument();
  });

  it('triggers strategy focus interaction when a row is clicked', () => {
    const guardClick = vi.fn();
    const toggleFocus = vi.fn();

    useLeaderboardMock.mockReturnValue({
      data: sampleRows,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    useFilterOptionalMock.mockReturnValue({
      focusedStrategy: null,
      guardClick,
      toggleFocus,
    });

    render(<Leaderboard />);
    fireEvent.click(screen.getByText('RLM(8)'));

    expect(guardClick).toHaveBeenCalledTimes(1);
    expect(toggleFocus).toHaveBeenCalledWith('strategy', 'RLM(8)');
  });
});
