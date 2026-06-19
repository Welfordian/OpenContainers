# OpenContainers

OpenContainers is a clean-room, browser-native runtime for running Node-style JavaScript projects without a server-side container. It provides a WebContainer-compatible facade, a virtual filesystem, selected Node built-ins, npm package installation, HTTP previews, and WebSocket bridging for browser-based playgrounds and REPLs.

The main hosted app in this repository is OpenContainers Run, a standalone playground intended for `run.welford.me`.

## Status

OpenContainers is currently an early implementation. It is useful for browser-based JavaScript and Node experiments, but it is not a full Linux or Node.js VM.

Current constraints include:

- Native Node add-ons are not supported.
- Browser CORS and network restrictions still apply to external fetches.
- Raw external TCP and TLS sockets are not supported.
- Package lifecycle scripts are permission-gated.
- Preview servers are routed through the OpenContainers service worker.

## Repository Layout

- `packages/embed` contains the WebContainer-compatible `OpenContainer` facade.
- `packages/runtime-node` contains the Node-like runtime and built-ins.
- `packages/fs` contains the virtual filesystem.
- `packages/npm` contains npm registry and installer support.
- `packages/service-worker` and `packages/preview-client` handle browser previews.
- `apps/run-welford` contains the standalone OpenContainers Run app.

## Runtime Package Contents

The npm package intentionally ships the README, `package.json`, and the bundled browser runtime at `packages/embed/dist/webcontainer-compatible.js`.
That bundle contains:

- The `OpenContainer` and `WebContainer` browser facades.
- The virtual filesystem, Node-like runtime, shell, npm runner, preview bridge, and service worker generator.
- `createOpenContainersServiceWorkerScript()`, which writes the service worker your app must serve from its own origin.

You do not need the repository source files to build a REPL host. You import the bundled runtime from `opencontainers`, serve the generated service worker from your public directory, and provide your own editor, terminal, file UI, and preview iframe.

## Local Development

Install dependencies for the standalone app:

```sh
npm --prefix apps/run-welford install
```

Run the OpenContainers Run app locally:

```sh
npm run run:dev
```

Build the standalone app:

```sh
npm run run:build
```

Run the test suite:

```sh
npm test
```

## Using OpenContainers

Install OpenContainers from npm:

```sh
npm install opencontainers
```

The package exposes the browser runtime through `opencontainers` and `opencontainers/webcontainer`.

Boot a container, mount files, and spawn a process:

```js
import { OpenContainer } from "opencontainers";

const container = await OpenContainer.boot({
  projectId: "demo",
  previewBasePath: "/opencontainers/preview",
  serviceWorkerUrl: "/opencontainers-runtime-sw.js",
});

await container.mount({
  "index.js": {
    file: {
      contents: "console.log('Hello from OpenContainers');",
    },
  },
});

const process = await container.spawn("node", ["index.js"]);

let output = "";
await process.output.pipeTo(
  new WritableStream({
    write(chunk) {
      output += String(chunk);
    },
  }),
);

const exitCode = await process.exit;
console.log({ exitCode, output });
```

## Building A Browser REPL

OpenContainers gives you the runtime pieces needed to build a REPL like OpenContainers Run. Your host app provides the editor, console UI, file state, package controls, and styling.

The minimum host app flow is:

1. Install `opencontainers`.
2. Serve the OpenContainers service worker from your own origin.
3. Boot an `OpenContainer`.
4. Mount the user's files.
5. Spawn `node`, `npm`, or another supported command.
6. Pipe process output into your console UI.
7. Listen for `server-ready` and point an iframe at the preview URL.

### npm And npx

`npm` and `npx` are routed through the real npm CLI inside the virtual filesystem, not a hand-written installer shim.
On first use, OpenContainers downloads a pinned npm CLI tarball from the npm registry, verifies and extracts it into:

```txt
/home/opencontainers/.opencontainers/npm/npm-11.17.0
```

npm's cache is stored in:

```txt
/home/opencontainers/.npm
```

That means normal flows such as these work from either your app's run button or a terminal UI backed by `container.spawn()`:

```sh
npm install chalk
node index.js
npx cowsay OpenContainers
npm run dev
```

The runtime still enforces browser constraints. Native Node add-ons, postinstall scripts without permission, raw external TCP, and browser-blocked network/CORS requests are not made available just because npm is real.

### 1. Generate The Service Worker

Service workers must be served from the same origin as your app. They cannot be imported directly from `node_modules` at runtime.

OpenContainers currently exports a service worker generator. Add a small script that writes it into your app's public/static directory:

```js
// scripts/write-opencontainers-sw.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { createOpenContainersServiceWorkerScript } from "opencontainers";

mkdirSync("public", { recursive: true });

writeFileSync(
  "public/opencontainers-runtime-sw.js",
  createOpenContainersServiceWorkerScript({
    previewBasePath: "/opencontainers/preview",
  }),
);
```

For a Vite app, run it before local dev and before production builds:

```json
{
  "scripts": {
    "predev": "node scripts/write-opencontainers-sw.mjs",
    "dev": "vite",
    "prebuild": "node scripts/write-opencontainers-sw.mjs",
    "build": "vite build"
  }
}
```

This creates a browser-fetchable file at:

```txt
/opencontainers-runtime-sw.js
```

The service worker needs a root-level scope so it can intercept preview requests under `/opencontainers/preview/...`. `OpenContainer.boot()` registers it with `scope: "/"`.

Service workers require HTTPS in production. Localhost is allowed for development.

### 2. Boot The Runtime

Use the same service worker URL and preview base path when booting:

```js
import { OpenContainer } from "opencontainers";

const container = await OpenContainer.boot({
  projectId: "repl",
  serviceWorkerUrl: "/opencontainers-runtime-sw.js",
  previewBasePath: "/opencontainers/preview",
});

container.on("error", (error) => {
  console.error(error);
});
```

On the first page load after installing a service worker, the page may not be controlled yet. If previews do not connect and you receive the "Service Worker is not controlling this page" error, reload the page once and run again.

### 3. Mount Files And Run Code

Mount a WebContainer-style file tree, then spawn a command:

```js
await container.mount({
  "index.js": {
    file: {
      contents: `
const http = require("node:http");

http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<h1>Hello from OpenContainers</h1>");
}).listen(3000, () => {
  console.log("Server ready on port 3000");
});
`,
    },
  },
});

const process = await container.spawn("node", ["index.js"]);
```

Pipe process output into your console:

```js
process.output.pipeTo(
  new WritableStream({
    write(chunk) {
      appendToConsole(String(chunk));
    },
  }),
);

process.exit.then((exitCode) => {
  appendToConsole(`Exited with code ${exitCode}`);
});
```

### 4. Show Browser Previews

When runtime code starts an HTTP server, OpenContainers emits a preview URL:

```js
container.on("server-ready", (port, url) => {
  console.log(`Server ready on port ${port}: ${url}`);
  iframe.src = url;
});
```

For the example above, the URL will look like:

```txt
https://your-app.example/opencontainers/preview/repl:3000/
```

The browser loads that URL through your same-origin service worker. The service worker forwards the request into the OpenContainers runtime, which dispatches it to the server listening inside the container.

### 5. Minimal REPL Shell

A small host implementation looks like this:

```js
import { OpenContainer } from "opencontainers";

const iframe = document.querySelector("iframe");
const runButton = document.querySelector("button[data-run]");
const editor = createYourEditorSomehow();

const container = await OpenContainer.boot({
  projectId: "repl",
  serviceWorkerUrl: "/opencontainers-runtime-sw.js",
  previewBasePath: "/opencontainers/preview",
});

container.on("server-ready", (_port, url) => {
  iframe.src = url;
});

container.on("error", (error) => {
  appendToConsole(error.stack || error.message);
});

runButton.addEventListener("click", async () => {
  await container.mount({
    "index.js": {
      file: {
        contents: editor.getValue(),
      },
    },
  });

  const process = await container.spawn("node", ["index.js"]);

  process.output.pipeTo(
    new WritableStream({
      write(chunk) {
        appendToConsole(String(chunk));
      },
    }),
  );

  const exitCode = await process.exit;
  appendToConsole(`Exited with code ${exitCode}`);
});
```

That is enough for a basic browser REPL with Node-style execution and HTTP previews. From there, add your own editor, package UI, persistence, sharing, examples, and visual design.

## Browser Previews

OpenContainers detects HTTP servers started inside the runtime and emits preview URLs:

```js
container.on("server-ready", (port, url) => {
  console.log(`Server ready on port ${port}: ${url}`);
  iframe.src = url;
});
```

Your app must serve and register the OpenContainers service worker. The default runtime options expect:

- Service worker URL: `/opencontainers-runtime-sw.js`
- Preview route base: `/opencontainers/preview`

The standalone app already wires these pieces together. For your own app, follow the service worker setup above.

## WebContainer Compatibility

OpenContainers exports a `WebContainer` alias for compatibility with code that expects a WebContainer-shaped API:

```js
import { WebContainer } from "opencontainers/webcontainer";

const container = await WebContainer.boot();
```

The compatibility layer supports common flows such as mounting files, spawning Node commands, listening for server-ready events, and dispatching preview requests. It does not aim to perfectly emulate every StackBlitz WebContainers behavior.

## Cloudflare Pages

The standalone app is compatible with Cloudflare Pages.

Use these Pages settings:

- Root directory: `apps/run-welford`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `26`

Share persistence expects a D1 binding named `bookmarks` with the `repl_shares` table.

## Useful Commands

```sh
npm run run:dev
npm run run:build
npm run run:pages:dev
npm test
npm run test:milestones
```
