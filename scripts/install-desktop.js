const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

try {
  const homeDir = os.homedir();
  const projectDir = process.cwd();

  // Resolve binary paths
  const electronDistBinary = path.join(
    projectDir,
    "node_modules",
    "electron",
    "dist",
    "electron",
  );
  const electronCli = path.join(
    projectDir,
    "node_modules",
    "electron",
    "cli.js",
  );
  const nodeBinary = process.execPath;

  // Use direct electron executable if available, otherwise node cli
  const execCommand = fs.existsSync(electronDistBinary)
    ? `${electronDistBinary} ${projectDir}`
    : `${nodeBinary} ${electronCli} ${projectDir}`;

  const iconSource = path.join(projectDir, "src", "renderer", "icon.png");

  // 1. Copy icon to standard system icon locations
  const iconTargets = [
    path.join(homeDir, ".local", "share", "icons", "hicolor", "512x512", "apps", "track-it.png"),
    path.join(homeDir, ".local", "share", "icons", "hicolor", "256x256", "apps", "track-it.png"),
    path.join(homeDir, ".local", "share", "icons", "hicolor", "128x128", "apps", "track-it.png"),
    path.join(homeDir, ".local", "share", "icons", "hicolor", "64x64", "apps", "track-it.png"),
    path.join(homeDir, ".local", "share", "icons", "hicolor", "48x48", "apps", "track-it.png"),
    path.join(homeDir, ".local", "share", "icons", "hicolor", "scalable", "apps", "track-it.png"),
    path.join(homeDir, ".local", "share", "pixmaps", "track-it.png"),
  ];

  for (const target of iconTargets) {
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.copyFileSync(iconSource, target);
  }

  // 2. Generate desktop entry
  const destDir = path.join(homeDir, ".local", "share", "applications");
  const destFile = path.join(destDir, "track-it.desktop");

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const desktopEntry = `[Desktop Entry]
Name=TRACK IT
GenericName=Time & Task Progress Tracker
Comment=Time & Task Progress Tracker integrates with GNOME Calendar
Exec=${execCommand}
Path=${projectDir}
Icon=${iconSource}
Terminal=false
Type=Application
Categories=Utility;ProjectManagement;Office;
StartupWMClass=track-it
StartupNotify=false
Actions=NewTask;

[Desktop Action NewTask]
Name=New Task
Exec=${execCommand}
`;

  fs.writeFileSync(destFile, desktopEntry, "utf8");
  fs.chmodSync(destFile, "755");

  // 3. Clear GNOME thumbnail & icon caches to force immediate refresh
  try {
    const thumbDir = path.join(homeDir, ".cache", "thumbnails");
    if (fs.existsSync(thumbDir)) {
      execSync(`rm -rf "${thumbDir}"/*`, { stdio: "ignore" });
    }
  } catch (e) {}

  try {
    execSync(`gtk-update-icon-cache -f -t "${path.join(homeDir, ".local", "share", "icons", "hicolor")}"`, { stdio: "ignore" });
  } catch (e) {}

  try {
    execSync(`update-desktop-database "${destDir}"`, { stdio: "ignore" });
  } catch (e) {}

  console.log("\n==================================================");
  console.log("🎉 Desktop launcher and dock icon registered!");
  console.log(`Shortcut: ${destFile}`);
  console.log("Icon installed to system icon theme (track-it)");
  console.log("StartupWMClass configured to 'track-it' (Instant window association)");
  console.log("==================================================\n");
} catch (error) {
  console.error("Failed to register desktop shortcut:", error.message);
  process.exit(1);
}
