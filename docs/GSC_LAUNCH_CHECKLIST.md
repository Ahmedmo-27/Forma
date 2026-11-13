# Google Search Console — Forma launch checklist

Use after polish is deployed, then publish + an **indexable** production build.

## 0. Publish + indexable deploy

1. Flip the gate (needs Mongo or platform super_admin JWT):

   ```bash
   # From Backend (MONGO_URI in .env)
   node src/scripts/publishPublicSite.js

   # Or from Frontend with platform JWT
   PLATFORM_TOKEN=… npm run publish:site
   ```

2. Redeploy Frontend so prerendered HTML has `index, follow` (default `npm run build`).

   If Google still says “URL is not available / cannot be indexed”, view source on
   `https://www.forma-official.com/` and confirm there is **no**  
   `<meta name="robots" content="noindex, nofollow" />`.  
   A stale deploy with noindex will block indexing even when `published: true`.

   For draft-only builds while gated: `npm run build:noindex`.

3. Confirm anonymous `GET https://api.forma-official.com/api/public/site-config` → `"published": true`.

## 1. Verify property

1. Open [Google Search Console](https://search.google.com/search-console).
2. Add property `https://www.forma-official.com` (URL-prefix).
3. Prefer HTML tag verification: set `VITE_GSC_VERIFICATION` (or `GSC_VERIFICATION`) in the Vercel build env to the token Google shows, then redeploy. The prerender script injects:

   ```html
   <meta name="google-site-verification" content="…" />
   ```

4. Also verify apex `https://forma-official.com` if listed; it should 301 to www (see `Frontend/vercel.json`).

## 2. Submit sitemap

1. Sitemaps → add `https://www.forma-official.com/sitemap.xml`
2. Confirm discovered URL count matches bilingual routes (14 URLs: 7 paths × EN+AR).

## 3. Request indexing (priority URLs)

Use URL Inspection → Request indexing for:

- `https://www.forma-official.com/`
- `https://www.forma-official.com/ar`
- `https://www.forma-official.com/plans`
- `https://www.forma-official.com/ar/plans`
- `https://www.forma-official.com/gym-management-software-egypt`
- `https://www.forma-official.com/ar/gym-management-software-egypt`
- `https://www.forma-official.com/whatsapp-gym-crm`
- `https://www.forma-official.com/multi-branch-gym-software`

## 4. Clear ComingSoon / noindex residue

1. Coverage / Pages: confirm marketing URLs are not “Excluded by ‘noindex’”.
2. If old ComingSoon was crawled, Request indexing again after publish.
3. Confirm live HTML has `<meta name="robots" content="index, follow" />` (prerender) and ComingSoon is gone for anonymous users.

## 5. Monitor (30–60 days)

| Report | Watch for |
|--------|-----------|
| Pages / Indexing | Soft 404, redirect errors, duplicate without canonical |
| Experience / CWV | LCP on home (lazy 3D hero already); mobile usability |
| Performance / Queries | Brand + Egypt EN/AR queries; CTR on titles |
| Enhancements | FAQ rich results if eligible |

## 6. Share debuggers

- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) — scrape `og-share.jpg` / `og-share-ar.jpg`
- [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)

Expect 1200×630 cards with the **horizontal Forma logo**, not the favicon alone.
