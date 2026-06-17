const http = require("http");

http.createServer((req, res) => {
  res.setHeader("content-type", "text/plain");
  res.end("express-basic:" + req.url);
}).listen(3000);
