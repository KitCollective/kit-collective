# NativeTabs + overview swipe landing hop — NotebookLM deep research

**Date:** 2026-09-05  
**Product:** KitCollective  
**NotebookLM:** [NativeTabs pager swipe landing hop](https://notebooklm.google.com/notebook/7b680cf8-a1c0-4dd9-96c5-df22e7209d95)  
**Deep research task:** `8df83fc8-608c-4964-8a70-d59f6d703c48` (54 sources, imported 14 cited)

**Question:** Hvorfor hopper hele overview-containeren ned og tilbage, og hvorfor blinker elementer, når man finger-swiper mellem NativeTabs-oversigter og JS bagefter kalder `router.navigate`?

## Answer

Hoppet ned-og-tilbage er **iOS automatic content inset på den første `UIScrollView`**, ikke titel-typography og ikke en coalesce der pin’er device-34.

`react-native-pager-view` v8 wrapper en SwiftUI `UICollectionView` (selv en `UIScrollView`) som først kalder `setupView()` i `didMoveToWindow`. Inactive NativeTabs er **ikke** i window. Ved `router.navigate` attaches destination-fanen → hosting controller oprettes → UIKit sætter `contentInsetAdjustmentBehavior = automatic` (top + tab bar) → indholdet falder ned → et senere layout / `ignoreSafeArea: true` tager det tilbage. Det matcher optagelsen.

JS-padding alene kan ikke stoppe første frame: `useSafeAreaInsets` er asynkront ([safe-area-context docs](https://docs.expo.dev/versions/latest/sdk/safe-area-context/)). Nested `SafeAreaProvider` i `NativeTabsView.ios.js` har ingen `initialMetrics`, så pre-attach måler **34**, post-attach **83** ([expo/expo#42486](https://github.com/expo/expo/issues/42486), [react-native-screens#3573](https://github.com/software-mansion/react-native-screens/issues/3573)).

Den forrige “pin window/device 34”-patch ramte **forkert kant**. Expo’s egne workaround (issue 42486): **største** bottom er altid den rigtige. `tabBarContentInset` må ikke lægge 49 oven i en already-bounded 83.

`disableAutomaticContentInsets` på Trigger sætter `overrideScrollViewContentInsetAdjustmentBehavior: false`. RNS-helperen kan **kun** skifte Never → Automatic; den sætter aldrig Never. PagerView v8 starter som Automatic. Opt-out forhindrer derfor ikke hoppet.

**Hvad vi gør:** (1) module-level max-cache af insets + `tabBarContentInset` der ikke double-counter; (2) erstat outer `PagerView` med en Reanimated-række, så NativeTabs-attach ikke remounter en SwiftUI-pager.

**Evidensstyrke:** Stærk på årsag (Expo + RNS + pager-view source). Device-verifikation af Reanimated-pageren er HITL.

---

## Decision-relevant findings

### 1. Cache MAX bounded bottom — ikke pin window 34

marcospgp (expo/expo#42486), reproduced on SDK 55 (34→83):

> The larger value is always correct. Cache the largest bottom inset. First tab visited still flashes. Subsequent tabs use cached correct insets.

React context på tværs af tabs er **upålidelig** (NativeTabs isolerer trees). Module-level cache virker: destinationens første render kan synkront læse 83 fra Samling, selv mens dens nested provider stadig siger 34.

Pinning `initialWindowMetrics` (device 34) + `tabBarContentInset = 49 + bottom` er stabil **kun hvis** pin virker. Når live hopper til 83 og pin misser, bliver padding 91→140. Og det stopper ikke native PagerView-inset.

### 2. `tabBarContentInset` og bounded 83

Hvis chrome bruger bounded 83, er tab bar allerede med. Læg ikke 49 oveni.

Kompensation: `bottom >= 50` → brug `bottom + insetSm`; ellers `49 + bottom + insetSm`. Så er 34 og 83 samme padding (91).

### 3. Yoga/frame ved attach

kkafar (RNS #3573): prerendered tabs er **ikke** laid out natively; kun Yoga, uden tab bar. JS-padding kan ikke blokere den native frame-update. Experimental `SafeAreaView` fra `react-native-screens/experimental` er synkron men ustabil API.

### 4. PagerView v8 er first `UIScrollView`

`PagerViewProvider.setupView` kører i `didMoveToWindow` og laver `UIHostingController(..., ignoreSafeArea: true)`. Første descendant-`UIScrollView` i tabben er UICollectionView.

iOS 11+: hver scroll view med Automatic justerer sig selv (ikke kun “første child” fra den gamle `automaticallyAdjustsScrollViewInsets`). En dummy ScrollView hjælper derfor ikke.

Expo #43056: per-view `contentInsetAdjustmentBehavior="never"` ignoreres inde i NativeTabs; Trigger-opt-out er den eneste officielle knap — og den tvinger ikke Never på PagerView.

### 5. freezeOnBlur / opacity-gate / JS tabs

- freezeOnBlur: hoppet er first attach, ikke blur. Nul effekt.
- Opacity 0 indtil `bottom >= 83`: skjuler hoppet men viser blank når NativeTabs skifter — ser ud som blink.
- JS `Tabs`: ét shared VC, ingen 34→83. Bryder design lock + KIT-42 (Liquid Glass NativeTabs). Nej.

### 6. Ingen delt view-instans

Expo Native tabs docs: hver tab er et isoleret subtree. Én PagerView på tværs af tabs er ikke muligt.

---

## What we already tried (and why it missed)

| Attempt | Why it missed |
| --- | --- |
| Defer `router.navigate` until pager idle | Pill requires a tab switch; attach still remounts PagerView |
| Hold neighbour pages on blur | Stops outgoing index-0 snap; destination PagerView still setups on window |
| `disableAutomaticContentInsets` | Does not set PagerView’s collection view to Never |
| Coalesce only when live === 0 | 34 is already non-zero |
| Pin `initialWindowMetrics` (device 34) | Wrong edge vs Expo workaround; does not stop native automatic inset |

---

## Implementation (this pass)

1. `rememberLargestInsets` / module cache in `useStableSafeAreaInsets`.
2. `tabBarContentInset` skips the extra 49 when bottom is already bounded.
3. Outer overview pager is a Reanimated + Gesture Handler row (`place-pager.tsx`). Inner Indbakke Beskeder|Aktivitet stays `PagerView`.
4. NativeTabs + Liquid Glass bar unchanged (KIT-42).

---

## Primary-source follow-up (node_modules + Expo docs)

A parallel pass over Expo docs and `apps/mobile/node_modules` (SDK 57 / pager-view 8.0.2) agrees on lock and cause, and disagrees on keeping outer `PagerView`:

- **Keep NativeTabs + five nested stacks.** Not JS `<Tabs>`, not `FloatingTabBar`, not `BottomAccessory` as content host, not a sibling overlay (that covers drills unless gated by stack depth — not a NativeTabs API). KIT-42 stands.
- **NativeTabs wraps each screen in `SafeAreaProvider` without `initialMetrics`**, skipping `SafeAreaProviderCompat` which stacks use to avoid nested providers (`NativeTabsView.ios.js` vs `SafeAreaProviderCompat.js`). Unfocused tabs can report `safeAreaInsets == 0` then jump.
- **`disableAutomaticContentInsets` is a no-op when the first descendant is already UIKit `automatic`.** Helper only does Never→Automatic (`RNSScrollViewHelper.mm`).
- **PagerView 8 `TabView.id(props.children.count)`** remounts if child count changes; `initialPage` is applied once. Pre-sync `setPageWithoutAnimation` before `navigate` would only help a destination that still used PagerView.
- **Outer overview is Reanimated, not five PagerViews.** That is the delta vs “keep PagerView and lift top padding outside it”: removing the `UICollectionView` removes the native hop-down-then-back. Inner Indbakke still uses PagerView. Destination row starts at `hostedIndex`, so a separate pre-sync index is redundant.

---

## Sources

| Source | What it owns |
| --- | --- |
| NotebookLM deep report, task `8df83fc8-608c-4964-8a70-d59f6d703c48` | Synthesis + recommended cache / gate / JS-tabs order |
| [expo/expo#42486](https://github.com/expo/expo/issues/42486) | 34→83 flash; max-bottom workaround |
| [software-mansion/react-native-screens#3573](https://github.com/software-mansion/react-native-screens/issues/3573) | Yoga-only prerender; experimental SafeAreaView |
| [AppAndFlow/react-native-safe-area-context#689](https://github.com/AppAndFlow/react-native-safe-area-context/issues/689) | Nested provider ignores parent `initialMetrics` |
| [expo/expo#43056](https://github.com/expo/expo/issues/43056) | Per-ScrollView `never` ignored; RNS PR 3655 |
| [Expo Native tabs](https://docs.expo.dev/router/advanced/native-tabs/) | Safe area, `disableAutomaticContentInsets`, eager tabs |
| `react-native-screens` `RNSScrollViewHelper.mm` | Only Never→Automatic |
| `react-native-pager-view` `PagerViewProvider.swift` / `PagerView.swift` | `didMoveToWindow` + `TabView.id(children.count)` |
| `expo-router` `NativeTabsView.ios.js` | Nested `SafeAreaProvider` without `initialMetrics` |
| `expo-router` `SafeAreaProviderCompat.js` | Stacks skip nested providers when insets exist |
