import type { RegelsOpLocatie, OmgevingsdocumentRegel } from "@/types/domain";

/**
 * Client voor de "Ruimtelijke Plannen API" van het Digitaal Stelsel Omgevingswet (DSO),
 * de opvolger van ruimtelijkeplannen.nl. Dit is de databron achter de publieke viewer
 * "Regels op de kaart" (https://omgevingswet.overheid.nl/regels-op-de-kaart).
 *
 * Endpoint en request/response-vorm zijn overgenomen uit de officiele OpenAPI-spec die
 * PDOK publiceert op GitHub (PDOK/open-api-specs, ruimtelijke-plannen/alleplannen.yaml):
 * host "data.informatiehuisruimte.nl", basePath "/api/ruimtelijke-plannen/v1". Die spec
 * definieert geen securityScheme, dus deze API lijkt (in elk geval voor het opvragen van
 * "leidende plannen" op een punt) zonder API-key te werken. Zet toch DSO_API_KEY in
 * .env.local als je merkt dat de live gateway een key afdwingt (401/403) die niet in de
 * spec staat - we sturen 'm dan automatisch mee als x-api-key header.
 *
 * BELANGRIJKE KANTTEKENING: dit sandbox-milieu had geen netwerktoegang tot
 * data.informatiehuisruimte.nl, dus deze integratie is opgebouwd uit de gepubliceerde
 * spec maar niet live tegen echte responses getest - met name de exacte vorm van de
 * "teksten"-resource (de daadwerkelijke regeltekst) stond niet in de ingeziene spec-file.
 * Bij een onverwacht antwoord faalt deze module expliciet in plaats van data te verzinnen,
 * en we tonen altijd een link naar de officiele viewer zodat je nooit zonder brondata zit.
 */

const RP_BASE_URL = process.env.DSO_BASE_URL ?? "https://data.informatiehuisruimte.nl/api/ruimtelijke-plannen/v1";

function omgevingsloketUrl(lat: number, lon: number): string {
  return `https://omgevingswet.overheid.nl/regels-op-de-kaart/?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`;
}

function authHeaders(): Record<string, string> {
  const apiKey = process.env.DSO_API_KEY;
  return apiKey ? { "x-api-key": apiKey } : {};
}

interface RpPlan {
  id: string;
  naam?: string;
  type?: string;
  planstatusInfo?: { planstatus?: string; datum?: string };
  _links?: { self?: { href?: string }; teksten?: { href?: string } };
}

interface RpZoekResponse {
  _embedded?: { plannen?: RpPlan[] };
}

/** Best-effort parser: de exacte vorm van de teksten-resource is niet geverifieerd (zie moduledoc). */
function extraheerTekst(item: unknown): string | null {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    for (const key of ["tekst", "xhtml", "inhoud", "content", "waarde"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
  }
  return null;
}

async function haalTekstenOp(href: string): Promise<string[]> {
  try {
    const res = await fetch(href, {
      headers: { Accept: "application/hal+json, application/json", ...authHeaders() },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, unknown>;
    const embedded = data._embedded as Record<string, unknown> | undefined;
    const lijst = (Object.values(embedded ?? {})[0] as unknown[] | undefined) ?? [];
    return lijst.map(extraheerTekst).filter((t): t is string => Boolean(t));
  } catch {
    return [];
  }
}

export async function haalRegelsOp(lat: number, lon: number): Promise<RegelsOpLocatie> {
  const loketUrl = omgevingsloketUrl(lat, lon);

  const body = {
    _geo: {
      contains: { type: "Point", coordinates: [lon, lat] },
    },
  };

  let res: Response;
  try {
    res = await fetch(`${RP_BASE_URL}/leidende-plannen/_zoek`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/hal+json, application/json",
        "Content-Crs": "epsg:4258",
        "Accept-Crs": "epsg:4258",
        ...authHeaders(),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    return {
      status: "fout",
      melding: `Kon de Ruimtelijke Plannen API niet bereiken (${(err as Error).message}). Bekijk de regels handmatig via de officiele viewer.`,
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      status: "fout",
      melding:
        "De Ruimtelijke Plannen API wees het verzoek af (401/403). Vraag een gratis DSO_API_KEY aan via " +
        "https://developer.omgevingswet.overheid.nl/formulieren/api-key-aanvragen-0/ en zet die in .env.local, " +
        "of bekijk de regels handmatig via de officiele viewer.",
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  if (res.status === 404) {
    return {
      status: "geen_dekking",
      melding: "Geen leidende plannen gevonden voor deze locatie.",
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  if (!res.ok) {
    return {
      status: "fout",
      melding: `De Ruimtelijke Plannen API gaf een onverwachte fout (HTTP ${res.status}). Bekijk de regels handmatig via de officiele viewer, en controleer of DSO_BASE_URL nog overeenkomt met de actuele OpenAPI-spec (PDOK/open-api-specs op GitHub).`,
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  let data: RpZoekResponse;
  try {
    data = (await res.json()) as RpZoekResponse;
  } catch {
    return {
      status: "fout",
      melding: "De Ruimtelijke Plannen API gaf een antwoord dat niet als JSON gelezen kon worden.",
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  const plannen = data._embedded?.plannen ?? [];
  if (plannen.length === 0) {
    return {
      status: "geen_dekking",
      melding: "Geen leidende plannen gevonden voor deze locatie.",
      bevoegdGezag: null,
      regels: [],
      omgevingsloketUrl: loketUrl,
    };
  }

  const regels: OmgevingsdocumentRegel[] = [];
  for (const plan of plannen) {
    const teksten = plan._links?.teksten?.href ? await haalTekstenOp(plan._links.teksten.href) : [];
    if (teksten.length === 0) {
      regels.push({
        documentTitel: plan.naam ?? "Onbekend plan",
        documentType: plan.type ?? "onbekend",
        bekendOnder: plan.planstatusInfo?.planstatus ?? null,
        identificatie: plan.id ?? null,
        regelTekst:
          "(Geen regeltekst automatisch kunnen ophalen voor dit plan; bekijk de volledige tekst via de officiele viewer of het brondocument.)",
        bron: "dso",
        brondocumentUrl: plan._links?.self?.href ?? null,
      });
    } else {
      for (const tekst of teksten) {
        regels.push({
          documentTitel: plan.naam ?? "Onbekend plan",
          documentType: plan.type ?? "onbekend",
          bekendOnder: plan.planstatusInfo?.planstatus ?? null,
          identificatie: plan.id ?? null,
          regelTekst: tekst,
          bron: "dso",
          brondocumentUrl: plan._links?.self?.href ?? null,
        });
      }
    }
  }

  return {
    status: "ok",
    melding: null,
    bevoegdGezag: null,
    regels,
    omgevingsloketUrl: loketUrl,
  };
}
