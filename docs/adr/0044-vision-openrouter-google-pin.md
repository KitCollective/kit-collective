# Vision inference via OpenRouter pinned to Google

Collector Vision uses OpenRouter `google/gemini-2.5-flash-lite`. Nest sends identity and grouping photos with provider `only: google-ai-studio` + `google-vertex`, `allow_fallbacks: false`, `data_collection: deny`, and `sort: latency`. Thinking stays off. Direct `GEMINI_API_KEY` remains the fallback when OpenRouter is unset. Unset both → noop; Save still succeeds.

The key stays Nest-only (`OPENROUTER_VISION_API_KEY`). Expo never holds it. Factory Scout/Gate keep `OPENROUTER_API_KEY` and still must not receive collector photos.

Status: accepted.
Supersedes: the Vision sentence in ADR-0021 (“Vision still forbids OpenRouter”). Scout/Gate routing in ADR-0021 is unchanged.
