'use strict';

const config = require('../config');
const usersService = require('../services/users');
const postsService = require('../services/posts');
const categoriesService = require('../services/categories');
const tagsService = require('../services/tags');
const settingsService = require('../services/settings');
const commentsService = require('../services/comments');
const { paths, slugify, isValidSlug } = require('../utils/slug');
const { isValidId } = require('../utils/uuid');
const { renderMarkdown, plainExcerpt } = require('../utils/markdown');
const { formatDate } = require('../utils/format');
const { safeAdminReturnTo } = require('../utils/returnTo');

function asArray(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Resolve category/tag checkboxes + optional new names.
 * @param {import('express').Request} req
 */
async function resolveTaxonomies(req) {
  const categoryIds = asArray(req.body.categoryIds).filter(isValidId);
  const tagIds = asArray(req.body.tagIds).filter(isValidId);

  const newCategories = String(req.body.newCategories || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const name of newCategories) {
    const existing = categoriesService.getBySlug(slugify(name));
    if (existing) {
      if (!categoryIds.includes(existing.id)) categoryIds.push(existing.id);
      continue;
    }
    try {
      const created = await categoriesService.createCategory({ name });
      categoryIds.push(created.id);
    } catch {
      // skip invalid reserved names
    }
  }

  const newTags = String(req.body.newTags || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const name of newTags) {
    const existing = tagsService.getBySlug(slugify(name));
    if (existing) {
      if (!tagIds.includes(existing.id)) tagIds.push(existing.id);
      continue;
    }
    try {
      const created = await tagsService.createTag({ name });
      tagIds.push(created.id);
    } catch {
      // skip invalid
    }
  }

  return { categoryIds, tagIds };
}

function parsePostBody(req) {
  const title = String(req.body.title || '').trim();
  const slug = String(req.body.slug || '').trim();
  const excerpt = String(req.body.excerpt || '').trim();
  const bodyMd = String(req.body.bodyMd || '');
  const status = req.body.status === 'published' ? 'published' : 'draft';
  const updateSlug = req.body.updateSlug === '1' || req.body.updateSlug === 'on';

  return { title, slug, excerpt, bodyMd, status, updateSlug };
}

function loginForm(req, res) {
  res.render('admin/login', {
    title: 'Admin Login',
    error: null,
    username: '',
  });
}

async function loginSubmit(req, res) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  const user = await usersService.authenticate(username, password);
  if (!user) {
    return res.status(401).render('admin/login', {
      title: 'Admin Login',
      error: 'Invalid username or password.',
      username,
    });
  }

  req.session.user = user;
  const returnTo = req.session.returnTo || paths.admin.home();
  delete req.session.returnTo;

  req.session.save(() => {
    res.redirect(returnTo);
  });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect(paths.admin.login());
  });
}

function dashboard(_req, res) {
  const published = postsService.listPosts({ status: 'published', limit: 5 });
  const drafts = postsService.listPosts({ status: 'draft', limit: 5 });
  const all = postsService.listPosts({ status: 'all', limit: 1 });
  const pendingComments = commentsService.countPending();

  res.render('admin/dashboard', {
    title: 'Dashboard',
    stats: {
      total: all.total,
      published: published.total,
      drafts: drafts.total,
      categories: categoriesService.listCategories().length,
      tags: tagsService.listTags().length,
      pendingComments,
    },
    recentPublished: published.items,
    recentDrafts: drafts.items,
    formatDate,
  });
}

function commentsList(req, res) {
  const status = req.query.status || 'pending';
  const page = Math.max(1, Number(req.query.page) || 1);
  const result = commentsService.listForAdmin({ status, page, limit: 30 });

  res.render('admin/comments', {
    title: 'Comments',
    ...result,
    formatDate,
  });
}

function commentApprove(req, res, next) {
  const { id } = req.params;
  if (!isValidId(id)) return next();
  commentsService.setStatus(id, 'approved');
  req.flash('ok', 'Comment approved.');
  res.redirect(`${paths.admin.comments()}?status=${req.body.status || 'pending'}`);
}

function commentReject(req, res, next) {
  const { id } = req.params;
  if (!isValidId(id)) return next();
  commentsService.setStatus(id, 'rejected');
  req.flash('ok', 'Comment rejected.');
  res.redirect(`${paths.admin.comments()}?status=${req.body.status || 'pending'}`);
}

function commentDelete(req, res, next) {
  const { id } = req.params;
  if (!isValidId(id)) return next();
  commentsService.deleteComment(id);
  req.flash('ok', 'Comment deleted.');
  res.redirect(`${paths.admin.comments()}?status=${req.body.status || 'all'}`);
}

function postsList(req, res) {
  const status = ['published', 'draft', 'all'].includes(req.query.status)
    ? req.query.status
    : 'all';
  const page = Math.max(1, Number(req.query.page) || 1);
  const result = postsService.listPosts({ status, page, limit: 20 });

  res.render('admin/posts-list', {
    title: 'Posts',
    posts: result.items,
    pagination: result,
    statusFilter: status,
    formatDate,
    paths,
  });
}

function takeFormDraft(req, mode, postId) {
  const draft = req.session?.postFormDraft;
  if (!draft) return null;
  if (draft.mode !== mode) return null;
  if (mode === 'edit' && draft.postId !== postId) return null;
  return draft;
}

function clearFormDraft(req) {
  if (req.session) delete req.session.postFormDraft;
}

function postNewGet(req, res) {
  const draft = takeFormDraft(req, 'create');
  const post = draft
    ? {
        title: draft.title || '',
        slug: draft.slug || '',
        excerpt: draft.excerpt || '',
        bodyMd: draft.bodyMd || '',
        status: draft.status || 'draft',
        categories: [],
        tags: [],
      }
    : {
        title: '',
        slug: '',
        excerpt: '',
        bodyMd: '',
        status: 'draft',
        categories: [],
        tags: [],
      };

  // One-time restore after preview; clear so refresh stays clean
  if (draft) clearFormDraft(req);

  res.render('admin/post-form', {
    title: 'New post',
    mode: 'create',
    post,
    categories: categoriesService.listCategories(),
    tags: tagsService.listTags(),
    error: null,
    selectedCategoryIds: draft?.categoryIds || [],
    selectedTagIds: draft?.tagIds || [],
    newCategories: draft?.newCategories || '',
    newTags: draft?.newTags || '',
  });
}

async function postCreate(req, res) {
  const data = parsePostBody(req);
  const { categoryIds, tagIds } = await resolveTaxonomies(req);

  if (!data.title) {
    return res.status(400).render('admin/post-form', {
      title: 'New post',
      mode: 'create',
      post: { ...data, categories: [], tags: [] },
      categories: categoriesService.listCategories(),
      tags: tagsService.listTags(),
      error: 'Title is required.',
      selectedCategoryIds: categoryIds,
      selectedTagIds: tagIds,
    });
  }

  try {
    const post = await postsService.createPost({
      title: data.title,
      slug: data.slug || undefined,
      excerpt: data.excerpt,
      bodyMd: data.bodyMd,
      status: data.status,
      authorId: req.session.user.id,
      categoryIds,
      tagIds,
    });

    clearFormDraft(req);
    req.flash('ok', `Post “${post.title}” created.`);
    return res.redirect(paths.admin.postEdit(post.id));
  } catch (err) {
    return res.status(err.status || 400).render('admin/post-form', {
      title: 'New post',
      mode: 'create',
      post: { ...data, categories: [], tags: [] },
      categories: categoriesService.listCategories(),
      tags: tagsService.listTags(),
      error: err.message || 'Could not create post.',
      selectedCategoryIds: categoryIds,
      selectedTagIds: tagIds,
    });
  }
}

function postEditGet(req, res, next) {
  const { id } = req.params;
  if (!isValidId(id)) return next();

  const post = postsService.getById(id);
  if (!post) return next();

  const draft = takeFormDraft(req, 'edit', id);
  if (draft) clearFormDraft(req);

  const formPost = draft
    ? {
        ...post,
        title: draft.title,
        slug: draft.slug,
        excerpt: draft.excerpt,
        bodyMd: draft.bodyMd,
        status: draft.status,
      }
    : post;

  res.render('admin/post-form', {
    title: `Edit: ${formPost.title}`,
    mode: 'edit',
    post: formPost,
    categories: categoriesService.listCategories(),
    tags: tagsService.listTags(),
    error: null,
    selectedCategoryIds: draft?.categoryIds || (post.categories || []).map((c) => c.id),
    selectedTagIds: draft?.tagIds || (post.tags || []).map((t) => t.id),
    newCategories: draft?.newCategories || '',
    newTags: draft?.newTags || '',
  });
}

async function postUpdate(req, res, next) {
  const { id } = req.params;
  if (!isValidId(id)) return next();

  const existing = postsService.getById(id);
  if (!existing) return next();

  const data = parsePostBody(req);
  const { categoryIds, tagIds } = await resolveTaxonomies(req);

  if (!data.title) {
    return res.status(400).render('admin/post-form', {
      title: `Edit: ${existing.title}`,
      mode: 'edit',
      post: { ...existing, ...data },
      categories: categoriesService.listCategories(),
      tags: tagsService.listTags(),
      error: 'Title is required.',
      selectedCategoryIds: categoryIds,
      selectedTagIds: tagIds,
    });
  }

  try {
    const post = await postsService.updatePost(id, {
      title: data.title,
      // Manual slug when not regenerating from title
      slug: data.updateSlug ? undefined : data.slug || undefined,
      excerpt: data.excerpt,
      bodyMd: data.bodyMd,
      status: data.status,
      categoryIds,
      tagIds,
      // Regenerate unique slug from title when checked
      updateSlug: data.updateSlug,
    });

    clearFormDraft(req);
    req.flash('ok', `Post “${post.title}” saved.`);
    return res.redirect(paths.admin.postEdit(id));
  } catch (err) {
    return res.status(err.status || 400).render('admin/post-form', {
      title: `Edit: ${existing.title}`,
      mode: 'edit',
      post: { ...existing, ...data },
      categories: categoriesService.listCategories(),
      tags: tagsService.listTags(),
      error: err.message || 'Could not update post.',
      selectedCategoryIds: categoryIds,
      selectedTagIds: tagIds,
    });
  }
}

function postDelete(req, res, next) {
  const { id } = req.params;
  if (!isValidId(id)) return next();

  const existing = postsService.getById(id);
  if (!existing) return next();

  postsService.deletePost(id);
  clearFormDraft(req);
  req.flash('ok', `Deleted “${existing.title}”.`);
  res.redirect(paths.admin.posts());
}

/**
 * Persist current editor fields in session (create or edit).
 * @returns {{ mode: string, postId: string|null, editorHref: string }}
 */
function saveFormDraftFromRequest(req) {
  const data = parsePostBody(req);
  const mode = req.body._mode === 'edit' ? 'edit' : 'create';
  const postId = isValidId(req.body._postId) ? req.body._postId : null;

  const categoryIds = asArray(req.body.categoryIds).filter(isValidId);
  const tagIds = asArray(req.body.tagIds).filter(isValidId);
  const newCategories = String(req.body.newCategories || '');
  const newTags = String(req.body.newTags || '');

  req.session.postFormDraft = {
    mode,
    postId,
    title: data.title,
    slug: data.slug,
    excerpt: data.excerpt,
    bodyMd: data.bodyMd,
    status: data.status,
    updateSlug: data.updateSlug,
    categoryIds,
    tagIds,
    newCategories,
    newTags,
  };

  const editorHref =
    mode === 'edit' && postId ? paths.admin.postEdit(postId) : paths.admin.postNew();

  return { mode, postId, editorHref, data };
}

/**
 * Save draft then open media library; after upload, return to the editor.
 */
function postDraftForMedia(req, res) {
  const mode = req.body._mode === 'edit' ? 'edit' : 'create';
  const postId = isValidId(req.body._postId) ? req.body._postId : null;

  if (mode === 'edit' && !postId) {
    req.flash('error', 'Missing post id.');
    return res.redirect(paths.admin.posts());
  }

  const { editorHref } = saveFormDraftFromRequest(req);
  const mediaUrl = `${paths.admin.media()}?returnTo=${encodeURIComponent(editorHref)}`;

  req.flash('ok', 'Post draft saved temporarily. Upload media, then return to your post.');
  req.session.save(() => {
    res.redirect(mediaUrl);
  });
}

/**
 * Preview current form fields without saving (create or edit).
 * Stores draft in session so "Back to editor" restores fields.
 */
function postPreviewForm(req, res) {
  const mode = req.body._mode === 'edit' ? 'edit' : 'create';
  const postId = isValidId(req.body._postId) ? req.body._postId : null;

  if (mode === 'edit' && !postId) {
    req.flash('error', 'Missing post id for edit preview.');
    return res.redirect(paths.admin.posts());
  }

  const { editorHref, data } = saveFormDraftFromRequest(req);

  const slugGuess =
    slugify(data.slug || data.title || '') ||
    (mode === 'edit' && postId ? postsService.getById(postId)?.slug : null) ||
    'untitled';

  const bodyHtml = renderMarkdown(data.bodyMd || '');
  const excerpt = data.excerpt || plainExcerpt(data.bodyMd || '');
  const author = req.session.user
    ? {
        id: req.session.user.id,
        displayName: req.session.user.displayName,
        username: req.session.user.username,
      }
    : null;

  req.session.save(() => {
    res.render('admin/preview', {
      title: `Preview: ${data.title || 'Untitled'}`,
      post: {
        id: postId,
        title: data.title || 'Untitled',
        slug: slugGuess,
        excerpt,
        bodyHtml,
        status: data.status,
        publishedLabel: formatDate(new Date().toISOString()),
        author,
        url: paths.post(slugGuess),
      },
      isDraft: data.status !== 'published',
      isFormPreview: true,
      backHref: editorHref,
    });
  });
}

function postPreview(req, res, next) {
  const { id } = req.params;
  if (!isValidId(id)) return next();

  const post = postsService.getById(id);
  if (!post) return next();

  const bodyHtml = renderMarkdown(post.bodyMd);
  const excerpt = post.excerpt || plainExcerpt(post.bodyMd);

  res.render('admin/preview', {
    title: `Preview: ${post.title}`,
    post: {
      ...post,
      bodyHtml,
      excerpt,
      publishedLabel: formatDate(post.publishedAt || post.createdAt),
      url: paths.post(post.slug),
    },
    isDraft: post.status !== 'published',
    isFormPreview: false,
    backHref: paths.admin.postEdit(post.id),
  });
}

function settingsGet(_req, res) {
  const all = settingsService.getAll();
  const authors = usersService.listUsers();

  res.render('admin/settings', {
    title: 'Settings',
    settings: {
      site_title: all.site_title || config.siteName,
      site_description: all.site_description || '',
      posts_per_page: all.posts_per_page || '10',
    },
    authors,
    error: null,
  });
}

function settingsPost(req, res) {
  const site_title = String(req.body.site_title || '').trim() || config.siteName;
  const site_description = String(req.body.site_description || '').trim();
  let posts_per_page = Number(req.body.posts_per_page) || 10;
  posts_per_page = String(Math.min(50, Math.max(1, posts_per_page)));

  settingsService.setMany({
    site_title,
    site_description,
    posts_per_page,
  });

  // Optional author bio updates
  const authorIds = asArray(req.body.authorId).filter(isValidId);
  for (const id of authorIds) {
    const displayName = String(req.body[`displayName_${id}`] || '').trim();
    const bio = String(req.body[`bio_${id}`] || '');
    if (displayName) {
      usersService.updateProfile(id, { displayName, bio });
    }
  }

  // Refresh session display name if current user updated
  if (req.session.user) {
    const me = usersService.getById(req.session.user.id);
    if (me) {
      req.session.user = {
        id: me.id,
        username: me.username,
        displayName: me.displayName,
        bio: me.bio,
      };
    }
  }

  req.flash('ok', 'Settings saved.');
  res.redirect(paths.admin.settings());
}

module.exports = {
  loginForm,
  loginSubmit,
  logout,
  dashboard,
  postsList,
  postNewGet,
  postCreate,
  postEditGet,
  postUpdate,
  postDelete,
  postPreview,
  postPreviewForm,
  postDraftForMedia,
  settingsGet,
  settingsPost,
  commentsList,
  commentApprove,
  commentReject,
  commentDelete,
  // exported for tests
  resolveTaxonomies,
  isValidSlug,
};
