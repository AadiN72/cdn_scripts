#!/usr/bin/env node

import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));

function runGit(args, options = {}) {
  const output = execFileSync("git", ["-C", scriptDirectory, ...args], {
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  });
  return typeof output === "string" ? output.trim() : "";
}

export function updateSharedScripts() {
  try {
    runGit(["rev-parse", "--git-dir"]);
  } catch (error) {
    if (error.status === 128) {
      return;
    }
    throw error;
  }

  runGit(["fetch", "origin", "main"], { stdio: "inherit" });

  const localCommit = runGit(["rev-parse", "HEAD"]);
  const remoteCommit = runGit(["rev-parse", "origin/main"]);
  if (localCommit === remoteCommit) {
    return;
  }

  const isBehind = (() => {
    try {
      runGit(["merge-base", "--is-ancestor", "HEAD", "origin/main"]);
      return true;
    } catch (error) {
      if (error.status === 1) {
        return false;
      }
      throw error;
    }
  })();

  if (!isBehind) {
    return;
  }

  if (runGit(["status", "--porcelain"])) {
    throw new Error(
      "Shared scripts have local changes and cannot be updated automatically",
    );
  }

  runGit(["merge", "--ff-only", "origin/main"], { stdio: "inherit" });
  console.log("Updated shared manager scripts.");
}
