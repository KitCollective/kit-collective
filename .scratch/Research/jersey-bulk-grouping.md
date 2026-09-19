# Bulk upload grouping — Vision vs on-device vs order

**Date:** 2026-08-23  
**Product:** KitCollective  
**Question:** When a collector bulk-uploads jersey photos (typically in sequence: UserJersey A then B then C), should grouping into UserJerseys — and optional photo-role guesses — use a cloud VLM, on-device CV, embeddings, or no ML at all?

**Companion research (do not duplicate):** club/season identity and cost already locked in [jersey-vision-providers.md](./jersey-vision-providers.md). Capture speed and OCR-later in [jersey-registration-speed.md](./jersey-registration-speed.md). This file is **grouping**, not catalog ID.

---

## Answer

**On-device CV is not equally good.** Apple Feature Print and ML Kit image labeling measure generic visual similarity or 400 everyday labels (`Soccer`, `Stadium`). They do not know F.C. København 2023/24 home, and they are not a substitute for grouping a cellar dump of shirts. There is no Expo first-party module for Feature Print. A custom LiteRT “kit classifier” would be our own catalog model — a different product.

**The strongest signal we already have is not a model: pick order.** Expo ImagePicker `orderedSelection` (iOS 15+) shows numbered badges and returns assets in tap order. Collectors who photograph one shirt at a time (front → back → label, next shirt) are handing us a sequence. Treat that as the default grouping prior. Human bind (unbound strip from prototype C/D) is the fail-open.

**Cloud Gemini is the right *suggestion* worker for grouping, not the source of truth.** Same paid Flash-Lite path as today’s Vision suggestion. One multi-image call can return `{ groups: [{ photoIndexes, roleGuess }] }` via structured JSON. Official cap is **3,600 images/request** (20 MB inline). Cost at 1600² is still fractions of a cent for a 12-photo dump; **grouping should use small thumbs** (≤384 px → 258 tokens/image) so latency stays inside the existing 10 s fail-open. Club/season stays a **per-UserJersey** call on the photos actually bound to that copy.

**Do not ship “chunk every three photos” as Vision.** That was a prototype stand-in. It fights mixed shot counts (one shirt with only a front; another with five photos).

**Save still must not wait.** Grouping suggestions fade in. Unbound photos stay unbound until the collector bonds or accepts a suggestion.

| Question | Answer |
| --- | --- |
| Heuristic first, Vision second? | **Yes.** Pick-order is a first-party OS/Expo signal. |
| Feature Print same-shirt front vs two homes? | **Unknown.** Docs only claim print distance. Unmeasured. |
| Gemini JSON groups for 12–30 photos in one call? | **Yes** on the 3,600-image cap. Batch if **20 MB inline** or **10 s** timeout, not because of file count. |
| On-device equally good? | **No.** |

---

## What “equally good” would mean here

Two jobs get mixed in conversation. Split them:

| Job | What success looks like | What can do it |
| --- | --- | --- |
| **Group** photos into UserJerseys (A / B / C) | Same physical shirt’s shots sit together | Order/time heuristic; human bind; *optional* VLM or similarity as a suggestion |
| **Identify** club / season / kit type | Catalog UUIDs after confirm | Paid Gemini (already chosen). Not OCR. Not ML Kit labels. Not Feature Print. |
| **Role** `front` \| `back` \| `label` | Domain `PHOTO_ROLES` | Slot order on a single jersey; VLM guess as suggestion. Left/right/other is a proposal, not domain. |

No first-party API publishes football-kit grouping accuracy. Closed-beta on real Danish collections is the only test (same caveat as [jersey-vision-providers.md](./jersey-vision-providers.md)).

---

## 1. No ML — order, EXIF, human bind

### Pick order (ship this)

Expo ImagePicker (fetched 2026-08-23):

- `allowsMultipleSelection` — Android, iOS 14+, Web.
- `orderedSelection` — **iOS 15+**. Number badges in selection order; assets **returned in that order**. Docs: order is intended even if the option is off, but **not guaranteed** unless `orderedSelection` is true. **Turn it on.**
- `selectionLimit` — `0` = system max.
- `exif: true` — Android/iOS EXIF object (iOS camera path omits GPS).
- `defaultTab` — Android: open on photos vs other tabs.
- `legacy` on Android — pick from outside the photo library (Files-like). Matches “Fotos **and** Filer.”

Android’s system photo picker grants access only to selected items (`PickMultipleVisualMedia`). `DATE_TAKEN` is a documented picker column; location EXIF needs extra permission (`ACCESS_MEDIA_LOCATION`) — **do not depend on GPS**. Full `DateTimeOriginal` survival through every picker path is **not** a published guarantee. Do not request broad `READ_MEDIA_IMAGES`.

**Product implication:** numbered multi-select is a first-party OS/Expo feature, not a custom camera roll. Sequence is the bulk prior Nicklas described.

### Time gaps (optional, weak)

EXIF `DateTimeOriginal` (when `exif: true`) can split a long session if the collector paused between shirts. Official Expo field exists; **no** first-party rule for “N seconds = new UserJersey.” Treat as a hint, not a cut. Burst shots of one shirt are close in time; two shirts photographed back-to-back are also close. Order still wins.

### Groups of three (do not default)

Domain recommends three roles, does not require them. Save needs **at least one** photo ([docs/design-system.md](../../docs/design-system.md) Photo slot). Auto-bundling 1–2–3 as UserJersey A, 4–5–6 as B fails as soon as someone shoots only fronts, or five angles. Keep as a *debug* heuristic, not UX.

### Human bind (always)

Unbound filmstrip + tap photo → tap UserJersey tab. Works offline, works when Vision fails, works when two homes look alike. This is the product fallback, not a prototype leftover.

---

## 2. On-device CV — not a replacement

### Apple Vision Feature Print

Official:

- [`VNGenerateImageFeaturePrintRequest`](https://developer.apple.com/documentation/vision/vngenerateimagefeatureprintrequest) — still-image request; results are `VNFeaturePrintObservation`.
- [`FeaturePrintObservation.distance(to:)`](https://developer.apple.com/documentation/vision/featureprintobservation/distance(to:)) — “Shorter distances indicate greater similarity between feature prints.”
- Sample: [Analyzing Image Similarity with Feature Print](https://developer.apple.com/documentation/vision/analyzing-image-similarity-with-feature-print) (WWDC 2019 Session 222).

What the docs actually claim: a **distance between two images’ feature prints**. Crop/scale is applied *before* the print. They do not claim product identity, sports kits, or front/back of the same garment. Front and back of one shirt often share a colourway but not a viewpoint; two different clubs’ white homes can be closer than one shirt’s front vs collar label. **Unmeasured for UserJersey grouping.**

[`VNClassifyImageRequest`](https://developer.apple.com/documentation/vision/vnclassifyimagerequest) is a **fixed** general taxonomy (`knownClassifications`) for categorization/search — not Kit / UserJersey identity.

Expo: **no** first-party Vision Feature Print module ([jersey-registration-speed.md](./jersey-registration-speed.md) — no first-party OCR either). Shipping this means a custom native module / CNG, iOS-only unless Android gets a parallel embedding.

### Google ML Kit

Official [ML Kit](https://developers.google.com/ml-kit) on-device tasks that look “vision-ish”:

| API | What Google says it does | Group shirts? |
| --- | --- | --- |
| Text recognition v2 | OCR, receipts, cards | Label size later. Not groups. |
| Image labeling | 400+ general entities | Example soccer photo → `Stadium`, `Sports`, `Soccer`. Not club, not “same copy.” |
| Object detection & tracking | Localize/track objects in a **live camera** feed | Session camera, not a 20-photo library cluster. |
| Barcode | 1D/2D codes | Irrelevant unless we add barcodes. |
| Image description / Prompt (newer GenAI on device) | Short descriptions / prompts | Not a KitCollective catalog matcher; extra on-device LLM surface; not researched here as MVP. |

Custom LiteRT via Image Labeling: “your own model trained with AutoML / TensorFlow.” That is **training a kit classifier**, not using a Google-provided football API.

### Verdict

On-device can later **hint** “these two adjacent photos are similar” on iOS. It cannot replace Gemini for identity, and it is **not equally good** for A/B/C grouping across lighting, backs, and labels. Do not put it on the Save path. Do not block Android on Feature Print.

---

## 3. Cloud embeddings / visual search

### Gemini Embedding 2

Official [Gemini API embeddings](https://ai.google.dev/gemini-api/docs/embeddings) (fetched 2026-08-23):

- `gemini-embedding-2` maps text, images, video, audio, PDF into one space; docs list **clustering** as a task.
- Image input: **maximum 6 images per request**, PNG/JPEG.
- A 20-photo bulk dump needs **batched** embeds, then our clustering in Nest.

That is extra architecture (vectors, threshold, cluster count) for a job Gemini Flash-Lite can attempt in **one** generateContent call with a JSON schema. Embeddings help *if* we later build visual search against **our** Kit photo archive. They are not the bulk-upload MVP.

Vertex `multimodalembedding@001` sample: **1 instance per request** — twenty photos = twenty predict calls, then our clustering. Extra GCP surface.

OpenAI’s official Embeddings API is **text**; Images APIs are generation/edit, not a hosted CLIP clustering API.

### Vision API Product Search

Official: retailers upload **reference images** into product sets; query image returns similar products. Categories include **apparel**. Index updates approximately once per day. That is “match this photo to our catalog SKUs,” not “cluster this camera roll into UserJerseys.” We do not have a visual Kit reference set of every Nordic shirt from every angle. **Wrong seam.**

[Vision API deprecations](https://cloud.google.com/vision/docs/deprecations) (fetched 2026-08-23) list Celebrity Recognition and OCR On-Prem — **not** Product Search. Do not call it deprecated. Also do not build bulk grouping on it.

---

## 4. Cloud VLM (Gemini) for grouping

Already chosen for suggestions: **paid `gemini-2.5-flash-lite`**, Nest adapter, Expo never holds the key. Current `VisionAdapter.infer(photoBytes)` is **one photo → club/season/type**. Grouping is a **new job shape**, not a tweak.

Official image understanding (fetched 2026-08-23):

- Max **3,600** images per request. 12–30 photos does **not** force batching on file count.
- Inline total request **20 MB** (prompt + bytes); larger → Files API (2 GB/file, 20 GB/project, 48 h). Twenty 1600 px JPEGs can exceed 20 MB — thumbs or Files API.
- Tokenization: 258 tokens if both sides ≤384 px; else 768×768 tiles at 258 tokens each. Production must `countTokens`.
- Gemini 3 `media_resolution` changes token budgets. Identity/grouping MVP stays **2.5 Flash-Lite**; do not silently switch.
- Gemini is explicitly multimodal for classification / VQA **without training a specialized CV model**.
- Structured JSON + string `enum` remain first-party ([jersey-vision-providers.md](./jersey-vision-providers.md)).

**Proposed grouping schema (application-level, not a Google product):**

```text
{
  groups: [
    { photoIndexes: number[], roleGuess: ("front"|"back"|"label")[] }
  ],
  ungroupedIndexes: number[],
  confidence: number
}
```

Map `photoIndexes` to the client’s ordered picker array. Persist catalog UUIDs only after confirm, same as today. Role guesses outside `PHOTO_ROLES` stay client-side “andet” until domain changes.

**Cost (same assumptions as providers note: 1600² ≈ 2322 image tokens, $0.10 / $0.40 per 1M, thinking off):**

| Call | Images | Image tokens | ~USD in+out |
| --- | ---: | ---: | ---: |
| Grouping thumbs ≤384 px | 12 | 3,096 | **~$0.0005** |
| Grouping thumbs ≤384 px | 20 | 5,160 | **~$0.0007** |
| Grouping full 1600² | 12 | 27,864 | **~$0.0030** |
| Identity on one bound jersey (2 photos 1600²) | 2 | 4,644 | **~$0.0006** |

Latency, not money, is the risk. Twelve full-res images in one 10 s timeout will miss more often than twelve 384 px thumbs. **Use thumbs for grouping; 1600 px for identity on the active UserJersey.**

Privacy: paid Gemini only (no training on prompts/files/images). Same as existing Vision.

OpenRouter: still an extra subprocessor ([jersey-vision-providers.md](./jersey-vision-providers.md)). Do not send collection photos through a router for MVP.

---

## Recommended pipeline

```text
Single (≤ one shirt’s shots, collector stays on one confirm)
  Expo ordered picker or camera session
  → local draft (roles by slot / tap order)
  → Nest Vision identity on those photos (existing job)
  → confirm live; Save never waits
  → optional “Flere trøjer i denne upload” escapes to bulk

Bulk (many photos, likely sequential)
  Expo ImagePicker { allowsMultipleSelection, orderedSelection: true, exif: true }
  → show ALL photos immediately; unbound strip + UserJersey tabs (human bind works now)
  → Nest grouping job (Flash-Lite, thumbs, JSON groups), fail-open 10 s
       on success: pre-fill tabs as suggestions (same 50/70% bands as identity)
       on fail: leave unbound
  → per accepted/bound UserJersey: existing identity Vision (1600 px)
  → Gem og næste; leftover unbound stays on the strip
```

**Device vs Nest**

| Step | Where | Blocks Save? |
| --- | --- | --- |
| Numbered pick, local draft | Expo | No |
| Heuristic groups (order / time) | Expo | No |
| Human bind | Expo | No |
| Grouping suggestion | Nest Gemini | No |
| Club/season suggestion | Nest Gemini (existing) | No |
| Feature Print / ML Kit | Do not ship MVP | — |
| OCR on label | Post-MVP native module | No |

---

## Implications for the add-jersey prototype / later `/to-design`

1. Single and bulk are **one flow** with a mode switch, not two apps. D’s steal (confirm vs unbound+tabs) matches the research: order first, Vision second.
2. Do not animate a blocking “AI analysing 20 photos” screen.
3. Do not promise left/right mapping in domain until `PHOTO_ROLES` changes.
4. A/B test grouping suggestions only after a fixture set of real bulk dumps (same club two shirts, front+back+label, messy order). Until then, human bind is the honest bulk UX.

---

## Open / Yellow

1. **No vendor accuracy for kit grouping.** Flash-Lite might split two white homes incorrectly. Measure or keep bind.
2. **Gemini 10 s timeout vs N images.** Thumbs first; if still slow, group in batches of 8 and merge by index.
3. **Android numbered badges.** `orderedSelection` is documented iOS 15+ only. Android returns a list; **do not assume** badge UI. Sequence may still match selection order — verify on a Pixel, do not lock the iOS badge as Android chrome.
4. **Feature Print on front vs back** of one shirt: unmeasured. Do not design iOS-only grouping around it.
5. **Current `/v1` Vision contract is one photo.** Grouping needs a new job + contract; that is a later slice, not a silent adapter change.
6. **`gemini-embedding-2` 6-image cap** makes embeddings worse than one VLM call for a 12–30 photo dump unless we batch.
7. **EXIF completeness through Android Photo Picker** is not a published guarantee; `DATE_TAKEN` exists, GPS is a separate permission.
8. **Product Search “maintenance”** was not confirmed on the official deprecations page. Wrong seam anyway.

---

## Sources

| URL | What it supports |
| --- | --- |
| https://docs.expo.dev/versions/latest/sdk/imagepicker/ | `allowsMultipleSelection`, `orderedSelection` (iOS 15+ numbered badges + return order), `exif`, `selectionLimit`, Android `defaultTab` / `legacy` (fetched 2026-08-23) |
| https://ai.google.dev/gemini-api/docs/image-understanding | 3600 images/request, 20 MB inline, 258-token / 768-tile rule, multimodal without a custom CV model (fetched 2026-08-23) |
| https://ai.google.dev/gemini-api/docs/embeddings | gemini-embedding-2 clustering task; max 6 images/request (fetched 2026-08-23) |
| https://developer.apple.com/documentation/vision/vngenerateimagefeatureprintrequest | On-device feature prints |
| https://developer.apple.com/documentation/vision/featureprintobservation/distance(to:) | Shorter distance = greater similarity |
| https://developer.apple.com/documentation/vision/analyzing-image-similarity-with-feature-print | Official similarity sample (WWDC 2019 222) |
| https://developer.apple.com/documentation/vision/vnclassifyimagerequest | General image classification, not kits |
| https://developers.google.com/ml-kit | On-device task list |
| https://developers.google.com/ml-kit/vision/image-labeling | 400+ general labels; custom LiteRT for specialized classes |
| https://cloud.google.com/vision/product-search/docs | Retailer product-set visual search (apparel); not camera-roll clustering |
| https://cloud.google.com/vision/docs/deprecations | Product Search **not** listed (Celebrity Recognition / OCR On-Prem are) |
| https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/multimodal-embeddings-api | Vertex multimodal embeddings; 1 instance/request in samples |
| https://developer.android.com/training/data-storage/shared/photopicker | `PickMultipleVisualMedia`; selected-item access only |
| https://ai.google.dev/gemini-api/docs/files | Files API when inline exceeds 20 MB |
| ./jersey-vision-providers.md | Flash-Lite identity worker, paid-only, OCR ≠ club ID, OpenRouter skip, cost model |
| ./jersey-registration-speed.md | Save <10 s attention, Expo camera vs picker, no first-party OCR, Android system picker |
| ../../CONTEXT.md | Vision suggestion; Save must not wait |
| ../../packages/domain/src/index.ts | `PHOTO_ROLES` = front \| back \| label |
| ../../apps/api/src/vision/vision.adapter.ts | Current infer = one photo |
| ../../docs/design-system.md | Photo slot roles; at least one photo to Save |

**Gate:** Green for primary-source completeness on *capabilities*. Yellow if someone treats Gemini grouping or Feature Print as proven on Nordic kits without a fixture dump.
