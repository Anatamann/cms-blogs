# Instructions for Grok Build AI Agent: Anime Blogging Website

## Project Overview
Build a sustainable, lightweight Anime Blogging website. The site functions as a content management system (CMS) similar to WordPress in features but significantly lighter, optimized for 1-2 authors. It will be containerized as a Docker image for consistent deployment across hosting environments.

**Core Goals:**
- **Lightweight & Sustainable**: Minimal dependencies, fast loading, easy maintenance.
- **Anime Niche Focus**: Content revolves around anime reviews, news, discussions, fan art, etc.
- **UI Theme**: Hybrid 90s retro vibe (pixel art elements, CRT effects, bold colors like neon pinks, cyans, greens; retro fonts) combined with modern components (smooth animations, responsive design, accessible navigation).
- **Single/Multi-Author Admin**: Simple authentication for 1-2 users.
- **Dockerized**: Fully self-contained Docker setup.

Iterate based on feedback; this is the first draft.

## Tech Stack (Lightweight & Modern)
- **Frontend**: HTML5, CSS3 (TailwindCSS or vanilla with custom CSS for retro-modern mix), JavaScript (minimal Vanilla JS or Alpine.js for interactivity).
- **Backend**: Node.js with Express.js (or lightweight Go if preferred for performance) for API and admin.
- **Database**: SQLite (embedded, no server needed) or lightweight PostgreSQL for simplicity. Use Prisma or Drizzle ORM.
- **CMS Features**:
  - Markdown-based blogging (like MDX or simple Markdown rendering) with embedded media support.
  - Admin dashboard for creating/editing posts, categories (e.g., Reviews, News, Fan Theories), tags, media upload.
  - **Media Handling**:
    - Support uploads for GIFs, photos (auto-convert all images to WebP on upload for optimization), and small videos (enforce 30MB size cap).
    - Store in public/uploads/ with organized subfolders (images/, gifs/, videos/).
    - Automatic optimization: resize images, compress videos.
  - Basic SEO (meta tags, sitemap).
  - RSS feed generation.
- **Hosting**: Docker Compose with Nginx (static serving) + app container.
- **Avoid Heavy Frameworks**: No full React/Vue unless justified for components; prefer server-side rendering (EJS or similar) for lightness.

## Directory Structure (Proposed)
```
/app
├── public/              # Static assets
│   ├── uploads/         # User-uploaded media (images/, gifs/, videos/)
│   ├── images/          # Anime-related images, retro assets
│   ├── css/
│   ├── js/
│   └── fonts/           # Retro fonts (e.g., pixel, monospace)
├── src/
│   ├── views/           # Templates (EJS or HTML)
│   ├── routes/          # Express routes
│   ├── controllers/     # Business logic
│   ├── models/          # DB models
│   └── utils/           # Helpers (markdown parser, etc.)
├── admin/               # Admin panel (protected routes)
├── data/                # SQLite DB, content storage
├── docker/              # Dockerfiles
├── docker-compose.yml
├── package.json
└── README.md
```

## Key Features
1. **Public Site**:
   - Homepage: Hero banner with retro anime aesthetic, latest posts grid (card style with 90s scanlines).
   - Blog Listing: Paginated posts with filters by category/tag.
   - Individual Post: Rich Markdown rendering, comments (Disqus-like or simple DB comments), related posts.
   - Categories & Tags sidebar.
   - Search functionality.
   - About page, Contact, Archive.
   - Dark mode default with neon accents.

2. **Admin CMS**:
   - Login (simple username/password or JWT for 1-2 users).
   - Dashboard: Post list, create new, edit, delete.
   - WYSIWYG Editor (lightweight like Toast UI or Markdown-focused) supporting media embeds via Markdown or shortcodes.
   - Media Library: 
     - Upload and manage GIFs (preserve animation), photos (automatic conversion to WebP with optimization), and small videos (strict 30MB size limit with compression).
     - Automatic processing on upload: resize images, generate thumbnails, organize files in public/uploads/.
   - Settings: Site title, description, author bios.
   - Preview post functionality.

3. **Technical Requirements**:
   - Fully responsive (mobile-first).
   - Performance: < 2s load time; aggressive optimization for media (WebP conversion, video compression, lazy loading, thumbnails).
   - Media-specific: Enforce 30MB video cap, auto-WebP for images, GIF optimization.
   - Accessibility: ARIA labels, keyboard nav.
   - Security: Sanitize inputs, rate limiting on uploads, HTTPS in Docker, file type validation.
   - SEO: Clean URLs, structured data for articles.
   - Analytics: Optional Plausible or simple logging.
   - **IDs & URLs**: Follow the conventions below for every entity and public route (non-negotiable).

## URL Slugs & Route Conventions (Clean & Consistent)

Public and admin URLs must stay human-readable, stable, and uniform. **Never put UUIDs in public page URLs.**

### Slug format (all content entities)
- **Case**: lowercase only.
- **Separator**: hyphens (`kebab-case`), never underscores or spaces.
- **Charset**: ASCII letters, digits, and hyphens only (`a-z`, `0-9`, `-`).
- **Shape**: no leading/trailing hyphens; collapse multiple hyphens to one.
- **Length**: max 120 characters after normalization.
- **Uniqueness**: unique per entity type (post slug unique among posts, category among categories, tag among tags).
- **Generation**: auto from title/name on create; allow manual override in admin; re-slug on edit only if author opts in (avoid breaking links by default).
- **Reserved words**: do not allow slugs that collide with static routes (`admin`, `blog`, `search`, `about`, `contact`, `archive`, `rss`, `sitemap`, `api`, `uploads`, `login`, `logout`).

### Canonical public routes (use these paths only)
| Page | Pattern | Example |
|------|---------|---------|
| Home | `/` | `/` |
| Blog index | `/blog` | `/blog` |
| Blog page | `/blog?page=2` | query for pagination only |
| Post | `/blog/:slug` | `/blog/neon-genesis-review` |
| Category | `/category/:slug` | `/category/reviews` |
| Tag | `/tag/:slug` | `/tag/mecha` |
| Search | `/search?q=` | `/search?q=evangelion` |
| Archive | `/archive` | `/archive` |
| About | `/about` | `/about` |
| Contact | `/contact` | `/contact` |
| RSS | `/rss.xml` | `/rss.xml` |
| Sitemap | `/sitemap.xml` | `/sitemap.xml` |

### Admin routes (no public content slugs mixed in)
| Page | Pattern | Example |
|------|---------|---------|
| Login | `/admin/login` | `/admin/login` |
| Dashboard | `/admin` | `/admin` |
| Posts list | `/admin/posts` | `/admin/posts` |
| New post | `/admin/posts/new` | `/admin/posts/new` |
| Edit post | `/admin/posts/:id/edit` | `/admin/posts/<uuid>/edit` |
| Media | `/admin/media` | `/admin/media` |
| Settings | `/admin/settings` | `/admin/settings` |

- Admin **edit/delete** routes may use the entity **UUID** (`:id`) because they are private and must stay stable if the slug changes.
- Public **read** routes always use **slug**, never UUID.
- Filters (category/tag on listing) use slug query or path above—not numeric or UUID ids.
- Trailing slashes: normalize to **no trailing slash** (except `/` root). Redirect the other form with 301.
- Always link with the same helper (`url.forPost(slug)`, etc.) so templates never hardcode inconsistent paths.

### Slug helper requirements (implement once, reuse everywhere)
- `slugify(input)` → normalized kebab slug.
- `ensureUniqueSlug(base, existingCheck)` → append `-2`, `-3`, … if taken.
- Validate on write; reject invalid manual slugs with a clear admin error.

## Database UUID Conventions (Clean Tables)

Primary keys and foreign keys must be clean, consistent UUIDs—not mixed integer/UUID schemes, and not exposed in public URLs.

### Rules
- **Type**: UUID **v4** (random) for all entity primary keys unless noted.
- **Storage (SQLite)**: `TEXT` columns, always the **canonical 36-character** form:
  - `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (lowercase hex + hyphens).
  - Never store without hyphens, never uppercase, never `Blob`/binary UUID.
- **Generation**: create in application code (or DB default) at insert time; never null PKs.
- **Foreign keys**: same TEXT UUID format; always reference the parent PK column name pattern `*_id` (e.g. `author_id`, `post_id`).
- **No UUID in public URLs**: slugs for public pages; UUIDs only in admin paths, internal APIs, and DB rows.
- **Join tables**: composite uniqueness on the two FKs; optional own UUID PK if needed for ORM simplicity—if used, still canonical UUID text.
- **Settings**: key/value table may use string `key` as PK (not UUID); all content entities use UUID.
- **Media files on disk**: prefer `{uuid}.webp` / `{uuid}.gif` / `{uuid}.mp4` (or uuid + short original stem) so filenames stay unique and tidy; DB stores path + uuid id.

### Tables & ID columns (standard shape)
| Table | PK | Notes |
|-------|----|--------|
| `users` | `id` UUID | |
| `posts` | `id` UUID | `slug` unique TEXT for URLs |
| `categories` | `id` UUID | `slug` unique TEXT |
| `tags` | `id` UUID | `slug` unique TEXT |
| `media` | `id` UUID | file path separate from id |
| `comments` | `id` UUID | `post_id` UUID FK |
| `post_categories` | (`post_id`, `category_id`) or UUID `id` | both FKs UUID |
| `post_tags` | (`post_id`, `tag_id`) or UUID `id` | both FKs UUID |
| `settings` | `key` TEXT | exception: not UUID |

### Cleanliness checklist
- One ID strategy site-wide (UUID text)—no autoincrement integers mixed in for content tables.
- Indexes on all `slug` columns used in routes; unique constraints enforced in DB.
- Seed data uses valid UUID v4 strings and matching clean slugs (e.g. `welcome-to-ainme`, `reviews`).

## UI/UX Design Guidelines
- **90s Vibe**:
  - Background: Subtle grid or scanline patterns.
  - Colors: `#FF00FF` (magenta), `#00FFFF` (cyan), black, white; high contrast.
  - Fonts: Pixelated headers, sans-serif body.
  - Elements: Glitch effects on hover, animated cursors, retro buttons.
- **Modern Flow**:
  - Smooth transitions, infinite scroll option.
  - Hamburger menu on mobile.
  - Consistent navigation bar (logo + links).
- Use CSS variables for easy theming.

## Docker Setup
- **Dockerfile**: Multi-stage build for optimization.
- **docker-compose.yml**: Services for app, nginx, optional DB.
- Volumes for persistent data (DB, uploads).
- Environment variables for config (ports, secrets).

## Development Workflow
1. Initialize repo with this structure.
2. Set up Docker first for consistency.
3. Implement backend API **with UUID PKs (canonical text) and `slugify` / unique-slug helpers from day one**.
4. Build frontend templates **using only the canonical route table; public links by slug, admin edit links by UUID**.
5. Integrate CMS (enforce slug validation + reserved-word checks on write).
6. Style with retro-modern theme.
7. Test thoroughly (assert no public URL contains a UUID; assert all PKs match UUID regex).
8. Document deployment.

## Next Steps for Grok Agent
- Generate full code structure.
- Provide initial Docker setup files.
- Create sample post data.
- Output this as a living document for iterations.

Provide feedback on this draft to refine before implementation.