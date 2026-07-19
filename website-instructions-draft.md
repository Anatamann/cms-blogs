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
3. Implement backend API.
4. Build frontend templates.
5. Integrate CMS.
6. Style with retro-modern theme.
7. Test thoroughly.
8. Document deployment.

## Next Steps for Grok Agent
- Generate full code structure.
- Provide initial Docker setup files.
- Create sample post data.
- Output this as a living document for iterations.

Provide feedback on this draft to refine before implementation.