import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Profile from '../Profile';
import { renderWithRouter } from '../../test/testUtils';

vi.mock('../../context/MockDataContext', () => {
  return {
    useMockData: vi.fn(),
    memberProfilePhotoKey: (email) => `photo:${email}`,
    notifyProfilePhotoUpdated: vi.fn(),
  };
});

const { useMockData } = await import('../../context/MockDataContext');

describe('Profile - Delete member profile', () => {
  beforeEach(() => {
    useMockData.mockReturnValue({
      getMemberAnalytics: vi.fn(async () => ({ profileViewsLast30Days: [], applicationStatusBreakdown: [] })),
      userProfile: { displayName: 'Test User', email: 't@demo.linkdln', role: 'MEMBER', headline: 'Engineer' },
      updateUserProfile: vi.fn(),
      deleteMemberProfile: vi.fn(),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('calls deleteMemberProfile after confirmation', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Profile />, { route: '/in/me' });

    await user.click(screen.getByRole('button', { name: /delete member profile/i }));

    const { deleteMemberProfile } = useMockData.mock.results[0].value;
    expect(deleteMemberProfile).toHaveBeenCalled();
  });
});

