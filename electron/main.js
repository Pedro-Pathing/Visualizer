// Electron support removed. This file has been stubbed out to keep the
// repository web-first and deployable to Vercel. If you need Electron
// behavior again, restore the original implementation from your git
// history or backup.

export default {};

// Handle __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let server;
let serverPort = 34567;
let appUpdater;

/**
 * Try to start the HTTP server on `serverPort`, and if it's already in use
 * try subsequent ports up to `maxAttempts` times. When successful, set the
 * global `server` and `serverPort` to the listening instance/port.
 */
const startServer = async () => {
  const expressApp = express();

  const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Limit to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: "Too many requests from this client, please try again later.",
  });

  let distPath;

  if (app.isPackaged) {
    // In production: files are in app.asar at root
    distPath = path.join(process.resourcesPath, "app.asar", "dist");
  } else {
    // In development
    distPath = path.join(__dirname, "../dist");
  }

  console.log("Serving static files from:", distPath);

  // Serve static files
  expressApp.use(express.static(distPath));

  // SPA fallback
  expressApp.get("*", limiter, (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  // Helper to attempt listening on ports starting at `startPort`.
  const tryListenOnPortRange = (startPort, maxAttempts = 50) => {
    return new Promise((resolve, reject) => {
      let attempt = 0;
      let port = startPort;

      const attemptListen = () => {
        attempt += 1;
        // Create a new server instance for each attempt so errors don't persist
        const candidate = http.createServer(expressApp);

        candidate.once("error", (err) => {
          if (err && err.code === "EADDRINUSE" && attempt < maxAttempts) {
            console.warn(`Port ${port} in use, trying ${port + 1}`);
            port += 1;
            // Give a tiny delay to avoid busy-looping
            setTimeout(attemptListen, 10);
          } else {
            reject(err);
          }
        });

        candidate.once("listening", () => {
          server = candidate;
          serverPort = port;
          console.log(`Local server running on port ${serverPort}`);
          resolve();
        });

        candidate.listen(port);
      };

      attemptListen();
    });
  };

  // Try to listen, allowing fallback ports if needed
  await tryListenOnPortRange(serverPort, 100);
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 800,
    title: "Pedro Pathing Visualizer",
    webPreferences: {
      nodeIntegration: false, // Security: Sandbox the web code
      contextIsolation: true, // Security: Sandbox the web code
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Force clear the cache to ensure we load the latest build
  mainWindow.webContents.session.clearCache();
  mainWindow.webContents.session.clearStorageData();

  appUpdater = new AppUpdater(mainWindow);

  // Load the app from the local server
  mainWindow.loadURL(`http://localhost:${serverPort}`);

  // Handle "Save As" dialog native behavior
  mainWindow.webContents.session.on(
    "will-download",
    (event, item, webContents) => {
      // item.setSavePathDialog(true);
      item.on("updated", (event, state) => {
        if (state === "interrupted") {
          console.log("Download is interrupted but can be resumed");
        }
      });
    },
  );

  mainWindow.on("closed", () => {
    mainWindow = null;
    app.quit();
  });
};

app.on("ready", async () => {
  await startServer();
  createWindow();

  // Check for updates after a short delay to ensure window is ready
  setTimeout(() => {
    if (appUpdater) {
      appUpdater.checkForUpdates();
    }
  }, 3000);
});

// CRITICAL: Satisfies "when the project closes it should auto close"
app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  if (server) {
    server.close();
  }
});

// Add these functions at the top, after the imports
const getDirectorySettingsPath = () => {
  return path.join(app.getPath("userData"), "directory-settings.json");
};

const loadDirectorySettings = async () => {
  const settingsPath = getDirectorySettingsPath();
  try {
    const data = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // Return default settings if file doesn't exist
    return { autoPathsDirectory: "" };
  }
};

const saveDirectorySettings = async (settings) => {
  const settingsPath = getDirectorySettingsPath();
  try {
    await fs.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2),
      "utf-8",
    );
    return true;
  } catch (error) {
    console.error("Error saving directory settings:", error);
    return false;
  }
};

// Update the existing ipcMain.handle for "file:get-directory"
ipcMain.handle("file:get-directory", async () => {
  // Load saved directory settings
  const settings = await loadDirectorySettings();

  // If we have a saved directory, use it
  if (
    settings.autoPathsDirectory &&
    settings.autoPathsDirectory.trim() !== ""
  ) {
    try {
      await fs.access(settings.autoPathsDirectory);
      return settings.autoPathsDirectory;
    } catch (error) {
      console.log(
        "Saved directory no longer accessible, falling back to default",
      );
    }
  }

  // Fallback to default directory
  const defaultDir = path.join(
    process.env.HOME,
    "Documents",
    "GitHub",
    "BBots2025-26",
    "TeamCode",
    "src",
    "main",
    "assets",
    "AutoPaths",
  );

  try {
    await fs.access(defaultDir);
    return defaultDir;
  } catch {
    // Create directory if it doesn't exist
    await fs.mkdir(defaultDir, { recursive: true });
    return defaultDir;
  }
});

// Update the existing ipcMain.handle for "file:set-directory"
ipcMain.handle("file:set-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select AutoPaths Directory",
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedDir = result.filePaths[0];

    // Save the directory to settings
    const settings = await loadDirectorySettings();
    settings.autoPathsDirectory = selectedDir;
    await saveDirectorySettings(settings);

    return selectedDir;
  }
  return null;
});

// Add new IPC handlers for directory settings
ipcMain.handle("directory:get-settings", async () => {
  return await loadDirectorySettings();
});

ipcMain.handle("directory:save-settings", async (event, settings) => {
  return await saveDirectorySettings(settings);
});

// Add a handler to get the saved directory directly
ipcMain.handle("directory:get-saved-directory", async () => {
  const settings = await loadDirectorySettings();
  return settings.autoPathsDirectory || "";
});

// Add to existing IPC handlers
ipcMain.handle("file:create-directory", async (event, dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error("Error creating directory:", error);
    throw error;
  }
});

ipcMain.handle("file:get-directory-stats", async (event, dirPath) => {
  try {
    const files = await fs.readdir(dirPath);
    const ppFiles = files.filter((file) => file.endsWith(".pp"));

    let totalSize = 0;
    let latestModified = new Date(0);

    for (const file of ppFiles) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
      if (stats.mtime > latestModified) {
        latestModified = stats.mtime;
      }
    }

    return {
      totalFiles: ppFiles.length,
      totalSize,
      lastModified: latestModified,
    };
  } catch (error) {
    console.error("Error getting directory stats:", error);
    return {
      totalFiles: 0,
      totalSize: 0,
      lastModified: new Date(),
    };
  }
});

ipcMain.handle("app:get-app-data-path", () => {
  return app.getPath("userData");
});

// Add to existing IPC handlers
ipcMain.handle("file:rename", async (event, oldPath, newPath) => {
  try {
    // Check if new path already exists
    const exists = await fs
      .access(newPath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      throw new Error(`File "${path.basename(newPath)}" already exists`);
    }

    await fs.rename(oldPath, newPath);
    return { success: true, newPath };
  } catch (error) {
    console.error("Error renaming file:", error);
    throw error;
  }
});

ipcMain.handle("file:list", async (event, directory) => {
  try {
    const files = await fs.readdir(directory);
    const ppFiles = files.filter((file) => file.endsWith(".pp"));

    const fileDetails = await Promise.all(
      ppFiles.map(async (file) => {
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
        };
      }),
    );

    return fileDetails;
  } catch (error) {
    console.error("Error reading directory:", error);
    return [];
  }
});

ipcMain.handle("file:read", async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    console.error("Error reading file:", error);
    throw error;
  }
});

ipcMain.handle("file:write", async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, "utf-8");
    return true;
  } catch (error) {
    console.error("Error writing file:", error);
    throw error;
  }
});

// Save dialog (returns file path or null if cancelled)
ipcMain.handle("file:show-save-dialog", async (event, options) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, options || {});
    if (result.canceled) return null;
    return result.filePath;
  } catch (error) {
    console.error("Error showing save dialog:", error);
    throw error;
  }
});

// Write base64-encoded content to disk (binary)
ipcMain.handle("file:write-base64", async (event, filePath, base64Content) => {
  try {
    const buffer = Buffer.from(base64Content, "base64");
    await fs.writeFile(filePath, buffer);
    return true;
  } catch (error) {
    console.error("Error writing base64 file:", error);
    throw error;
  }
});

ipcMain.handle("file:delete", async (event, filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error("Error deleting file:", error);
    throw error;
  }
});

ipcMain.handle("file:exists", async (event, filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});
