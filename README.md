# Vergunningplicht Checker

Webapp die voor een adres en een korte omschrijving van een bouw-/gebruiksplan ("casus")
automatisch de geldende omgevingsplan-/bestemmingsplanregels opzoekt en beoordeelt of het
plan vergunningplichtig is onder de Omgevingswet.

## Hoe het werkt

1. **Adres opzoeken** — het adres wordt omgezet naar coordinaten via de gratis, key-loze
   [PDOK Locatieserver](https://github.com/PDOK/locatieserver/wiki/API-Locatieserver).
2. **Regels ophalen** — met die coordinaten worden de geldende plannen (bestemmingsplan/
   omgevingsplan) opgehaald bij de **Ruimtelijke Plannen API** van het Digitaal Stelsel
   Omgevingswet (DSO), de databron achter de publieke viewer
   ["Regels op de kaart"](https://omgevingswet.overheid.nl/regels-op-de-kaart). Deze API lijkt
   volgens de officiele OpenAPI-spec zonder key te werken; zie de kanttekening hieronder.
3. **Toetsen** — de casus en de opgehaalde regeltekst worden gecombineerd tot een oordeel
   (vergunningplichtig / vergunningvrij / onduidelijk) met een checklist per
   activiteitcategorie (bouwen, strijdig gebruik, slopen, kappen, aanleggen, uitweg,
   monument, milieu). Dit gebeurt inhoudelijk via Claude (Anthropic API), die verplicht
   citeert uit de daadwerkelijk opgehaalde regeltekst. Zonder AI-key toont de app alleen een
   trefwoord-gebaseerd vangnet — geen inhoudelijk oordeel.
4. **Kaart** — de locatie wordt getoond op een PDOK-achtergrondkaart met een
   bestemmingsplan-contourenlaag.

## Belangrijke kanttekening bij deze versie

Dit project is gebouwd in een omgeving zonder netwerktoegang tot overheids-API's. De koppeling
in `lib/dso.ts` is opgebouwd uit de officiele OpenAPI-spec die PDOK publiceert op GitHub
([PDOK/open-api-specs](https://github.com/PDOK/open-api-specs), bestand
`ruimtelijke-plannen/alleplannen.yaml`): host `data.informatiehuisruimte.nl`, pad
`/api/ruimtelijke-plannen/v1/leidende-plannen/_zoek`. Die spec definieert geen
authenticatie-schema, dus de app doet de aanroep standaard zonder key. **Dit is echter niet
live geverifieerd** — met name de exacte vorm van de "teksten"-resource (de daadwerkelijke
regeltekst) stond niet in de ingeziene spec-file, dus de parsing daarvan in `lib/dso.ts` is
defensief best-effort. Krijg je 401/403 van de live API, vraag dan alsnog een gratis
`DSO_API_KEY` aan (zie hieronder) — die wordt automatisch meegestuurd als hij gezet is. Bij een
onverwacht antwoord faalt de app expliciet en verwijst hij altijd door naar de officiele viewer,
zodat je nooit een verzonnen antwoord krijgt. Hetzelfde voorbehoud geldt in mindere mate voor de
laagnaam van de PDOK-bestemmingsplanlaag op de kaart (`NEXT_PUBLIC_RP_WMS_URL`/`_LAYER`) — dit is
puur de visuele overlay, niet de brondata voor de toetsing.

## Setup

```bash
npm install
cp .env.example .env.local
# vul DSO_API_KEY en (aanbevolen) ANTHROPIC_API_KEY in .env.local in
npm run dev
```

Open http://localhost:3000.

### API-keys

- **DSO_API_KEY** (optioneel, alleen nodig als de Ruimtelijke Plannen API 401/403 teruggeeft):
  gratis self-service aanvragen via
  https://developer.omgevingswet.overheid.nl/formulieren/api-key-aanvragen-0/ (naam, e-mail,
  organisatie, telefoonnummer invullen; Fair Use Policy accepteren; je krijgt een
  test-/pre-productie-key en kunt apart een productie-key aanvragen). Er bestaan losse keys per
  omgeving (test vs. productie) en soms per API — begin met een test-key.
- **ANTHROPIC_API_KEY** (nodig voor het inhoudelijke oordeel): aanmaken via
  https://console.anthropic.com/

Zonder ANTHROPIC_API_KEY werkt de app nog wel (adres opzoeken, regels en kaart tonen), maar
zonder inhoudelijk vergunningplicht-oordeel — alleen een trefwoord-vangnet.

## Disclaimer

Dit is een hulpmiddel dat een **indicatie** geeft, geen juridisch bindend advies. Controleer
de uitkomst altijd bij de gemeente (het bevoegd gezag) of via het Omgevingsloket voordat je
een vergunningaanvraag wel of niet indient.

## Techstack

Next.js 14 (App Router, TypeScript), Tailwind CSS, react-leaflet, Anthropic SDK, zod.
