// Structural diagnostics only. Never retain source text, form values or account data.
export function inspectTargets() {
  return {targets:["article[data-testid=\"tweet\"]","[data-testid=\"primaryColumn\"]","[data-testid=\"bookmark\"]"].map(selector=>({selector,count:document.querySelectorAll(selector).length}))};
}
