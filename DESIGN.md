# DetailCut design

## Work unit

Turn one long product-detail image into upload-sized slices without sending the image to a server. Prefer visually quiet horizontal seams near the requested segment height, keep the original aspect ratio, and download deterministic JPGs in one ZIP.

Acceptance criteria:

- JPG, PNG, and WebP inputs are decoded locally and invalid inputs fail clearly.
- Output width and maximum slice height are user-controlled within documented bounds.
- Every source pixel row appears exactly once in the ordered output; no overlap or gap.
- A quiet-seam search may move an internal cut, but never below the minimum slice size.
- Output files are numbered and downloadable as one valid ZIP.
- The page contains no network, analytics, storage, or upload path.

## Existing integration points

- The proven store-mode ZIP/CRC-32 implementation is adapted from `experiments/market-image-packer/core.js:10`.
- The browser image decode and Blob download pattern is adapted from `experiments/market-image-packer/app.js:13`.
- This is otherwise a greenfield product; there is no backend or existing persistence layer.

## Proposed flow

```text
P1  receive a file from picker or drop
P2  IF no file -> show "choose an image" and stop
P3  IF MIME is not JPG, PNG, or WebP -> show unsupported-format error and stop
P4  IF file exceeds 40 MiB -> show size-limit error and stop
P5  CALL browser image decoder
P6    IF decoding fails -> show decode error and stop
P7  validate target width (320..2400), max height (800..10000), quality (60..100)
P8  IF any setting is invalid -> show setting error and stop
P9  calculate scaled height while preserving aspect ratio
P10 CALL draw scaled source to a working canvas
P11   IF canvas allocation or draw fails -> show processing error and stop
P12 sample each candidate row in a bounded band around the ideal cut
P13 score each row by local luminance variation plus vertical edge energy
P14 choose the lowest score with a small distance penalty
P15 IF no candidate respects minimum slice height -> use the ideal cut
P16 append [start, cut) and set start = cut
P17 IF rows remain -> repeat P12; ELSE continue
P18 verify slices are contiguous, positive, ordered, and end at scaled height
P19 IF verification fails -> show internal-plan error and stop
P20 FOR EACH planned slice in order
P21   CALL draw exact source row interval into output canvas
P22     IF draw fails -> show export error and stop
P23   CALL encode JPG Blob
P24     IF encoding fails -> show export error and stop
P25   append numbered ZIP entry and release the slice canvas
P26 build store-mode ZIP from all entries
P27 IF ZIP creation fails -> show archive error and stop
P28 WRITE browser download through a temporary object URL
P29 IF download cannot be initiated -> show download error and stop
P30 revoke the temporary URL and show slice count plus dimensions
P31 when the first valid file or a setting changes, debounce a local preview request
P32 CALL decode the first image for preview
P33   IF preview decoding fails -> hide preview and keep export available
P34 calculate the same verified cut plan used by export
P35 draw a bounded thumbnail and overlay every internal cut position
P36 show predicted slice heights; release the decoded preview image
P37 IF a newer preview request exists -> discard this result without replacing current UI
P38 when "sample" is chosen, generate one synthetic detail image locally
P39 IF sample encoding fails -> show sample error and keep the picker available
P40 add the sample as the single free-edition input and run P31
```

## Completeness check

- Boundary validation: P2–P4 and P7–P8.
- Permission/authentication: intentionally absent; all processing is local and anonymous.
- Fallible calls and writes: P5/P6, P10/P11, P21/P22, P23/P24, P26/P27, P28/P29.
- Preview/sample failures are non-destructive and observable: P32/P33 and P38/P39.
- Ordering: the complete cut plan is verified at P18 before any output is encoded.
- Concurrency: one export button owns one run; controls are disabled until its terminal state. Preview requests use a monotonically increasing request number, so stale work cannot replace newer settings (P31/P37).
- Privacy: no external call or persistence exists in the proposed flow.
- Remaining browser-specific risk: very tall decoded canvases can exceed a browser's canvas limit even below the file-size cap; this must fail visibly at P11 and be documented rather than claimed supported.
