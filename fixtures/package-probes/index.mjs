import assert from "node:assert/strict";
import http from "node:http";
import chalk, { green } from "chalk";
import { Command } from "commander";
import debug from "debug";
import dotenv from "dotenv";
import { fetch, Headers, Request, Response } from "undici";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

console.log(`undici-fetch:${fetch.name}:${fetch.length}`);

dotenv.config({ path: ".env" });
console.log(`dotenv:${process.env.PACKAGE_PROBE}`);

const command = new Command();
command.option("-n, --name <name>");
command.parse(["node", "probe", "--name", "oc"]);
console.log(`commander:${command.opts().name}`);

const argv = yargs(hideBin(["node", "probe", "--flag", "value"]))
  .option("flag", { type: "string" })
  .parse();
console.log(`yargs:${argv.flag}`);

process.env.DEBUG = "oc:*";
const log = debug("oc:probe");
log("value %d", 7);
console.log(`debug-enabled:${log.enabled}`);

console.log(`chalk:${green("ok")}:${chalk.bold("bold")}`);

const headers = new Headers({ "x-probe": "ok" });
const request = new Request("http://localhost:3000/pkg", { headers });
assert.equal(request.headers.get("x-probe"), "ok");
const response = new Response("body");
assert.equal(await response.text(), "body");

const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/plain");
  res.end(`undici:${req.url}`);
});

await new Promise((resolve) => server.listen(3000, resolve));
try {
  const fetched = await fetch("http://localhost:3000/pkg");
  console.log(await fetched.text());
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("package probes complete");
