const fs = require("fs");
fs.writeFileSync("watched.txt", "old");
const watcher = fs.watch("watched.txt", (event, name) => {
  console.log(event + ":" + name);
  watcher.close();
});
fs.writeFileSync("watched.txt", "new");
