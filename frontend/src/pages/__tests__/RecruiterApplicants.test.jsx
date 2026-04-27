import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecruiterJobs from '../RecruiterJobs';
import { renderWithRouter } from '../../test/testUtils';

vi.mock('../../context/MockDataContext', () => {
  return { useMockData: vi.fn() };
});

const { useMockData } = await import('../../context/MockDataContext');

describe('RecruiterJobs - applicants', () => {
  beforeEach(() => {
    useMockData.mockReturnValue({
      jobs: [{ id: 1, title: 'Frontend Engineer', company: 'Demo Co', location: 'Remote', type: 'Full-time', remote: true, industry: 'Technology', description: '', applicants: 1 }],
      addJob: vi.fn(),
      editJob: vi.fn(),
      deleteJob: vi.fn(),
      applicantsByJobId: {
        '1': [
          { id: 'a1', name: 'Candidate One', email: 'c1@demo.linkdln', headline: 'Engineer', resumeSummary: 'Resume text', status: 'New', appliedAgo: 'Just now' },
        ],
      },
      updateApplicantStatus: vi.fn(),
    });
  });

  it('opens applicants modal and opens resume viewer', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RecruiterJobs />);

    await user.click(screen.getByRole('button', { name: /view applicants/i }));
    expect(screen.getByRole('dialog', { name: /applicants/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /view resume/i }));
    expect(screen.getByRole('dialog', { name: /resume/i })).toBeInTheDocument();
    expect(screen.getByText(/resume text/i)).toBeInTheDocument();
  });
});

