import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MainFeed from '../MainFeed';
import { renderWithRouter } from '../../test/testUtils';

vi.mock('../../context/MockDataContext', () => {
  return {
    memberProfilePhotoKey: (email) => `photo:${email}`,
    PROFILE_PHOTO_UPDATED: 'profile-photo-updated',
    useMockData: vi.fn(),
  };
});

const { useMockData } = await import('../../context/MockDataContext');

describe('MainFeed - Write article', () => {
  beforeEach(() => {
    useMockData.mockReturnValue({
      posts: [],
      addPost: vi.fn(),
      updatePost: vi.fn(),
      deletePost: vi.fn(),
      togglePostLike: vi.fn(),
      addPostComment: vi.fn(),
      togglePostRepost: vi.fn(),
      addRepostWithThoughts: vi.fn(),
      feedPermissions: { canPost: true, placeholder: 'Start a post…', helper: '' },
      userProfile: { displayName: 'Test User', email: 't@demo.linkdln' },
      userRole: 'MEMBER',
    });
  });

  it('publishes an article with title + body', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MainFeed />);

    await user.click(screen.getByRole('button', { name: /write article/i }));

    expect(screen.getByRole('dialog', { name: /write article/i })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/a clear, compelling title/i), 'My Article');
    await user.type(screen.getByPlaceholderText(/share your perspective/i), 'Hello world');

    await user.click(screen.getByRole('button', { name: /publish/i }));

    const { addPost } = useMockData.mock.results[0].value;
    expect(addPost).toHaveBeenCalledWith('Hello world', expect.objectContaining({ articleTitle: 'My Article' }));
  });
});

describe('MainFeed - repost and like flows', () => {
  let togglePostLike;
  let addRepostWithThoughts;
  let togglePostRepost;
  beforeEach(() => {
    togglePostLike = vi.fn();
    addRepostWithThoughts = vi.fn();
    togglePostRepost = vi.fn();
    useMockData.mockReturnValue({
      posts: [
        {
          id: 101,
          author: 'Alice',
          headline: 'Engineer',
          time: '1h',
          content: 'Original post',
          likes: 0,
          comments: 0,
          likedByMe: false,
          reposts: 0,
          repostedByMe: false,
          commentList: [],
        },
      ],
      addPost: vi.fn(),
      updatePost: vi.fn(),
      deletePost: vi.fn(),
      togglePostLike,
      addPostComment: vi.fn(),
      togglePostRepost,
      addRepostWithThoughts,
      feedPermissions: { canPost: true, placeholder: 'Start a post…', helper: '' },
      userProfile: { displayName: 'Test User', email: 't@demo.linkdln' },
      userRole: 'MEMBER',
    });
  });

  it('toggles like on a post', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MainFeed />);

    const postCard = screen.getAllByText('Original post')[0].closest('.card');
    expect(postCard).toBeTruthy();
    await user.click(within(postCard).getByRole('button', { name: /^like$/i }));

    expect(togglePostLike).toHaveBeenCalledWith(101);
  });

  it('opens repost panel and submits repost with thoughts', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MainFeed />);

    const postCard = screen.getAllByText('Original post')[0].closest('.card');
    expect(postCard).toBeTruthy();
    await user.click(within(postCard).getByRole('button', { name: /^repost$/i }));
    await user.type(screen.getByPlaceholderText(/what do you want to say/i), 'Nice!');
    await user.click(screen.getByRole('button', { name: /post repost/i }));

    expect(addRepostWithThoughts).toHaveBeenCalledWith(101, 'Nice!');
  });

  it('quick repost triggers togglePostRepost', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MainFeed />);

    const postCard = screen.getAllByText('Original post')[0].closest('.card');
    expect(postCard).toBeTruthy();
    await user.click(within(postCard).getByRole('button', { name: /^repost$/i }));
    await user.click(screen.getByRole('button', { name: /quick repost/i }));

    expect(togglePostRepost).toHaveBeenCalledWith(101);
  });
});

