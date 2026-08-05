/* Admin helpers */
(function () {
  const title = document.getElementById('title');
  const slug = document.getElementById('slug');
  const preview = document.querySelector('[data-slug-preview]');
  if (slug && preview) {
    function slugify(input) {
      return String(input || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120);
    }

    function syncPreview() {
      const value = slug.value.trim() || (title ? slugify(title.value) : '') || '…';
      preview.textContent = value;
    }

    slug.addEventListener('input', syncPreview);
    if (title && !slug.defaultValue) {
      title.addEventListener('input', () => {
        if (!slug.dataset.touched) {
          slug.value = slugify(title.value);
          syncPreview();
        }
      });
    }
    slug.addEventListener('input', () => {
      slug.dataset.touched = '1';
    });
    syncPreview();
  }
})();

/* Copy URL / markdown buttons */
(function () {
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(text);
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = prev;
        }, 1200);
      } catch {
        window.prompt('Copy:', text);
      }
    });
  });
})();

/* Post editor: media insert modal + backdrop list */
(function () {
  const modal = document.querySelector('[data-media-modal]');
  const list = modal ? modal.querySelector('[data-media-list]') : null;
  const body = document.getElementById('bodyMd');
  const coverInput = document.querySelector('[data-cover-image]');
  const backdropList = document.querySelector('[data-backdrop-list]');

  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = value.slice(0, start) + text + value.slice(end);
    const pos = start + text.length;
    textarea.selectionStart = pos;
    textarea.selectionEnd = pos;
    textarea.focus();
  }

  function addBackdropRow(url) {
    const listEl = document.querySelector('[data-backdrop-list]');
    if (!listEl) {
      // eslint-disable-next-line no-console
      console.warn('[admin] backdrop list not found');
      return;
    }
    const li = document.createElement('li');
    li.className = 'backdrop-list__item';
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'backdropImages';
    input.maxLength = 500;
    input.value = String(url || '');
    input.placeholder = '/uploads/images/….webp';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-ghost btn-sm';
    removeBtn.setAttribute('data-backdrop-remove', '');
    removeBtn.textContent = 'Remove';
    li.appendChild(input);
    li.appendChild(removeBtn);
    listEl.appendChild(li);
    input.focus();
  }

  // —— Backdrop list controls (work even if modal is missing) ——
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;

    if (t.closest('[data-backdrop-add-empty]')) {
      e.preventDefault();
      e.stopPropagation();
      addBackdropRow('');
      return;
    }

    if (t.closest('[data-backdrop-remove]')) {
      e.preventDefault();
      const li = t.closest('.backdrop-list__item');
      if (li) li.remove();
      return;
    }

    if (t.closest('[data-backdrop-add-media]')) {
      e.preventDefault();
      e.stopPropagation();
      openModal('backdrop');
      return;
    }

    if (t.closest('[data-cover-from-media]')) {
      e.preventDefault();
      e.stopPropagation();
      openModal('cover');
      return;
    }

    if (t.closest('[data-media-open]')) {
      e.preventDefault();
      e.stopPropagation();
      openModal('insert');
    }
  });

  if (!modal || !list) {
    // eslint-disable-next-line no-console
    console.warn('[admin] media modal markup missing — picker disabled');
    return;
  }

  const qInput = modal.querySelector('[data-media-q]');
  const typeSelect = modal.querySelector('[data-media-type]');
  const prevBtn = modal.querySelector('[data-media-prev]');
  const nextBtn = modal.querySelector('[data-media-next]');
  const pageLabel = modal.querySelector('[data-media-page-label]');

  let page = 1;
  let totalPages = 0;
  /** @type {'insert'|'cover'|'backdrop'} */
  let pickMode = 'insert';
  let searchTimer = null;

  function openModal(mode) {
    if (!modal || !list) {
      // Fallback: jump to media library
      window.location.href = '/mantri/media';
      return;
    }
    pickMode = mode || 'insert';
    modal.hidden = false;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    page = 1;
    if (typeSelect && (pickMode === 'cover' || pickMode === 'backdrop')) {
      // Prefer images for stills
      if (!typeSelect.value) typeSelect.value = 'image';
    }
    loadMedia();
    if (qInput) {
      try {
        qInput.focus();
      } catch {
        /* ignore */
      }
    }
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  async function loadMedia() {
    if (!list) return;
    list.innerHTML = '<p class="muted">Loading…</p>';
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '24');
    const q = qInput ? qInput.value.trim() : '';
    let type = typeSelect ? typeSelect.value : '';
    if ((pickMode === 'cover' || pickMode === 'backdrop') && !type) {
      type = 'image';
    }
    if (q) params.set('q', q);
    if (type) params.set('type', type);

    try {
      const res = await fetch(`/mantri/media.json?${params}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      totalPages = data.totalPages || 0;
      if (pageLabel) {
        pageLabel.textContent =
          totalPages > 0
            ? `Page ${data.page} / ${totalPages} · ${data.total} file(s)`
            : 'No results';
      }
      if (prevBtn) prevBtn.disabled = page <= 1;
      if (nextBtn) nextBtn.disabled = !totalPages || page >= totalPages;

      if (!data.items || !data.items.length) {
        list.innerHTML =
          '<p class="muted">No media found. <a href="/mantri/media">Open library to upload</a>.</p>';
        return;
      }

      list.innerHTML = '';
      data.items.forEach((item) => {
        if (pickMode !== 'insert' && item.type === 'video') return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'media-embed-item';
        btn.title = item.filename || item.url;
        const imgSrc = item.thumbUrl || (item.type !== 'video' ? item.url : '');
        btn.innerHTML = imgSrc
          ? `<img src="${imgSrc}" alt="" loading="lazy" /><span>${item.type}</span>`
          : `<span class="media-card__video-ph">VIDEO</span><span>${item.type}</span>`;
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          if (pickMode === 'cover' && coverInput) {
            coverInput.value = item.url || '';
            closeModal();
            return;
          }
          if (pickMode === 'backdrop') {
            addBackdropRow(item.url || '');
            closeModal();
            return;
          }
          if (body) {
            insertAtCursor(body, item.markdown || `\n\n![](${item.url})\n\n`);
          }
          closeModal();
        });
        list.appendChild(btn);
      });
      if (!list.children.length) {
        list.innerHTML = '<p class="muted">No still images in this filter.</p>';
      }
    } catch {
      list.innerHTML =
        '<p class="muted">Could not load media. <a href="/mantri/media">Open library</a>.</p>';
    }
  }

  modal.querySelectorAll('[data-media-close]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });

  if (qInput) {
    qInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        page = 1;
        loadMedia();
      }, 250);
    });
  }
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      page = 1;
      loadMedia();
    });
  }
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (page > 1) {
        page -= 1;
        loadMedia();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (page < totalPages) {
        page += 1;
        loadMedia();
      }
    });
  }
})();
