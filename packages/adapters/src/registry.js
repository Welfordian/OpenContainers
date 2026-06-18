export const packageAdapters = {
  esbuild: {
    replaceBin: {
      esbuild: "/__adapters__/esbuild-wasm/bin.js"
    },
    replaceModule: "/__adapters__/esbuild-wasm/index.js",
    postInstall: "skip",
    files: {
      "/__adapters__/esbuild-wasm/index.js": `
        function transformSync(source, options = {}) {
          return { code: String(source), map: options.sourcemap ? '' : null, warnings: [], errors: [] };
        }
        async function transform(source, options = {}) {
          return transformSync(source, options);
        }
        function buildSync() {
          return { outputFiles: [], warnings: [], errors: [] };
        }
        async function build() {
          return buildSync();
        }
        module.exports = {
          version: 'opencontainers-esbuild-wasm-adapter',
          transform,
          transformSync,
          build,
          buildSync,
          formatMessages: async (messages) => messages.map(String),
          formatMessagesSync: (messages) => messages.map(String)
        };
      `,
      "/__adapters__/esbuild-wasm/bin.js": `
        const esbuild = require('./index.js');
        const args = process.argv.slice(2);
        if (args.includes('--version')) {
          console.log(esbuild.version);
        } else {
          console.log('opencontainers esbuild adapter');
        }
      `
    }
  },
  fsevents: {
    replaceModule: "/__adapters__/fsevents/noop.js",
    postInstall: "skip",
    files: {
      "/__adapters__/fsevents/noop.js": `
        module.exports = {
          watch() {
            return { close() {} };
          }
        };
      `
    }
  },
  sharp: {
    replaceModule: "/__adapters__/sharp/unsupported.js",
    postInstall: "skip",
    files: {
      "/__adapters__/sharp/unsupported.js": `
        function sharpUnsupported() {
          const error = new Error('sharp uses native image processing bindings and is not supported in OpenContainers V1');
          error.code = 'ERR_OPENCONTAINERS_NATIVE_MODULE_UNSUPPORTED';
          throw error;
        }
        module.exports = sharpUnsupported;
      `
    }
  }
};

export function adapterForPackage(packageName) {
  return packageAdapters[packageName] ?? null;
}

export function materializeAdapterFiles(fs, adapter) {
  for (const [path, source] of Object.entries(adapter.files ?? {})) {
    const directory = path.slice(0, path.lastIndexOf("/")) || "/";
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path, normalizeAdapterSource(source));
  }
}

function normalizeAdapterSource(source) {
  return `${source.trim().replace(/^ {8}/gm, "")}\n`;
}
