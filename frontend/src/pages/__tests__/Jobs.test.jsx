import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
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
      authToken: null,
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
  it('filters by industry and by keyword search', async () => {
    useMockData.mockReturnValue({
      jobs: [
        { id: 1, title: 'Frontend Engineer', company: 'A', location: 'Remote', type: 'Full-time', remote: true, industry: 'Technology', description: 'React components only.', applicants: 0, hasApplied: false },
        {
          id: 2,
          title: 'Data Analyst — RetailIQ',
          company: 'B',
          location: 'Boston, MA',
          type: 'Contract',
          remote: false,
          industry: 'Retail',
          description: 'SQL dashboards and reporting.',
          applicants: 0,
          hasApplied: false,
        },
      ],
      applyToJob: vi.fn(),
      toggleSaveJob: vi.fn(),
      isJobSaved: vi.fn(() => false),
      userProfile: { displayName: 'Test User', headline: 'Engineer' },
      authToken: null,
    });

    const user = userEvent.setup();
    const { container } = renderWithRouter(<Jobs />);

    const selects = screen.getAllByRole('combobox');
    const industrySelect = selects[selects.length - 1];
    await user.selectOptions(industrySelect, 'Retail');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="jobs-result-count"]')).toHaveTextContent('1 result');
    });
    expect(screen.getAllByText(/RetailIQ/i).length).toBeGreaterThanOrEqual(1);

    await user.selectOptions(industrySelect, '');
    expect(container.querySelector('[data-testid="jobs-result-count"]')).toHaveTextContent('2 results');

    const keywordInputs = container.querySelectorAll('[data-testid="jobs-keyword-search"]');
    expect(keywordInputs.length).toBeGreaterThanOrEqual(1);
    const keywordInput = keywordInputs[0];
    fireEvent.change(keywordInput, { target: { value: 'RetailIQ' } });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="jobs-result-count"]')).toHaveTextContent(/1 result/);
    });
    expect(screen.getAllByText(/RetailIQ/i).length).toBeGreaterThanOrEqual(1);
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
      authToken: null,
    });

    renderWithRouter(<Jobs />);
    const applyBtn = screen.getByRole('button', { name: /already applied to this job/i });
    expect(applyBtn).toBeDisabled();
  });
});

