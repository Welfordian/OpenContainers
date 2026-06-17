const { spawn } = require("child_process");
const child = spawn("node", ["-e", "console.log('child fixture')"]);
child.stdout.on("data", (chunk) => console.log(String(chunk).trim()));
