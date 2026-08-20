import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Adreslocatie, ChecklistItem, RegelsOpLocatie, VergunningplichtOordeel } from "@/types/domain";
import { CHECKLIST_CATEGORIEEN } from "./vergunningplicht";

const AiOordeelSchema = z.object({
  oordeel: z.enum(["vergunningplichtig", "vergunningvrij", "onduidelijk"]),
  motivatie: z.string(),
  aandachtspunten: z.array(z.string()),
  checklist: z.array(
    z.object({
      categorie: z.string(),
      van_toepassing: z.union([z.boolean(), z.literal("onduidelijk")]),
      toelichting: z.string(),
    })
  ),
});

export interface AiReasoningResultaat {
  oordeel: VergunningplichtOordeel;
  motivatie: string;
  aandachtspunten: string[];
  checklist: ChecklistItem[];
}

function grondslagVoor(categorie: string): string {
  return CHECKLIST_CATEGORIEEN.find((c) => c.categorie === categorie)?.wettelijkeGrondslag ?? "";
}

export function aiReasoningBeschikbaar(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Laat Claude de opgehaalde omgevingsdocumenten-regels en de casus van de
 * gebruiker combineren tot een onderbouwd vergunningplicht-oordeel. Dit is
 * bewust een apart, expliciet gemarkeerd redeneer-station (geen verborgen
 * "zwarte doos"): het model krijgt alleen de brontekst die we ook aan de
 * gebruiker tonen, en moet citeren uit die tekst.
 */
export async function beoordeelMetAi(
  adres: Adreslocatie,
  casus: string,
  regels: RegelsOpLocatie
): Promise<AiReasoningResultaat> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const regelsBlok =
    regels.status === "ok" && regels.regels.length > 0
      ? regels.regels
          .map(
            (r, i) =>
              `[Regel ${i + 1}] Document: ${r.documentTitel} (${r.documentType}${r.bekendOnder ? `, bekend onder ${r.bekendOnder}` : ""})\n${r.regelTekst}`
          )
          .join("\n\n")
      : `(Geen regeltekst automatisch beschikbaar: ${regels.melding ?? "onbekende reden"}. Baseer je oordeel op het algemene Nederlandse omgevingsrecht en wees expliciet over de onzekerheid; verwijs de gebruiker naar ${regels.omgevingsloketUrl}.)`;

  const systemPrompt = `Je bent een Nederlandse omgevingsrecht-assistent die een vergunningplicht-toets (Omgevingswet) uitvoert.
Je krijgt een adres, een door de gebruiker beschreven casus (voorgenomen bouw- of gebruiksactiviteit), en de daadwerkelijke
regeltekst uit de geldende omgevingsdocumenten (omgevingsplan/bestemmingsplan) op die locatie, opgehaald via de officiele
DSO "Regels op de kaart"-voorziening.

Beoordeel per categorie uit deze vaste lijst of de casus daaronder valt en of dat vergunningplichtig is:
${CHECKLIST_CATEGORIEEN.map((c) => `- ${c.categorie} (${c.wettelijkeGrondslag})`).join("\n")}

Regels:
- Citeer of parafraseer expliciet uit de aangeleverde regeltekst waar mogelijk; verzin geen regeltekst.
- Als de regeltekst ontbreekt of onvoldoende is om zeker te zijn, kies "onduidelijk" en leg uit wat er nog nagevraagd moet worden.
- Bijlage II van het Besluit bouwwerken leefomgeving (Bbl) kent vergunningsvrije bouwwerken (bijv. kleine aan- en uitbouwen
  aan de achterkant, onder voorwaarden qua afmeting/ligging). Alleen "vergunningvrij" als je dat met redelijke zekerheid uit
  de casus + regels kunt afleiden; twijfel = "onduidelijk".
- Geef een totaaloordeel (oordeel): "vergunningplichtig" als minstens een categorie een vergunning vereist,
  "vergunningvrij" als geen enkele categorie van toepassing is of alles binnen vergunningsvrije kaders valt,
  anders "onduidelijk".
- Antwoord UITSLUITEND met geldig JSON volgens dit schema, geen omliggende tekst:
{
  "oordeel": "vergunningplichtig" | "vergunningvrij" | "onduidelijk",
  "motivatie": string (samenvatting van de redenering, in het Nederlands, met verwijzing naar relevante regels),
  "aandachtspunten": string[] (praktische vervolgstappen/onzekerheden voor de gebruiker),
  "checklist": [{ "categorie": string (exact een van bovenstaande categorienamen), "van_toepassing": true|false|"onduidelijk", "toelichting": string }, ...]
}
Neem alle categorien uit de lijst op in de checklist, ook als ze niet van toepassing zijn.`;

  const userPrompt = `Adres: ${adres.weergavenaam} (gemeente ${adres.gemeente})
Casus van de gebruiker:
"""
${casus}
"""

Geldende regels op deze locatie:
"""
${regelsBlok}
"""`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const tekst = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  let ruw: unknown;
  try {
    const jsonMatch = tekst.match(/\{[\s\S]*\}/);
    ruw = JSON.parse(jsonMatch ? jsonMatch[0] : tekst);
  } catch {
    throw new Error("AI-redenering gaf geen valide JSON terug.");
  }

  const parsed = AiOordeelSchema.parse(ruw);

  return {
    oordeel: parsed.oordeel,
    motivatie: parsed.motivatie,
    aandachtspunten: parsed.aandachtspunten,
    checklist: parsed.checklist.map((item) => ({
      categorie: item.categorie,
      van_toepassing: item.van_toepassing,
      toelichting: item.toelichting,
      wettelijkeGrondslag: grondslagVoor(item.categorie),
    })),
  };
}
