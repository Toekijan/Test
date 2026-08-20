import type { RegelsOpLocatie, OmgevingsdocumentRegel } from "@/types/domain";

/**
 * Client voor de open-data API's van het Digitaal Stelsel Omgevingswet (DSO),
 * ook bekend als "Regels op de kaart" (https://omgevingswet.overheid.nl/regels-op-de-kaart).
 *
 * BELANGRIJK - lees dit voor gebruik:
 * De DSO-API's vereisen een gratis, self-service API-key die je aanvraagt via
 * https://developer.omgevingswet.overheid.nl/formulieren/api-key-aanvragen-0/
 * Zet die key in de omgevingsvariabele DSO_API_KEY.
 *
 * De exacte endpoint-URL/response-vorm van de "omgevingsspecifieke informatie"
 * (geometrie-gebaseerde regelopvraging) staat in de OpenAPI-specificatie die je
 * pas kunt inzien nadat je een API-key hebt aangevraagd op het Ontwikkelaarsportaal
 * (developer.omgevingswet.overheid.nl/api-register). Dit sandbox-milieu had geen
 * netwerktoegang tot dat portaal om de spec te verifieren, dus de pad-constanten
 * hieronder zijn bewust configureerbaar via environment variables (DSO_BASE_URL /
 * DSO_REGELS_PATH) zodat je ze zonder code-wijziging kunt corrigeren op basis van
 * de echte spec. Bij een onverwacht antwoord faalt deze module expliciet in plaats
 * van stilzwijgend onjuiste data te verzinnen, en verwijzen we altijd door naar de
 * officiele viewer zodat je nooit zonder brondata zit.
 */

const DSO_BASE_URL =
  process.env.DSO_BASE_URL ?? "https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api";
const DSO_REGELS_PATH = process.env.DSO_REGELS_PATH ?? "/v6/omgevingsspecifiekeinformatie/_zoek";

function omgevingsloketUrl(lat: number, lon: number): string {
  return `https://omgevingswet.overheid.nl/regels-op-de-kaart/?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`;
}

interface DsoZoekResponse {
  bevoegdGezag?: { naam?: string };
  resultaten?: Array<{
    omgevingsdocument?: { titel?: string; type?: string; identificatie?: string; bekendOnder?: string };
    regelteksten?: Array<{ tekst?: string; identificatie?: string }>;
    documentUrl?: string;
  }>;
}

export async function haalRegelsOp(lat: number, lon: number): Promise<RegelsOpLocatie> {
  const loketUrl = omgevingsloketUrl(lat, lon);
  const apiKey = process.env.DSO_API_KEY;

  if (!apiKey) {
    return {
      status: "geen_key",
      melding:
        "Geen DSO_API_KEY geconfigureerd. Vraag een gratis API-key aan via " +
        "https://developer.omgevingswet.overheid.nl/formulieren/api-key-aanvragen-0/ en zet deze in .env.local. " +
        "Je kunt de geldende regels voor dit punt in de tussentijd handmatig bekijken in de officiele viewer.",
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  const body = {
    geometrie: { type: "Point", coordinates: [lon, lat] },
  };

  let res: Response;
  try {
    res = await fetch(`${DSO_BASE_URL}${DSO_REGELS_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    return {
      status: "fout",
      melding: `Kon de DSO-API niet bereiken (${(err as Error).message}). Bekijk de regels handmatig via de officiele viewer.`,
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      status: "fout",
      melding:
        "De DSO-API wees de API-key af (ongeldig of nog niet actief). Controleer DSO_API_KEY, of bekijk de regels handmatig via de officiele viewer.",
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  if (res.status === 404) {
    return {
      status: "geen_dekking",
      melding: "Geen omgevingsdocumenten gevonden voor deze locatie in de DSO-index.",
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  if (!res.ok) {
    return {
      status: "fout",
      melding: `De DSO-API gaf een onverwachte fout (HTTP ${res.status}). Bekijk de regels handmatig via de officiele viewer, en controleer of DSO_BASE_URL/DSO_REGELS_PATH nog overeenkomen met de actuele OpenAPI-spec op het Ontwikkelaarsportaal.`,
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  let data: DsoZoekResponse;
  try {
    data = (await res.json()) as DsoZoekResponse;
  } catch {
    return {
      status: "fout",
      melding: "De DSO-API gaf een antwoord dat niet als JSON gelezen kon worden.",
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  const regels: OmgevingsdocumentRegel[] = (data.resultaten ?? []).flatMap((resultaat) => {
    const teksten = resultaat.regelteksten?.length
      ? resultaat.regelteksten
      : [{ tekst: undefined, identificatie: undefined }];
    return teksten.map((rt) => ({
      documentTitel: resultaat.omgevingsdocument?.titel ?? "Onbekend omgevingsdocument",
      documentType: resultaat.omgevingsdocument?.type ?? "onbekend",
      bekendOnder: resultaat.omgevingsdocument?.bekendOnder ?? null,
      identificatie: rt.identificatie ?? resultaat.omgevingsdocument?.identificatie ?? null,
      regelTekst: rt.tekst ?? "(geen regeltekst meegegeven door de API)",
      bron: "dso" as const,
      brondocumentUrl: resultaat.documentUrl ?? null,
    }));
  });

  if (regels.length === 0) {
    return {
      status: "geen_dekking",
      melding: "De DSO-API gaf geen regels terug voor deze locatie.",
      bevoegdGezag: data.bevoegdGezag?.naam ?? null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  return {
    status: "ok",
    melding: null,
    bevoegdGezag: data.bevoegdGezag?.naam ?? null,
    regels,
    omgevingsloketUrl: loketUrl,
  };
}
