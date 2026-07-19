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

/* Post editor: media insert panel */
(function () {
  const panel = document.querySelector('[data-media-embed]');
  const list = document.querySelector('[data-media-list]');
  const body = document.getElementById('bodyMd');
  const refreshBtn = document.querySelector('[data-media-refresh]');
  if (!panel || !list || !body) return;

  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = value.slice(0, start) + text + value.slice(end);
    const pos = start + text.length;
    textarea.selectionStart = pos;
    textarea.selectionEnd = pos;
    textarea.focus();
  }

  async function loadMedia() {
    list.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const res = await fetch('/admin/media.json', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to load media');
      const data = await res.json();
      if (!data.items || !data.items.length) {
        list.innerHTML =
          '<p class="muted">No media yet. <a href="/admin/media">Upload in the library</a>.</p>';
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
          insertAtCursor(body, item.markdown || `\n\n![](${item.url})\n\n`);
        });
        list.appendChild(btn);
      });
    } catch {
      list.innerHTML = '<p class="muted">Could not load media.</p>';
    }
  }

  if (refreshBtn) refreshBtn.addEventListener('click', loadMedia);
  loadMedia();
})();
