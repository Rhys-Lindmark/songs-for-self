# Timeline artwork performance

The overview uses actual 64px Spotify album artwork, drawn at 28px with room for high-density screens. Larger 300px art is requested in selected-album details. Known Spotify CDN encodings are resized conservatively; custom supplied URLs, archive fallbacks, and unknown image paths retain their original URLs.

`public/album-thumbnails.json` is a public, pre-resolved mapping of reference album IDs to thumbnail URLs. A page fetches it once instead of making an oEmbed request for each reference album. It contains public artwork metadata, not downloaded artwork or visitor histories. Generate it manually with `npm run data:album-thumbnails`; the default covers the reference timeline. `--all` optionally extends to every public atlas album. The generator bounds concurrency and retries and respects Spotify's Retry-After response. It is intentionally excluded from routine build/test regeneration.

One shared observer handles artwork visibility and another handles timeline lanes. Large timelines mount art only near the viewport and cull horizontally hidden covers; scrolling reveals additional source albums. Small imports retain all their controls. Earlier Classical content is mounted on expansion. Genre/year selection retains access to all source moments. Album grouping and the reference mark array are memoized so selecting a song does not rebuild the complete timeline.

Catalog failure falls back to shared, bounded oEmbed requests. Missing art keeps a placeholder. URL metadata, pending requests, and decoded-image caches are bounded or deduplicated. A failed small image can try a larger version and then the existing real-art fallback. No generated dependencies, image binaries or enrichment datasets are copied into the repository.

## Measurement

`npm run test:timeline-performance-browser` uses an isolated Chromium context, CDP Performance/Network counters, and observed long tasks. It measures four seconds after scrolling the timeline into view. It checks mounted art, real loaded image dimensions, observer/request counts, Classical expansion, keyboard selection and mobile panning. Set `SFS_BASE_URL` to a preview or production URL; `SFS_PERF_BASELINE=1` collects the same measurements without enforcing optimized counts.

The manual **Timeline performance measurement** workflow can profile a deployed URL and enforce the optimized contract or optionally prepare the artwork catalog as a downloadable artifact. Build checks run the strict performance contract along with the existing interaction, import, responsiveness and accessibility checks.

The initial 1280×900 live measurement had 2,259 artwork components/observers, 7,011 timeline elements, 62 oEmbed requests and 56 loaded covers after four seconds. Its image transfers totaled 1,865,784 encoded bytes. A checked real cover used 52,028 bytes at 300px and 3,035 bytes at 64px. These are controlled samples, not representative field Core Web Vitals or a claim that every connection has the same timing. Keep before/after metrics with the workflow artifacts.
