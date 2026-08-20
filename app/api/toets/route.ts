import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { geocodeAdres, PdokError } from "@/lib/pdok";
import { haalRegelsOp } from "@/lib/dso";
import { basisChecklist } from "@/lib/vergunningplicht";
import { aiReasoningBeschikbaar, beoordeelMetAi } from "@/lib/ai-reasoning";
import type { ToetsResultaat } from "@/types/domain";

export const runtime = "nodejs";

const RequestSchema = z.object({
  adres: z.string().min(3, "Vul een adres in (straat, huisnummer, plaats)."),
  casus: z.string().min(10, "Beschrijf de casus iets uitgebreider (minimaal 10 tekens)."),
});

const DISCLAIMER =
  "Dit is een geautomatiseerde indicatie, geen juridisch bindend advies. Controleer de uitkomst altijd bij de gemeente " +
  "(bevoegd gezag) of via het Omgevingsloket voordat je een vergunningaanvraag wel of niet indient.";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ongeldige invoer." }, { status: 400 });
  }
  const { adres, casus } = parsed.data;

  let adreslocatie;
  try {
    adreslocatie = await geocodeAdres(adres);
  } catch (err) {
    const message = err instanceof PdokError ? err.message : "Onbekende fout bij het opzoeken van het adres.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const regels = await haalRegelsOp(adreslocatie.lat, adreslocatie.lon);

  let oordeel: ToetsResultaat["oordeel"] = "onduidelijk";
  let motivatie: string;
  let aandachtspunten: string[];
  let checklist = basisChecklist(casus);
  let aiGebruikt = false;

  if (aiReasoningBeschikbaar()) {
    try {
      const aiResultaat = await beoordeelMetAi(adreslocatie, casus, regels);
      oordeel = aiResultaat.oordeel;
      motivatie = aiResultaat.motivatie;
      aandachtspunten = aiResultaat.aandachtspunten;
      checklist = aiResultaat.checklist;
      aiGebruikt = true;
    } catch (err) {
      motivatie =
        `Automatische AI-redenering is mislukt (${(err as Error).message}). Onderstaande checklist is een ` +
        "trefwoord-gebaseerd vangnet en geen inhoudelijke beoordeling; lees de opgehaalde regels handmatig door.";
      aandachtspunten = [
        "AI-redenering was niet succesvol; beoordeel de casus handmatig aan de hand van de getoonde regeltekst.",
      ];
    }
  } else {
    motivatie =
      "Geen ANTHROPIC_API_KEY geconfigureerd, dus is er geen inhoudelijke AI-redenering over de regeltekst uitgevoerd. " +
      "Onderstaande checklist markeert alleen welke categorieen mogelijk relevant zijn op basis van trefwoorden in de casus; " +
      "dit is geen beoordeling. Zet ANTHROPIC_API_KEY in .env.local voor een onderbouwd oordeel.";
    aandachtspunten = [
      "Zet ANTHROPIC_API_KEY in .env.local om een inhoudelijk oordeel te krijgen op basis van de daadwerkelijke regeltekst.",
      `Bekijk de geldende regels in de officiele viewer: ${regels.omgevingsloketUrl}`,
    ];
  }

  if (regels.status !== "ok") {
    aandachtspunten = [...aandachtspunten, regels.melding ?? "Regeltekst kon niet automatisch opgehaald worden."];
  }

  const resultaat: ToetsResultaat = {
    adres: adreslocatie,
    casus,
    regels,
    checklist,
    oordeel,
    motivatie,
    aandachtspunten,
    aiGebruikt,
    disclaimer: DISCLAIMER,
  };

  return NextResponse.json(resultaat);
}
