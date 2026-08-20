export interface Adreslocatie {
  weergavenaam: string;
  gemeente: string;
  postcode: string | null;
  rdX: number;
  rdY: number;
  lat: number;
  lon: number;
  bagId: string | null;
  gemeentecode: string | null;
}

export interface OmgevingsdocumentRegel {
  documentTitel: string;
  documentType: string;
  bekendOnder: string | null;
  identificatie: string | null;
  regelTekst: string;
  bron: "dso" | "handmatig";
  brondocumentUrl: string | null;
}

export interface RegelsOpLocatie {
  status: "ok" | "geen_key" | "geen_dekking" | "fout";
  melding: string | null;
  bevoegdGezag: string | null;
  regels: OmgevingsdocumentRegel[];
  omgevingsloketUrl: string;
}

export type VergunningplichtOordeel = "vergunningplichtig" | "vergunningvrij" | "onduidelijk";

export interface ChecklistItem {
  categorie: string;
  van_toepassing: boolean | "onduidelijk";
  toelichting: string;
  wettelijkeGrondslag: string;
}

export interface ToetsResultaat {
  adres: Adreslocatie;
  casus: string;
  regels: RegelsOpLocatie;
  checklist: ChecklistItem[];
  oordeel: VergunningplichtOordeel;
  motivatie: string;
  aandachtspunten: string[];
  aiGebruikt: boolean;
  disclaimer: string;
}
