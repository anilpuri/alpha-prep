// Extract all HTTP image URLs from question HTML (handles src, data-src, lazy-loading)
export function extractImages(html: string): string[] {
  if (!html) return [];
  const urls: string[] = [];
  const imgTagRegex = /<img([^>]*)>/gi;
  let m;
  while ((m = imgTagRegex.exec(html)) !== null) {
    const attrs = m[1];
    const dataSrc = /data-src=["']([^"']+)["']/i.exec(attrs);
    const src     = /\bsrc=["']([^"']+)["']/i.exec(attrs);
    const url = dataSrc?.[1] || src?.[1] || "";
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}

/**
 * HTML → plain text for question/option rendering.
 * Handles math symbols, tables, fractions, superscripts, subscripts, LaTeX,
 * and all common HTML entities found in SSC CGL question banks.
 */
export function stripHtml(html: string): string {
  if (!html) return "";

  let t = html;

  // ── Superscript / subscript maps (shared with LaTeX processing below) ────────
  const supMap: Record<string, string> = {
    "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹",
    "+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","a":"ᵃ","b":"ᵇ","c":"ᶜ","x":"ˣ",
  };
  const subMap: Record<string, string> = {
    "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉",
  };

  // ── LaTeX math → readable plain text ─────────────────────────────────────────
  // Converts \( ... \) and \[ ... \] blocks to readable Unicode text.
  const latexToText = (m: string): string => {
    let s = m;
    // \frac{num}{den} — nested, so loop until stable
    let prev = "";
    while (prev !== s) {
      prev = s;
      s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1/$2)");
    }
    // {num} \over {den}  — LaTeX \over syntax
    s = s.replace(/\{([^{}]*)\}\s*\\over\s*\{([^{}]*)\}/g, "($1/$2)");
    s = s.replace(/([^{}\s\\]+)\s*\\over\s*([^{}\s\\]+)/g, "($1/$2)");
    // \sqrt{a} → √a
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)").replace(/\\sqrt\b/g, "√");
    // Superscripts ^{...} and ^x
    s = s.replace(/\^\{([^{}]*)\}/g, (_, c) => c.split("").map((ch: string) => supMap[ch] ?? ch).join(""));
    s = s.replace(/\^([0-9a-zA-Z])/g, (_, c) => supMap[c] ?? c);
    // Subscripts _{...} and _x
    s = s.replace(/_\{([^{}]*)\}/g, (_, c) => c.split("").map((ch: string) => subMap[ch] ?? ch).join(""));
    s = s.replace(/_([0-9])/g, (_, c) => subMap[c] ?? c);
    // \text{...}, \mathrm{...}, \mathbf{...} — keep the inner text
    s = s.replace(/\\(?:text|mathrm|mathbf|mathit|mathcal)\{([^{}]*)\}/g, "$1");
    // Common symbols
    s = s.replace(/\\times/g, "×").replace(/\\div/g, "÷").replace(/\\pm/g, "±")
         .replace(/\\mp/g, "∓").replace(/\\cdot/g, "·").replace(/\\ldots|\\dots/g, "…")
         .replace(/\\infty/g, "∞").replace(/\\pi/g, "π").replace(/\\theta/g, "θ")
         .replace(/\\alpha/g, "α").replace(/\\beta/g, "β").replace(/\\gamma/g, "γ")
         .replace(/\\delta/g, "δ").replace(/\\sigma/g, "σ").replace(/\\mu/g, "μ")
         .replace(/\\leq/g, "≤").replace(/\\geq/g, "≥").replace(/\\neq/g, "≠")
         .replace(/\\le\b/g, "≤").replace(/\\ge\b/g, "≥").replace(/\\ne\b/g, "≠")
         .replace(/\\approx/g, "≈").replace(/\\equiv/g, "≡").replace(/\\propto/g, "∝")
         .replace(/\\quad|\\qquad/g, " ").replace(/\\,|\\;|\\!/g, "")
         .replace(/\\left|\\right/g, "").replace(/\\big[lr]?[({[|)]*/g, "");
    // Mixed number cleanup: 7(1/2) → 7 1/2
    s = s.replace(/(\d)\((\d+)\/(\d+)\)/g, "$1 $2/$3");
    // Remove remaining LaTeX commands and braces
    s = s.replace(/\\[a-zA-Z]+\*/g, "").replace(/\\[a-zA-Z]+/g, "");
    s = s.replace(/[{}]/g, "").replace(/\\ /g, " ").replace(/\\\\/g, "");
    return s.replace(/\s+/g, " ").trim();
  };

  // Apply LaTeX processing before HTML stripping
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => latexToText(m));
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => latexToText(m));
  // Also handle $...$  (single-dollar inline math — skip if just a price like $5)
  t = t.replace(/\$([^$\n]{1,80}?)\$/g, (_, m) => {
    // Only convert if it looks like math (contains \ or ^ or _ or \frac etc.)
    if (/[\\^_]|\\frac|\\over/.test(m)) return latexToText(m);
    return `$${m}$`;
  });

  // ── Table → structured plain text ───────────────────────────────────────────
  t = t.replace(/<tr[^>]*>/gi, "\n");
  t = t.replace(/<\/tr>/gi, "");
  t = t.replace(/<t[dh][^>]*>/gi, "  ");
  t = t.replace(/<\/t[dh]>/gi, " |");
  t = t.replace(/<\/table>/gi, "\n");
  t = t.replace(/<table[^>]*>/gi, "\n");

  // ── Superscript / subscript HTML tags → unicode ──────────────────────────────
  t = t.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_, inner) => {
    const text = stripHtml(inner);
    return text.split("").map(c => supMap[c] ?? c).join("");
  });
  t = t.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_, inner) => {
    const text = stripHtml(inner);
    return text.split("").map(c => subMap[c] ?? c).join("");
  });

  // ── HTML fraction markup ─────────────────────────────────────────────────────
  // <span class="frac"><sup>num</sup><sub>den</sub></span> style
  t = t.replace(/<span[^>]*frac[^>]*>\s*<sup[^>]*>(.*?)<\/sup>\s*<sub[^>]*>(.*?)<\/sub>\s*<\/span>/gi,
    (_, n, d) => `${stripHtml(n)}/${stripHtml(d)}`);

  // ── Block-level → newline ────────────────────────────────────────────────────
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/(?:p|div|h[1-6]|blockquote|pre|li)>/gi, "\n");
  t = t.replace(/<li[^>]*>/gi, "• ");

  // ── Strip all remaining tags ─────────────────────────────────────────────────
  t = t.replace(/<[^>]+>/g, "");

  // ── HTML named entities — full math + common set ─────────────────────────────
  const entities: Record<string, string> = {
    // punctuation / misc
    amp:"&", lt:"<", gt:">", nbsp:" ", quot:'"', apos:"'", shy:"",
    mdash:"—", ndash:"–", ldquo:"“", rdquo:"”", lsquo:"‘", rsquo:"’",
    hellip:"…", bull:"•", middot:"·", deg:"°", micro:"µ", para:"¶", sect:"§",
    copy:"©", reg:"®", trade:"™",
    // math operators
    times:"×", divide:"÷", plusmn:"±", minus:"−", ne:"≠", le:"≤", ge:"≥",
    lt2:"<", gt2:">", asymp:"≈", equiv:"≡", prop:"∝", sim:"~",
    sum:"∑", prod:"∏", int:"∫", part:"∂", nabla:"∇", infin:"∞",
    radic:"√", permil:"‰", prime:"′", Prime:"″",
    // Greek letters
    alpha:"α", beta:"β", gamma:"γ", delta:"δ", epsilon:"ε", zeta:"ζ", eta:"η",
    theta:"θ", iota:"ι", kappa:"κ", lambda:"λ", mu:"μ", nu:"ν", xi:"ξ",
    omicron:"ο", pi:"π", rho:"ρ", sigma:"σ", tau:"τ", upsilon:"υ", phi:"φ",
    chi:"χ", psi:"ψ", omega:"ω",
    Alpha:"Α", Beta:"Β", Gamma:"Γ", Delta:"Δ", Theta:"Θ", Lambda:"Λ", Pi:"Π",
    Sigma:"Σ", Phi:"Φ", Psi:"Ψ", Omega:"Ω",
    // fractions
    frac12:"½", frac13:"⅓", frac14:"¼", frac34:"¾",
    // arrows
    rarr:"→", larr:"←", uarr:"↑", darr:"↓", harr:"↔", rArr:"⇒", lArr:"⇐",
    // shapes / set
    circ:"∘", oplus:"⊕", cup:"∪", cap:"∩", sub2:"⊂", sup2:"⊃", isin:"∈", notin:"∉",
    forall:"∀", exist:"∃",
    // currency
    pound:"£", euro:"€", yen:"¥", cent:"¢",
    // cards / misc
    spades:"♠", clubs:"♣", hearts:"♥", diams:"♦",
  };

  t = t.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (_, name) => entities[name] ?? `&${name};`);
  t = t.replace(/&#([0-9]+);/g,   (_, n) => String.fromCharCode(Number(n)));
  t = t.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

  // ── Cleanup whitespace ────────────────────────────────────────────────────────
  t = t.replace(/[^\S\n]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/ \|(\s*\n)/g, "$1");   // trailing pipes from table cells

  return t.trim();
}
