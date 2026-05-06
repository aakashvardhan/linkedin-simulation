import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Network from '../Network';
import { renderWithRouter } from '../../test/testUtils';

vi.mock('../../context/MockDataContext', () => {
  return { useMockData: vi.fn() };
});

const { useMockData } = await import('../../context/MockDataContext');

describe('Network', () => {
  let withdrawConnectionRequest;
  let acceptIncomingInvite;
  beforeEach(() => {
    withdrawConnectionRequest = vi.fn();
    acceptIncomingInvite = vi.fn();
    useMockData.mockReturnValue({
      connections: [
        { id: 1, name: 'Elena Vogel', headline: 'Recruiter', mutual: 5, status: 'none' },
        { id: 2, name: 'James Park', headline: 'Scientist', mutual: 3, status: 'pending' },
        { id: 3, name: 'Amira Hassan', headline: 'Engineer', mutual: 8, status: 'connected' },
      ],
      requestConnection: vi.fn(),
      withdrawConnectionRequest,
      incomingInvites: [{ id: 'inv1', name: 'Alice Smith', headline: 'Data Scientist', mutual: 12 }],
      acceptIncomingInvite,
      declineIncomingInvite: vi.fn(),
    });
  });

  it('accepts an incoming invite', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Network />);

    await user.click(screen.getByRole('button', { name: /invitations/i }));
    await user.click(screen.getByRole('button', { name: /accept/i }));

    expect(acceptIncomingInvite).toHaveBeenCalledWith('inv1');
  });

  it('withdraws a pending outbound request', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Network />);

    const pendingTabs = screen.getAllByRole('button', { name: /^pending/i });
    await user.click(pendingTabs[0]);
    await user.click(screen.getByRole('button', { name: /withdraw/i }));

    expect(withdrawConnectionRequest).toHaveBeenCalledWith(2);
  });
});

