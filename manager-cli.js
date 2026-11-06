#!/usr/bin/env node

import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { updateSharedScripts } from "./updateSharedScripts.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

updateSharedScripts();

const child = spawn(
  process.execPath,
  [path.join(scriptDirectory, "manager.js"), ...process.argv.slice(2)],
  { cwd: process.cwd(), stdio: "inherit" },
);

child.once("error", (error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
child.once("close", (code) => {
  process.exitCode = code ?? 1;
});
