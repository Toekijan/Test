import type { Adreslocatie } from "@/types/domain";

const LOCATIESERVER_BASE = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";

interface PdokDoc {
  id: string;
  weergavenaam: string;
  type: string;
  gemeentecode?: string;
  gemeentenaam?: string;
  postcode?: string;
  centroide_ll?: string; // "POINT(lon lat)"
  centroide_rd?: string; // "POINT(x y)"
  adresseerbaarobject_id?: string;
}

interface PdokResponse {
  response: {
    numFound: number;
    docs: PdokDoc[];
  };
}

function parsePoint(wkt: string | undefined): [number, number] | null {
  if (!wkt) return null;
  const match = /POINT\(([-0-9.]+)\s+([-0-9.]+)\)/.exec(wkt);
  if (!match) return null;
  return [parseFloat(match[1]), parseFloat(match[2])];
}

export class PdokError extends Error {}

/**
 * Zoekt een adres op via de PDOK Locatieserver (vrij, geen API-key nodig)
 * en geeft coordinaten (RD + WGS84) en gemeente-informatie terug.
 * https://github.com/PDOK/locatieserver/wiki/API-Locatieserver
 */
export async function geocodeAdres(adres: string): Promise<Adreslocatie> {
  const url = new URL(`${LOCATIESERVER_BASE}/free`);
  url.searchParams.set("q", adres);
  url.searchParams.set("fq", "type:adres");
  url.searchParams.set("rows", "1");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    throw new PdokError(
      `Kon PDOK Locatieserver niet bereiken. Controleer de internetverbinding. (${(err as Error).message})`
    );
  }

  if (!res.ok) {
    throw new PdokError(`PDOK Locatieserver gaf een fout terug (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as PdokResponse;
  const doc = data.response.docs[0];
  if (!doc) {
    throw new PdokError(
      `Geen adres gevonden voor "${adres}". Controleer de schrijfwijze (bijv. "Straatnaam 1, Plaats").`
    );
  }

  const rd = parsePoint(doc.centroide_rd);
  const ll = parsePoint(doc.centroide_ll);
  if (!rd || !ll) {
    throw new PdokError(`PDOK gaf geen bruikbare coordinaten terug voor "${adres}".`);
  }

  return {
    weergavenaam: doc.weergavenaam,
    gemeente: doc.gemeentenaam ?? "onbekend",
    postcode: doc.postcode ?? null,
    rdX: rd[0],
    rdY: rd[1],
    lon: ll[0],
    lat: ll[1],
    bagId: doc.adresseerbaarobject_id ?? null,
    gemeentecode: doc.gemeentecode ?? null,
  };
}
