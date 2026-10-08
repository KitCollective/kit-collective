# Splash-baggrundsvideo — primary-source research

**Date:** 2026-09-05  
**Product:** KitCollective  
**Question:** Hvilken *slags* video (og hvilken historie) skal senere briefes til Higgsfield / `/to-video-brief` som unik splash-baggrund — fodbold, passion, samleobjekter, værdi — uden rigtige klubkits, med KitCollective som sponsor på fiktive præmietrøjer, og med storytelling frem for stum visuel marketing?

## Answer

Mute marketing-loop uden captions, bag splash-chromen. Formatet er låst af Nicklas (2026-09-05): **annonce, aktiv, loop, mute, ingen tekst i billedet.** Unfold/still-life er for vag — den viser objektet, men ikke produktets verbum.

**Produkthistorien (én transformation, tre led):**  
*Kampen forsvinder. Trøjen bliver. Samlingen vises.*  
KitCollective er stedet, hvor fodboldpassion bliver et visuelt katalog — det PRD kalder «samlet, visuelt overblik over sin trøjesamling på telefonen, der hvor trøjerne er», imod Facebook-gruppen og regnearket.

**Klippet at briefe:** to fiktive sider i KC-sponsor-præmietrøjer spiller (bur, nat, floodlight). Energien er rigtig fodbold. Når spillet klippes, er det trøjen der bliver i billedet, et shutter slår, og fliserne slår ind i et 4:5-gitter. Loop: gitteret sprænges tilbage til afspark. Ingen captions, ingen app-UI, ingen rigtige klubber, ingen DKK.

Stills-først (fiktive kits) → `generate_video`. Motion-låsen skal stadig åbnes som gap. Reduce Motion = første frame. Denne fil er research + brainstorm; den er **ikke** et brief.

---

## Decision-relevant findings

### A. Splash-fladen (chrome, launch, discovery)

- **Splash er first-session place `splash`, ikke iOS launch screen.** Ulogget start er `place: "splash"`; tap (`continueFromSplash`) går til `discovery`; dock Login / Opret går til `door` og sætter `skippedDiscovery: true` hvis man kommer fra splash. ([`apps/mobile/src/first-session/session.ts`](../../apps/mobile/src/first-session/session.ts) `FirstSessionPlace`, `createFirstSession`, `reduceFirstSession` `continueFromSplash` / `openDoor`)
- **Chrome på splash er allerede tekst + lockup.** Sort `fill.primary`-plade, hvid lockup (`kitcollective-lockup-white.png`), caption `Tryk for at fortsætte`, dock **Login** / **Opret konto**. ([`apps/mobile/src/first-session/splash-screen.tsx`](../../apps/mobile/src/first-session/splash-screen.tsx); copy i [`door-copy.ts`](../../apps/mobile/src/first-session/door-copy.ts) `SPLASH_CAPTION`, `SPLASH_LOGIN_LABEL`, `SPLASH_REGISTER_LABEL`)
- **Næste skærm er allerede jersey-grid i bevægelse.** Discovery henter showcase-UserJerseys og kører `DiscoveryMarquee` (stille under `reduceMotion`). CTA: “Tilføj din første trøje” / “Jeg har allerede en konto”. ([`discovery-showcase.tsx`](../../apps/mobile/src/first-session/discovery-showcase.tsx); [`discovery-copy.ts`](../../apps/mobile/src/first-session/discovery-copy.ts); [`discovery-marquee.tsx`](../../apps/mobile/src/first-session/discovery-marquee.tsx))
- **Apple skelner launch screen, splash og onboarding.** Launch screen: “isn't part of an onboarding experience or a splash screen, and it isn't an opportunity for artistic expression.” Splash: “a beautiful graphic that succinctly communicates branding”; vis den “just long enough for people to absorb the information at a glance without feeling that it’s delaying their experience.” Onboarding sker *efter* launching. ([Apple HIG Launching](https://developer.apple.com/design/human-interface-guidelines/launching); [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding). **Fetch-note:** `developer.apple.com` returnerede JS-skal; citaterne er HIG-teksten via spejl [Launching](https://apple-docs.everest.mt/docs/design/human-interface-guidelines/launching/) og [Onboarding](https://apple-docs.everest.mt/docs/design/human-interface-guidelines/onboarding/).)
- **Konsekvens (revideret efter Nicklas):** Loopende baggrund er *produktets first screen efter launch*, ikke Apples system-launch. Den må ikke forsinke tap. Historien fortælles **i billedet** (kamp → trøje → gitter), ikke med brændt tekst — chrome ejer allerede copy. En separat copy-ledet ads-film er valgfri senere, ikke et krav for splash. Discovery bagefter er evidens (rigtige UserJerseys), ikke anden marketing-loop.

**Evidensstyrke:** Stærk på repo-låsen og HIG-skellet. Svag på “hvad konkurrenter faktisk viser i appen” — se §G.

### B. Lock collisions

| Lås | Hvad den siger | Kollision med looping splash-video |
| --- | --- | --- |
| Motion | “No auto-playing loops on load except a loading indicator and the collection empty diagram (transform only; reduced-motion = still).” Quiet confirmation, never decoration. ([`docs/design-system.md`](../../docs/design-system.md) Foundations → Motion) | En autoplay-loop på splash er **ikke** på undtagelseslisten. Empty-diagrammet er den eneste tilladte decorative loop, og kun `transform`. Video er nyt. Kræver **gap i design-systemet**, ikke en stille implementering. |
| Reduced motion | “`prefers-reduced-motion: reduce` → durations ~0 / no transform travel.” Still equivalent. Collection empty: “reduced-motion = still.” Splash-kode har **ikke** `useReduceMotion` i dag. ([design-system Motion](../../docs/design-system.md); [`use-reduce-motion.ts`](../../apps/mobile/src/theme/use-reduce-motion.ts); empty diagram [`collection-empty-diagram.tsx`](../../apps/mobile/src/components/collection-empty-diagram.tsx)) | Video **skal** have et still-frame (første frame eller poster) der matcher `fill.primary` + hvid lockup. Uden det er det et lock-brud. |
| Jersey first | “The collector’s photo is the interface; chrome is grayscale scaffolding.” Wash, badges, meta viger for fotoet. ([Principles → Jersey first](../../docs/design-system.md)) | Fiktive AI-kits på splash er **ikke** collectorens foto. De må ikke se ud som katalog-KitPhoto og ikke stjæle lockup’en. |
| Ingen arkivkits | “No archive kit renders in Expo, Astro, or OG until rights are resolved. KitPhoto may render on `admin` only.” ([Constraints](../../docs/design-system.md); PRD Non-Goals) | Fiktive præmietrøjer er tilladt *hvis* de ikke ligner rigtige klubkits og ikke er arkiv-JPEG. De er **ikke** stamdata-Kit. |
| Marks from data | “Never emoji. Never an invented crest.” Violate: “a made-up shield, or an archive kit JPEG used as a club logo.” ([Principles → Marks from data](../../docs/design-system.md)) | Fiktive trøjer må **ikke** bære opfundne skjold/crests. KC-monogram/lockup er produktlogo, ikke catalog Mark. |
| Logo | Splash: lockup, white on dark. Colour `#0A0A0A` or `#FFFFFF` only. “Do not … place the logo on a busy jersey photo without a dark layer.” ([Logo](../../docs/design-system.md)) | Video bag lockup **skal** have mørkt lag (scrim). Logo må ikke ligge på travlt trøjefoto. Identity wash aldrig bag jersey-foto. |
| Color / splash canvas | Splash i kode: `backgroundColor: color.fillPrimary`. Light alias `fill.primary` → black. White lockup = dark canvas. Identity wash is garnish, “never behind a jersey photo.” ([splash-screen.tsx](../../apps/mobile/src/first-session/splash-screen.tsx); Color) | Video der lysner pladen eller putter wash bag trøjer bryder både splash-canvas og Color-låsen. |
| PRD værdi | “Platformen fastsætter ikke markedspriser eller økonomisk værdi for samlertrøjer.” ([`.scratch/Business/PRD.md`](../Business/PRD.md) Non-Goals) | “Værdi” i videoen er **samlerbetydning**, ikke pris, bud, “worth”, ticker eller StockX-sprog. |
| Chrome-tekst | Caption + dock er allerede der. ([door-copy.ts](../../apps/mobile/src/first-session/door-copy.ts)) | Brændte video-captions konkurrerer med “Tryk for at fortsætte” / Login / Opret. Splash plate: **ingen** brændt tekst. Story film: copy OK. |
| CONTEXT nouns | **Kit** = catalog shirt design. **UserJersey** = collector’s owned instance. ([`CONTEXT.md`](../../CONTEXT.md) Language) | Videoen viser hverken rigtige Kit-rækker eller UserJerseys. Fiktive præmietrøjer er marketing-rekvisitter. Script må ikke kalde dem “listings”, “the shirt” som katalog, eller “jersey” for catalog-rækken. |

**Apple Motion (HIG):** “Don’t add motion for the sake of adding motion.” “Make motion optional.” “Let people cancel motion.” ([HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion); spejl [Motion](https://apple-docs.everest.mt/docs/design/human-interface-guidelines/motion/))

**Apple Accessibility:** “Let people control audio and video playback. Avoid autoplaying audio and video content without also providing controls to start and stop it.” Reduce Motion: “ensure your app or game responds by reducing automatic and repetitive animations, including zooming, scaling, and peripheral motion.” ([HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility); spejl [Accessibility](https://apple-docs.everest.mt/docs/design/human-interface-guidelines/accessibility/))

**WCAG 2.2 SC 2.2.2 Pause, Stop, Hide (Level A):** For moving/blinking/scrolling that (1) starts automatically, (2) lasts more than five seconds, and (3) is presented in parallel with other content, there must be a mechanism to pause, stop, or hide it unless essential. Splash har caption + dock **parallelt** med en baggrund. En loop > 5 s kræver pause/stop/hide *eller* at Reduce Motion erstatter videoen med still (ingen bevægelse = kriteriet gælder ikke). **Understanding-siden** `https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html` **timed out** i dette run; SC-teksten er fra [WCAG 2.2 TR](https://www.w3.org/TR/WCAG22/#pause-stop-hide).

**Expo Video (første parti):** `expo-video` kan loope og mute: `player.loop = true`; `player.muted` (default `false` — skal sættes `true`); `play()` i `useVideoPlayer`-setup. `nativeControls` default `true` — splash skal `nativeControls={false}`. Lokal fil via `require`. `onFirstFrameRender` til at skjule poster. PiP/background **ikke** til splash. ([Expo Video](https://docs.expo.dev/versions/latest/sdk/video/) — `VideoPlayer.loop`, `muted`, `VideoView.nativeControls`, usage example with `player.loop = true`)

### C. IP / kit design — fiktive præmietrøjer (ikke juridisk rådgivning)

Dette er evidens til grill, **ikke** counsel. KitCollective skal have advokat, før noget renders offentligt.

- **WIPO, hvad et varemærke er:** “A trademark is a sign capable of distinguishing the goods or services of one enterprise from those of other enterprises.” Registration “will confer an exclusive right to the use of the registered trademark.” Sports: “Sports trademarks are central to secure sponsorship deals and release product merchandising.” Også: “Article 6ter is used to protect armorial bearings, flags and other state emblems…” ([WIPO Trademarks](https://www.wipo.int/trademarks/en/). En sports-under-URL (`/web/trademarks/sports`) **404**’ede i dette run.)
- **EUTMR art. 9:** Indehaveren “shall be entitled to prevent all third parties not having his consent from using in the course of trade” et identisk/lignende tegn, inkl. likelihood of confusion og (ved omdømme) unfair advantage. Forbudte handlinger inkluderer “using the sign … in advertising.” ([EUR-Lex, Regulation (EU) 2017/1001, Article 9](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32017R1001))
- **FIFA Equipment Regulations (digitalhub PDF, ældre udgave — Acting President Issa Hayatou):** Officielle kits bærer **Official Member Association Emblem**, Name, Flag, Manufacturer’s Identification; sponsorreklame på landsholdskit i Pitch Area er “strictly prohibited” (art. 57.1), med Club World Cup-undtagelse for klubber. Art. 11.2 tillader emblem, mascot/symbol, name, flag på brystet. ([FIFA Equipment Regulations PDF](https://digitalhub.fifa.com/m/4028a792bb93a722/original/q3drmdesvc8bbmanff8d-pdf.pdf) Definitions; arts 10–11, 57)
- **FIFA Club World Cup 2025 (oktober 2024):** “The FIFA Equipment Regulations … in force apply to all matches.” Klubber indsender first-choice og alternative kits til FIFA-godkendelse. Farver skal kontrastere. ([FCWC 2025 Regulations](https://digitalhub.fifa.com/m/18848e4224efbd91/original/FCWC25_Regulations_EN.pdf) arts 4.1, 27.1–27.3)

**Hvad vi vil have — det omvendte:** Fiktive trøjer der *ikke* er officielle kits. FIFA-reglerne er evidens for, at rigtige kits er tæt pakket med beskyttede emblemer, manufacturer-ID og (klub) sponsor. KC-trøjer skal bære **vores** lockup som brystsponsor og **ingen** andens emblem.

**Praktiske designregler til senere brief (fra låsen + ovenstående, ikke fra counsel):**

1. Ingen rigtige klubnavne, forkortelser, crests, nickname, eller “lookalike” skjold. Design-systemet forbyder already “made-up shield”.
2. Ingen klub-kodede colourways (ikke FCK-hvid/blå, United-rød, osv.). Hold stoffet i grayscale + ét KC-neutralt felt, eller en farve der *ikke* læses som en Superliga/PL-side.
3. KC-lockup kun `#0A0A0A` eller `#FFFFFF`; clear-space; mørkt lag hvis trøjen er travl. Ikke wash på trøjen.
4. Ingen manufacturer-chevrons, tre striber, swoosh, eller “tech” labels der ligner Adidas/Nike/Puma.
5. Ingen nameset der er rigtige spillere. Hvis nummer: fiktivt, ikke “10” på et rød/hvid-kit der kan læses som en kendt side.
6. Trøjen er **ikke** et Kit og **ikke** en UserJersey. Den er en rekvisit.

**2025 FIFA Equipment Regulations** som selvstændig 115-siders PDF blev **ikke** hentet first-party i dette run (blogs peger på fifa.com; digitalhub-filen ovenfor er den ældre udgave). Club World Cup 2025 bekræfter, at *the Equipment Regulations in force* stadig styrer kit-mærkning.

### D. Story candidates (3–5)

Hver: logline, beats, lock fit/fail, brændt tekst.

#### 1. “Hænderne” — samleobjekt som omhu

- **Logline:** Hænder folder, hænger, fotograferer fiktive præmietrøjer; KitCollective sidder som brystsponsor; lyset kører hen over stof.
- **Beats:** (1) Mørkt rum, ét stof i bevægelse. (2) Hænder løfter trøjen — KC-lockup læses. (3) Trøjen hænger på en stang blandt andre fiktive trøjer. (4) Et kamera-shutter-øjeblik (uden UI). Loop tilbage til stof.
- **Fit:** Passion som handling, ikke pris. Jersey-first *som objekt*. Aktiv nok (hænder).  
  **Fail-risiko:** Unboxing/haul-energi (UGC-unboxing). For stille til “active”. Hænder kan se ud som marketplace-foto.
- **Brændt tekst:** Nej på splash. Story film: ja, dansk voice om *samling*, ikke kroner.

#### 2. “Banen, men fiktiv” — match-energi

- **Logline:** Fiktive spillere i fiktive kits løber; kamera finder KC-sponsor på brystet; cut til trøjen på en knage.
- **Beats:** Løb → tacklinger i sløret baggrund → close-up sponsor → trøjen som objekt.
- **Fit:** “Active” og fodbold.  
  **Fail:** Ligner rigtig broadcast. Colourways og kropsprog trækker klubassociation. FIFA/EUTMR-risiko hvis kits *minder*. Motion lock: for meget perifer bevægelse (HIG vision/periphery; Reduce Motion).
- **Brændt tekst:** Nej på splash (scoreboard/navne er forbudt — de *er* tekst og kan ligne rigtige klubber).

#### 3. “Lys over stof” — stille relikvie

- **Logline:** Ét fiktivt kit; én lyskilde; stof og søm; KC-pladen som det eneste mærke.
- **Beats:** Still-kamera, lys pan, loop.
- **Fit:** Samleobjekt, logo-clear, let at freeze til Reduce Motion.  
  **Fail:** Ikke “active”. HIG: “Don’t add motion for the sake of adding motion.” Nærmest dekorativ loop = lock-brud medmindre Nicklas åbner Motion-undtagelsen.
- **Brændt tekst:** Nej.

#### 4. “Fra krop til stang” — objektgørelse

- **Logline:** En fiktiv spiller tager trøjen af efter kamp; den bliver et objekt på en samlerstang.
- **Beats:** Krop/ryg (ingen ansigt nødvendigt) → trøjen løftes af → KC-sponsor → stang i mørkt rum.
- **Fit:** Storytelling uden captions: *kamp tøjet → samling*. Split: korte beats til splash-loop; fuld bue til story film.  
  **Fail:** Try-on/UGC-try-on hvis det bliver “fit check”. Ansigt kræver consent. Banescenen kan stadig klub-kode.
- **Brændt tekst:** Splash nej. Story film: “Det er ikke kampen. Det er trøjen.” (copy låses i brief; ikke en produktclaim her.)

#### 5. “Pris uden pris” — præmietrøje som ære, ikke kroner

- **Logline:** En fiktiv præmietrøje rækkes frem (hænder, podie-lys) og ender i en samling — uden beløb, uden auktion.
- **Beats:** Lys, hænder, trøje, stang. Ingen tal.
- **Fit:** “Prize jerseys” + PRD-værdi som betydning.  
  **Fail:** Podium + konfetti = design-system “No bounce, no confetti.” Trophy-cup kan ligne rigtige turneringer (UEFA/FIFA marks — **ikke** i billedet).
- **Brændt tekst:** Splash nej. Story film: må gerne sige *præmie*/*samling*; må **ikke** sige prisestimat.

### E. Produkthistorien (revideret 2026-09-05 efter Nicklas)

Unfold/hænder/stof er **forkastet som A-historie**. Den var et still-life af rekvisitten. Nicklas: mute marketing-annonce, aktiv, ingen captions, loop. Storytelling skal bære *produktet*, ikke stoffet.

**Hvad produktet faktisk lover** (PRD, ikke stemning): KitCollective løser, at seriøse samlere ikke har et sted at registrere, overskue og genfinde samlingen. Konkurrenten er Facebook-gruppen, regnearket og Instagram-feedet — ikke Superliga-broadcast. User goal: visuelt overblik på telefonen, der hvor trøjerne er. Produktbilledet er samlerens foto. Værdi er ikke kroner.

En mute loop kan kun fortælle én sætning. Den sætning er en **transformation med tre led**, ellers er den vag:

| Led | I filmen | I produktet |
| --- | --- | --- |
| 1. Passion | Fiktive KC-kits i spil — løb, aflevering, skud | Fodbold er hvorfor trøjen findes |
| 2. Objekt | Spillet klippes væk; trøjen bliver i rammen; shutter | Fotoet er produktbilledet; UserJersey, ikke kampen |
| 3. Samling | 4:5-fliser slår ind i et gitter | Samling — overblik i stedet for feed/regneark |

Uden led 1 er det et lookbook. Uden led 3 er det en sportsannonce for en klub, der ikke findes. Uden led 2 er det FIFA. Alle tre skal kunne læses uden tekst.

**Logline:** To sider spiller i vores præmietrøjer. Kampen ender. Trøjerne bliver en samling.

**9:16, ~10 s, mute, seamless loop — beat sheet**

| s | Billede | Hvorfor det er produkt, ikke stock-fodbold |
| --- | --- | --- |
| 0–2 | Bur / floodlight / nordisk nat. Afspark. To kits: mørk vs lys, **kun** KC på brystet, ingen kam. | Passion + vores rekvisit. Ikke Superliga-farver. |
| 2–5 | Aktivt spil tæt på: sprint, aflevering, et skud eller en duel. Ingen scoreboard, ingen tribune-tifo, ingen speaker. | Energi. Ikke broadcast. |
| 5–7 | Freeze på kroppen; trøjen trækkes af over hovedet (klassisk fodboldgestus) **eller** rives med i bevægelsen og bliver alene i billedet. KC-sponsor læses. | Objektet udskilles. Det er samlerens genstand. |
| 7–8 | Hvidt shutter-blink (ikke app-UI). Trøjen bliver en 4:5-flise. Flere præmietrøjer fra samme kamp lander som fliser. | Capture. PRD: fotoet er produktbilledet. |
| 8–10 | Fliserne slår ind i et to-kolonne gitter. Kort hold. | Samling. Overblik. |
| 10→0 | Gitteret sprænges / falder tilbage til afspark. Samme første frame. | Loop uden caption-CTA. Chrome ejer Login / Opret. |

Midterpladen (lockup-zonen) holdes mørkere end kanterne, så white lockup kan ligge ovenpå.

**Hvad vi aldrig viser i det her klip:** rigtige klubber, manufacturer-striber, tal/DKK, burned «Samling», app-skærm, confetti, ansigter der skal genkendes, nameset på kendte spillere.

**Runner-up hvis Nicklas vil have mere «samler» end «kamp»:** *Det tomme felt.* Gitter med én sort flise → aktiv jagt (løb, rum, præmietrøje findes i bevægelse) → shutter → feltet fyldes → loop åbner hullet igen. Det er ønskelisten. Svagere på fodboldpassion; stærkere på «genfinde».

`docs/video-system.md` **findes ikke** endnu. Senere `/to-video-brief` kører i **Lock**-mode før Brief.)

### F. Higgsfield routing (katalog 2026-09-05, 16 workflows)

`get_workflow_instructions` uden argument listede 16 workflows. `docs/video-system.md` er fraværende — routing her er til **senere** grill, ikke et brief.

| Workflow | Hinge vs splash plate | Verdict |
| --- | --- | --- |
| **`generate_video` (ordinary, ikke et af de 16 navngivne)** | Faceless-kataloget: “Topic alone is never enough: a generic video of/about something … uses ordinary video generation.” NOT for faceless: “silent animation, image-to-video, footage edits, ads…” | **Splash plate:** dette. Stum, ét klip/loop, image-to-video fra kit-stills. Tool-default: `seedance_2_5` for general video; `kling3_0` for multi-shot. (Higgsfield `generate_video` description; faceless `NOT for`) |
| `faceless-video` | “NOT for: … silent animation, … ads, product demos…” Låser narrator + burned subtitles. | **Ikke** splash. Ikke story film medmindre Nicklas vil have YouTube-explainer — det er et tredje job. |
| `ugc-product-video` | Product-only, voiceover, ingen talking head. Captions/UGC-framing. | **Ikke** splash (voice + burned captions vs chrome). **Kandidat** til story film hvis produktet er den fiktive trøje i hånden, ikke appen. |
| `ugc-review-video` / `ugc-unboxing-video` / `ugc-try-on-video` / `ugc-tutorial-video` | Talking head, unboxing-climax, try-on, Step N-captions. | Brænder talking-head/captions. **Ikke** splash. Try-on kun hvis story film *er* “jeg har trøjen på” — svag fit. |
| `ugc-website-video` | Hero er captured screenshots af en **URL**. | Expo har ikke en public page at fange. BRIEF-MD: “An Expo app with no public product page cannot be captured from a URL.” |
| `brand-asset-creation` | Stills: logo, merch, mockups. “Also not for … generic image generation” wait — it *is* for branded assets onto physical assets. | **Stills først:** fiktive kits med KC-sponsor. Ikke videoen. |
| `product-photoshoot` | “Do not use for … video ads.” Stills. | **Stills:** packshot af fiktiv trøje. Ikke videoen. |
| `character-sheet` | Multi-view character. | Kun hvis story film har en gentagelig fiktiv person. Ikke splash. |
| `ad-multiplier` | 4–30 s *existing* video → varianter. | Efter vi har ét masterklip. |
| `video-editing` | Higgsedit af *existing* footage. NOT generating new AI footage. | Assemble splash-loop / cut story — efter generate. |
| `subtitles` | Burn-in captions. | Splash: **nej**. Story film: måske. |
| `thumbnail-generation` | Covers, ikke video. | Story film-pakke, ikke splash. |
| `narrator` | Voiceover/talking head over clip. | Story film, ikke plate. |
| `website-builder-flow` | Websites. | Irrelevant. |

**Produktionsrækkefølge (kits skal designes som stills først):**

1. Lås fiktivt kit-look (farve, sponsor-placering, ingen crest) mod Logo + Marks-from-data — **Nicklas**.
2. `brand-asset-creation` og/eller `product-photoshoot` / `generate_image`: forside, ryg, close-up af KC-sponsor, hænder+trøje. Godkend stills.
3. `generate_video` med `medias[]` image refs: stum 9:16 loop til splash plate. Ingen captions.
4. Først derefter story film (egen brief, egen workflow — sandsynligvis `generate_video` med lyd *eller* `ugc-product-video` hvis Nicklas vil have voiceover-UGC).
5. `ad-multiplier` kun hvis vi skalerer ét godkendt klip.

**Ikke** at briefes i dette run. Skill: grill claims, sprog, duration; Higgsfield pinner modeller. ([`to-video-brief/SKILL.md`](../../.cursor/skills/to-video-brief/SKILL.md) Route)

### G. Collector-produkter: hvad first-party faktisk siger

Vi har **ikke** kørt apps. Tredjeparts flow-recaps (Page Flows, Mobbin) er **ikke** citeret. First-party listings/sites nævner **ikke** looping splash-video.

- **Apple (HIG):** Splash er et kort graphic i onboarding, ikke launch-art, ikke video. ([Launching](https://developer.apple.com/design/human-interface-guidelines/launching); [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding))
- **Discogs (App Store):** “Catalog, Collect & Shop Music” — collection, barcode, wantlist, “Collection value”. Ingen splash-video i listing. Support: collection-tab, scan, grid. ([App Store](https://apps.apple.com/us/app/discogs/id1036449551); [How To Use The Collection Feature On iOS](https://support.discogs.com/hc/en-us/articles/360039334454-How-To-Use-The-Collection-Feature-On-iOS). `discogs.com` homepage **timed out**.)
- **Letterboxd (App Store):** “The social app for film lovers” — log, diary, lists. “Sign in … or create an account”. Ingen splash-video i listing. (`letterboxd.com` **timed out**; [App Store](https://apps.apple.com/us/app/letterboxd/id1054271011))
- **GOAT (App Store):** Marketplace, drops, AR “sneakers on feet”. Ingen splash-video i listing. (`goat.com/about` **404**.) ([App Store](https://apps.apple.com/us/app/goat-sneakers-apparel/id966758561))
- **StockX (App Store):** Buy/sell verified sneakers; “collectibles” som kategori på GB-listing. Ingen splash-video i listing. (`stockx.com/about` **timed out**.) ([App Store](https://apps.apple.com/us/app/stockx-sneakers-and-apparel/id881599819))

**Læsning:** Kategorien sælger katalog, log og (GOAT/StockX) handel. Ingen first-party kilde i dette run dokumenterer en cinematic looping splash. Discogs’ “Collection value” er præcis den pris-sprog PRD afviser. KitCollective skal ikke kopiere det.

**Evidensstyrke:** Stærk negativ (listings nævner det ikke). Svag på in-app sandhed (apps ikke kørt).

---

## Open decisions for Nicklas

Disse går ind i en senere `/to-video-brief`-grill. Ingen svar opfindes her.

1. **Motion-lock gap:** Må splash være en *tredje* autoplay-loop (ud over loading + collection empty diagram), eller forbliver pladen `fill.primary` still indtil design-systemet åbnes?
2. **WCAG-mekanisme:** Reduce Motion-still alene, eller også en pause/stop i chrome for brugere uden Reduce Motion (SC 2.2.2, HIG Accessibility)?
3. **Hvor kører story-filmen?** Kun ads/Reels, eller også et sted i appen *efter* splash (ikke bag lockup)? Discovery har allerede UserJersey-marquee.
4. **Hvor mange fiktive kits** og hvilken farvepalette (grayscale-only vs ét neutralt felt)? Hvem godkender at de **ikke** ligner Superliga/PL-kits?
5. **KC som sponsor:** Lockup, wordmark eller filled monogram på brystet? Størrelse/clear-space vs læsbarhed i 9:16 close-up?
6. **Ansigter / hænder / krop:** Kun hænder, eller fiktiv spiller uden ansigt, eller character-sheet-persona?
7. **Lyd på story film:** Dansk voice, accent, eller kun billeder + captions? UGC-workflows defaulter amerikansk engelsk uden override.
8. **Claims-tabel:** Hvilke sætninger må story-filmen sige om produktet (ingen pris, ingen user counts, ingen authenticity-garanti)? Låses i `docs/video-system.md`.
9. **Launch vs splash still:** Skal Expo launch screen være identisk sort `fill.primary` (HIG: avoid flash), og er video-første-frame den samme sort?
10. **Counsel:** Er fiktive kits + KC-sponsor godkendt af advokat før Higgsfield-spend, eller venter vi?
11. **Spend:** Credits vs `use_unlim` — mennesket siger til, skill’en bruger ikke unlim af sig selv.

---

## Sources

**Repo**

- [`CONTEXT.md`](../../CONTEXT.md) — Kit vs UserJersey
- [`docs/design-system.md`](../../docs/design-system.md) — Taste; Constraints; Principles; Motion; Logo; Color; Empty state
- [`apps/mobile/src/first-session/splash-screen.tsx`](../../apps/mobile/src/first-session/splash-screen.tsx)
- [`apps/mobile/src/first-session/door-copy.ts`](../../apps/mobile/src/first-session/door-copy.ts)
- [`apps/mobile/src/first-session/session.ts`](../../apps/mobile/src/first-session/session.ts)
- [`apps/mobile/src/first-session/discovery-showcase.tsx`](../../apps/mobile/src/first-session/discovery-showcase.tsx)
- [`apps/mobile/src/first-session/discovery-copy.ts`](../../apps/mobile/src/first-session/discovery-copy.ts)
- [`apps/mobile/src/theme/use-reduce-motion.ts`](../../apps/mobile/src/theme/use-reduce-motion.ts)
- [`.scratch/Business/PRD.md`](../Business/PRD.md) — Non-Goals, ingen markedspris
- [`.cursor/skills/to-video-brief/SKILL.md`](../../.cursor/skills/to-video-brief/SKILL.md)
- [`.cursor/skills/to-video-brief/references/BRIEF-MD.md`](../../.cursor/skills/to-video-brief/references/BRIEF-MD.md)
- [`.cursor/skills/to-video-brief/references/VIDEO-SYSTEM-MD.md`](../../.cursor/skills/to-video-brief/references/VIDEO-SYSTEM-MD.md) — `docs/video-system.md` findes ikke i repoet i dette run

**Higgsfield MCP (session 2026-09-05)**

- `get_workflow_instructions` uden argument — 16 workflows + faceless `NOT for` / ordinary video generation
- `generate_video` tool description — ordinary generation, image refs, model defaults

**Apple**

- [HIG home](https://developer.apple.com/design/human-interface-guidelines/) — JS-skal i fetch
- [HIG Launching](https://developer.apple.com/design/human-interface-guidelines/launching) — citater via [spejl](https://apple-docs.everest.mt/docs/design/human-interface-guidelines/launching/)
- [HIG Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) — [spejl](https://apple-docs.everest.mt/docs/design/human-interface-guidelines/onboarding/)
- [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion) — [spejl](https://apple-docs.everest.mt/docs/design/human-interface-guidelines/motion/)
- [HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) — [spejl](https://apple-docs.everest.mt/docs/design/human-interface-guidelines/accessibility/)

**W3C / Expo**

- [WCAG 2.2 SC 2.2.2](https://www.w3.org/TR/WCAG22/#pause-stop-hide)
- [Understanding SC 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) — **timed out**
- [Expo Video](https://docs.expo.dev/versions/latest/sdk/video/) — `loop`, `muted`, `nativeControls`

**IP (ikke counsel)**

- [WIPO Trademarks](https://www.wipo.int/trademarks/en/)
- [EUTMR (EU) 2017/1001 Art. 9](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32017R1001)
- [FIFA Equipment Regulations (digitalhub PDF, ældre udgave)](https://digitalhub.fifa.com/m/4028a792bb93a722/original/q3drmdesvc8bbmanff8d-pdf.pdf)
- [FIFA Club World Cup 2025 Regulations](https://digitalhub.fifa.com/m/18848e4224efbd91/original/FCWC25_Regulations_EN.pdf)

**First-party listings (ingen in-app video evidens)**

- [Discogs App Store](https://apps.apple.com/us/app/discogs/id1036449551); [Discogs iOS collection](https://support.discogs.com/hc/en-us/articles/360039334454-How-To-Use-The-Collection-Feature-On-iOS)
- [Letterboxd App Store](https://apps.apple.com/us/app/letterboxd/id1054271011)
- [GOAT App Store](https://apps.apple.com/us/app/goat-sneakers-apparel/id966758561)
- [StockX App Store](https://apps.apple.com/us/app/stockx-sneakers-and-apparel/id881599819)

**Fetch-fejl / 404 i dette run**

- `developer.apple.com` HIG-sider: JS required
- WCAG Understanding pause-stop-hide: timeout
- `letterboxd.com`, `discogs.com`, `stockx.com/about`: timeout
- `goat.com/about`: 404
- WIPO sports-underpage: 404
- FIFA Equipment Regulations 2025 som separat first-party PDF: ikke hentet
