// Older Chromium (before 84) ignores `gap` on flex containers.  For every rule
// that makes a flex container with a gap, add a fallback that spaces the
// children with margins.  The fallback only applies when the page script
// has found that flex gap is unsupported and set class "no-fgap" on <html>.
const num = (v) => v && v !== "0" && !/^0(px|rem|em)?$/.test(v) ? v : null;

export default function flexGap() {
  return {
    postcssPlugin: "flex-gap-fallback",
    Once(root) {
      const missed = [];
      root.walkRules((rule) => {
        if (!rule.parent || rule.parent.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
        let display = "", dir = "row", wrap = false, gap = null, rg = null, cg = null;
        rule.walkDecls((d) => {
          if (d.parent !== rule) return;
          if (d.prop === "display") display = d.value;
          if (d.prop === "flex-direction") dir = d.value;
          if (d.prop === "flex-wrap") wrap = d.value !== "nowrap";
          if (d.prop === "flex-flow") { if (/column/.test(d.value)) dir = "column"; if (/\bwrap/.test(d.value)) wrap = true; }
          if (d.prop === "gap") gap = d.value.trim().split(/\s+/);
          if (d.prop === "row-gap") rg = d.value;
          if (d.prop === "column-gap") cg = d.value;
        });
        const isFlex = /flex/.test(display);
        if (!isFlex) { if (gap || rg || cg) { if (!/grid/.test(display)) missed.push(rule.selector); } return; }
        let row = rg, col = cg;
        if (gap) { row = row ?? gap[0]; col = col ?? (gap[1] ?? gap[0]); }
        row = num(row); col = num(col);
        if (!row && !col) return;
        const sel = rule.selectors.map((s) => `.no-fgap ${s}`);
        const mk = (suffix, decls) => {
          const r = rule.clone({ selectors: sel.map((s) => s + suffix) });
          r.removeAll();
          for (const [p, v] of decls) r.append({ prop: p, value: v });
          return r;
        };
        let out;
        if (wrap) out = mk(" > *", [col && ["margin-right", col], row && ["margin-bottom", row]].filter(Boolean));
        else if (/column/.test(dir)) out = row && mk(" > * + *", [["margin-top", row]]);
        else out = col && mk(" > * + *", [["margin-left", col]]);
        if (out) rule.parent.insertAfter(rule, out);
      });
      if (missed.length) console.warn("flex-gap: gap without display on the same rule:", missed.join(" | "));
    },
  };
}
flexGap.postcss = true;
