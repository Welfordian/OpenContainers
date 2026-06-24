export function transformEsmToCjs(source, { filename, staticImportHelper = "__opencontainersRequire", awaitStaticImports = false } = {}) {
  const exportNames = new Map();
  let transformed = String(source);
  const staticImport = (specifier) => `${awaitStaticImports ? "await " : ""}${staticImportHelper}(${JSON.stringify(specifier)})`;
  transformed = replaceOutsideLiterals(transformed, /\bimport\.meta\.url\b/g, () => JSON.stringify(pathToFileUrl(filename)));
  transformed = replaceOutsideLiterals(transformed, /\bimport\.meta\.filename\b/g, () => JSON.stringify(filename));
  transformed = replaceOutsideLiterals(transformed, /\bimport\.meta\.dirname\b/g, () => JSON.stringify(dirname(filename)));
  transformed = replaceOutsideLiterals(transformed, /\bimport\.meta\.resolve\s*\(/g, () => "__opencontainersImportMetaResolve(");
  transformed = replaceOutsideLiterals(transformed, /\bimport\s*\(([^)]+)\)/g, (_match, specifierExpression) => `__opencontainersDynamicImport(${specifierExpression})`);

  transformed = replaceOutsideLiterals(transformed, /^(\s*)import\s+["']([^"']+)["'](?:\s+(?:with|assert)\s+\{[^}]*\})?(?:[^\S\r\n]*;[^\S\r\n]*(.*)|[^\S\r\n]*)$/gm, (_match, indent, specifier, rest) => {
    return appendTrailingImportCode(`${indent}${staticImport(specifier)};`, rest);
  });

  transformed = replaceOutsideLiterals(transformed, /^(\s*)import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'](?:\s+(?:with|assert)\s+\{[^}]*\})?(?:[^\S\r\n]*;[^\S\r\n]*(.*)|[^\S\r\n]*)$/gm, (_match, indent, name, specifier, rest) => {
    return appendTrailingImportCode(`${indent}const ${name} = __opencontainersModuleNamespace(${staticImport(specifier)}, ${JSON.stringify(specifier)});`, rest);
  });

  transformed = replaceOutsideLiterals(transformed, /^(\s*)import\s+([A-Za-z_$][\w$]*)\s*,\s*\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'](?:\s+(?:with|assert)\s+\{[^}]*\})?(?:[^\S\r\n]*;[^\S\r\n]*(.*)|[^\S\r\n]*)$/gm, (_match, indent, defaultName, namespaceName, specifier, rest) => {
    const temp = `__opencontainers_import_${defaultName}`;
    return appendTrailingImportCode(
      `${indent}const ${temp} = ${staticImport(specifier)};\n${indent}const ${defaultName} = ${temp} && ${temp}.__esModule ? ${temp}.default : (${temp}.default ?? ${temp});\n${indent}const ${namespaceName} = __opencontainersModuleNamespace(${temp}, ${JSON.stringify(specifier)});`,
      rest
    );
  });

  transformed = replaceOutsideLiterals(transformed, /^(\s*)import\s+{([^}]+)}\s+from\s+["']([^"']+)["'](?:\s+(?:with|assert)\s+\{[^}]*\})?(?:[^\S\r\n]*;[^\S\r\n]*(.*)|[^\S\r\n]*)$/gm, (_match, indent, imports, specifier, rest) => {
    return appendTrailingImportCode(`${indent}const { ${normalizeImportBindings(imports)} } = ${staticImport(specifier)};`, rest);
  });

  transformed = replaceOutsideLiterals(transformed, /^(\s*)import\s+([A-Za-z_$][\w$]*)\s*,\s*{([^}]+)}\s+from\s+["']([^"']+)["'](?:\s+(?:with|assert)\s+\{[^}]*\})?(?:[^\S\r\n]*;[^\S\r\n]*(.*)|[^\S\r\n]*)$/gm, (_match, indent, defaultName, imports, specifier, rest) => {
    const temp = `__opencontainers_import_${defaultName}`;
    return appendTrailingImportCode(
      `${indent}const ${temp} = ${staticImport(specifier)};\n${indent}const ${defaultName} = ${temp} && ${temp}.__esModule ? ${temp}.default : (${temp}.default ?? ${temp});\n${indent}const { ${normalizeImportBindings(imports)} } = ${temp};`,
      rest
    );
  });

  transformed = replaceOutsideLiterals(transformed, /^(\s*)import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'](?:\s+(?:with|assert)\s+\{[^}]*\})?(?:[^\S\r\n]*;[^\S\r\n]*(.*)|[^\S\r\n]*)$/gm, (_match, indent, defaultName, specifier, rest) => {
    const temp = `__opencontainers_import_${defaultName}`;
    return appendTrailingImportCode(
      `${indent}const ${temp} = ${staticImport(specifier)};\n${indent}const ${defaultName} = ${temp} && ${temp}.__esModule ? ${temp}.default : (${temp}.default ?? ${temp});`,
      rest
    );
  });

  transformed = replaceOutsideLiterals(transformed, /(^|[;\n])(\s*)export\s+default\s+function\s*([A-Za-z_$][\w$]*)?\s*\(/g, (_match, prefix, indent, name) => {
    if (name) {
      exportNames.set("default", name);
      return `${prefix}${indent}function ${name}(`;
    }
    exportNames.set("default", "__opencontainers_default_export");
    return `${prefix}${indent}function __opencontainers_default_export(`;
  });

  transformed = replaceOutsideLiterals(transformed, /(^|[;\n])(\s*)export\s+default\s+class\s*([A-Za-z_$][\w$]*)?\s*/g, (_match, prefix, indent, name) => {
    if (name) {
      exportNames.set("default", name);
      return `${prefix}${indent}class ${name} `;
    }
    exportNames.set("default", "__opencontainers_default_export");
    return `${prefix}${indent}class __opencontainers_default_export `;
  });

  transformed = replaceOutsideLiterals(transformed, /(^|[;\n])(\s*)export\s+default\s+([^;\n]+);?/g, (_match, prefix, indent, expression) => {
    return `${prefix}${indent}const __opencontainers_default_export = ${trimTrailingSemicolon(expression)};\n${indent}exports.default = __opencontainers_default_export;\n${indent}exports.__esModule = true;`;
  });

  transformed = replaceOutsideLiterals(transformed, /(^|[;\n])(\s*)export\s+(const|let|var)\s+([^;]+);?/g, (_match, prefix, indent, kind, declaration) => {
    const names = declaredVariableNames(declaration);
    for (const name of names) exportNames.set(name, name);
    return `${prefix}${indent}${kind} ${declaration};`;
  });

  transformed = replaceOutsideLiterals(transformed, /(^|[;\n])(\s*)export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g, (_match, prefix, indent, name) => {
    exportNames.set(name, name);
    return `${prefix}${indent}function ${name}(`;
  });

  transformed = replaceOutsideLiterals(transformed, /(^|[;\n])(\s*)export\s+class\s+([A-Za-z_$][\w$]*)\s*/g, (_match, prefix, indent, name) => {
    exportNames.set(name, name);
    return `${prefix}${indent}class ${name} `;
  });

  transformed = replaceOutsideLiterals(transformed, /^(\s*)export\s+{([^}]*)}\s+from\s+["']([^"']+)["'](?:[^\S\r\n]*;[^\S\r\n]*(.*)|[^\S\r\n]*)$/gm, (_match, indent, exportsList, specifier, rest) => {
    const temp = `__opencontainers_reexport_${Math.random().toString(16).slice(2)}`;
    return appendTrailingImportCode(
      `${indent}const ${temp} = ${staticImport(specifier)};\n${normalizeExportList(exportsList).map(({ local, exported }) => `${indent}${defineExport(exported, `${temp}[${JSON.stringify(local)}]`)}`).join("\n")}`,
      rest
    );
  });

  transformed = replaceOutsideLiterals(transformed, /^(\s*)export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'](?:[^\S\r\n]*;[^\S\r\n]*(.*)|[^\S\r\n]*)$/gm, (_match, indent, exported, specifier, rest) => {
    const temp = `__opencontainers_reexport_namespace_${Math.random().toString(16).slice(2)}`;
    return appendTrailingImportCode(
      `${indent}const ${temp} = __opencontainersModuleNamespace(${staticImport(specifier)}, ${JSON.stringify(specifier)});\n${indent}${defineExport(exported, temp)}`,
      rest
    );
  });

  transformed = replaceOutsideLiterals(transformed, /^(\s*)export\s+\*\s+from\s+["']([^"']+)["'](?:[^\S\r\n]*;[^\S\r\n]*(.*)|[^\S\r\n]*)$/gm, (_match, indent, specifier, rest) => {
    const temp = `__opencontainers_reexport_all_${Math.random().toString(16).slice(2)}`;
    return appendTrailingImportCode(
      `${indent}const ${temp} = ${staticImport(specifier)};\n${indent}for (const key of Object.keys(${temp})) if (key !== 'default' && key !== '__esModule') Object.defineProperty(exports, key, { enumerable: true, configurable: true, get: () => ${temp}[key] });`,
      rest
    );
  });

  transformed = replaceOutsideLiterals(transformed, /^(\s*)export\s+{([^}]*)}(?:[^\S\r\n]*;[^\S\r\n]*(.*)|[^\S\r\n]*)$/gm, (_match, indent, exportsList, rest) => {
    return appendTrailingImportCode(
      normalizeExportList(exportsList).map(({ local, exported }) => `${indent}${defineExport(exported, local)}`).join("\n"),
      rest
    );
  });

  if (exportNames.size) {
    transformed += "\nexports.__esModule = true;\n";
    for (const [exported, local] of exportNames.entries()) {
      transformed += `${defineExport(exported, local)}\n`;
    }
  }

  return transformed;
}

function replaceOutsideLiterals(source, pattern, replacer) {
  const codeMask = createCodeMask(source);
  return source.replace(pattern, (...args) => {
    const match = args[0];
    const offset = args.at(-2);
    return codeMask[offset] ? replacer(...args) : match;
  });
}

function createCodeMask(source) {
  const mask = new Array(source.length).fill(false);
  let state = "code";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (char === "\n") {
        mask[index] = true;
        state = "code";
      }
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        index += 1;
        state = "code";
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if ((state === "single" && char === "'") || (state === "double" && char === "\"") || (state === "template" && char === "`")) {
        state = "code";
      }
      continue;
    }

    mask[index] = true;
    if (char === "/" && next === "/") {
      mask[index] = false;
      index += 1;
      state = "line-comment";
      continue;
    }
    if (char === "/" && next === "*") {
      mask[index] = false;
      index += 1;
      state = "block-comment";
      continue;
    }
    if (char === "'") {
      mask[index] = false;
      state = "single";
    } else if (char === "\"") {
      mask[index] = false;
      state = "double";
    } else if (char === "`") {
      mask[index] = false;
      state = "template";
    }
  }

  return mask;
}

function appendTrailingImportCode(replacement, rest) {
  const trailing = rest?.trim();
  return trailing ? `${replacement}\n${trailing}` : replacement;
}

function defineExport(exported, expression) {
  return `Object.defineProperty(exports, ${JSON.stringify(exported)}, { enumerable: true, configurable: true, get: () => ${expression} });`;
}

function dirname(input) {
  const value = String(input);
  const index = value.lastIndexOf("/");
  return index <= 0 ? "/" : value.slice(0, index);
}

function pathToFileUrl(path) {
  return `file://${String(path).split("/").map((part, index) => (
    index === 0 ? "" : encodeURIComponent(part)
  )).join("/")}`;
}

export function looksLikeEsm(source) {
  const strippedSource = stripCommentsForEsmDetection(source);
  return /(^|\n)\s*import\s+[\w*{"']|\bimport\s*\(|(^|\n)\s*export\s+/m.test(strippedSource);
}

function stripCommentsForEsmDetection(source) {
  let output = "";
  let state = "code";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      output += char === "\n" ? "\n" : " ";
      if (char === "\n") state = "code";
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        output += "  ";
        index += 1;
        state = "code";
      } else {
        output += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      output += char;
      if (char === "\\") {
        output += next ?? "";
        index += 1;
        continue;
      }
      if ((state === "single" && char === "'") || (state === "double" && char === "\"") || (state === "template" && char === "`")) {
        state = "code";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      output += "  ";
      index += 1;
      state = "line-comment";
      continue;
    }
    if (char === "/" && next === "*") {
      output += "  ";
      index += 1;
      state = "block-comment";
      continue;
    }
    if (char === "'") state = "single";
    else if (char === "\"") state = "double";
    else if (char === "`") state = "template";
    output += char;
  }
  return output;
}

function normalizeImportBindings(imports) {
  return imports.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [imported, local] = part.split(/\s+as\s+/).map((value) => value.trim());
      return local ? `${imported}: ${local}` : imported;
    })
    .join(", ");
}

function normalizeExportList(exportsList) {
  return exportsList.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [local, exported] = part.split(/\s+as\s+/).map((value) => value.trim());
      return { local, exported: exported ?? local };
    });
}

function declaredVariableNames(declaration) {
  return declaration.split(",")
    .map((part) => part.trim().match(/^([A-Za-z_$][\w$]*)/)?.[1])
    .filter(Boolean);
}

function trimTrailingSemicolon(value) {
  return value.trim().replace(/;$/, "");
}
