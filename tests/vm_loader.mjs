import fs from "node:fs";
import vm from "node:vm";

const LIB_DIR = new URL("../web/js/lib/", import.meta.url);
const DATA_DIR = new URL("../web/js/data/", import.meta.url);

export function createDefaultFetch() {
  return async (urlOrString) => {
    const raw = String(urlOrString);
    const filename = raw.split("/").pop()?.split("?")[0];
    if (!filename) return { ok: false, status: 404, async json() { return {}; } };
    const candidate = new URL(filename, DATA_DIR);
    if (!fs.existsSync(candidate)) {
      return { ok: false, status: 404, async json() { return {}; } };
    }
    const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
    return { ok: true, status: 200, async json() { return parsed; } };
  };
}

export function stripExports(source) {
  return source
    .replaceAll("export async function ", "async function ")
    .replaceAll("export function ", "function ")
    .replaceAll("export const ", "const ")
    .replaceAll("export let ", "let ")
    .replaceAll("export class ", "class ");
}

export function extractExportNames(source) {
  return [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)]
    .map((match) => match[1]);
}

function replaceMetaUrl(source, moduleUrl) {
  return source.replaceAll("import.meta.url", JSON.stringify(moduleUrl.href));
}

function compileLibModule(moduleName, context, options = {}) {
  const storeTarget = context || globalThis;
  storeTarget.__testLibModules ??= {};
  const normalized = moduleName.replace(/\.(?:m?js)$/, "");
  if (storeTarget.__testLibModules[normalized]) {
    return storeTarget.__testLibModules[normalized];
  }
  const moduleUrl = new URL(`${normalized}.mjs`, LIB_DIR);
  const original = fs.readFileSync(moduleUrl, "utf8");
  const exports = extractExportNames(original);
  const code = rewriteImports(original, context, { ...options, moduleUrl });
  const stripped = replaceMetaUrl(stripExports(code), moduleUrl);
  const wrapped = `(() => {\n${stripped}\nglobalThis.__testLibModules[${JSON.stringify(normalized)}] = { ${exports.join(", ")} };\n})();`;
  if (context) {
    vm.runInContext(wrapped, context, { filename: `${normalized}.mjs` });
  } else {
    vm.runInThisContext(wrapped, { filename: `${normalized}.mjs` });
  }
  return storeTarget.__testLibModules[normalized];
}

export function rewriteImports(source, context, options = {}) {
  const {
    appExpr = "(globalThis.app ?? globalThis.__app)",
    apiExpr = "(globalThis.api ?? globalThis.__api)",
    moduleUrl = new URL("entry.mjs", LIB_DIR),
  } = options;
  let result = replaceMetaUrl(source, moduleUrl);
  result = result.replace(
    /import\s+\{\s*app\s*\}\s+from\s+["'](?:\.\.\/)+scripts\/app\.js["'];/g,
    `const app = ${appExpr};`,
  );
  result = result.replace(
    /import\s+\{\s*api\s*\}\s+from\s+["'](?:\.\.\/)+scripts\/api\.js["'];/g,
    `const api = ${apiExpr};`,
  );
  result = result.replace(
    /import\s*\{([\s\S]*?)\}\s*from\s*["']\.\/([A-Za-z0-9_-]+)\.(?:m?js)["'];/g,
    (_statement, names, depName) => {
      const normalizedDep = depName.replace(/\.(?:m?js)$/, "");
      compileLibModule(normalizedDep, context, options);
      const destructured = names.replace(/\b(\w+)\s+as\s+(\w+)\b/g, "$1: $2");
      return `const {${destructured}} = globalThis.__testLibModules[${JSON.stringify(normalizedDep)}];`;
    },
  );
  return result;
}

export function loadLibModule(moduleName, context, options = {}) {
  const {
    appExpr = "(globalThis.app ?? globalThis.__app)",
    apiExpr = "(globalThis.api ?? globalThis.__api)",
    expose = [],
  } = options;
  const normalized = moduleName.replace(/\.(?:m?js)$/, "");
  const moduleUrl = new URL(`${normalized}.mjs`, LIB_DIR);
  const original = fs.readFileSync(moduleUrl, "utf8");
  const exportNames = extractExportNames(original);
  const allNames = [...new Set([...exportNames, ...expose])];
  const code = stripExports(rewriteImports(original, context, { appExpr, apiExpr, moduleUrl }));
  const storeTarget = context || globalThis;
  storeTarget.__testLibModules ??= {};
  const wrapped = `(() => {\n${code}\nconst __exports = { ${allNames.join(", ")} };\nglobalThis.__testLibModules[${JSON.stringify(normalized)}] = __exports;\nreturn __exports;\n})();`;
  if (context) {
    return vm.runInContext(wrapped, context, { filename: `${normalized}.mjs` });
  }
  return vm.runInThisContext(wrapped, { filename: `${normalized}.mjs` });
}

export function createVmContext(globals = {}) {
  const context = {
    console,
    fetch: createDefaultFetch(),
    URL,
    Blob,
    setTimeout,
    clearTimeout,
    ...globals,
  };
  return vm.createContext(context);
}

export function loadJsonData(filename) {
  return JSON.parse(fs.readFileSync(new URL(filename, DATA_DIR), "utf8"));
}
