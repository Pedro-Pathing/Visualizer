import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

// Create a progress bar
function createProgressBar(total, current = 0) {
  const width = 30;
  const percentage = Math.min(100, (current / total) * 100);
  const filled = Math.floor((width * percentage) / 100);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `[${bar}] ${percentage.toFixed(1)}%`;
}

// Run command with streaming output and progress tracking
async function runCommandStream(command, args, label) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 ${label}...`);

    const child = spawn(command, args, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    let error = "";

    child.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;

      // Show progress for uploads
      if (text.includes("Uploading") || text.includes("uploading")) {
        const match = text.match(/(\d+)%/);
        if (match) {
          const percent = parseInt(match[1]);
          process.stdout.write(
            `\r📤 Uploading: ${createProgressBar(100, percent)}`,
          );
        }
      } else {
        console.log(`    ${text.trim()}`);
      }
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      error += text;
      // Filter out non-critical warnings
      if (!text.includes("warning") && !text.includes("Warning")) {
        console.log(`   ⚠ ${text.trim()}`);
      }
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`\n✅ ${label} complete`);
        resolve({ stdout: output, stderr: error });
      } else {
        console.log(`\n❌ ${label} failed with code ${code}`);
        reject(new Error(`${label} failed: ${error}`));
      }
    });

    child.on("error", (err) => {
      console.log(`\n❌ ${label} error:`, err.message);
      reject(err);
    });
  });
}

// Simple command runner for non-interactive commands
async function runCommand(cmd, label) {
  console.log(`🚀 ${label}...`);
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname + "/.." });
    if (stderr && !stderr.includes("warning"))
      console.log(`   ${stderr.trim()}`);
    console.log(`✅ ${label} complete`);
    return stdout;
  } catch (error) {
    console.error(`\n❌ ${label} failed:`, error.message);
    throw error;
  }
}

async function getCurrentVersion() {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(__dirname, "../package.json"), "utf8"),
  );
  return packageJson.version;
}

async function checkGitHubAuth() {
  try {
    await execAsync("gh auth status");
    console.log("✅ GitHub CLI authenticated");
    return true;
  } catch (error) {
    console.log("❌ GitHub CLI not authenticated or error:", error.message);
    console.log("\n💡 Please authenticate:");
    console.log("   1. Run: gh auth login");
    console.log('   2. Select "GitHub.com"');
    console.log('   3. Select "HTTPS" or "SSH"');
    console.log("   4. Follow the prompts");
    return false;
  }
}

async function createGitHubRelease(version, artifactPaths) {
  const tag = `v${version}`;
  const title = `Pedro Pathing Visualizer ${version}`;

  // Try to get changelog if it exists
  let notes = `## 🚀 Quick Update

Refer to the README installation section for instructions on installing or updating Pedro Pathing Visualizer. Below is a condensed version of the instructions for quick reference. 

This repo is regularly updated with new features and bug fixes but tested primarily on macOS. Should an issue arise, please report it via the GitHub Issues page and revert to the previous stable version if needed.

#### **macOS**
Run the following command in terminal and provide your password when prompted:
\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingVisualizer/main/install.sh | bash
\`\`\`

#### **Windows**
Download and install via the  \`.exe\` installer below.

#### **Linux**
Download the \`.deb\`, \`.tar.gz\`, or \`.AppImage\` file. Run in terminal with executable permissions.

## 📝 Release Notes
`;

  try {
    const changelog = await fs.readFile(
      path.join(__dirname, "../CHANGELOG.md"),
      "utf8",
    );
    const versionSection = changelog.match(
      new RegExp(`## ${version}[\\s\\S]*?(?=## |$)`),
    );
    if (versionSection) {
      notes += `\n${versionSection[0].replace(`## ${version}`, "")}`;
    } else {
      notes += `\n- Bug fixes and improvements`;
    }
  } catch (error) {
    notes += `\n- Bug fixes and improvements`;
  }

  console.log(`\n📦 Creating GitHub release ${tag}...`);
  console.log(`📁 Artifacts to upload: ${artifactPaths.length}`);

  // Create a temporary file for the release notes
  const notesFile = path.join(__dirname, `../release-notes-${version}.md`);
  await fs.writeFile(notesFile, notes);

  try {
    // Construct arguments for gh release create
    const args = [
      "release",
      "create",
      tag,
      ...artifactPaths,
      "--title",
      title,
      "--notes-file",
      notesFile,
      "--draft",
      "--target",
      "main",
    ];

    await runCommandStream(
      "gh",
      args,
      "Creating GitHub draft release with artifacts",
    );

    console.log("\n✨ Draft release created!");

    // Clean up notes file
    await fs.unlink(notesFile);
  } catch (error) {
    // Clean up notes file even on error
    try {
      await fs.unlink(notesFile);
    } catch {}

    throw error;
  }
}

async function main() {
  console.log("🚀 Pedro Pathing Visualizer Release Process");
  console.log("==========================================\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question) =>
    new Promise((resolve) => rl.question(question, resolve));

  try {
    // 1. Get current version
    const version = await getCurrentVersion();
    console.log(`📦 Current version: ${version}`);

    // 2. Confirm with user
    const proceed = await ask(`\nCreate release v${version}? (y/N): `);
    if (!proceed.toLowerCase().startsWith("y")) {
      console.log("Release cancelled.");
      rl.close();
      return;
    }

    // 3. Check GitHub auth
    console.log("\n🔐 Checking GitHub authentication...");
    const isAuthenticated = await checkGitHubAuth();
    if (!isAuthenticated) {
      console.log("\n❌ Cannot proceed without GitHub authentication.");
      rl.close();
      return;
    }

    // 4. Build the app
    console.log("\n🔨 Step 1: Building app...");
    console.log("========================");
    await runCommand("npm run build", "Building with Vite");

    // 5. Create Artifacts
    console.log("\n📦 Step 2: Packaging for All Platforms...");
    console.log("========================");
    // Changed from dist:unsigned (mac only) to dist:all (mac, win, linux)
    // Note: This may require specific env setup on the build machine for cross-compilation
    await runCommand(
      "npm run dist:all",
      "Packaging for macOS, Windows, and Linux (x64 & arm64)",
    );

    // 6. Find Artifacts
    console.log("\n🔍 Step 3: Finding Artifacts...");
    console.log("========================");
    const releaseDir = path.join(__dirname, "../release");
    const files = await fs.readdir(releaseDir);

    // Look for dmg, exe, AppImage, deb, tar.gz
    const artifactFiles = files.filter(
      (f) =>
        (f.endsWith(".dmg") ||
          f.endsWith(".exe") ||
          f.endsWith(".AppImage") ||
          f.endsWith(".deb") ||
          f.endsWith(".tar.gz")) &&
        f.includes(version) &&
        !f.includes("blockmap"), // Exclude electron-builder internal files
    );

    // Check for linux x86_64 (amd64) artifacts
    const hasLinuxAmd64 = artifactFiles.some((f) =>
      f.endsWith(".deb")
        ? f.includes("_amd64")
        : f.toLowerCase().includes("amd64") || f.toLowerCase().includes("x64"),
    );

    if (!hasLinuxAmd64) {
      console.log(
        "⚠ No Linux x86_64 (amd64) artifact detected. If you intended to build linux x86_64, run `npm run dist:linux:x64` or update your CI to include `--x64`.",
      );
    }

    if (artifactFiles.length === 0) {
      throw new Error(
        `No artifacts found for version ${version} in release/ folder`,
      );
    }

    const artifactPaths = artifactFiles.map((f) => path.join(releaseDir, f));

    console.log(`✅ Found ${artifactFiles.length} artifacts:`);
    artifactFiles.forEach((f) => console.log(`   - ${f}`));

    // 7. Create git tag
    console.log("\n🏷️  Step 4: Creating git tag...");
    console.log("============================");
    const tagExists = await (async () => {
      try {
        await execAsync(`git rev-parse v${version}`);
        return true;
      } catch {
        return false;
      }
    })();

    if (tagExists) {
      console.log(`⚠ Tag v${version} already exists. Skipping.`);
    } else {
      const createTag = await ask(`Create git tag v${version}? (y/N): `);
      if (createTag.toLowerCase().startsWith("y")) {
        await runCommand(
          `git tag -a v${version} -m "Release ${version}"`,
          "Creating git tag",
        );
        await runCommand(
          `git push origin v${version}`,
          "Pushing tag to GitHub",
        );
      } else {
        console.log("Skipping tag creation.");
      }
    }

    // 8. Create GitHub release
    console.log("\n🚀 Step 5: Creating GitHub release...");
    console.log("====================================");

    const createRelease = await ask(
      `Create GitHub draft release for v${version}? (y/N): `,
    );

    if (createRelease.toLowerCase().startsWith("y")) {
      console.log("\n📤 Uploading artifacts...");
      await createGitHubRelease(version, artifactPaths);

      console.log("\n✅ Release draft created!");
      console.log("\n📋 Next steps:");
      console.log("==============");
      console.log(
        "1. Review the draft: https://github.com/Mallen220/PedroPathingVisualizer/releases",
      );
      console.log("2. Edit release notes if needed");
      console.log('3. Click "Publish release"');
    } else {
      console.log("Skipping GitHub release creation.");
      console.log(`\n📁 Artifacts are ready in: ${releaseDir}`);
    }

    console.log("\n🎉 Release process complete!");
  } catch (error) {
    console.error("\n❌ Release failed:", error.message);
    console.log("\n💡 Debug tips:");
    console.log("1. Check GitHub authentication: gh auth status");
    console.log(
      "2. Ensure cross-compilation dependencies are installed if building for other OSs",
    );
  } finally {
    rl.close();
  }
}

main();
