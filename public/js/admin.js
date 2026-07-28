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

/* Post editor: media insert modal */
(function () {
  const modal = document.querySelector('[data-media-modal]');
  const list = document.querySelector('[data-media-list]');
  const body = document.getElementById('bodyMd');
  const coverInput = document.querySelector('[data-cover-image]');
  const openBtns = document.querySelectorAll('[data-media-open], [data-cover-from-media]');
  if (!modal || !list) return;

  const qInput = modal.querySelector('[data-media-q]');
  const typeSelect = modal.querySelector('[data-media-type]');
  const prevBtn = modal.querySelector('[data-media-prev]');
  const nextBtn = modal.querySelector('[data-media-next]');
  const pageLabel = modal.querySelector('[data-media-page-label]');
  const closeEls = modal.querySelectorAll('[data-media-close]');

  let page = 1;
  let totalPages = 0;
  let pickMode = 'insert'; // insert | cover
  let searchTimer = null;

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

  function openModal(mode) {
    pickMode = mode || 'insert';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    page = 1;
    loadMedia();
    if (qInput) qInput.focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  async function loadMedia() {
    list.innerHTML = '<p class="muted">Loading…</p>';
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '24');
    const q = qInput ? qInput.value.trim() : '';
    const type = typeSelect ? typeSelect.value : '';
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
          '<p class="muted">No media found. Upload in the library first.</p>';
        return;
      }

      list.innerHTML = '';
      data.items.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'media-embed-item';
        btn.title = item.filename || item.url;
        const imgSrc = item.thumbUrl || (item.type !== 'video' ? item.url : '');
        btn.innerHTML = imgSrc
          ? `<img src="${imgSrc}" alt="" loading="lazy" /><span>${item.type}</span>`
          : `<span class="media-card__video-ph">VIDEO</span><span>${item.type}</span>`;
        btn.addEventListener('click', () => {
          if (pickMode === 'cover' && coverInput) {
            coverInput.value = item.url || '';
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
    } catch {
      list.innerHTML = '<p class="muted">Could not load media.</p>';
    }
  }

  openBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.hasAttribute('data-cover-from-media') ? 'cover' : 'insert';
      openModal(mode);
    });
  });

  closeEls.forEach((el) => el.addEventListener('click', closeModal));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
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
    prevBtn.addEventListener('click', () => {
      if (page > 1) {
        page -= 1;
        loadMedia();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (page < totalPages) {
        page += 1;
        loadMedia();
      }
    });
  }
})();
