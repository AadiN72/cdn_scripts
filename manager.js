#!/usr/bin/env node

import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import readline from "readline/promises";
import { updateSharedScripts } from "./updateSharedScripts.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.cwd();

updateSharedScripts();

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(scriptDirectory, scriptName), ...args],
      { cwd: repoRoot, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("\nWhat do you want to do?\n");
    console.log("1. Generate draft");
    console.log("2. Publish");
    const choice = (await prompt.question("Choose an option: ")).trim();

    if (choice === "1") {
      const title = (
        await prompt.question("Draft title (press Enter for Untitled Draft): ")
      ).trim();
      return await runScript("generateDraft.js", [
        Date.now().toString(),
        title || "Untitled Draft",
      ]);
    }
    if (choice === "2") {
      return await runScript("publishDraft.js");
    }

    console.error("Invalid option. Choose 1 or 2.");
    return 1;
  } finally {
    prompt.close();
  }
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
