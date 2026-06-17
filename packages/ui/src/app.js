import { buildPreviewShell } from "./preview-shell.js";

class KernelClient {
  constructor(worker) {
    this.worker = worker;
    this.nextId = 1;
    this.pending = new Map();
    this.onStream = () => {};
    this.onWebSocket = () => {};
    this.onPty = () => {};
    worker.addEventListener("message", (event) => this.handleMessage(event.data));
  }

  handleMessage(message) {
    if (message?.type === "stream") {
      this.onStream(message);
      return;
    }
    if (message?.type === "webSocket") {
      this.onWebSocket(message);
      return;
    }
    if (message?.type === "pty") {
      this.onPty(message);
      return;
    }
    if (message?.type !== "reply") return;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    this.pending.delete(message.requestId);
    if (message.payload?.ok === false) pending.reject(deserializeError(message.payload.error));
    else pending.resolve(message.payload);
  }

  request(type, payload = {}) {
    const id = `ui-${this.nextId++}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }
}

const state = {
  currentFile: "/workspace/server.js",
  files: [],
  previewPort: null,
  previewRefreshToken: 0
};

const elements = {
  fileList: document.querySelector("#file-list"),
  editor: document.querySelector("#editor"),
  currentFile: document.querySelector("#current-file"),
  terminal: document.querySelector("#terminal"),
  commandInput: document.querySelector("#command-input"),
  commandForm: document.querySelector("#command-form"),
  runDev: document.querySelector("#run-dev"),
  saveFile: document.querySelector("#save-file"),
  stopAll: document.querySelector("#stop-all"),
  clearNodeModules: document.querySelector("#clear-node-modules"),
  resetFs: document.querySelector("#reset-fs"),
  status: document.querySelector("#runtime-status"),
  preview: document.querySelector("#preview"),
  previewLink: document.querySelector("#preview-link"),
  storageSummary: document.querySelector("#storage-summary")
};

const worker = new Worker("/packages/kernel/src/kernel-worker.js", { type: "module" });
const kernel = new KernelClient(worker);
kernel.onStream = ({ stream, chunk }) => appendTerminal(chunk, stream);
kernel.onWebSocket = relayKernelWebSocketEvent;
kernel.onPty = ({ chunk, event }) => {
  if (chunk) appendTerminal(chunk);
  if (event === "close") appendTerminal("\r\n[pty closed]\r\n", "stderr");
};
const previewSockets = new Map();
const pty = { sessionId: null };

await connectServiceWorker(worker);
const init = await kernel.request("initProject", {
  projectId: "demo",
  defaultPreviewPort: 3000
});
state.files = init.files;
updateStorage(init.storage);
renderFileList();
await loadFile(state.currentFile);
const openedPty = await kernel.request("openPty", { cwd: "/workspace", cols: 100, rows: 24 });
pty.sessionId = openedPty.sessionId;
appendTerminal("$ ");
await refreshPreview();

elements.runDev.addEventListener("click", runDevCommand);
elements.saveFile.addEventListener("click", async () => {
  await saveCurrentFile();
  await refreshPreview();
});
elements.stopAll.addEventListener("click", async () => {
  if (pty.sessionId) await kernel.request("ptyInput", { sessionId: pty.sessionId, data: "\x03" });
  await kernel.request("killAll");
  setStatus("Stopped");
  await refreshPreview();
});
elements.clearNodeModules.addEventListener("click", async () => {
  const result = await kernel.request("clearNodeModules");
  state.files = result.files;
  updateStorage(result.storage);
  renderFileList();
  appendTerminal("cleared node_modules\n");
});
elements.resetFs.addEventListener("click", async () => {
  const result = await kernel.request("resetFilesystem");
  state.files = result.files;
  updateStorage(result.storage);
  renderFileList();
  await loadFile("/workspace/server.js");
  appendTerminal("filesystem reset\n");
  await refreshPreview();
});
elements.commandForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendTerminalCommand(elements.commandInput.value);
});
document.querySelectorAll("[data-permission]").forEach((input) => {
  input.addEventListener("change", () => {
    kernel.request("setPermission", {
      name: input.dataset.permission,
      value: input.checked
    });
  });
});
window.addEventListener("message", handlePreviewMessage);

async function connectServiceWorker(kernelWorker) {
  if (!("serviceWorker" in navigator)) {
    appendTerminal("service workers unavailable; preview routing disabled\n", "stderr");
    return;
  }
  await navigator.serviceWorker.register("/sw.js", { type: "module" });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    location.reload();
    return;
  }
  const channel = new MessageChannel();
  navigator.serviceWorker.controller.postMessage({ type: "WELFORD_CONNECT_KERNEL" }, [channel.port1]);
  kernelWorker.postMessage({ type: "WELFORD_ATTACH_PORT" }, [channel.port2]);
}

async function runCommand(commandLine, options = {}) {
  setStatus("Running");
  appendTerminal(`$ ${commandLine}\n`);
  try {
    const result = await kernel.request("runCommand", { commandLine, ...options });
    state.files = result.files;
    updateStorage(result.storage);
    renderFileList();
    appendTerminal(result.status === "running" ? `pid ${result.pid} running\n` : `exit ${result.status}\n`);
    setStatus(result.status === "running" || result.status === 0 ? "Ready" : "Failed");
    await refreshPreview({ waitForServer: result.status === "running" });
  } catch (error) {
    appendTerminal(`${error.stack ?? error.message}\n`, "stderr");
    setStatus("Failed");
  }
}

async function runDevCommand() {
  setStatus("Running");
  try {
    await saveCurrentFile({ announce: false });
    if (pty.sessionId) {
      await kernel.request("ptyInput", { sessionId: pty.sessionId, data: "\x03" });
    }
    await kernel.request("killAll");
    await sendTerminalCommand("npm run dev", { waitForServer: true });
  } catch (error) {
    appendTerminal(`${error.stack ?? error.message}\n`, "stderr");
    setStatus("Failed");
  }
}

async function sendTerminalCommand(commandLine, { waitForServer = true } = {}) {
  if (!commandLine.trim()) return;
  setStatus("Running");
  if (!pty.sessionId) {
    await runCommand(commandLine);
    return;
  }
  try {
    await kernel.request("ptyInput", {
      sessionId: pty.sessionId,
      data: `${commandLine}\n`
    });
    setStatus("Ready");
    await refreshPreview({ waitForServer });
  } catch (error) {
    appendTerminal(`${error.stack ?? error.message}\n`, "stderr");
    setStatus("Failed");
  }
}

async function saveCurrentFile({ announce = true } = {}) {
  const result = await kernel.request("writeFile", {
    path: state.currentFile,
    content: elements.editor.value
  });
  state.files = result.files;
  updateStorage(result.storage);
  renderFileList();
  if (announce) appendTerminal(`saved ${state.currentFile}\n`);
}

async function loadFile(path) {
  const result = await kernel.request("readFile", { path });
  state.currentFile = path;
  elements.currentFile.textContent = path;
  elements.editor.value = result.content;
  renderFileList();
}

function renderFileList() {
  elements.fileList.replaceChildren(...state.files
    .filter((file) => file.type === "file")
    .map((file) => {
      const button = document.createElement("button");
      button.textContent = file.path.replace("/workspace/", "");
      button.className = file.path === state.currentFile ? "selected" : "";
      button.addEventListener("click", () => loadFile(file.path));
      const item = document.createElement("li");
      item.append(button);
      return item;
    }));
}

async function refreshPreview({ waitForServer = false } = {}) {
  const token = ++state.previewRefreshToken;
  const preview = waitForServer ? await waitForPreviewServer() : await getPreviewStatus();
  if (token !== state.previewRefreshToken) return;

  state.previewPort = preview.port ?? null;
  const previewPath = state.previewPort ? `/p/demo:${state.previewPort}/` : "/p/demo/";
  const url = new URL(previewPath, location.href);
  url.searchParams.set("t", String(Date.now()));
  previewSockets.clear();
  elements.preview.srcdoc = buildPreviewShell({ previewUrl: url.href });
  elements.previewLink.href = previewPath;
  elements.previewLink.textContent = previewPath;
}

async function getPreviewStatus() {
  const result = await kernel.request("previewStatus");
  return result.preview ?? { port: null, ports: [] };
}

async function waitForPreviewServer({ timeoutMs = 2500, intervalMs = 100 } = {}) {
  const started = Date.now();
  let lastStatus = await getPreviewStatus();
  while (!lastStatus.port && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    lastStatus = await getPreviewStatus();
  }
  return lastStatus;
}

async function handlePreviewMessage(event) {
  if (event.source !== elements.preview.contentWindow) return;
  const message = event.data;
  if (message?.type === "preview-console") {
    appendTerminal(`[preview:${message.level}] ${message.args.map(formatConsoleArg).join(" ")}\n`);
    return;
  }
  if (!message?.type?.startsWith?.("welford:ws:")) return;

  if (message.type === "welford:ws:connect") {
    try {
      const response = await kernel.request("webSocketConnect", {
        projectId: message.projectId,
        port: message.port,
        path: message.path,
        protocols: message.protocols
      });
      previewSockets.set(response.socketId, {
        localId: message.localId,
        source: event.source
      });
      postToPreview(event.source, {
        type: "welford:ws:event",
        localId: message.localId,
        socketId: response.socketId,
        event: "connected"
      });
    } catch (error) {
      postToPreview(event.source, {
        type: "welford:ws:event",
        localId: message.localId,
        event: "error",
        message: error.message
      });
    }
    return;
  }

  if (message.type === "welford:ws:send") {
    await kernel.request("webSocketSend", {
      socketId: message.socketId,
      data: message.data
    });
    return;
  }

  if (message.type === "welford:ws:close") {
    await kernel.request("webSocketClose", {
      socketId: message.socketId,
      code: message.code,
      reason: message.reason
    });
  }
}

function relayKernelWebSocketEvent(message) {
  const previewSocket = previewSockets.get(message.socketId);
  if (!previewSocket) return;
  postToPreview(previewSocket.source, {
    type: "welford:ws:event",
    localId: previewSocket.localId,
    socketId: message.socketId,
    event: message.event,
    data: message.data,
    code: message.code,
    reason: message.reason,
    wasClean: message.wasClean
  });
  if (message.event === "close") previewSockets.delete(message.socketId);
}

function postToPreview(target, message) {
  target?.postMessage?.(message, location.origin);
}

function formatConsoleArg(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function appendTerminal(text, stream = "stdout") {
  const span = document.createElement("span");
  span.className = stream;
  span.textContent = text;
  elements.terminal.append(span);
  elements.terminal.scrollTop = elements.terminal.scrollHeight;
}

function setStatus(value) {
  elements.status.textContent = value;
}

function updateStorage(storage) {
  if (!storage) return;
  const usage = formatBytes(storage.usage ?? storage.virtualUsage ?? 0);
  const quota = storage.quota ? ` / ${formatBytes(storage.quota)}` : "";
  elements.storageSummary.textContent = `Storage: ${usage}${quota}${storage.persistent ? " persisted" : ""}`;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function deserializeError(error) {
  return Object.assign(new Error(error?.message ?? "Kernel request failed"), error ?? {});
}
