export function transformEsmToCjs(source, { filename }) {
  const exportNames = new Map();
  let transformed = source.replace(/\bimport\.meta\.url\b/g, JSON.stringify(`file://${filename}`));
  transformed = transformed.replace(/\bimport\s*\(([^)]+)\)/g, (_match, specifierExpression) => `__opencontainersDynamicImport(${specifierExpression})`);

  transformed = transformed.replace(/^\s*import\s+["']([^"']+)["'];?\s*$/gm, (_match, specifier) => {
    return `__opencontainersRequire(${JSON.stringify(specifier)});`;
  });

  transformed = transformed.replace(/^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, name, specifier) => {
    return `const ${name} = __opencontainersRequire(${JSON.stringify(specifier)});`;
  });

  transformed = transformed.replace(/^\s*import\s+{([^}]+)}\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, imports, specifier) => {
    return `const { ${normalizeImportBindings(imports)} } = __opencontainersRequire(${JSON.stringify(specifier)});`;
  });

  transformed = transformed.replace(/^\s*import\s+([A-Za-z_$][\w$]*)\s*,\s*{([^}]+)}\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, defaultName, imports, specifier) => {
    const temp = `__opencontainers_import_${defaultName}`;
    return `const ${temp} = __opencontainersRequire(${JSON.stringify(specifier)});\nconst ${defaultName} = ${temp} && ${temp}.__esModule ? ${temp}.default : (${temp}.default ?? ${temp});\nconst { ${normalizeImportBindings(imports)} } = ${temp};`;
  });

  transformed = transformed.replace(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, defaultName, specifier) => {
    const temp = `__opencontainers_import_${defaultName}`;
    return `const ${temp} = __opencontainersRequire(${JSON.stringify(specifier)});\nconst ${defaultName} = ${temp} && ${temp}.__esModule ? ${temp}.default : (${temp}.default ?? ${temp});`;
  });

  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+default\s+function\s*([A-Za-z_$][\w$]*)?\s*\(/g, (_match, prefix, indent, name) => {
    if (name) {
      exportNames.set("default", name);
      return `${prefix}${indent}function ${name}(`;
    }
    exportNames.set("default", "__opencontainers_default_export");
    return `${prefix}${indent}function __opencontainers_default_export(`;
  });

  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+default\s+class\s*([A-Za-z_$][\w$]*)?\s*/g, (_match, prefix, indent, name) => {
    if (name) {
      exportNames.set("default", name);
      return `${prefix}${indent}class ${name} `;
    }
    exportNames.set("default", "__opencontainers_default_export");
    return `${prefix}${indent}class __opencontainers_default_export `;
  });

  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+default\s+([^;\n]+);?/g, (_match, prefix, indent, expression) => {
    return `${prefix}${indent}const __opencontainers_default_export = ${trimTrailingSemicolon(expression)};\n${indent}exports.default = __opencontainers_default_export;\n${indent}exports.__esModule = true;`;
  });

  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+(const|let|var)\s+([^;]+);?/g, (_match, prefix, indent, kind, declaration) => {
    const names = declaredVariableNames(declaration);
    for (const name of names) exportNames.set(name, name);
    return `${prefix}${indent}${kind} ${declaration};`;
  });

  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g, (_match, prefix, indent, name) => {
    exportNames.set(name, name);
    return `${prefix}${indent}function ${name}(`;
  });

  transformed = transformed.replace(/(^|[;\n])(\s*)export\s+class\s+([A-Za-z_$][\w$]*)\s*/g, (_match, prefix, indent, name) => {
    exportNames.set(name, name);
    return `${prefix}${indent}class ${name} `;
  });

  transformed = transformed.replace(/^\s*export\s+{([^}]*)}\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, exportsList, specifier) => {
    const temp = `__opencontainers_reexport_${Math.random().toString(16).slice(2)}`;
    return `const ${temp} = __opencontainersRequire(${JSON.stringify(specifier)});\n${normalizeExportList(exportsList).map(({ local, exported }) => `exports[${JSON.stringify(exported)}] = ${temp}[${JSON.stringify(local)}];`).join("\n")}`;
  });

  transformed = transformed.replace(/^\s*export\s+\*\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, specifier) => {
    const temp = `__opencontainers_reexport_all_${Math.random().toString(16).slice(2)}`;
    return `const ${temp} = __opencontainersRequire(${JSON.stringify(specifier)});\nfor (const key of Object.keys(${temp})) if (key !== 'default' && key !== '__esModule') exports[key] = ${temp}[key];`;
  });

  transformed = transformed.replace(/^\s*export\s+{([^}]*)};?\s*$/gm, (_match, exportsList) => {
    return normalizeExportList(exportsList).map(({ local, exported }) => `exports[${JSON.stringify(exported)}] = ${local};`).join("\n");
  });

  if (exportNames.size) {
    transformed += "\nexports.__esModule = true;\n";
    for (const [exported, local] of exportNames.entries()) {
      transformed += `exports[${JSON.stringify(exported)}] = ${local};\n`;
    }
  }

  return transformed;
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
