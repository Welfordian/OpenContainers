const http = require("http");
const server = http.createServer((req, res) => res.end("websocket-basic"));
server.on("upgrade", (req, socket) => {
  socket.addEventListener("open", () => socket.send("ws-ready"));
  socket.addEventListener("message", (event) => socket.send("ws:" + event.data));
});
server.listen(3000);
