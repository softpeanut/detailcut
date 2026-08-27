# DetailCut

DetailCut slices a long product-detail image into numbered JPG files and one ZIP. It searches backward from each requested maximum height for a visually quiet horizontal seam, while preserving contiguous output rows. Processing is local to the browser.

## Revenue hypothesis

- Buyer: Korean marketplace sellers and detail-page designers who repeatedly split long exports.
- Free proof: one real image, custom width/height, smart seam selection, real ZIP.
- Paid asset: ₩12,900 one-time offline batch edition for up to 20 images.
- The seller-held paid asset is complete at `dist/detailcut-pro-v1.0.0.zip`; the public page keeps checkout disabled until a real product listing and delivery URL exist.
- Revenue is zero until a non-self purchase settles and is withdrawable.

The product borrows the useful constraints observed in THE Hackathon: a short build, immediately visible output, a free proof before payment, and a five-to-seven-day market test. It does not copy a participant's product or brand.

## Run and verify

```sh
node --test test.mjs
node --check core.js
node --check app.js
sh build-pro.sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. A real browser test with a synthetic tall image should confirm image decode, quiet-seam planning, JPG encoding, ZIP download, and visual continuity before deployment.

`browser-smoke.mjs` performs the decode-to-download path headlessly when Playwright is available. It uses an installed Chrome binary and generates its synthetic image inside the browser; it does not contact an external site.

## Product contract

- Input: JPG, PNG, or WebP; 40 MiB or less per file.
- Output width: 320–2400 px.
- Maximum slice height: 800–10000 px.
- Free edition: one source image. Pro edition: up to 20 source images.
- Automatic cuts are structural guesses, not semantic understanding. Users must inspect the result before publishing.
- No fetch/XHR/WebSocket, external asset, analytics, cookie, local storage, backend, or upload path.

## Material references

- THE Hackathon rules and market-metric structure: https://thehackathon.org/
- Participant retrospective describing 30-hour shipping, one-week revenue validation, and reuse of existing source: https://rriver2.tistory.com/entry/%ED%9D%91%EB%B0%B1%EA%B0%9C%EB%B0%9C%EC%9E%90-%EB%8D%94%ED%95%B4%EC%BB%A4%ED%86%A4-%EC%82%AC%EB%9E%8C%EC%9D%80-%EC%96%B4%EB%96%BB%EA%B2%8C-%EC%84%B1%EC%9E%A5%ED%95%98%EB%8A%94%EA%B0%80

Marketplace dimensions change and are not embedded as compliance claims. The 860 × 5000 defaults are editable working values, not a guarantee of acceptance.
