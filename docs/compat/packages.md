# Package Compatibility

This document is generated from fixture metadata under [fixtures](../../fixtures). Do not edit this table by hand; update each fixture's `metadata.json` and run `npm run compat:docs`.

## Summary

The package compatibility lab records the package versions, commands, preview coverage, and permissions needed for each smoke fixture. These fixtures use the deterministic in-repository registry where possible so CI does not depend on live npm registry state.

| Fixture | Category | Packages | Commands | Preview | Permissions |
| --- | --- | --- | --- | --- | --- |
| `child-process-spawn-node` | process | - | `npm run test` | no | `childProcesses` |
| `cli-ecosystem` | cli | typescript@1.0.0<br>tsx@1.0.0<br>ts-node@1.0.0<br>eslint@1.0.0<br>prettier@1.0.0<br>vitest@1.0.0<br>jest@1.0.0 | `npm install`<br>`npm run build`<br>`npm run-script lint`<br>`npm run format`<br>`npm t`<br>`npm run tsx`<br>`npm run ts-node`<br>`npx jest --version`<br>`node dist/cli.js` | no | `childProcesses`<br>`packageInstall` |
| `express-basic` | framework | - | `npm run dev` | yes | `preview` |
| `framework-ecosystem` | framework | fastify@1.0.0<br>hono@1.0.0<br>socket.io@1.0.0<br>ws@1.0.0 | `npm install`<br>`npm run dev` | yes | `packageInstall`<br>`preview`<br>`webSocketPreview` |
| `fs-watch` | filesystem | - | `npm run test` | no | `fileSystemWatch` |
| `npm-install-simple` | package-manager | is-odd@1.0.0 | `npm install`<br>`npm run test` | no | `packageInstall` |
| `package-probes` | package | chalk@5.0.0<br>commander@12.0.0<br>debug@4.3.0<br>dotenv@16.0.0<br>undici@6.0.0<br>yargs@17.0.0 | `npm install`<br>`npm run test` | no | `packageInstall` |
| `vite-react` | framework | vite@5.0.0 | `npm install`<br>`npm run dev` | yes | `packageInstall`<br>`preview`<br>`webSocketPreview` |
| `websocket-basic` | network | - | `npm run dev` | yes | `preview`<br>`webSocketPreview` |
