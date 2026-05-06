import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Messaging from '../Messaging';
import { renderWithRouter } from '../../test/testUtils';

vi.mock('../../context/MockDataContext', () => {
  return { useMockData: vi.fn() };
});

const { useMockData } = await import('../../context/MockDataContext');

describe('Messaging', () => {
  beforeEach(() => {
    useMockData.mockReturnValue({
      conversationStore: {
        threads: [
          { id: 't1', peerName: 'Elena Vogel', messages: [{ id: 'm1', text: 'Hello', isMine: false, time: '1:00 PM' }] },
        ],
      },
      sendMessage: vi.fn(),
      userProfile: { displayName: 'Test User' },
    });
  });

  it('sends a message in the selected thread', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Messaging />);

    await user.type(screen.getByPlaceholderText(/write a message/i), 'Test message');
    await user.click(screen.getByRole('button', { name: /send/i }));

    const { sendMessage } = useMockData.mock.results[0].value;
    expect(sendMessage).toHaveBeenCalledWith('t1', 'Test message');
  });
});

