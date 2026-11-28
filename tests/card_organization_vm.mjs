import fs from "node:fs";
import { extractExportNames, rewriteImports, stripExports } from "./vm_loader.mjs";

// Load actual organization dependencies in the same VM realm as the existing
// host/DOM mocks, rather than replacing their behavior with test doubles.
export function withCardOrganizationImports(source, context) {
  context.__testCardModules ??= {};
  let rewritten = rewriteImports(source, context);
  rewritten = rewritten.replace(
    /import\s*\{([\s\S]*?)\}\s*from\s*["']\.\/([A-Za-z0-9_-]+)\.(?:m?js)["'];/g,
    (_statement, names, module) => {
      if (!context.__testCardModules[module]) {
        const original = fs.readFileSync(new URL(`../web/js/lib/${module}.mjs`, import.meta.url), "utf8");
        const exports = extractExportNames(original);
        const code = stripExports(withCardOrganizationImports(original, context));
        context.__testCardModules[module] = context.__testLibModules?.[module];
        if (!context.__testCardModules[module]) {
          context.__testLibModules ??= {};
          const wrapped = `(()=>{${code}\nglobalThis.__testCardModules.${module}={${exports.join(",")}};})()`;
          context.__testLibModules[module] = context.__testCardModules[module];
          // vm.runInContext is handled by rewriteImports above for all ./lib/*.mjs imports.
          void wrapped;
        }
      }
      return `const {${names}} = globalThis.__testCardModules.${module};`;
    },
  );
  return rewritten;
}
