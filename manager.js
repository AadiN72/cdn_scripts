#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import readline from "readline/promises";
import { updateSharedScripts } from "./updateSharedScripts.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.cwd();
const draftsDir = path.join(repoRoot, "drafts");

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

async function promptForDraft(prompt) {
  const drafts = fs
    .readdirSync(draftsDir)
    .filter((file) => file.endsWith(".md"))
    .sort();

  if (drafts.length === 0) {
    throw new Error("No draft files found in drafts/");
  }

  console.log("Select a draft to publish:\n");
  drafts.forEach((file, index) => {
    console.log(`${index + 1}. ${file.replace(/\.md$/, "")}`);
  });

  const selection = Number(
    (await prompt.question("\nChoose a draft number: ")).trim(),
  );
  const draft = drafts[selection - 1];
  if (!draft) {
    throw new Error("Invalid selection");
  }

  return draft.replace(/\.md$/, "");
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
      prompt.close();
      return await runScript("generateDraft.js", [
        Date.now().toString(),
        title || "Untitled Draft",
      ]);
    }
    if (choice === "2") {
      const draftSlug = await promptForDraft(prompt);
      prompt.close();
      return await runScript("publishDraft.js", [draftSlug]);
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
