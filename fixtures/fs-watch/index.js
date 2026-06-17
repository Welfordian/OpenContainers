const fs = require("fs");
fs.writeFileSync("watched.txt", "old");
fs.watch("watched.txt", (event, name) => console.log(event + ":" + name));
fs.writeFileSync("watched.txt", "new");
