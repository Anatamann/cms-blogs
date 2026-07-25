# Categories vs tags — recommendation for Ainme Blog

## What the CSV actually is

File: `public/test-blogs/category list for blog website - Sheet1.csv`

| Column | Content |
|--------|---------|
| **Category** | Names like Action, Comedy, Isekai, Rom-Com, ecchi, sports |
| **Description** | Genre definitions |

These are **anime genres / story flavors**, not “content formats.”

---

## Better model for this site

Keep **two taxonomies** (you already have both tables):

| Layer | Purpose | Examples | How many |
|-------|---------|----------|----------|
| **Categories** | *What kind of post is this?* | Reviews, News, Episode notes, Fan Theories | Few (3–8), rarely change |
| **Tags** | *What is the post about?* (genre/topic) | Action, Isekai, Rom-Com, Sports | Many, grow over time |

### Why not dump the CSV into “categories”?

- Mixing “Review” with “Isekai” confuses filters and navigation.
- A post is usually **one** format (Review) and **several** genres (Action + Comedy).
- Public URLs already match: `/category/reviews` vs `/tag/isekai`.

### Why tags fit the CSV

- Genres are multi-select on each post (checkboxes already on the post form).
- Descriptions belong on tags for `/tag/:slug` archives and SEO later.
- CSV import is a one-time vocabulary seed, not a second CMS product.

---

## Recommended practices

1. **Categories** — editorial types only (Review, News, Analysis…).  
2. **Tags** — genres from the CSV + freeform (studio, season, franchise).  
3. **Naming** — Title Case display names; slugs kebab-case (`rom-com`, `romantic-drama`).  
4. **Avoid tag explosion** — prefer a controlled list; add free tags sparingly.  
5. **Optional later** — “Featured genres” on home; tag pages showing the description.

---

## Admin management

| URL | Action |
|-----|--------|
| `/mantri/tags` | List tags, post counts, import CSV |
| `/mantri/tags/new` | Create |
| `/mantri/tags/:uuid/edit` | Edit name/slug/description |
| Import button | Loads `public/test-blogs/category list for blog website - Sheet1.csv` |

Post editor still assigns tags when writing a post.

---

## Mapping your CSV → tags

| CSV “Category” | Suggested tag name | Slug |
|----------------|--------------------|------|
| Action | Action | `action` |
| Comedy | Comedy | `comedy` |
| Rom-Com | Rom-Com | `rom-com` |
| Periodic | Period / Historical | `period` or `historical` |
| Isekai | Isekai | `isekai` |
| ecchi | Ecchi | `ecchi` |
| Romantic Drama | Romantic Drama | `romantic-drama` |
| sports | Sports | `sports` |

“Periodic” is clearer for readers as **Period** or **Historical**.

---

## What we deliberately did not do

- Replace categories with the CSV list  
- Auto-create a third “genre” table (tags already cover it)  
- Force every CSV row as a category (would break the Reviews/News model)
