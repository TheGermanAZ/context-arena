import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../Sidebar';
import { FilterProvider } from '../../lib/FilterContext';

function renderWithFilterProvider() {
  return render(
    <FilterProvider>
      <Sidebar expanded onToggle={vi.fn()} />
    </FilterProvider>
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies presets and updates checked panels', () => {
    renderWithFilterProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Code Generation' }));

    expect(screen.getByLabelText('RLLM vs Hand-rolled')).toBeChecked();
    expect(screen.getByLabelText('Code Strategies')).toBeChecked();
    expect(screen.getByLabelText('Leaderboard')).not.toBeChecked();
    expect(screen.getByLabelText('Retention by Type')).not.toBeChecked();
  });

  it('enforces max 4 selected panels by disabling additional options', () => {
    renderWithFilterProvider();

    fireEvent.click(screen.getByLabelText('Retention Curve'));

    expect(screen.getByLabelText('Leaderboard')).toBeChecked();
    expect(screen.getByLabelText('Token Cost')).toBeChecked();
    expect(screen.getByLabelText('Retention by Type')).toBeChecked();
    expect(screen.getByLabelText('Retention Curve')).toBeChecked();
    expect(screen.getByLabelText('Depth 1 vs 2')).toBeDisabled();
    expect(screen.getByText('Max 4 panels')).toBeInTheDocument();
  });
});
