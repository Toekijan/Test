import type { ChecklistItem } from "@/types/domain";

/**
 * Algemeen toetsingskader vergunningplicht onder de Omgevingswet (sinds 1-1-2024).
 * Dit is geen uitputtende juridische engine maar een structuur die (a) als
 * vangnet dient wanneer er geen AI-redenering beschikbaar is, en (b) als
 * checklist die de AI-redenering (zie ai-reasoning.ts) moet invullen op basis
 * van de daadwerkelijke regeltekst en de casus.
 */
export const CHECKLIST_CATEGORIEEN: Array<{ categorie: string; wettelijkeGrondslag: string; trefwoorden: string[] }> = [
  {
    categorie: "Bouwactiviteit",
    wettelijkeGrondslag: "Art. 5.1 lid 1 onder a Omgevingswet jo. Bbl bijlage II (vergunningvrij bouwen)",
    trefwoorden: ["bouw", "aanbouw", "uitbouw", "dakkapel", "schuur", "bijgebouw", "verbouw", "optoppen", "verdieping"],
  },
  {
    categorie: "Strijdig gebruik met omgevingsplan",
    wettelijkeGrondslag: "Art. 5.1 lid 1 onder a Omgevingswet (omgevingsplanactiviteit gebruik)",
    trefwoorden: ["gebruik", "bestemming", "functiewijziging", "bedrijf aan huis", "kamerverhuur", "splitsen", "horeca"],
  },
  {
    categorie: "Sloopactiviteit",
    wettelijkeGrondslag: "Omgevingsplan (sloopregels), evt. Erfgoedwet bij monument",
    trefwoorden: ["sloop", "slopen", "afbreken"],
  },
  {
    categorie: "Kappen van houtopstand",
    wettelijkeGrondslag: "Gemeentelijke APV / bomenverordening",
    trefwoorden: ["kap", "boom", "bomen", "houtopstand"],
  },
  {
    categorie: "Aanlegactiviteit",
    wettelijkeGrondslag: "Art. 5.1 lid 1 onder i Omgevingswet (aanlegactiviteit, omgevingsplan)",
    trefwoorden: ["aanleg", "verharding", "inrit", "parkeerplaats", "sloot dempen", "ophogen"],
  },
  {
    categorie: "Uitweg / inrit",
    wettelijkeGrondslag: "Gemeentelijke APV",
    trefwoorden: ["uitweg", "inrit", "oprit"],
  },
  {
    categorie: "Monument of beschermd gezicht",
    wettelijkeGrondslag: "Art. 5.1 lid 1 onder b/g Omgevingswet, Erfgoedwet",
    trefwoorden: ["monument", "beschermd stadsgezicht", "beschermd dorpsgezicht"],
  },
  {
    categorie: "Milieubelastende activiteit",
    wettelijkeGrondslag: "Besluit activiteiten leefomgeving (Bal)",
    trefwoorden: ["milieu", "emissie", "geluid", "opslag gevaarlijke stoffen", "bedrijfsactiviteit"],
  },
];

export function basisChecklist(casus: string): ChecklistItem[] {
  const casusLower = casus.toLowerCase();
  return CHECKLIST_CATEGORIEEN.map(({ categorie, wettelijkeGrondslag, trefwoorden }) => {
    const raakt = trefwoorden.some((woord) => casusLower.includes(woord));
    return {
      categorie,
      van_toepassing: raakt ? ("onduidelijk" as const) : false,
      toelichting: raakt
        ? "Trefwoord in de casus gevonden dat op deze categorie kan wijzen; automatische toetsing zonder AI-redenering kan dit niet met zekerheid beoordelen. Raadpleeg de opgehaalde regeltekst of het bevoegd gezag."
        : "Geen aanwijzing in de casus dat deze categorie van toepassing is.",
      wettelijkeGrondslag,
    };
  });
}
