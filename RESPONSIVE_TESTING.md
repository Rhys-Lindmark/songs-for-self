# Responsive smoke testing

Run the site locally on the smoke-test port:

```sh
npm run dev -- --port 4329
```

In another terminal, run:

```sh
npm run test:responsive
```

The smoke runner opens a fresh headless browser at 320 px, 375 px, and 430 px. It fails on page-level horizontal overflow, undersized primary controls, missing timeline panning, broken genre/space/geography activation, failed United States → California → Los Angeles drill-down, failed imported-playlist views or downloads, escaped mount-path links, failed resources, browser console errors, or a return of removed time/coverage UI.

Run the complementary keyboard, screen-reader-semantics, and reduced-motion contract with:

```sh
npm run test:accessibility
```

That runner checks desktop and 320 px layouts for document landmarks, heading and ID integrity, named controls, image alternatives, working skip navigation, reduced-motion behavior, keyboard-addressable geography markers, and overflow.

On macOS, the runner uses the standard Google Chrome application when present. Elsewhere, install Playwright Chromium (`npx playwright install chromium`) or provide an explicit executable with `CHROME_PATH`. Use `SFS_BASE_URL` when the local site is running at a different URL.

## Production HTTP smoke check

After deployment, run `npm run test:production` to verify the custom domain, release markers, removed coverage cards, social assets, favicon, and V3 CSV. Override the target with `SFS_PRODUCTION_URL` when testing another domain.

Music coverage: `npm run test:music-coverage-browser` verifies the fixed score, Classical composer separation, historical reissues, all three area arrangements, missing/covered filters, keyboard selection, mobile overflow, and browser resume. Set `SFS_BASE_URL` to the preview or production URL.
