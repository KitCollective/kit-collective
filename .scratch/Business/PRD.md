# KitCollective – Nordisk platform for fodboldtrøjesamlere

**Version 2.0** · August 2026 · Erstatter `temp-PRD.md`

---

## Sammenfatning

KitCollective er samlerens katalog over fodboldtrøjer i Norden. Produktet løser
ét problem først: at seriøse samlere ikke har noget ordentligt sted at
registrere, overskue og genfinde deres samling. Facebook-grupper og regneark er
i dag standarden, og de er dårlige til alt andet end handel.

Forretningen bygges i tre lag. Abonnementet til 29 kroner om måneden er det
første, fordi det kan sælges uden partnere og beviser betalingsviljen.
Affiliate-formidling til de butikker, der allerede lever af nichen, lægges
ovenpå fra måned seks. Gebyr på handel mellem samlere kommer sidst, når der er
tæthed nok til at et lot får bud.

Det afgørende designprincip er, at de tre lag er det samme produkt. Ønskelisten
er i fase 1 en premium-funktion og i fase 2 et match mellem en navngiven køber
og en butiks lager. Der skal ikke bygges to produkter.

KitCollective bygges som en **mobilapp til iOS og Android**. Registrering sker
med trøjen i hånden, og kameraet er derfor ikke en detalje, men selve
indtastningsmetoden. Push-notifikationer er samtidig den eneste kanal, der gør
ønskelisten til en grund til at vende tilbage — en e-mail om en trøjematch
bliver læst en gang om ugen, en push bliver læst med det samme. Appen
suppleres af et **offentligt weblag uden login**, hvor samlinger og
katalogsider kan ses og deles. Uden det mister vi både organisk søgning og
muligheden for at dele en samling i en Facebook-gruppe, hvilket er den eneste
gratis distributionskanal, vi har.

### Væsentligste ændringer fra version 1

| Område | Version 1 | Version 2 | Begrundelse |
| --- | --- | --- | --- |
| Platform | Responsiv web, app "vurderes senere" | Native mobilapp til iOS og Android, med offentligt weblag | Kamera og push er ikke tilbehør, men produktets to vigtigste mekanismer |
| Pris | 15 DKK/md | 29 DKK/md | Stripes faste gebyr æder en femtedel af 15 kr. 29 kr. giver 110 % mere netto |
| Måltal | 5.000 registrerede på 3 mdr. | 1.500 registrerede på 6 mdr. | 5.000 svarer til 5 % af hele det nordiske publikum. Ikke opnåeligt |
| KYC | Fuld KYC ved oprettelse | Progressiv tillid; udvidet verifikation kun ved auktion | KYC er den dyreste friktion i onboarding og løser intet problem i MVP |
| Ønskeliste | Ikke med | Kernefunktion og primær premium-driver | Eneste funktion, der giver en grund til at vende tilbage ugentligt |
| Auktioner | Gebyr pr. listing i fase 2 | "Åben for tilbud" i fase 2, budsystem i fase 3 | Validerer efterspørgslen uden regulatorisk og supportmæssig risiko |
| Partnerskaber | "Could have" | Eksplicit måltal: tre underskrevne partnere inden måned 6 | Uden partnere findes fase 2 ikke, og så er der kun abonnement |
| Marked | Ikke opgjort | Målt: ~100.000 unikke nordiske gruppemedlemmer | Alle måltal hviler nu på et målt publikum |

---

## Markedsgrundlag

Tallene er aflæst direkte på Facebooks offentlige gruppesider i august 2026. De
er et gulv, ikke et estimat: det er mennesker, der aktivt har opsøgt et sted at
købe, sælge og bytte fodboldtrøjer.

| Gruppe | Land | Medlemmer |
| --- | --- | --- |
| Køb, salg og bytte af fodboldtrøjer | DK | 39.881 |
| Køb – Salg – Bytte af Fodboldtrøjer | DK | 19.798 |
| Køb & Salg af KUN fodboldtrøjer | DK | 7.159 |
| Køb og Salg af Fodboldtrøjer | DK | 2.329 |
| Fodboldtrøje Fanatiker Gruppen | DK | 946 |
| Kjøp, Salg og bytte av fotballdrakter og sko | NO | 40.100 |
| Köp/Sälj Fotbollströjor Sverige | SE | 13.700 |
| Köp/Sälj Fotbollströjor Sverige! | SE | 2.500 |
| Fotboll köp/sälj Sverige | SE | 738 |

Grupperne overlapper kraftigt — de samme danskere er typisk med i tre eller
fire. Korrigeret for overlap er det unikke nordiske publikum omkring **100.000
mennesker**.

**Danmark er det stærkeste marked.** Den største danske gruppe er på højde med
den største norske i et land med en tredjedel færre indbyggere. Sverige er
påfaldende underforsynet: den største svenske gruppe er en tredjedel af den
danske, og svenske samlere handler i stedet på Tradera og internationale sites.
Det er et hul, ikke et fravær af interesse.

**Distribution er ikke problemet.** Den største danske Facebook-gruppe har flere
medlemmer end samtlige trøjesamler-apps i verden tilsammen. Publikummet findes,
det er samlet, og det er gratis at nå. Problemet er, at ingen endnu har fået de
mennesker til at betale for et katalog.

---

## Positionering og konkurrence

Vi konkurrerer ikke med Classic Football Shirts eller Vinted. Vi konkurrerer med
et regneark, en Facebook-gruppe og et Instagram-feed.

| Alternativ | Hvad det gør godt | Hvor vi kan slå det |
| --- | --- | --- |
| Regneark | Total fleksibilitet: varianter, nameset, købspris, noter | Billeder, struktur, søgbarhed og deling — hvis vi ikke er mere rigide end Excel |
| Facebook-grupper | Gebyrfri handel og peer-review af ægthed på minutter | Struktureret ønskeliste og match i stedet for at scrolle opslag |
| Shirt Squad | 100.000+ trøjer i database, brugerindsendelse med godkendelse, premium siden sommer 2026 | Kun engelsk, ingen nordisk data, ~500 installationer efter to år |
| MyFootballShirts | Samme koncept, gratis, syv sprog | Under 1.000 downloads. Manuel indtastning uden fælles katalog |
| Instagram | Rækkevidde og kulturel kapital | Ikke slå det — levere billeder til det |

**Kataloget alene er ikke et forspring.** Shirt Squad har allerede bygget præcis
den model, vi har låst — fælles database, brugerindsendelse med godkendelse,
felter helt ned til nameset-font — og har omkring 500 installationer efter to
år. Det er bevist, at man kan bygge det, og at det ikke i sig selv skaffer
brugere.

Positionen skal derfor være én af tre: **bedste nordiske database**, **hurtigste
registrering**, eller **stærkeste nordiske community**. Vi vinder på de to
første i MVP og bruger den tredje som distribution.

---

## Goals

### Business Goals

- Etablere KitCollective som standardkataloget for fodboldtrøjer i Norden, med
  Danmark som første marked og Sverige og Norge fra måned tre.
- Nå 1.500 registrerede brugere og 75 betalende abonnenter inden for seks
  måneder efter lancering.
- Underskrive mindst tre butikspartnere inden måned seks, så affiliate-laget kan
  aktiveres.
- Bevise, at nordiske samlere vil betale 29 kroner om måneden for katalog og
  discovery — eller afkræfte det hurtigt og billigt.
- Opbygge et verificeret katalog over klubber, ligaer, sæsoner og spillere, som
  er dyrt for andre at kopiere.

### User Goals

- Få et samlet, visuelt overblik over sin trøjesamling på telefonen, der hvor
  trøjerne er.
- Kunne registrere en trøje på under et minut med de felter, samlere faktisk
  bruger.
- Definere en drømmetrøje præcist og få besked, når den dukker op — uden at
  skulle scrolle Facebook dagligt.
- Finde ud af, hvem der ejer en bestemt trøje, og kunne tage kontakt.
- Bidrage til kataloget, når noget mangler, og se sit bidrag blive fælles data.

### Non-Goals

- KitCollective håndterer ikke betaling, fragt, returnering, reklamation eller
  tvistløsning mellem samlere i version 1.
- Platformen fastsætter ikke markedspriser eller økonomisk værdi for
  samlertrøjer. Prisestimater er den mest klagede funktion i hele kategorien, og
  trøjer er sværere at prissætte end kort, fordi stand, variant og nameset
  varierer voldsomt.
- Vi bygger ikke en fuld markedsplads. Kontakt mellem samlere er organisk,
  platformen er ikke part i handlen.
- Vi lancerer ikke på engelsk eller uden for Norden i version 1.
- Vi bygger ikke automatisk billedgenkendelse i MVP, men kamera-flowet og
  datamodellen skal kunne bære det senere. Genkendelse af mærke- og
  størrelseslabel er den mest oplagte version 2-funktion, fordi den angriber
  kategoriens hovedproblem direkte.
- Vi bygger ikke en web-app til registrering og redigering. Weblaget er
  læseadgang og deling, intet andet.

---

## Free og premium

Låst beslutning. Gratis er det personlige katalog inden for vores database.
Premium er netværket.

| Funktion | Lag |
| --- | --- |
| Personligt katalog med faste felter | Gratis |
| Offentlig visning af samling eller enkelt trøje | Gratis, og et valg — ikke betalt |
| Status: ikke tilgængelig / åben for bytte / åben for henvendelser | Gratis at sætte, kontakt kræver premium |
| Billeder, filtrering, sortering, eksport | Gratis |
| Ønskeliste med præcise kriterier og match-besked | Premium |
| Søgning i alle offentlige samlinger | Premium |
| Følg samlere og få besked ved nye uploads | Premium |
| Send henvendelse om en trøje | Premium |
| Foreslå manglende katalogdata | Premium |
| Giveaways | Premium |
| Auktioner: deltage og oprette | Premium, fase 3 |

**Offentlig visning er bevidst gratis.** Hvis kun premium-brugere kunne gøre
deres samling synlig, ville premium-søgningen være tom. Gratis-brugere leverer
det indhold, premium betaler for at søge i.

**Custom data er kun for premium.** Konsekvensen er, at kataloget skal være
seedet før lancering: Superligaen, de nordiske ligaer, landshold og de største
europæiske klubber. Ved et hul møder gratis-brugeren en opgraderings-CTA, ikke
et dødt felt: "Klubben findes ikke endnu — opgrader for at foreslå den."

**Pris:** 29 DKK pr. måned inklusive moms, med lokal prisvisning i SEK og NOK.
Anbefalet årsabonnement på 290 DKK. Tre dages gratis prøveperiode, som kræver
verificeret e-mail.

### Hvad app-platformen koster i abonnementsøkonomi

Apple og Google er merchant of record og trækker deres provision, før pengene
udbetales. Det er en ny omkostning i forhold til version 1, hvor betalingen gik
direkte gennem Stripe på web.

| Pr. abonnent pr. måned | Web (Stripe) | App Store, small business (15 %) | App Store, standard (30 %) |
| --- | --- | --- | --- |
| Kundens pris inkl. moms | 29,00 kr. | 29,00 kr. | 29,00 kr. |
| Moms 25 % | −5,80 kr. | −5,80 kr. | −5,80 kr. |
| Provision / gebyr | −2,21 kr. | −3,48 kr. | −6,96 kr. |
| **Netto til KitCollective** | **ca. 21,00 kr.** | **ca. 19,70 kr.** | **ca. 16,20 kr.** |

**Beslutning: ansøg om Apple Small Business Program og Googles tilsvarende
15 %-sats fra dag ét.** Begge gælder ved en årsomsætning under en million
dollar, hvilket vi ligger langt under. Med 15 % koster app-platformen os cirka
1,30 kroner pr. abonnent om måneden sammenlignet med web — omkring 6 procent.
Det er en acceptabel pris for push og kamera.

Ved 30 procent ville regnestykket derimod se anderledes ud, og ansøgningen er
derfor ikke en formalitet, men en forudsætning. Bemærk desuden, at EU's
Digital Markets Act tillader at henvise til betaling uden for appen. Det er
ikke besværet værd ved 75 abonnenter, men bør genbesøges, hvis abonnementet
vokser.

---

## User Stories

### Samler (gratis)

- Som samler vil jeg oprette mine trøjer med klub, sæson, størrelse, stand og
  spillertryk, så jeg har overblik over, hvad jeg ejer.
- Som samler vil jeg vælge land, liga og klub fra et katalog frem for at skrive
  fritekst, så mine data er ensartede og søgbare.
- Som samler vil jeg tilføje billeder af front, ryg og mærke, så samlingen er
  visuelt troværdig.
- Som samler vil jeg bestemme, om min samling er privat eller offentlig, så jeg
  kan dele uden at blive kontaktet om alt.
- Som samler vil jeg markere en trøje som åben for bytte eller henvendelse, så
  andre ved, hvad der er i spil.
- Som samler vil jeg eksportere min samling, så jeg ikke føler mig låst inde.

### Premium-samler

- Som premium-samler vil jeg oprette en ønskeliste med præcise kriterier —
  klub, sæson, størrelse, spillertryk, stand — så jeg kan definere min
  drømmetrøje.
- Som premium-samler vil jeg have besked, når en trøje, der matcher min
  ønskeliste, bliver registreret af en anden samler eller dukker op hos en
  partnerbutik.
- Som premium-samler vil jeg søge i alle offentlige samlinger, så jeg kan finde
  ejeren af en trøje, jeg har ledt efter i årevis.
- Som premium-samler vil jeg følge andre samlere og få besked ved nye uploads.
- Som premium-samler vil jeg foreslå en manglende klub, liga, spiller eller
  sæson, så kataloget bliver bedre for alle.
- Som premium-samler vil jeg prøve premium i tre dage, før jeg betaler.

### Platformadministrator

- Som administrator vil jeg modtage notifikation, når en premium-bruger
  foreslår katalogdata, så jeg kan verificere og promovere det til fælles
  metadata.
- Som administrator vil jeg moderere profiler, billeder og henvendelser, så
  communityet forbliver trygt.
- Som administrator vil jeg se, hvor lang tid der går fra en bruger opretter
  trøje nummer et til nummer to, fordi det er produktets vigtigste tal.

---

## Functional Requirements

### Konto og progressiv tillid — Must have

- Kontooprettelse med e-mail og adgangskode. Google-login som sekundær mulighed.
  **Sign in with Apple er obligatorisk**, hvis vi tilbyder tredjepartslogin —
  Apple afviser ellers appen.
- E-mailverifikation er eneste krav for at bruge gratis-laget.
- Valgfrit profilfoto og profiltekst.
- Rapportering og blokering af brugere fra dag ét.
- Konto- og privatlivsindstillinger, herunder synlighed af profil og samling.
- **Ingen ID-verifikation i MVP.** Udvidet verifikation indføres først som krav
  for at oprette auktioner i fase 3, eller for et "verificeret samler"-badge.

### Katalog og samlingsstyring — Must have

- Seedet katalog før lancering: lande, ligaer, klubber og sæsoner for Norden og
  de største europæiske ligaer.
- Opret, redigér, arkivér og vis trøjer i en personlig samling.
- Obligatoriske felter: klub, sæson, trøjetype (hjemme/ude/tredje/målmand),
  størrelse, stand.
- Valgfrie felter: spillertryk og nummer, ærmemærke, nameset-type, købssted,
  købsdato, noter.
- Ægthedsfelt med tre niveauer: ukendt (default), vurderet, verificeret.
- Ingen obligatorisk pris. Købspris er valgfri og altid privat.
- Status pr. trøje: ikke tilgængelig (default), åben for bytte, åben for
  henvendelser.
- Billeder tages med kameraet direkte i flowet, med anbefaling om front, ryg og
  mærke. Valg fra galleriet er muligt, men er ikke standardvejen.
- Filtrering, sortering og eksport af egen samling.
- **Krav til registreringshastighed:** trøje nummer to skal kunne oprettes på
  under 45 sekunder. Genbrug af sidste valgte land, liga og klub som
  forudfyldte værdier, og mulighed for at fortsætte direkte til næste trøje uden
  at gå tilbage til oversigten.

### Discovery og community — Must have

- Offentlige samlerprofiler med trøjeoversigt og samleinteresser.
- Søgning på land, liga, klub, sæson og trøjeattributter. Søgning i andres
  samlinger kræver premium.
- Visning af hvilke samlere der ejer en given trøje, når deres
  synlighedsindstillinger tillader det.
- Kontaktfunktion mellem samlere med tydelige rammer: dialogen foregår mellem
  brugerne, og KitCollective er ikke part i en eventuel handel.
- Badges og achievements for samlingsmilepæle, antal klubber, antal lande og
  community-bidrag.

### Offentligt weblag — Must have

Dette er ikke en "nice to have" ved siden af appen. Det er vores distribution og
vores eneste vej til organisk søgning.

- Offentlige samlingssider på web, tilgængelige uden app og uden konto.
- Offentlige sider for enkelte trøjer.
- Katalogsider pr. klub og sæson, som viser hvilke trøjer der findes, og hvor
  mange samlere der har dem.
- Delelige links med korrekt Open Graph-titel og -billede, så et opslag i en
  Facebook-gruppe ser ud som en samling og ikke som en URL.
- Deep linking: et delt link åbner appen, hvis den er installeret, og ellers
  websiden med en installationsopfordring.
- Ingen redigering på web. Alt, der skaber eller ændrer data, sker i appen.
- Respekterer brugerens synlighedsindstillinger fuldt ud. Privat betyder ikke
  indekseret.

### Ønskeliste og match — Must have

Dette er MVP'ens vigtigste funktion og den primære grund til at betale.

- Premium-brugere opretter ønskelisteposter med strukturerede kriterier: klub,
  sæson (eller interval), størrelse, spillertryk, stand, maks. pris (valgfri).
- Systemet matcher automatisk mod nyregistrerede trøjer, der er markeret åben
  for bytte eller henvendelser.
- **Push-notifikation ved match**, med deep link direkte til trøjen. E-mail er
  en sekundær kanal for brugere, der har afvist push.
- Brugeren kan gå direkte fra notifikation til henvendelse.
- **Datamodelkrav:** en ønskelistepost skal kunne matches maskinelt mod en
  ekstern varekilde, ikke kun mod interne trøjer. Feltnavne og
  kategori-identifikatorer skal designes med det for øje, selvom
  affiliate-laget først bygges i fase 2. Dette koster ingenting nu og sparer en
  ombygning senere.

### Custom data — Must have

- Premium-brugere kan foreslå manglende klub, liga, spiller, sæson eller
  variant.
- Forslaget indeholder type, navn og evidens i form af link eller foto.
- Administrator notificeres, verificerer og promoverer forslaget til kanonisk
  katalogdata.
- Først derefter kan alle brugere, inklusive gratis, vælge posten.
- Stamdata bliver aldrig et frit tekstfelt, der behandles som sandhed.
- **Servicemål: svar på forslag inden 48 timer.** Hvis svartiden bliver til
  dage, mister nye brugere deres første registrering.

### Premium og betaling — Must have

- Abonnement til 29 DKK pr. måned via in-app purchase, med lokal prisvisning i
  SEK og NOK gennem butikkernes prisniveauer.
- Årsabonnement til 290 DKK.
- Tre dages gratis prøveperiode, som kræver verificeret e-mail.
- **Gendan køb** skal være tilgængelig og synlig. Det er et krav fra Apple og en
  hyppig afvisningsgrund.
- Abonnementsvilkår, pris og fornyelse skal fremgå på købsskærmen, ikke kun i
  vilkårene. Også en hyppig afvisningsgrund.
- Kvitteringer valideres server-side. Abonnementsstatus er noget, vores backend
  afgør, ikke klienten.
- Ved udløb af premium bevares samlingen fuldt ud. Kun netværksfunktionerne
  begrænses. Ønskelisten bevares, men der sendes ikke match-beskeder.
- Butikkerne håndterer kortdata. Ingen kortoplysninger i vores database.

### Giveaways — Should have

- Månedlig giveaway i samarbejde med partnerbutik.
- Deltagelse forbeholdt premium.
- Tydelig markering af kommercielt samarbejde og synlige regler.

### Partnerformidling — Fase 2, ikke MVP

- Partnerbutikkers lager kan matches mod ønskelisteposter.
- Relevante købsmuligheder vises i søgeresultater og notifikationer.
- Alle kommercielle links markeres tydeligt og adskilles visuelt fra
  community-indhold.

### Handel mellem samlere — Fase 3, ikke MVP

- Fase 2 introducerer "åben for tilbud" og fremhævede opslag, som validerer
  efterspørgslen uden et budsystem.
- Fase 3 introducerer egentlige auktioner med sælgergebyr, forudsat at
  regulatoriske og supportmæssige forhold er afklaret, og at oprettelse kræver
  udvidet verifikation.

---

## User Experience

### Første besøg

Brugeren kommer typisk fra et link i en Facebook-gruppe. Linket åbner en
offentlig webside — som regel en anden samlers samling — hvor værdien er synlig,
før noget skal installeres. Derfra fører en tydelig opfordring til App Store
eller Google Play.

I appen oprettes konto med e-mail eller Apple-/Google-login, e-mailen bekræftes,
og brugeren føres direkte til at oprette sin første trøje med kameraet. Der er
ingen KYC-trin og ingen profilopsætning før første trøje — profil og billede kan
udfyldes senere.

Push-tilladelse spørges der **ikke** om ved opstart. Den spørges der om i det
øjeblik, brugeren opretter sin første ønskelistepost, hvor formålet er konkret:
"Vi giver dig besked, så snart nogen registrerer den her trøje." Bliver
tilladelsen afvist på det forkerte tidspunkt, mister vi produktets vigtigste
retentionsmekanisme, og den kan kun genvindes via systemindstillingerne.

Premium introduceres først, når brugeren har oprettet mindst én trøje og
forsøger noget, der kræver netværket. Det er der, værdien er konkret.

### Kerneflow

**Trin 1 — Opret trøje, kameraet først.** Flowet starter med at fotografere
trøjen, ikke med en formular. Brugeren står typisk med trøjen i hånden, og
billedet er det, der gør oprettelsen konkret. Derefter vælges land, liga og klub
via søgning eller navigerbare lister, og sæson, type, størrelse og stand
udfyldes. Felterne valideres, og manglende katalogdata udløser en
opgraderings-CTA frem for en blindgyde.

**Trin 2 — Se samlingen.** Trøjen vises som et visuelt kort. Samlingen kan
filtreres og sorteres. Ingen prisangivelse er påkrævet.

**Trin 3 — Gentag hurtigt.** Land, liga og klub er forudfyldt fra sidste
registrering. Målet er, at trøje nummer to og tre oprettes i samme session.

**Trin 4 — Definér drømmetrøjen.** Brugeren opretter en ønskelistepost med
præcise kriterier og får forklaret, at der kommer besked ved match. Dette er
det primære opgraderingsmoment.

**Trin 5 — Modtag match og tag kontakt.** Ved match sendes en push, der deep
linker direkte til trøjen — ikke til forsiden. Derfra kan brugeren åbne
profilen og sende en henvendelse i samme flow.

**Trin 6 — Del samlingen.** Brugeren kan dele et link til sin samling eller en
enkelt trøje. Linket åbner en offentlig webside, som kan ses uden app og uden
konto. Det er sådan, nye brugere kommer ind.

### Edge cases

- Brugere kan skjule enkelte trøjer eller hele samlingen.
- Kontaktfunktioner har rapportering og blokering.
- Udgåede klubnavne, særlige varianter og omdøbte ligaer håndteres som
  katalogposter med gyldighedsperiode, ikke som frit tekstfelt.
- Ved udløbet premium bevares ønskelisten, men der sendes ikke match-beskeder.
  Listen genaktiveres ved fornyelse.
- Kommercielt indhold, giveaways og partnerlinks markeres altid tydeligt.

### UI/UX-principper

- Appen skal føles som en app, ikke som en indpakket hjemmeside. Native
  navigation, native tastatur og gestures.
- Kameraet er en førsteklasses indtastningsmetode, ikke et vedhæftningsfelt.
- Strukturerede, søgbare felter frem for tunge fritekstformularer. Alt, der kan
  vælges, skal kunne vælges med tommelfingeren.
- Visuelt fokus på trøjebilleder med tydelige metadata.
- Tilgængeligt design: god kontrast, tydelige labels, understøttelse af
  systemets tekststørrelse og VoiceOver/TalkBack.
- Weblaget må gerne være enkelt, men skal se ordentligt ud, når det deles i en
  Facebook-gruppe. Open Graph-billede og titel er en funktion, ikke en detalje.
- Sproglig tilpasning til dansk, svensk og norsk planlægges fra start uden at
  duplikere kerneproduktet pr. land.

---

## Narrative

Mikkel har samlet på fodboldtrøjer i ni år. Samlingen ligger spredt mellem
skabe, kasser og gamle billeder på telefonen, og han ved ikke længere, hvad han
egentlig ejer. To gange har han købt en trøje, han allerede havde.

En aften i en Facebook-gruppe ser han et link, en anden samler har delt. Det
åbner en side med hele mandens samling, pænt opstillet med billeder, klubber og
sæsoner. Mikkel tænker det samme, som alle gør: det vil jeg også have. Han
henter appen.

Han står i kælderen med den første trøje i hånden, tager et billede, og vælger
land, liga og klub fra lister, der allerede er der. Første trøje tager under et
minut. Da han opretter nummer to, er felterne forudfyldt fra den første, og han
når gennem elleve trøjer, før han lægger telefonen fra sig.

Ugen efter opretter han en ønskeliste: Brøndby udebane, 1998/99, størrelse L,
gerne med spillertryk. Han opgraderer til premium for at kunne gøre det, og
appen spørger om lov til at sende ham en besked, når trøjen dukker op. Det siger
han selvfølgelig ja til. Halvanden måned senere lyser telefonen op midt i en
frokostpause: en samler i Malmø har registreret præcis den trøje og markeret den
som åben for bytte. Mikkel trykker på beskeden og er inde på trøjen med det
samme. De skriver sammen, og handlen sker mellem dem.

Et halvt år senere får Mikkel en anden slags besked: trøjen fra hans ønskeliste
nummer to er kommet på lager hos en dansk butik. Han klikker videre og køber
den. KitCollective har ikke solgt noget, men har formidlet en handel, ingen af
parterne selv kunne have fundet.

---

## Success Metrics

### Nordstjerne

**Antal trøjer registreret pr. aktiv bruger pr. måned.** Alt andet følger af,
om folk gider registrere.

### Brugermålinger

| Metrik | Mål ved 6 mdr. |
| --- | --- |
| Registrerede brugere | 1.500 |
| Aktivering: mindst tre trøjer inden syv dage | 25 % |
| **Median tid fra trøje nr. 1 til nr. 2** | **under 5 minutter** |
| Gennemsnitlig samlingsdybde pr. aktiv bruger | 15 trøjer |
| Retention efter 30 dage | 35 % |
| Retention efter 90 dage | 20 % |
| Andel brugere med mindst én ønskelistepost | 20 % |
| **Accept af push-tilladelse** | **70 %** |
| Konvertering fra besøg på offentlig webside til installation | 15 % |

Tiden fra trøje nummer et til nummer to er den vigtigste enkeltmåling i hele
produktet. Manuel indtastning er den dokumenterede dødsårsag for hele
kategorien, og hvis tallet ikke måles fra første dag, opdages problemet først,
når retention allerede er tabt.

### Forretningsmålinger

| Metrik | Mål ved 6 mdr. |
| --- | --- |
| Betalende abonnenter | 75 |
| Konvertering fra prøveperiode | 5 % |
| Månedlig nettoomsætning | ca. 1.575 DKK |
| **Underskrevne butikspartnere** | **3** |
| Match-rate: ønskelisteposter der udløser mindst ét match | 30 % |
| Andel registrerede fordelt på DK / SE / NO | 60 / 20 / 20 |

Antallet af butikspartnere er lige så vigtigt som antallet af abonnenter. Uden
mindst tre partnere kan affiliate-laget ikke aktiveres, og så er abonnement den
eneste indtægt.

### Tekniske målinger

- 99,5 % månedlig oppetid.
- Trøjeoprettelse gennemført på under 45 sekunder i median.
- Søgeresultat på under 500 ms ved 50.000 registrerede trøjer.
- Svartid på katalogforslag under 48 timer.
- Crash-fri sessioner over 99,5 % på begge platforme.
- Koldstart til brugbar skærm under to sekunder på en fire år gammel telefon.
- Push leveret og åbnet inden for fem minutter efter et match.

### Tracking plan

- Offentlig webside vist, kilde registreret, installations-CTA klikket.
- App installeret og åbnet første gang, med kilde hvor den kan udledes.
- Konto oprettet, e-mail verificeret.
- Push-tilladelse vist, accepteret eller afvist, med skærm hvor den blev vist.
- Push sendt, leveret og åbnet, opdelt pr. notifikationstype.
- Samling eller enkelt trøje delt, med kanal.
- Trøje oprettet, redigeret, arkiveret. **Tidsstempel på hver oprettelse.**
- Billede taget med kamera kontra valgt fra galleri.
- Registreringsformular påbegyndt og afbrudt, med felt for afbrydelsespunkt.
- Katalogmangel mødt, opgraderings-CTA vist og klikket.
- Katalogforslag indsendt, godkendt eller afvist, med svartid.
- Søgning udført og filtre anvendt.
- Ønskelistepost oprettet, match udløst, notifikation åbnet, henvendelse sendt.
- Profil åbnet, fulgt, kontaktet, blokeret eller rapporteret.
- Prøveperiode startet, konverteret eller udløbet.
- Abonnement fornyet eller opsagt, med opsigelsesårsag.
- Giveaway vist og deltagelse registreret.
- Partnerlink vist og klikket (forberedt, aktiveres i fase 2).

---

## Technical Considerations

### Platform

- **Mobilapp til iOS og Android** som det primære produkt. Ét delt kodegrundlag
  frem for to native apps; teamet er to til tre personer, og to kodebaser er
  ikke realistisk.
- **Offentligt weblag uden login** til visning af samlerprofiler, enkelte trøjer
  og katalogsider. Læseadgang, ingen redigering. Dette er ikke en "web-app", men
  en delings- og indekseringsflade.
- **Administrationsflade på web** til katalogforslag, moderering og partnerdata.
- Deep links skal virke begge veje: et delt link åbner appen, hvis den er
  installeret, og ellers websiden med en installationsopfordring.

### Behov

- Kontosystem, e-mailverificering, abonnementsstyring og rollebaseret
  administration.
- Push-notifikationer med granulær styring pr. type: ønskeliste-match, fulgt
  samler, henvendelse, systembesked. En bruger, der slår alt fra, skal kunne slå
  ønskeliste-match til igen alene.
- Kameraintegration til trøjebilleder direkte i registreringsflowet, med
  beskæring og komprimering på enheden.
- Offline-tolerance: en påbegyndt registrering må ikke gå tabt ved dårlig
  forbindelse. Kladder gemmes lokalt og synkroniseres.
- Datamodel for trøjer, klubber, ligaer, lande, sæsoner, spillere, profiler,
  følgere, ønskelisteposter, badges og henvendelser.
- Søgeindeks med filtrering på tværs af katalog- og brugerdata.
- Billedupload, moderering og sikker opbevaring.
- Notifikationssystem til match, følgning og henvendelser.
- Administrationsflade til katalogforslag med kø, godkendelse og afvisning.

### Datamodel — kritiske beslutninger

- **Katalogdata og brugerdata adskilles strengt.** En trøje i en samling peger
  på kanoniske katalogposter, den kopierer dem ikke. Det gør det muligt at
  rette en klubs navn ét sted.
- **Katalogposter har gyldighedsperiode**, så omdøbte klubber og nedlagte ligaer
  kan repræsenteres historisk korrekt.
- **Ønskelisteposter gemmes som strukturerede kriterier**, ikke som fritekst, og
  med felter der kan matches mod en ekstern varekilde.
- **Ægthed er et felt på trøjen**, ikke en egenskab ved brugeren, så
  verifikationsniveauer kan indføres senere uden migrering.

### Integrationer

- **In-app purchase via App Store og Google Play** til abonnement. Ingen kortdata
  hos os. Kvitteringsvalidering skal ske server-side, aldrig i klienten.
- **Push-udbyder** med understøttelse af både APNs og FCM.
- E-mailudbyder til verificering og servicebeskeder. E-mail er sekundær kanal
  for match-notifikationer, ikke primær.
- Partnerfeeds eller deeplinks, når aftaler indgås (fase 2).
- Identitetsleverandør med nordisk dækning — først relevant i fase 3.
- Crash- og fejlrapportering fra begge platforme.

### Data og privatliv

- Overhold GDPR: samtykke, privatlivspolitik, sletning og eksport af persondata.
- Indsaml kun de data, der er nødvendige for det aktuelle tillidsniveau.
- Giv brugere tydelig kontrol over synlighed af profil, samling og enkelt-trøje.
- Privat som default. Offentlig visning er et aktivt valg.
- Log aldrig e-mailadresser, tokens eller betalingsdata i klartekst.

### Skalering

- Design katalog og søgning til gradvist voksende datamængder.
- Prioritér søge- og billedhastighed; det er de to centrale flows.
- Planlæg lokalisering af sprog og valuta uden at duplikere kerneproduktet.

---

## Risici

| Risiko | Konsekvens | Modtræk |
| --- | --- | --- |
| **Registreringsfriktion** | Kategoriens dokumenterede dødsårsag. Brugere opretter én trøje og forsvinder | Mål tid til trøje nr. 2 fra dag ét. Forudfyld felter. Sæt 45 sekunder som hårdt krav |
| **Katalogflaskehals** | Kun vi kan godkende data. Svartid på dage koster den første registrering | Servicemål på 48 timer. Seed kataloget grundigt før lancering |
| **Tomt indeks ved premium-launch** | Premium-søgning uden indhold brænder de mest entusiastiske brugere af | Tænd ikke premium før seed-fasen har leveret indhold at søge i |
| **Ønskelisten matcher aldrig** | Den primære betalingsgrund leverer ikke, og abonnenter opsiger | Mål match-rate. Ved lav rate åbnes for match mod partnerlager tidligere end planlagt |
| **Ingen partnere ved måned 6** | Fase 2 findes ikke, og abonnement er eneste indtægt | Start partnerdialogen i uge 1, ikke efter lancering |
| **Betalingsviljen findes ikke** | Hele modellen falder | Det er præcis, hvad fase 1 skal afgøre. Seks måneder er en billig test |
| **Moderering og svindel** | Falske profiler og kopivarer skader tilliden | Rapportering og blokering fra dag ét. Ægthedsfelt med ukendt som default |
| **Installationsfriktion** | App-kravet halverer effekten af vores eneste gratis kanal | Del altid offentlige websider i grupperne, aldrig App Store-links direkte |
| **Push-tilladelse afvist** | Ønskelisten mister sin virkning, og retention falder | Spørg først ved oprettelse af første ønskelistepost, hvor formålet er konkret. Mål accept-raten |
| **App review** | En kritisk fejl kan tage dage at rette i stedet for minutter | Serverstyret konfiguration af det, der kan ændres uden ny binær. Weblaget kan altid opdateres |
| **Standardprovision på 30 %** | Nettoen pr. abonnent falder fra 21 til 16 kr. | Ansøg om Apple Small Business Program og Googles 15 %-sats, før første udgivelse |

---

## Milestones og faser

### Estimat

- Fundament og MVP: 10–12 uger. App-valget lægger cirka fire uger til det
  oprindelige estimat: to platforme at teste på, in-app purchase i stedet for et
  webbetalingsflow, push-infrastruktur og weblaget.
- Regn desuden med **to uger til butiksgodkendelse** ved første udgivelse.
  Abonnementsapps bliver næsten altid afvist første gang, typisk på
  prøveperiodens vilkår eller på manglende gendannelse af køb. Læg det i planen
  frem for at blive overrasket.
- Udviklerkonti hos Apple og Google skal oprettes i uge ét. Verifikationen af en
  virksomhedskonto kan alene tage to uger.
- Premium og ønskeliste: indeholdt i MVP, da ønskelisten er betalingsgrunden.
- Partnerformidling: fra måned 6, forudsat underskrevne aftaler.
- Handel mellem samlere: fra måned 12, forudsat likviditet og juridisk
  afklaring.

### Team

Lean team på to til tre personer: product/founder med ansvar for prioritering,
community og partnerdialog, en engineer med både mobil- og backend-erfaring, og
en produktdesigner på deltid eller kombineret med product-rollen.

App-valget stiller et konkret krav til rekrutteringen: én person skal have
udgivet en app i begge butikker før. Butiksgodkendelse, in-app purchase og
push-certifikater er ikke svære problemer, men de er fulde af detaljer, der
koster en uge hver, når man møder dem første gang.

### Fase 0 — Seed og partnerdialog (parallelt med udvikling)

- Opbyg katalog: nordiske ligaer, landshold, de største europæiske klubber.
- Rekruttér 50–100 engagerede danske samlere fra de eksisterende
  Facebook-grupper til lukket beta.
- Indled dialog med butikspartnere. Målet er tre underskrevne aftaler inden
  måned seks.

### Fase 1 — MVP (uge 1–12)

App til iOS og Android med konto og e-mailverifikation, seedet katalog,
kamera-først registrering, samlingsstyring, søgning, ønskeliste med match og
push-notifikation, custom data-flow med administratorkø, abonnement via in-app
purchase med prøveperiode, samt rapportering og blokering.

Weblag med offentlige samlingssider, trøjesider og katalogsider, delelige links
med Open Graph-data, og deep linking til appen.

Administrationsflade til katalogkøen.

Afhængigheder: udviklerkonti hos Apple og Google oprettet i uge ét, godkendelse
til Small Business Program, og et brugbart udgangspunkt for klub- og ligadata.

### Fase 2 — Formidling (måned 6–12)

Affiliate-match mellem ønskelisteposter og partnerlager, partnerlinks i
søgeresultater, "åben for tilbud" og fremhævede opslag, månedlig giveaway,
udbygget statistik og badges.

Afhængigheder: mindst tre underskrevne partnere og dokumenteret match-rate på
ønskelisten.

### Fase 3 — Handel (fra måned 12)

Auktioner med budsystem og sælgergebyr, udvidet verifikation som krav for at
oprette auktion, køberbeskyttelse, verificeret samler-badge.

Afhængigheder: juridisk afklaring, modereringskapacitet og tilstrækkelig
likviditet i communityet til, at et lot får bud.

---

## Go-to-market

**Kanal 1 — De eksisterende Facebook-grupper.** Der er omkring 100.000 unikke
mennesker samlet i nordiske trøjegrupper, og det koster ingenting at nå dem.
Start med at deltage, ikke at reklamere. Rekruttér 50–100 samlere til lukket
beta gennem personlig kontakt, ikke gennem opslag.

App-valget gør denne kanal dyrere, og det skal håndteres bevidst. Et opslag med
et link til en webside koster brugeren ét klik; et opslag, der kræver en
installation fra App Store, koster tre til fire skridt og taber typisk over
halvdelen undervejs. Modtrækket er, at det, der deles i grupperne, altid er en
**offentlig samlingsside på web** — ikke et App Store-link. Brugeren ser en
rigtig samling først og installerer bagefter, fordi hun vil have sin egen.

**Kanal 2 — Butikspartnere.** Secondfootballshirts, ReShirt, RetroRetro,
Retroshirts og FITS CPH lever allerede af nichen i Danmark, og Pardon My Kicks
gør det i Sverige. De har omsætning og et distributionsproblem, vi kan løse.
De er både partnere og en distributionskanal til deres egne kunder.

**Kanal 3 — Organisk søgning.** En app kan ikke indekseres, og derfor findes
denne kanal kun, hvis weblaget bygges. Offentlige katalogsider for klub og sæson
samt delte samlinger er langsigtet den billigste kanal, men først når kataloget
har dybde. Planlæg URL-struktur, Open Graph-data og indeksering fra start, og
forvent resultater efter måned ni. Dropper vi weblaget for at spare tid i MVP,
dropper vi samtidig kanal tre permanent og halverer effekten af kanal et.

**App Store-søgning er ikke en kanal.** Shirt Squad og MyFootballShirts ligger
begge i butikkerne og har henholdsvis omkring 500 og under 1.000
installationer. Ingen leder efter "fodboldtrøje-samler-app". Butikkerne er et
distributionsled, ikke en kilde til efterspørgsel.

**Rækkefølge.** Start stærkt i Danmark frem for halvt i tre lande. Danmark har
det største aktive publikum i forhold til befolkningstallet og den tætteste
butiksinfrastruktur. Sverige er det billigste marked at tage bagefter, fordi
ingen har samlet det endnu. Norge har lige nu et akut ægthedsproblem — der er
dokumenterede tilfælde af købere, der betaler 2.900 kroner for kopier på
Finn.no — hvilket gør verifikation til en smerte, folk mærker i dag.

**Måling.** Følg CAC pr. kanal fra uge et og fordobl indsatsen på de to kanaler
med lavest CAC og højest 30-dages retention efter måned to.
