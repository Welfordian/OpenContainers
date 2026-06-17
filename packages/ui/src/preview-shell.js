export function buildPreviewShell({ previewUrl }) {
  const absolutePreviewUrl = new URL(previewUrl, globalThis.location?.href ?? "http://127.0.0.1/").href;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body, iframe { width: 100%; height: 100%; margin: 0; border: 0; }
      body { background: white; color: #111; font: 14px system-ui, sans-serif; }
      .status { box-sizing: border-box; padding: 18px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <iframe id="welford-preview-document" sandbox="allow-scripts allow-forms allow-popups allow-downloads"></iframe>
    <script>
      const previewUrl = ${JSON.stringify(absolutePreviewUrl)};
      const frame = document.getElementById("welford-preview-document");

      window.addEventListener("message", (event) => {
        const message = event.data;
        if (!message?.type) return;
        if (event.source === frame.contentWindow) {
          if (message.type === "welford:fetch:request") {
            handleFetchRequest(message);
            return;
          }
          if (message.type.startsWith("welford:ws:") || message.type === "preview-console") {
            window.parent.postMessage(message, window.location.origin);
          }
          return;
        }
        if (event.source === window.parent && message.type === "welford:ws:event") {
          frame.contentWindow?.postMessage(message, "*");
        }
      });

      async function loadPreview() {
        try {
          const response = await fetch(previewUrl, { cache: "no-store" });
          const html = await response.text();
          if (!response.ok) {
            renderStatus(response.status + " " + response.statusText + "\\n\\n" + html);
            return;
          }
          frame.srcdoc = withPreviewBase(html);
        } catch (error) {
          renderStatus(error.stack || error.message || String(error));
        }
      }

      async function handleFetchRequest(message) {
        try {
          const response = await fetch(message.url, {
            method: message.method || "GET",
            headers: message.headers || [],
            body: message.body,
            cache: "no-store"
          });
          const body = await response.arrayBuffer();
          frame.contentWindow?.postMessage({
            type: "welford:fetch:response",
            id: message.id,
            ok: true,
            status: response.status,
            statusText: response.statusText,
            headers: [...response.headers.entries()],
            body
          }, "*", [body]);
        } catch (error) {
          frame.contentWindow?.postMessage({
            type: "welford:fetch:response",
            id: message.id,
            ok: false,
            error: { message: error.message, name: error.name, stack: error.stack }
          }, "*");
        }
      }

      function withPreviewBase(html) {
        const baseTag = '<base href="' + escapeAttribute(previewUrl) + '">';
        if (/<base\\s/i.test(html)) return html;
        if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, '<head$1>' + baseTag);
        if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, '<html$1>' + baseTag);
        return baseTag + html;
      }

      function renderStatus(message) {
        frame.srcdoc = '<!doctype html><html><body><pre class="status">' + escapeHtml(message) + '</pre></body></html>';
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[char]);
      }

      function escapeAttribute(value) {
        return escapeHtml(value).replace(/\\n/g, "&#10;");
      }

      loadPreview();
    </script>
  </body>
</html>`;
}
