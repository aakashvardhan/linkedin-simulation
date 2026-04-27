import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Jobs from '../Jobs';
import { renderWithRouter } from '../../test/testUtils';

vi.mock('../../context/MockDataContext', () => {
  return {
    useMockData: vi.fn(),
  };
});

const { useMockData } = await import('../../context/MockDataContext');

describe('Jobs - Save job', () => {
  beforeEach(() => {
    useMockData.mockReturnValue({
      jobs: [
        {
          id: 1,
          title: 'Frontend Engineer',
          company: 'Demo Co',
          location: 'Remote',
          type: 'Full-time',
          remote: true,
          industry: 'Technology',
          description: 'Build UI',
          applicants: 0,
          hasApplied: false,
        },
      ],
      applyToJob: vi.fn(),
      toggleSaveJob: vi.fn(),
      isJobSaved: vi.fn(() => false),
      userProfile: { displayName: 'Test User', headline: 'Engineer' },
    });
  });

  it('calls toggleSaveJob when clicking Save job', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Jobs />);

    await user.click(screen.getByRole('button', { name: /save job/i }));

    const { toggleSaveJob } = useMockData.mock.results[0].value;
    expect(toggleSaveJob).toHaveBeenCalledWith(1);
  });
});

describe('Jobs - filters and apply duplicate prevention', () => {
  it('filters by keyword and industry', async () => {
    useMockData.mockReturnValue({
      jobs: [
        { id: 1, title: 'Frontend Engineer', company: 'A', location: 'Remote', type: 'Full-time', remote: true, industry: 'Technology', description: 'React', applicants: 0, hasApplied: false },
        { id: 2, title: 'Data Analyst', company: 'B', location: 'Boston, MA', type: 'Contract', remote: false, industry: 'Retail', description: 'SQL', applicants: 0, hasApplied: false },
      ],
      applyToJob: vi.fn(),
      toggleSaveJob: vi.fn(),
      isJobSaved: vi.fn(() => false),
      userProfile: { displayName: 'Test User', headline: 'Engineer' },
    });

    const user = userEvent.setup();
    renderWithRouter(<Jobs />);

    const keywordInputs = screen.getAllByPlaceholderText(/keywords/i);
    await user.type(keywordInputs[0], 'sql');
    expect(screen.getAllByText(/data analyst/i).length).toBeGreaterThan(0);
    // In the instance we interacted with, results should narrow.
    expect(screen.getAllByText(/1 results/i).length).toBeGreaterThan(0);

    // Clear and filter by industry
    await user.clear(keywordInputs[0]);
    const selects = screen.getAllByRole('combobox');
    const industrySelect = selects[selects.length - 1];
    await user.selectOptions(industrySelect, 'Retail');
    expect(screen.getAllByText(/data analyst/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 results/i).length).toBeGreaterThan(0);
  });

  it('prevents applying twice (button disabled when hasApplied)', async () => {
    useMockData.mockReturnValue({
      jobs: [
        { id: 3, title: 'Backend Engineer', company: 'C', location: 'NY', type: 'Full-time', remote: false, industry: 'FinTech', description: 'Python', applicants: 0, hasApplied: true },
      ],
      applyToJob: vi.fn(),
      toggleSaveJob: vi.fn(),
      isJobSaved: vi.fn(() => false),
      userProfile: { displayName: 'Test User', headline: 'Engineer' },
    });

    renderWithRouter(<Jobs />);
    const applyBtn = screen.getByRole('button', { name: /applied/i });
    expect(applyBtn).toBeDisabled();
  });
});

