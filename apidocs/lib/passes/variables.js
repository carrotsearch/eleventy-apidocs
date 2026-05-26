// $VAR$ substitution. Runs over the entire rendered HTML as the last pass,
// so it reaches both content and layout-injected markup (footers, nav).
// Variable names: uppercase letters, digits, underscores.

const PATTERN = /\$([A-Z][A-Z0-9_]*)\$/g;

export function substituteVariables(html, variables) {
  if (!variables) return html;
  return html.replace(PATTERN, (match, name) =>
    Object.hasOwn(variables, name) ? String(variables[name]) : match
  );
}
