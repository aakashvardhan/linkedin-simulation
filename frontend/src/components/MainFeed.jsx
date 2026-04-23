import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  FaImage,
  FaCalendarAlt,
  FaNewspaper,
  FaEllipsisH,
  FaThumbsUp,
  FaComment,
  FaRetweet,
  FaPaperPlane,
  FaCompass,
  FaPencilAlt,
  FaTrash,
  FaTimes,
} from 'react-icons/fa';
import {
  useMockData,
  memberProfilePhotoKey,
  PROFILE_PHOTO_UPDATED,
} from '../context/MockDataContext';

const MainFeed = () => {
  const location = useLocation();
  const {
    posts,
    addPost,
    updatePost,
    deletePost,
    togglePostLike,
    addPostComment,
    togglePostRepost,
    addRepostWithThoughts,
    feedPermissions,
    userProfile,
    userRole,
  } = useMockData();

  const [postText, setPostText] = useState('');
  const [menuPostId, setMenuPostId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [photoTick, setPhotoTick] = useState(0);
  const [commentOpenPostId, setCommentOpenPostId] = useState(null);
  const [commentInput, setCommentInput] = useState('');
  const [repostOpenPostId, setRepostOpenPostId] = useState(null);
  const [repostThoughts, setRepostThoughts] = useState('');
  const [toast, setToast] = useState(null);
  const [composerImage, setComposerImage] = useState(null);
  const mediaInputRef = useRef(null);
  const [articleModalOpen, setArticleModalOpen] = useState(false);
  const [articleFormTitle, setArticleFormTitle] = useState('');
  const [articleFormBody, setArticleFormBody] = useState('');
  const [articleFormCover, setArticleFormCover] = useState(null);
  const articleCoverInputRef = useRef(null);
  const [editArticleTitle, setEditArticleTitle] = useState('');

  useEffect(() => {
    const fn = () => setPhotoTick((t) => t + 1);
    window.addEventListener(PROFILE_PHOTO_UPDATED, fn);
    return () => window.removeEventListener(PROFILE_PHOTO_UPDATED, fn);
  }, []);

  useEffect(() => {
    if (menuPostId == null) return undefined;
    const close = () => setMenuPostId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuPostId]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const composerAvatar = useMemo(() => {
    const email = userProfile?.email;
    const name = userProfile?.displayName?.trim() || 'Member';
    if (!email) {
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0A66C2&color=fff&size=96`;
    }
    try {
      const stored = localStorage.getItem(memberProfilePhotoKey(email));
      if (stored) return stored;
    } catch {
      /* ignore */
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0A66C2&color=fff&size=96`;
  }, [userProfile?.email, userProfile?.displayName, location.pathname, photoTick]);

  const canModifyPost = (post) => {
    if (userRole === 'RECRUITER') return true;
    return !!(userProfile?.email && post.ownerEmail === userProfile.email);
  };

  const readImageFileToDataUrl = useCallback((fileList, onDataUrl) => {
    const file = fileList?.[0];
    if (!file) return;
    const isImage =
      file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(file.name || '');
    if (!isImage) {
      setToast('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      window.alert('Please choose an image under 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setToast('Could not read that image');
    reader.onload = () => onDataUrl(reader.result);
    reader.readAsDataURL(file);
  }, []);

  const handleComposerMedia = useCallback(
    (fileList) => readImageFileToDataUrl(fileList, setComposerImage),
    [readImageFileToDataUrl],
  );

  const handleArticleCover = useCallback(
    (fileList) => readImageFileToDataUrl(fileList, setArticleFormCover),
    [readImageFileToDataUrl],
  );

  const closeArticleModal = useCallback(() => {
    setArticleModalOpen(false);
    setArticleFormTitle('');
    setArticleFormBody('');
    setArticleFormCover(null);
  }, []);

  const canPublishArticle =
    feedPermissions.canPost &&
    !!articleFormTitle.trim() &&
    !!articleFormBody.trim();

  const handlePublishArticle = () => {
    if (!canPublishArticle) return;
    addPost(articleFormBody.trim(), {
      image: articleFormCover,
      articleTitle: articleFormTitle.trim(),
    });
    closeArticleModal();
    setToast('Article published to your feed');
  };

  const canSubmitPost = feedPermissions.canPost && (!!postText.trim() || !!composerImage);

  const handlePostSubmit = () => {
    if (!canSubmitPost) return;
    addPost(postText.trim(), { image: composerImage });
    setPostText('');
    setComposerImage(null);
  };

  const startEdit = (post) => {
    setMenuPostId(null);
    setEditingId(post.id);
    setEditText(post.content);
    setEditArticleTitle(post.articleTitle || '');
  };

  const saveEdit = () => {
    if (editingId == null) return;
    const post = posts.find((p) => p.id === editingId);
    if (post?.articleTitle) {
      const t = editArticleTitle.trim();
      const b = editText.trim();
      if (!t || !b) return;
      updatePost(editingId, { content: b, articleTitle: t });
    } else {
      updatePost(editingId, editText);
    }
    setEditingId(null);
    setEditText('');
    setEditArticleTitle('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setEditArticleTitle('');
  };

  const confirmDelete = (postId) => {
    if (window.confirm('Delete this post?')) {
      deletePost(postId);
      setMenuPostId(null);
      if (editingId === postId) cancelEdit();
      if (commentOpenPostId === postId) {
        setCommentOpenPostId(null);
        setCommentInput('');
      }
      if (repostOpenPostId === postId) {
        setRepostOpenPostId(null);
        setRepostThoughts('');
      }
    }
  };

  const showToast = (msg) => setToast(msg);

  const handleToggleComment = (postId) => {
    setRepostOpenPostId(null);
    setRepostThoughts('');
    setCommentOpenPostId((id) => {
      if (id === postId) {
        setCommentInput('');
        return null;
      }
      setCommentInput('');
      return postId;
    });
  };

  const handleToggleRepost = (postId) => {
    setCommentOpenPostId(null);
    setCommentInput('');
    setRepostOpenPostId((id) => {
      if (id === postId) {
        setRepostThoughts('');
        return null;
      }
      setRepostThoughts('');
      return postId;
    });
  };

  const handleSubmitRepost = (postId) => {
    const t = repostThoughts.trim();
    if (!t) return;
    addRepostWithThoughts(postId, t);
    setRepostOpenPostId(null);
    setRepostThoughts('');
    showToast('Repost with your thoughts added to the feed');
  };

  const handleQuickRepostOnly = (postId) => {
    togglePostRepost(postId);
    setRepostOpenPostId(null);
    setRepostThoughts('');
    showToast('Quick repost — count updated on original post');
  };

  const handleAddComment = (postId) => {
    addPostComment(postId, commentInput);
    setCommentInput('');
  };

  const handleSend = async (post) => {
    let snippet;
    if (post.articleTitle) {
      const body =
        post.content.length > 160 ? `${post.content.slice(0, 160)}…` : post.content;
      snippet = `${post.articleTitle}\n${body}`;
    } else {
      snippet = post.content.length > 220 ? `${post.content.slice(0, 220)}…` : post.content;
    }
    const line = `${post.author}: ${snippet}\n— shared from linkedlnDS (demo)`;
    try {
      await navigator.clipboard.writeText(line);
      showToast('Copied to clipboard — paste anywhere to send');
    } catch {
      showToast('Could not access clipboard; select and copy the post manually');
    }
  };

  const commentCountLabel = (n) => `${n} ${n === 1 ? 'comment' : 'comments'}`;

  return (
    <div className="main-feed" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {toast ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '88px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 3000,
            background: '#111',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            maxWidth: '90vw',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      ) : null}
      {articleModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 4000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box',
          }}
          onClick={(e) => e.target === e.currentTarget && closeArticleModal()}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              padding: '20px 22px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 id="article-modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#000000e6' }}>
                Write article
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={closeArticleModal}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '8px',
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <FaTimes size={18} />
              </button>
            </div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>
              Headline
            </label>
            <input
              type="text"
              value={articleFormTitle}
              onChange={(e) => setArticleFormTitle(e.target.value)}
              placeholder="A clear, compelling title"
              disabled={!feedPermissions.canPost}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #cfcfce',
                fontSize: '15px',
                fontWeight: 600,
                marginBottom: '14px',
                outline: 'none',
              }}
            />
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>
              Body
            </label>
            <textarea
              value={articleFormBody}
              onChange={(e) => setArticleFormBody(e.target.value)}
              placeholder="Share your perspective…"
              rows={10}
              disabled={!feedPermissions.canPost}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #cfcfce',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                minHeight: '200px',
                marginBottom: '14px',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />
            <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 600, color: '#555' }}>Cover image (optional)</p>
            <input
              ref={articleCoverInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              style={{ display: 'none' }}
              onChange={(e) => {
                handleArticleCover(e.target.files);
                e.target.value = '';
              }}
            />
            {articleFormCover ? (
              <div style={{ position: 'relative', marginBottom: '14px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e0e0df' }}>
                <img src={articleFormCover} alt="" style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block' }} />
                <button
                  type="button"
                  aria-label="Remove cover"
                  onClick={() => setArticleFormCover(null)}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FaTimes size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!feedPermissions.canPost}
                onClick={() => feedPermissions.canPost && articleCoverInputRef.current?.click()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px dashed #cfcfce',
                  background: '#faf9fc',
                  color: '#555',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: feedPermissions.canPost ? 'pointer' : 'not-allowed',
                  opacity: feedPermissions.canPost ? 1 : 0.55,
                }}
              >
                <FaImage color="#0A66C2" size={16} />
                Add cover
              </button>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                type="button"
                onClick={closeArticleModal}
                style={{
                  background: 'transparent',
                  color: '#666',
                  border: '1px solid #ccc',
                  borderRadius: '20px',
                  padding: '8px 18px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublishArticle}
                disabled={!canPublishArticle}
                style={{
                  backgroundColor: canPublishArticle ? '#0A66C2' : '#e0e0df',
                  color: canPublishArticle ? '#fff' : '#666',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '8px 20px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: canPublishArticle ? 'pointer' : 'not-allowed',
                }}
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
          <img src={composerAvatar} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
          <div style={{ display: 'flex', flex: 1, gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder={feedPermissions.placeholder}
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              disabled={!feedPermissions.canPost}
              style={{
                flex: 1,
                minWidth: '200px',
                borderRadius: '24px',
                border: '1px solid #666',
                padding: '0 16px',
                fontSize: '14px',
                outline: 'none',
                opacity: feedPermissions.canPost ? 1 : 0.6,
              }}
            />
            <button
              type="button"
              onClick={handlePostSubmit}
              disabled={!canSubmitPost}
              style={{
                backgroundColor: canSubmitPost ? '#0A66C2' : '#e0e0df',
                color: canSubmitPost ? '#fff' : '#00000099',
                borderRadius: '24px',
                padding: '0 16px',
                fontWeight: '600',
                border: 'none',
                cursor: canSubmitPost ? 'pointer' : 'not-allowed',
              }}
            >
              Post
            </button>
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#666', margin: '0 0 12px 56px', lineHeight: 1.4 }}>{feedPermissions.helper}</p>
        {composerImage ? (
          <div style={{ margin: '0 0 12px 56px', position: 'relative', maxWidth: '420px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e0e0df' }}>
            <img src={composerImage} alt="" style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', display: 'block' }} />
            <button
              type="button"
              aria-label="Remove image"
              onClick={() => setComposerImage(null)}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(0,0,0,0.65)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FaTimes size={14} />
            </button>
          </div>
        ) : null}
        <input
          ref={mediaInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          style={{ display: 'none' }}
          onChange={(e) => {
            handleComposerMedia(e.target.files);
            e.target.value = '';
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px', flexWrap: 'wrap', gap: '4px' }}>
          <button
            type="button"
            title={feedPermissions.canPost ? 'Add media to your post' : 'Posting disabled'}
            disabled={!feedPermissions.canPost}
            onClick={() => feedPermissions.canPost && mediaInputRef.current?.click()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#666',
              fontSize: '14px',
              fontWeight: '600',
              padding: '12px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              cursor: feedPermissions.canPost ? 'pointer' : 'not-allowed',
              opacity: feedPermissions.canPost ? 1 : 0.55,
            }}
          >
            <FaImage color="#0A66C2" size={18} />
            Media
          </button>
          <button
            type="button"
            title="Create an event"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#666', fontSize: '14px', fontWeight: '600', padding: '12px 8px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <FaCalendarAlt color="#c37d16" size={18} />
            Event
          </button>
          <button
            type="button"
            title={feedPermissions.canPost ? 'Write an article' : 'Posting disabled'}
            disabled={!feedPermissions.canPost}
            onClick={() => feedPermissions.canPost && setArticleModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#666',
              fontSize: '14px',
              fontWeight: '600',
              padding: '12px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              cursor: feedPermissions.canPost ? 'pointer' : 'not-allowed',
              opacity: feedPermissions.canPost ? 1 : 0.55,
            }}
          >
            <FaNewspaper color="#e16745" size={18} />
            Write article
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#e0e0df' }} />
        <span style={{ fontSize: '12px', color: '#666' }}>
          Sort by:{' '}
          <span style={{ color: '#000000e6', fontWeight: '600', cursor: 'pointer' }}>Top ▼</span>
        </span>
      </div>

      {posts.map((post) => (
        <div key={post.id} className="card" style={{ padding: '16px 0 0 0', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', padding: '0 16px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(post.author)}&background=random&color=fff&size=48`}
                alt=""
                style={{ borderRadius: '50%', width: 48, height: 48 }}
              />
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#000000e6' }}>{post.author}</h3>
                <p style={{ fontSize: '12px', color: '#666' }}>{post.headline}</p>
                <p style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {post.time} • <FaCompass size={10} />
                </p>
              </div>
            </div>
            {canModifyPost(post) ? (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  aria-label="Post options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuPostId(menuPostId === post.id ? null : post.id);
                  }}
                  style={{ color: '#666', height: 'fit-content', border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px' }}
                >
                  <FaEllipsisH />
                </button>
                {menuPostId === post.id && (
                  <div
                    role="menu"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      marginTop: 4,
                      background: '#fff',
                      border: '1px solid #e0e0df',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                      minWidth: '140px',
                      zIndex: 5,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => startEdit(post)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '10px 14px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: '14px',
                        textAlign: 'left',
                      }}
                    >
                      <FaPencilAlt size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDelete(post.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '10px 14px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: '#cc1010',
                        textAlign: 'left',
                      }}
                    >
                      <FaTrash size={14} /> Delete
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div style={{ fontSize: '14px', color: '#000000e6', marginBottom: '12px', padding: '0 16px' }}>
            {editingId === post.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {post.articleTitle != null ? (
                  <>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>Article headline</label>
                    <input
                      type="text"
                      value={editArticleTitle}
                      onChange={(e) => setEditArticleTitle(e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #ccc',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}
                    />
                  </>
                ) : null}
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={post.articleTitle != null ? 8 : 4}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={saveEdit} style={{ backgroundColor: '#0A66C2', color: '#fff', border: 'none', borderRadius: '20px', padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }}>
                    Save
                  </button>
                  <button type="button" onClick={cancelEdit} style={{ backgroundColor: 'transparent', color: '#666', border: '1px solid #ccc', borderRadius: '20px', padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {post.articleTitle ? (
                  <>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#e16745',
                        marginBottom: '8px',
                      }}
                    >
                      <FaNewspaper size={14} aria-hidden />
                      Article
                    </div>
                    <h2 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 700, color: '#000000e6', lineHeight: 1.3 }}>
                      {post.articleTitle}
                    </h2>
                    {post.image ? (
                      <div
                        style={{
                          margin: '0 -16px 14px',
                          backgroundColor: '#eef3f8',
                          borderTop: '1px solid #e8e6ef',
                          borderBottom: '1px solid #e8e6ef',
                        }}
                      >
                        <img src={post.image} alt="" style={{ width: '100%', maxHeight: '320px', objectFit: 'cover', display: 'block' }} />
                      </div>
                    ) : null}
                    <p style={{ margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{post.content}</p>
                  </>
                ) : (
                  <>
                    {post.content}
                    {post.repostQuote ? (
                      <div
                        style={{
                          marginTop: '12px',
                          border: '1px solid #e0e0df',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          backgroundColor: '#F3F2F0',
                        }}
                      >
                        <div style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <img
                              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(post.repostQuote.author)}&background=random&color=fff&size=40`}
                              alt=""
                              style={{ borderRadius: '50%', width: 40, height: 40 }}
                            />
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: 600, color: '#000000e6' }}>{post.repostQuote.author}</div>
                              <div style={{ fontSize: '12px', color: '#666' }}>{post.repostQuote.headline}</div>
                              <div style={{ fontSize: '12px', color: '#666' }}>{post.repostQuote.time}</div>
                            </div>
                          </div>
                          {post.repostQuote.articleTitle ? (
                            <div style={{ marginBottom: '10px' }}>
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: '#e16745',
                                  marginBottom: '4px',
                                }}
                              >
                                <FaNewspaper size={12} aria-hidden />
                                Article
                              </div>
                              <div style={{ fontSize: '15px', fontWeight: 700, color: '#000000e6', lineHeight: 1.35 }}>
                                {post.repostQuote.articleTitle}
                              </div>
                            </div>
                          ) : null}
                          <p style={{ margin: 0, fontSize: '14px', color: '#000000e6', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                            {post.repostQuote.content}
                          </p>
                        </div>
                        {post.repostQuote.image ? (
                          <div style={{ backgroundColor: '#eef3f8' }}>
                            <img src={post.repostQuote.image} alt="" style={{ width: '100%', display: 'block' }} />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </>
            )}
          </div>

          {post.image && !post.repostQuote && !post.articleTitle ? (
            <div style={{ width: '100%', marginBottom: '12px', backgroundColor: '#eef3f8' }}>
              <img src={post.image} alt="" style={{ width: '100%', display: 'block' }} />
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 16px',
              borderTop: '1px solid #e0e0df',
              borderBottom: '1px solid #e0e0df',
              fontSize: '12px',
              color: '#666',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FaThumbsUp color="#0A66C2" size={14} /> {post.likes}
            </span>
            <span style={{ textAlign: 'right' }}>
              {commentCountLabel(post.comments || 0)}
              {(post.reposts || 0) > 0 ? ` · ${post.reposts} reposts` : ''}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'stretch',
              width: '100%',
              boxSizing: 'border-box',
              margin: 0,
              padding: '4px 6px',
              borderBottom: '1px solid #e0e0df',
              backgroundColor: '#faf9fc',
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePostLike(post.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                flex: 1,
                padding: '10px 6px',
                color: post.likedByMe ? '#0A66C2' : '#666',
                fontWeight: '600',
                fontSize: '14px',
                borderRadius: '6px',
                border: 'none',
                background: post.likedByMe ? 'rgba(10, 102, 194, 0.12)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <FaThumbsUp size={18} /> Like
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleComment(post.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                flex: 1,
                padding: '10px 6px',
                color: commentOpenPostId === post.id ? '#0A66C2' : '#666',
                fontWeight: '600',
                fontSize: '14px',
                borderRadius: '6px',
                border: 'none',
                background: commentOpenPostId === post.id ? 'rgba(10, 102, 194, 0.12)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <FaComment size={18} /> Comment
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleRepost(post.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                flex: 1,
                padding: '10px 6px',
                color: repostOpenPostId === post.id || post.repostedByMe ? '#0A66C2' : '#666',
                fontWeight: '600',
                fontSize: '14px',
                borderRadius: '6px',
                border: 'none',
                background:
                  repostOpenPostId === post.id || post.repostedByMe ? 'rgba(10, 102, 194, 0.12)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <FaRetweet size={18} /> Repost
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSend(post);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                flex: 1,
                padding: '10px 6px',
                color: '#666',
                fontWeight: '600',
                fontSize: '14px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <FaPaperPlane size={18} /> Send
            </button>
          </div>

          {repostOpenPostId === post.id ? (
            <div style={{ padding: '14px 16px 16px', borderBottom: '1px solid #e0e0df', backgroundColor: '#fff' }}>
              <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: '#000000e6' }}>Repost with your thoughts</p>
              <textarea
                value={repostThoughts}
                onChange={(e) => setRepostThoughts(e.target.value)}
                placeholder="What do you want to say about this post?"
                rows={3}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cfcfce',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  marginBottom: '10px',
                  outline: 'none',
                }}
              />
              <div
                style={{
                  border: '1px solid #e0e0df',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '12px',
                  backgroundColor: '#f9f8fc',
                  fontSize: '13px',
                  color: '#555',
                }}
              >
                <span style={{ fontWeight: 600, color: '#000000cc' }}>{post.author}</span>
                <span style={{ color: '#666', marginLeft: '6px' }}>· {post.time}</span>
                {post.articleTitle ? (
                  <>
                    <p style={{ margin: '8px 0 4px', fontSize: '12px', fontWeight: 600, color: '#e16745' }}>Article</p>
                    <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#111', lineHeight: 1.35 }}>{post.articleTitle}</p>
                  </>
                ) : null}
                <p style={{ margin: post.articleTitle ? '0' : '8px 0 0', lineHeight: 1.4, color: '#333', whiteSpace: 'pre-wrap' }}>
                  {post.content}
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleSubmitRepost(post.id)}
                  disabled={!repostThoughts.trim()}
                  style={{
                    backgroundColor: repostThoughts.trim() ? '#0A66C2' : '#e0e0df',
                    color: repostThoughts.trim() ? '#fff' : '#666',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '8px 18px',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: repostThoughts.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Post repost
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickRepostOnly(post.id)}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#004182',
                    border: '1px solid #CCE4F7',
                    borderRadius: '20px',
                    padding: '8px 16px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Quick repost (no note)
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleRepost(post.id)}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#666',
                    border: 'none',
                    padding: '8px 12px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    marginLeft: 'auto',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {commentOpenPostId === post.id ? (
            <div style={{ padding: '12px 16px 16px', borderTop: '1px solid #f0eef5', marginTop: 0 }}>
              {(post.commentList || []).length > 0 ? (
                <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(post.commentList || []).map((c) => (
                    <li key={c.id} style={{ fontSize: '13px', lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600, color: '#000000e6' }}>{c.author}</span>
                      <span style={{ color: '#666', fontWeight: 400, marginLeft: '6px', fontSize: '12px' }}>{c.time}</span>
                      <p style={{ margin: '4px 0 0', color: '#333' }}>{c.text}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddComment(post.id);
                  }}
                  placeholder="Add a comment…"
                  style={{
                    flex: 1,
                    height: '36px',
                    borderRadius: '20px',
                    border: '1px solid #cfcfce',
                    padding: '0 14px',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleAddComment(post.id)}
                  disabled={!commentInput.trim()}
                  style={{
                    backgroundColor: commentInput.trim() ? '#0A66C2' : '#e0e0df',
                    color: commentInput.trim() ? '#fff' : '#666',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '0 16px',
                    height: '36px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: commentInput.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Post
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};

export default MainFeed;
