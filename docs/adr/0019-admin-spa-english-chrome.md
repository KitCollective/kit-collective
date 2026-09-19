# Admin SPA chrome is English

Expo and Astro stay Danish-first for collectors. Admin SPA chrome (buttons, filters, empty states, errors) is English — the operator surface follows the Base dashboard references, not the collector locale. CatalogLabel on this surface is requested as `en` (fallback `mul` → `en`). Search still matches aliases in every locale. This is not a second i18n product; it is the default for one internal SPA. Danish admin chrome can wait.

Status: accepted.
