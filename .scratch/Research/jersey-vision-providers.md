# Jersey photo → structured metadata: vision providers

**Date:** 2026-08-14  
**Product:** KitCollective  
**Question:** For jersey-photo → structured suggestions (club, season, kit type, player/number, badges) during upload, is **OpenAI Vision** still the right MVP choice, or is there something cheaper and/or better?

## Answer

Pick **Google Gemini 2.5 Flash-Lite on the paid Gemini API** as the MVP vision worker, not `gpt-4o`. It is a first-party vision model with official JSON-schema structured output (including string `enum`), image+text billed at **$0.10 / $0.40 per 1M tokens**, and a paid-tier promise that prompts and files (including images) are **not** used to improve Google’s products. At a 1600×1600 jersey photo, that is about **$0.0004 per image** and **~$0.0009 for a 3-image jersey** — roughly **7–15× cheaper than current `gpt-4o`**, and **~10–30× cheaper than huddle’s 2025 $0.01–$0.03/image claim**. OpenAI remains a clean fallback: **`gpt-4.1-nano`** ($0.10 / $0.40, vision, structured outputs, **no reasoning step**) is the OpenAI-shaped equivalent. Do **not** default to `gpt-4o-mini` for images: its vision tile multiplier (2833 base + 5667 per tile) makes a 3-image call **more expensive than `gpt-4o`**. On-device Apple Vision / ML Kit is OCR only — not club/season identity. Groq Qwen 3.6 27B is the latency candidate (~500 tok/s) but is Preview, JSON-object not JSON-schema, 3 images max, and does not publish image-token math. No vendor publishes football-kit identification accuracy; catalog ID mapping stays in NestJS.

---

## Cost model (dated 2026-08-14)

**Assumptions (stated so the table is reproducible):**

- Client already resizes front/back to max edge **~1600 px JPEG** ([jersey-registration-speed.md](./jersey-registration-speed.md)). Label may be larger; cost table uses 1600×1600 for every slot.
- **One API call** containing N images + one JSON suggestion object (not N sequential calls). That is the right NestJS shape: fire when the first photo exists; optionally re-run when 2–3 photos arrive.
- Prompt text **~400 tokens** (instructions + schema). Canonical club names are **not** stuffed into the prompt.
- Output **~350 tokens** of structured JSON. Thinking / extended reasoning **off**.
- Paid **standard** tier. Not Batch, Flex, Fast/Priority, or free Gemini.
- Image-token rules from each vendor’s official vision page. Gemini tile count for 1600×1600 uses the documented 768×768 tiling (9 × 258 = **2322** tokens). Production must call `countTokens` — Google also publishes a “rough” crop-unit formula that can yield fewer tiles.

`cost = ((N × image_tokens) + 400) × input_price/1M + 350 × output_price/1M`

| Candidate | Official rates (in / out per 1M) | Image tokens @ 1600² | **1 image** | **2 images** | **3 images** | vs huddle $0.01–0.03 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| **Gemini 2.5 Flash-Lite (MVP)** | $0.10 / $0.40 | 2322 | **$0.00041** | **$0.00064** | **$0.00088** | ~11–34× cheaper |
| Gemini 2.5 Flash (escalate) | $0.30 / $2.50 | 2322 | $0.00169 | $0.00238 | $0.00308 | still cheaper |
| Gemini 3.5 Flash-Lite | $0.30 / $2.50† | 2322 | $0.00169 | $0.00238 | $0.00308 | †output includes thinking tokens if left on |
| Gemini 3.1 Flash-Lite | $0.25 / $1.50† | 2322 | $0.00121 | $0.00179 | $0.00237 | newer Flash-Lite; same caveat |
| **gpt-4.1-nano (OpenAI fallback)** | $0.10 / $0.40 | ~3742‡ | **$0.00055** | **$0.00093** | **$0.00130** | ~8–23× cheaper |
| gpt-4.1-mini (OpenAI escalate) | $0.40 / $1.60 | ~2464‡ | $0.00171 | $0.00269 | $0.00368 | — |
| gpt-5.6-luna (`reasoning.effort: none`) | $0.20 / $1.20 | 2500§ | $0.00100 | $0.00150 | $0.00200 | cheap only if reasoning is off |
| gpt-4o (`detail: high`) | $2.50 / $10.00 | 765 | $0.00641 | $0.00833 | $0.01024 | huddle band **no longer holds**; this is ~⅓–⅔ of $0.01–0.03 |
| gpt-4o-mini (`detail: high`) | $0.15 / $0.60 | **25501** | $0.00410 | $0.00792 | **$0.01175** | 3-image call **costs more than gpt-4o** |
| Claude Haiku 4.5 | $1.00 / $5.00 | ~1560 | $0.00371 | $0.00527 | $0.00683 | in huddle’s old band, not cheaper |
| Together Qwen3.5-9B | $0.17 / $0.25 | 6404 | $0.00124 | $0.00233 | $0.00342 | cheap; extra vendor |
| Groq `qwen/qwen3.6-27b` | $0.60 / $3.00 | **unpublished** | cannot compute | cannot compute | 3-image cap | latency candidate only |

‡ Patch tokenizer (32×32), 1536-patch budget, then model multiplier (`gpt-4.1-nano` 2.46×, `gpt-4.1-mini` 1.62×) per OpenAI images-vision docs.  
§ GPT-5.6 family with `detail: original` / `auto` does **not** resize to a patch budget; 1600×1600 = 50×50 = 2500 patches, no listed multiplier. Default `reasoning.effort` is **medium** — leave it on and both cost and latency blow up.  
† Gemini 3.x Flash-Lite lists “output price (including thinking tokens)”. Disable thinking / set thinking budget 0 for suggestion JSON.

**What huddle’s $0.01–$0.03/image was.** That band matches **2024–early-2025 GPT-4 Turbo / early gpt-4o** vision at ~$10/M input plus a verbose prompt, or a high-detail unresized photo billed as many tiles. Against **2026-08-14** OpenAI list prices, even `gpt-4o` high-detail 1600² is **~$0.006/image**. The huddle README number is stale-high, not stale-low.

**At KitCollective scale (illustrative, not a forecast):** 10,000 jerseys × 2 photos average ≈ 20,000 images.

| Worker | ~USD / 20k images (2-image column × 10k) |
| --- | ---: |
| Gemini 2.5 Flash-Lite | **~$6** |
| gpt-4.1-nano | **~$9** |
| gpt-4o | **~$83** |
| huddle $0.02 midpoint | **~$400** |

Cost is not the gating risk. Latency-to-suggestion and catalog-match quality are.

---

## Latency / structured output / privacy

### Latency (no vendor SLA for “jersey ID”)

Target: first suggestion visible **<5 s if possible, <10 s acceptable**. Save must never wait. Nielsen’s 10 s attention limit still applies to a spinner on the confirm screen ([jersey-registration-speed.md](./jersey-registration-speed.md)).

| Provider | What official docs actually say | Implication for <5 s |
| --- | --- | --- |
| **Gemini Flash / Flash-Lite** | Positioned as speed / high-volume extraction. No millisecond SLA. `media_resolution` on Gemini 3 trades tokens **and** latency for fine text. | Best first-party bet for <5 s if thinking is off and images are pre-resized. |
| **gpt-4.1-nano** | Officially “low latency **without a reasoning step**.” | Best OpenAI bet for <5 s. |
| **gpt-4o** | No SLA. Huddle’s internal “<10 s Vision, <15 s e2e, 30 s timeout” is **not** an OpenAI number. | Plausible for <10 s; weaker for <5 s than Flash-Lite / nano. |
| **gpt-5.6-luna / o-series** | Reasoning models. Luna default effort is **medium**. | Do not use for the hot path unless `reasoning.effort: none`. |
| **Claude Haiku 4.5** | Official comparative latency: “Fastest.” Still billed as a full VLM. | Fine as a fallback; not cheaper. |
| **Groq Qwen 3.6 27B** | Model card: **~500 tok/s**. Groq’s own latency guide: VLMs’ **image encoding dominates TTFT**, independent of text tokens. JSON mode + `reasoning_effort: none`. | Likely fastest TTFT **after** encode; unproven for kit ID. Preview. Max **3** images (model card; vision page also says 5 — treat 3 as the hard cap). |
| **Together / Fireworks** | Together: downsize images; Fireworks: prompt cache can cut TTFT up to 80%, 30 images/request, URL faster than base64. | Extra hop vs first-party. Not MVP. |

Huddle’s **30 s timeout** is too long for a non-blocking suggestion. Time the NestJS worker at **8–12 s**, fail open, let Save proceed.

### Structured JSON

| Provider | Official mechanism | Club-name enum? |
| --- | --- | --- |
| **OpenAI** | Structured Outputs, `json_schema` + `strict: true`. Guarantees required keys and **no hallucinated enum values**. Enum is a supported type. | Yes for **small** closed sets (`kitType`: home/away/third/gk). **Do not** put the full club catalog in the schema: docs do not publish a catalog-scale enum limit; schema is sent (or cached) per request; catalog churn would rebuild it. Map `clubName` → canonical ID in NestJS. |
| **Gemini** | JSON Schema structured output (`enum` documented for string classification). Models including 2.5 Flash, 2.5 Flash-Lite, 3.x Flash-Lite. | Same pattern: enum kit type / condition; free-text club+season; server match. |
| **Claude** | GA structured outputs (`output_config.format`). String `enum` supported. Caveat: **capitalization of enum values is not guaranteed**. | Same. Compare enums case-insensitively. |
| **Groq** | **JSON Object Mode**, not JSON Schema. Prompt must contain the word “JSON”. | Weaker. Parse + validate in NestJS; do not trust shape. |
| **Together** | Docs: VLMs can reply in “structured JSON”; Qwen3.5 9B lists structured outputs in the chat catalog. | Usable; still map IDs yourself. |

**Catalog matching is application code.** No provider offers constrained decoding over *your* club IDs. Output names (and optional `confidence`); NestJS fuzzy/alias-matches onto seed IDs; unmatched → empty suggestion, never free-text club (PRD).

### Privacy / data use (photos of homes and collections)

| Provider | Official policy (API / paid) | KitCollective implication |
| --- | --- | --- |
| **OpenAI API** | As of **1 Mar 2023**, API data is **not used to train** unless you opt in. Default abuse logs **30 days**. Image/file inputs are CSAM-scanned; suspected CSAM is retained even under ZDR. EU data-residency exists (`eu.api.openai.com`) with 10% uplift for models on/after 5 Mar 2026. | Acceptable for MVP. Do not enable data-sharing fine-tunes. Set `store: false` on Responses. |
| **Gemini paid** | “Google doesn’t use your prompts (including … files such as images …) or responses to improve our products.” Logs retained a limited time for abuse/safety. May be processed/cached in any country where Google operates. | **Must be paid tier.** Free Gemini / AI Studio: content **is** used to improve products. |
| **Claude API** | Commercial terms: “Anthropic may not train models on Customer Content from Services.” Vision FAQ: image uploads ephemeral, deleted after the request; “Anthropic does not use uploaded images to train models.” | Strong default. Slightly more expensive. |
| **Groq** | Privacy policy exists; this pass did not retrieve a first-party “we don’t train on API prompts” sentence as crisp as OpenAI/Google/Anthropic. | If Groq is later used for latency, read the live DPA before sending collection photos. |
| **Together / Fireworks / OpenRouter** | Router / third-party inference. OpenRouter is **not** the model vendor. | Extra subprocessors. Skip for MVP photos. |

Server-side key in NestJS only. Expo never holds the provider key (already decided).

---

## Provider notes (primary sources only)

### 1. OpenAI (2026-08-14)

Current vision-capable lineup is no longer “gpt-4o or bust.” Official models page: **all latest models support image input**. Recommended cheap/fast: **GPT-5.6 Luna** for cost-sensitive volume — but Luna is a **reasoning** model. For this job, **`gpt-4.1-nano`** is the better OpenAI default: vision, structured outputs, 1M context, **no reasoning step**, $0.10 / $0.40.

**Vision token rules**

- Payload: 512 MB/request, 1500 images/request, PNG/JPEG/WEBP/non-animated GIF. “No watermarks or logos” is an input-quality rule on the vision page — jersey sponsor marks are the *content*, not a violation of that row in practice, but do not overlay app watermarks.
- `detail`: `low` (512², cheap, bad for namesets) / `high` / `original` (gpt-5.4+) / `auto`.
- **Tile family** (`gpt-4o`, `gpt-4.1`, `gpt-4o-mini`, most o-series except `o4-mini`): `low` = flat base tokens; `high` = fit 2048², shortest side 768 px, then 512² tiles. `gpt-4o`/`gpt-4.1`: **85 + 170×tiles**. `gpt-4o-mini`: **2833 + 5667×tiles**.
- **Patch family** (`gpt-4.1-mini/nano` 2025-04-14, `gpt-5-mini/nano`, `o4-mini`, …): 32×32 patches, 1536 budget, then a **multiplier** (nano 2.46×). That multiplier is why “mini/nano is cheap at text” is false for large photos unless you downscale first.
- Known limits (official): small / rotated / non-Latin text, counting, spatial reasoning, panoramic shots. Namesets and washed labels will fail some of the time — hence suggestions, never block Save.

**o-series:** vision exists; extra reasoning tokens and latency. Not the suggestion worker.

### 2. Google Gemini

Paid list prices fetched from [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing) on 2026-08-14.

- **2.5 Flash-Lite:** $0.10 in / $0.40 out (text/image/video). Smallest GA cost model “built for at scale usage.”
- **2.5 Flash:** $0.30 / $2.50. Escalate target.
- **3.5 Flash-Lite:** $0.30 / $2.50, “most cost-efficient GA” in the 3.5 line — **not** cheaper than 2.5 Flash-Lite on this price list.
- **3.1 Flash-Lite:** $0.25 / $1.50.
- **3.7 / 3.6 Flash:** $0.75 / $3.75 through 31 Dec 2026. Overkill.

**Image rules:** inline request 20 MB (else Files API). Max **3,600** images/request. Formats documented on the image-understanding page. Tokenization: 258 tokens if both sides ≤384 px; else 768×768 tiles at 258 tokens each. Gemini 3 adds `media_resolution` (max tokens per image; higher = better small text, more cost/latency). Page last updated **2026-07-30**.

**Structured output** and **enum** are first-party. Paid tier: no training on prompts/files.

### 3. Anthropic Claude

All current models take images. **Haiku 4.5** is the cheap/fast Claude: $1 / $5, “Fastest.” **Sonnet 5** is $2 / $10 (introductory $2/$10 is now the lasting price; the Sep 2026 bump was cancelled).

**Vision math:** `⌈w/28⌉ × ⌈h/28⌉` visual tokens, then downscale. Standard tier (Haiku 4.5): max long edge 1568 px / 1568 visual tokens. High-res (Claude 4.7+): 2576 px / 4784 tokens. Official worked example: 1000×1000 on Haiku 4.5 ≈ **$0.0013/image in image tokens only** ($1.30 per thousand images).

Limits: 100 images/request on 200k-context models; 10 MB base64 on first-party API; JPEG/PNG/GIF/WebP. People-identification refused. Accuracy caveats on small/rotated/low-quality images.

Structured outputs are GA. Enum capitalization is **not** guaranteed.

Cost is in huddle’s old band, not below Gemini Flash-Lite / gpt-4.1-nano. Use as a quality fallback if Gemini/OpenAI miss Nordic kits in beta — not as the default worker.

### 4. On-device (not a replacement)

Confirmed in first-party docs and in [jersey-registration-speed.md](./jersey-registration-speed.md):

- **Apple Vision `VNRecognizeTextRequest`:** on-device OCR, string + confidence + bbox. Not kit identity.
- **Google ML Kit Text Recognition v2:** on-device OCR for labels/receipts; Latin real-time; ≥16×16 px per character.

These can later propose **size / manufacturer / year** from the `label` photo. They cannot fill `catalogClubId`. Expo has no first-party OCR module. Do not put cloud Vision *or* on-device OCR on the Save critical path in MVP; the cloud VLM is the suggestion worker.

### 5. Specialized inference (only where official vision + price exist)

| Vendor | Official vision? | Price signal | MVP? |
| --- | --- | --- | --- |
| **Together** | Yes. Image tokens = up to 2×2 tiles of 560 px × **1601 tokens/tile** (always **6404** for a typical camera-roll photo). Catalog recommends **Qwen3.5 9B** at $0.17 / $0.25. | ~$0.0012 / 1600² image | Optional later. Extra vendor, coarse tiling. |
| **Fireworks** | Yes. OpenAI-compatible image_url. Max 30 images, 10 MB total base64, 5 MB/1.5 s per URL. Prompt caching documented. | Pricing page is app-rendered; not used as a number here. | Skip MVP. |
| **Groq** | Yes. `qwen/qwen3.6-27b`, Preview, ~500 t/s, $0.60 / $3.00, 20 MB, **3 images**, JSON Object Mode, `reasoning_effort: none` for non-thinking. **Image token formula not published.** | Cannot cost a jersey honestly. | Latency spike-test in beta, not default. |
| **OpenRouter** | Multimodal router. Not a model. Extra subprocessor. | Pass-through + markup. | Skip. |
| **Self-host LLaVA / Qwen-VL** | Weights exist; no first-party hosted SLA/price for a NestJS MVP. | GPU time + ops. | Skip until volume or privacy forces it. |

### 6. Two-stage pipeline (supported by docs, not by jersey benchmarks)

First-party docs support the *shape*:

1. **Cheap/fast VLM** (Gemini 2.5 Flash-Lite or gpt-4.1-nano) on the first photo → structured JSON + `confidence`.
2. **Escalate** to Gemini 2.5 Flash or gpt-4.1-mini only when confidence is low, catalog match fails, or the user is on the confirm screen still editing.
3. **OCR-then-LLM** is real for *labels* (ML Kit / Vision → size enum). It is **not** a cheaper path to club/season from a crest. CollX-class visual search is a different product; Google Vision Product Search is in maintenance mode and is not a football-kit catalog.

Do not wait for photo 2 and 3 before the first suggestion. Re-run when more roles arrive (`front`+`back`+`label` in one call is cheap at Flash-Lite rates).

---

## Recommended MVP architecture

```text
Expo (no provider key)
  → upload draft photo (role: front|back|label)
NestJS
  → resize already done on device
  → POST Gemini 2.5 Flash-Lite (paid)
       images: all roles present so far
       thinking: off
       response: JSON schema {
         clubName, clubNameAlt[], seasonLabel, kitType enum,
         playerName?, number?, badges[], manufacturerGuess?,
         confidence 0–1, evidence[]
       }
  → map clubName/alts → catalogClubId (alias table; never persist free text)
  → map seasonLabel → catalogSeasonId scoped to that club
  → if confidence ≥ 0.70 AND catalog hit → prefill chips (user can override)
  → if confidence low OR miss → empty suggestion, user searches (Letterboxd)
  → optional escalate (Flash / gpt-4.1-mini) while confirm screen is open
  → Save never waits; timeout 10 s; fail open
```

**Default worker:** `gemini-2.5-flash-lite` (paid).  
**OpenAI-shaped alternative if you want one vendor you already know from huddle:** `gpt-4.1-nano`, `detail: high` after 1600 px resize, Structured Outputs strict schema.  
**Escalate:** `gemini-2.5-flash` or `gpt-4.1-mini`.  
**Do not ship as default:** `gpt-4o`, `gpt-4o-mini`, o-series, GPT-5.x with default reasoning, Gemini **free** tier, Groq Preview, OpenRouter.

**Prefill threshold:** keep huddle’s **70%** as a *product* gate, not a vendor feature. Log `suggestion_shown`, `suggestion_accepted`, `suggestion_overridden`, `catalog_match_failed` from day one.

**Nordic / obscure kits:** treat as **weak evidence**. No model card reports Superliga / 2. division / vintage Hummel accuracy. Crest + sponsor + nameset text help; washed 1990s prints and non-Latin marks are in every vendor’s official failure list. Seed coverage + alias table matter more than swapping Flash-Lite for Opus.

---

## What huddle should change

If KitCollective copies huddle-design-guide’s Vision path, change these:

1. **Price:** stop quoting **$0.01–$0.03/image**. Against 2026-08-14 list prices, `gpt-4o` high-detail 1600² is **~$0.006**; Flash-Lite / gpt-4.1-nano are **sub-tenth-of-a-cent**.
2. **Model:** do not default `gpt-4o`. Do not assume `gpt-4o-mini` is cheaper for photos (tile multiplier). Prefer Gemini 2.5 Flash-Lite or gpt-4.1-nano.
3. **Latency budget:** huddle `<10 s Vision / <15 s e2e / 30 s timeout` is an internal SLO, not OpenAI’s. For async suggestions, **10 s fail-open** is enough; 30 s just holds a spinner.
4. **Trigger:** fire on **first photo**, do not wait for a 3-shot set. Re-run cheaply when back/label arrive.
5. **Output contract:** structured schema + **NestJS catalog IDs**. Huddle’s `match-jersey-metadata` name-match stays; never persist model free text as club.
6. **Reasoning models:** if anyone “upgrades” to GPT-5.6 Luna, set `reasoning.effort: none` or you will miss <5 s and pay for hidden thinking tokens.
7. **Privacy:** paid Gemini or OpenAI API (no training). Never the Gemini free tier for collection photos.
8. **70% auto-fill:** keep as UX policy; it is not a published accuracy rate.

---

## Open questions / weak evidence

1. **No vendor publishes football-kit identification accuracy.** Superliga, obscure third kits, and vintage reprints are unmeasured. Closed-beta on real Danish collections is the only test.
2. **Gemini 1600² token count** is computed from the 768-tile rule; Google’s “rough” crop-unit example can differ. Use `countTokens` on a fixture jersey before locking unit economics.
3. **Groq image billing** is unpublished. Model card says max **3** images; vision overview says **5**. Preview. Do not cost or SLA it yet.
4. **Gemini 3.x Flash-Lite vs 2.5 Flash-Lite:** 3.5 Flash-Lite is **not** cheaper on the 2026-08-14 price list. Quality vs 2.5 is unpublished for this task. Start 2.5 Flash-Lite; A/B later.
5. **`media_resolution` enum values** are introduced on the Gemini image-understanding page (updated 2026-07-30) without a full token table on that page. Re-read before tuning label-shot OCR via Gemini.
6. **OpenAI `detail: original`** on GPT-5.4+ preserves pixels and **raises** token use. Wrong default for a suggestion worker.
7. **Enum-of-all-clubs** is documented as a schema feature, not as a supported 5k-value production pattern. Weak idea until measured; alias-match is the conservative design.
8. **Huddle README latency/cost** was not re-read from a live huddle repo in this pass (path not in this workspace). Figures treated as the brief’s claim and checked only against current vendor price lists.
9. **Groq / Together / Fireworks training-on-API-data** sentences were not all retrieved as cleanly as OpenAI/Google/Anthropic. Do not send collection photos there in MVP.
10. **Fireworks per-model vision prices** were not extracted from the JS pricing app. Skipped rather than guessed.

---

## Sources

| URL | What it supports |
| --- | --- |
| https://developers.openai.com/api/docs/pricing.md | OpenAI per-1M rates for gpt-4o, gpt-4o-mini, gpt-4.1-nano/mini, gpt-5.6-luna, batch/flex/fast (fetched 2026-08-14) |
| https://developers.openai.com/api/docs/guides/images-vision.md | Vision input limits, detail levels, tile vs patch tokenization, gpt-4o-mini 2833/5667 multiplier, limitations |
| https://developers.openai.com/api/docs/models.md | Current models; all latest support image input; Luna/Terra/Sol recommendation |
| https://developers.openai.com/api/docs/models/gpt-4.1-nano.md | $0.10/$0.40, vision, structured outputs, no reasoning step |
| https://developers.openai.com/api/docs/models/gpt-5.6-luna.md | $0.20/$1.20, vision, structured outputs, default medium reasoning |
| https://developers.openai.com/api/docs/guides/structured-outputs.md | json_schema strict, enum, no hallucinated enum values |
| https://developers.openai.com/api/docs/guides/your-data.md | API not used for training since 2023-03-01; 30-day abuse logs; ZDR; image CSAM exception; EU residency |
| https://ai.google.dev/gemini-api/docs/pricing | Gemini 2.5/3.x Flash and Flash-Lite paid rates; free vs paid training flag (fetched 2026-08-14) |
| https://ai.google.dev/gemini-api/docs/image-understanding | 20 MB inline, 3600 images/request, 258-token / 768-tile rule, media_resolution, updated 2026-07-30 |
| https://ai.google.dev/gemini-api/docs/structured-output | JSON Schema, string `enum`, model support table including Flash-Lite |
| https://ai.google.dev/gemini-api/terms | Paid: no training on prompts/files/images; free: used to improve products |
| https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite | Flash-Lite capabilities: image in, structured outputs, thinking |
| https://platform.claude.com/docs/en/about-claude/pricing | Haiku 4.5 $1/$5, Sonnet 5 $2/$10 lasting price |
| https://platform.claude.com/docs/en/build-with-claude/vision | Image limits, 28×28 visual tokens, 1000×1000 Haiku cost example, ephemeral images, no training on uploads |
| https://platform.claude.com/docs/en/about-claude/models/overview | All current models vision; Haiku “Fastest”; knowledge cutoffs |
| https://platform.claude.com/docs/en/build-with-claude/structured-outputs | GA schema, enum, capitalization caveat |
| https://www.anthropic.com/legal/commercial-terms | “may not train models on Customer Content from Services” |
| https://privacy.claude.com/en/articles/7996885-how-do-you-use-personal-data-in-model-training | Commercial API: no training on chats unless opt-in / feedback |
| https://console.groq.com/docs/vision.md | Groq vision, qwen3.6-27b, JSON mode, 20 MB |
| https://console.groq.com/docs/model/qwen/qwen3.6-27b.md | $0.60/$3.00, ~500 t/s, max 3 images, Preview, reasoning_effort none |
| https://docs.together.ai/docs/vision-overview | 1601 tokens/tile, 2×2 cap, 6404 tokens for typical photos |
| https://docs.together.ai/docs/serverless-models.md | Qwen3.5 9B vision $0.17/$0.25 |
| https://docs.fireworks.ai/guides/querying-vision-language-models | Official VLM API, 30 images, size/timeout limits, prompt cache |
| https://openrouter.ai/docs/features/images-and-pdfs | Router, not a model; skip as extra subprocessor |
| https://developer.apple.com/documentation/vision/recognizing-text-in-images | On-device OCR only |
| https://developers.google.com/ml-kit/vision/text-recognition/v2 | On-device OCR only |
| ./jersey-registration-speed.md | Capture flow, 1600 px resize, OCR later, Nielsen 10 s, on-device ≠ club ID |

**Gate:** Green for research completeness against the brief (official pricing/docs dated 2026-08-14). No app code. Jersey-ID accuracy remains unmeasured — Yellow if someone treats Flash-Lite as “it will know Brøndby 98” without a beta fixture set.
