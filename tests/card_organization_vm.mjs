import fs from "node:fs";
import vm from "node:vm";

// Load actual organization dependencies in the same VM realm as the existing
// host/DOM mocks, rather than replacing their behavior with test doubles.
export function withCardOrganizationImports(source, context) {
  context.__testCardModules ??= {};
  return source.replace(/import\s*\{([^}]+)\}\s*from\s*["']\.\/(card_organization(?:_ui)?|card_apply_transaction|import_guidance|card_summary(?:_view)?|i18n_catalog)\.js["'];/g,
    (_statement, names, module) => {
      if (!context.__testCardModules[module]) {
        const original = fs.readFileSync(new URL(`../web/js/${module}.js`, import.meta.url), "utf8");
        const exports = [...original.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map(m => m[1]);
        const code = withCardOrganizationImports(original, context)
          .replaceAll("export async function ", "async function ").replaceAll("export function ", "function ").replaceAll("export const ", "const ");
        vm.runInContext(`(()=>{${code}\nglobalThis.__testCardModules.${module}={${exports.join(",")}};})()`, context, {filename: module});
      }
      return `const {${names}} = globalThis.__testCardModules.${module};`;
    });
}
