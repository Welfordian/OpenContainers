import { previewClientBrowserScript } from "../../preview-client/src/index.js";

const PREVIEW_SNIPPET_MARKER = "__OPENCONTAINERS_PREVIEW__";

export function injectPreviewClient(html, {
  projectId,
  defaultPort,
  bridgePath = `/__opencontainers/bridge/${projectId}`,
  parentOrigin,
  previewOrigin,
  baseUrl
}) {
  if (!isHtmlDocument(html) || html.includes(PREVIEW_SNIPPET_MARKER)) return html;
  const snippet = [
    "<script>",
    `window.${PREVIEW_SNIPPET_MARKER}=${JSON.stringify({ projectId, defaultPort, bridgePath, parentOrigin, previewOrigin, baseUrl })};`,
    "</script>",
    "<script>",
    escapeInlineScript(previewClientBrowserScript()),
    "</script>"
  ].join("");

  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${snippet}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1>${snippet}`);
  return `${snippet}${html}`;
}

export function isHtmlDocument(value) {
  return typeof value === "string" && /<!doctype html|<html|<head|<body/i.test(value);
}

function escapeInlineScript(source) {
  return source.replaceAll("</script", "<\\/script");
}
