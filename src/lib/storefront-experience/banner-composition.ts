/** Opt-in composition IDs map to owned styles, never merchant CSS or HTML. */
export type BannerComposition = {
  schema_version: 1;
  mold: "product_focus" | "collection" | "seasonal_offer";
  theme: "light" | "dark";
  font_id: "brand" | "system_sans" | "system_serif";
  eyebrow: string;
  heading: string;
  body: string;
  cta_label: string;
};

const fields = ["schema_version", "mold", "theme", "font_id", "eyebrow", "heading", "body", "cta_label"] as const;
const limits = { eyebrow: 40, heading: 64, body: 160, cta_label: 32 } as const;
const invalid = (field: string): never => { throw new Error(`Invalid banner composition: ${field}`); };
// The ASCII HTML5 entities relevant to executable syntax. Other named entities
// remain inert text; React still escapes the original merchant string.
const entities: Record<string, string> = {
  amp: "&", AMP: "&", lt: "<", LT: "<", gt: ">", GT: ">", quot: '"', QUOT: '"', apos: "'",
  lbrace: "{", rbrace: "}", lcub: "{", rcub: "}", colon: ":", equals: "=", commat: "@",
  NewLine: "\n", Tab: "\t", semi: ";", period: ".", sol: "/", bsol: "\\", lpar: "(", rpar: ")",
  lowbar: "_", percnt: "%", num: "#", dollar: "$", ast: "*", plus: "+", comma: ",", hyphen: "‐",
  nvlt: "<\u20d2", nvgt: ">\u20d2",
};

function decodedText(value: string): string {
  let result = value;
  for (let pass = 0; pass < 3; pass++) {
    // rawurldecode leaves a bare '%' intact and rejects invalid decoded UTF-8.
    result = result.replace(/(?:%[0-9a-f]{2})+/gi, run => {
      try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(run.match(/[0-9a-f]{2}/gi) ?? [], hex => Number.parseInt(hex, 16))); }
      catch { return invalid("encoding"); }
    }).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (entity, name: string) => {
      if (name[0] !== "#") return entities[name] ?? entity;
      const point = name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      // PHP ENT_HTML5 leaves invalid HTML character references as literal text.
      const valid = [9, 10, 12].includes(point) || point >= 32 && point <= 0x10ffff
        && !(point >= 0x7f && point <= 0x9f) && !(point >= 0xd800 && point <= 0xdfff)
        && !(point >= 0xfdd0 && point <= 0xfdef) && (point & 0xffff) < 0xfffe;
      return valid ? String.fromCodePoint(point) : entity;
    });
  }
  return result;
}

export function parseBannerComposition(value: unknown): BannerComposition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("object");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== fields.length || fields.some(field => !Object.hasOwn(input, field))) return invalid("keys");
  if (input.schema_version !== 1) invalid("schema_version");
  if (typeof input.mold !== "string" || !["product_focus", "collection", "seasonal_offer"].includes(input.mold)) invalid("mold");
  if (typeof input.theme !== "string" || !["light", "dark"].includes(input.theme)) invalid("theme");
  if (typeof input.font_id !== "string" || !["brand", "system_sans", "system_serif"].includes(input.font_id)) invalid("font_id");
  for (const [field, max] of Object.entries(limits)) {
    const raw = input[field];
    if (typeof raw !== "string" || Array.from(raw).length > max || Array.from(raw).some(character => {
      const point = character.codePointAt(0) ?? 0;
      return point >= 0xd800 && point <= 0xdfff;
    })) invalid(field);
    const decoded = decodedText(raw as string);
    if (/[<>{}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(decoded)
      || /(?<![\p{L}\p{N}\p{Mn}\p{Pc}])(?:javascript|vbscript|data|file)\s*:/iu.test(decoded)
      || /(?<![\p{L}\p{N}\p{Mn}\p{Pc}])(?:on[a-z]+|style)\s*=/iu.test(decoded)
      || /@(?:php|endphp|extends|include|section|yield|component|inject|verbatim|foreach|for|while|if)(?![\p{L}\p{N}\p{Mn}\p{Pc}])/iu.test(decoded)
      || /(?<![\p{L}\p{N}\p{Mn}\p{Pc}])(?:alert|confirm|eval|fetch|function|prompt|settimeout|expression|url)\s*\(/iu.test(decoded)
      || /(?<![\p{L}\p{N}\p{Mn}\p{Pc}])(?:console|document|localstorage|window)\s*\./iu.test(decoded)
      || /=>/u.test(decoded) || /(?:^|;)\s*[a-z-]{2,}\s*:[^;{}]+;/iu.test(decoded)) invalid(field);
  }
  if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(input.heading as string)) invalid("heading");
  return Object.fromEntries(fields.map(field => [field, input[field]])) as BannerComposition;
}
