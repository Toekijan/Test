# Vergunningplicht Checker

Webapp die voor een adres en een korte omschrijving van een bouw-/gebruiksplan ("casus")
automatisch de geldende omgevingsplan-/bestemmingsplanregels opzoekt en beoordeelt of het
plan vergunningplichtig is onder de Omgevingswet.

## Hoe het werkt

1. **Adres opzoeken** — het adres wordt omgezet naar coordinaten via de gratis, key-loze
   [PDOK Locatieserver](https://github.com/PDOK/locatieserver/wiki/API-Locatieserver).
2. **Regels ophalen** — met die coordinaten worden de geldende omgevingsdocumenten (het
   omgevingsplan, voorheen bestemmingsplan) opgehaald bij de officiele
   ["Regels op de kaart"](https://omgevingswet.overheid.nl/regels-op-de-kaart)-voorziening
   van het Digitaal Stelsel Omgevingswet (DSO). Hiervoor is een gratis API-key nodig (zie
   hieronder).
3. **Toetsen** — de casus en de opgehaalde regeltekst worden gecombineerd tot een oordeel
   (vergunningplichtig / vergunningvrij / onduidelijk) met een checklist per
   activiteitcategorie (bouwen, strijdig gebruik, slopen, kappen, aanleggen, uitweg,
   monument, milieu). Dit gebeurt inhoudelijk via Claude (Anthropic API), die verplicht
   citeert uit de daadwerkelijk opgehaalde regeltekst. Zonder AI-key toont de app alleen een
   trefwoord-gebaseerd vangnet — geen inhoudelijk oordeel.
4. **Kaart** — de locatie wordt getoond op een PDOK-achtergrondkaart met een
   bestemmingsplan-contourenlaag.

## Belangrijke kanttekening bij deze versie

Dit project is gebouwd in een omgeving zonder netwerktoegang tot
`developer.omgevingswet.overheid.nl`. De DSO-endpoint in `lib/dso.ts` is daarom
geimplementeerd op basis van de publiek gedocumenteerde API-namen ("omgevingsspecifieke
informatie" / "omgevingsdocumenten geometrie opvragen"), maar **is niet live getest tegen de
echte OpenAPI-spec**. Vraag een API-key aan, bekijk de spec op het
[Ontwikkelaarsportaal](https://developer.omgevingswet.overheid.nl/api-register/), en corrigeer
zo nodig `DSO_BASE_URL` / `DSO_REGELS_PATH` in `.env.local` (geen codewijziging nodig). Als de
call faalt, toont de app dat expliciet en verwijst hij altijd door naar de officiele viewer, zodat
je nooit een verzonnen antwoord krijgt. Hetzelfde voorbehoud geldt in mindere mate voor de
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

- **DSO_API_KEY** (nodig voor echte regelopvraging): gratis self-service aanvragen via
  https://developer.omgevingswet.overheid.nl/formulieren/api-key-aanvragen-0/
- **ANTHROPIC_API_KEY** (nodig voor het inhoudelijke oordeel): aanmaken via
  https://console.anthropic.com/

Zonder deze keys werkt de app nog wel (adres opzoeken en kaart tonen), maar zonder
inhoudelijk vergunningplicht-oordeel.

## Disclaimer

Dit is een hulpmiddel dat een **indicatie** geeft, geen juridisch bindend advies. Controleer
de uitkomst altijd bij de gemeente (het bevoegd gezag) of via het Omgevingsloket voordat je
een vergunningaanvraag wel of niet indient.

## Techstack

Next.js 14 (App Router, TypeScript), Tailwind CSS, react-leaflet, Anthropic SDK, zod.
