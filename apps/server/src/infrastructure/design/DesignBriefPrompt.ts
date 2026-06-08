import type { Spec } from "@u-build/shared";

export function formatDesignBriefForPrompt(spec: Spec): string {
  if (!spec.designBrief) {
    return [
      "# DesignBrief da SPEC",
      "Nao informado. Antes de escrever UI, derive uma decisao minima a partir da UserStory, visualContract e DesignContextBundle; registre risco de menor inteligencia visual.",
    ].join("\n");
  }

  return [
    "# DesignBrief da SPEC",
    "Contrato estruturado de Design Intelligence. Trate como requisito obrigatorio antes de escolher layout, componentes, copy, estados ou tokens.",
    JSON.stringify(spec.designBrief, null, 2),
  ].join("\n");
}
