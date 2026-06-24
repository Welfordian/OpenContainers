const fastify = require("fastify");
const { Hono } = require("hono");
const { Server } = require("socket.io");
const { WebSocketServer } = require("ws");

const app = fastify();

app.get("/fastify", (request, reply) => {
  reply.type("text/plain").send(`fastify:${request.url}`);
});

const hono = new Hono();
hono.get("/hono", (context) => context.text(`hono:${context.req.path}`));

app.get("/hono", async (request, reply) => {
  const response = await hono.fetch(new Request(`http://localhost${request.url}`));
  reply
    .code(response.status)
    .type(response.headers.get("content-type") ?? "text/plain")
    .send(await response.text());
});

const wss = new WebSocketServer({ server: app.server, path: "/ws" });
wss.on("connection", (socket) => {
  socket.send("ws-ready");
  socket.on("message", (message) => {
    socket.send(`ws:${message}`);
  });
});

const io = new Server(app.server);
io.on("connection", (socket) => {
  console.log(`socket.io connected:${socket.id}`);
  socket.emit("chat message", "socketio-ready");
  socket.on("chat message", (message) => {
    socket.emit("chat message", `socketio:${message}`);
  });
});

app.listen({ port: 3000, host: "0.0.0.0" }, () => {
  console.log("framework fixture ready");
});
