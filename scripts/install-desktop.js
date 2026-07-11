const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

try {
  const homeDir = os.homedir();
  const projectDir = process.cwd();
  
  // Resolve paths
  const nodeBinary = process.execPath;
  const electronCli = path.join(projectDir, 'node_modules', 'electron', 'cli.js');
  const iconPath = path.join(projectDir, 'src', 'renderer', 'icon.png');
  const destDir = path.join(homeDir, '.local', 'share', 'applications');
  const destFile = path.join(destDir, 'progress-tracker.desktop');

  if (!fs.existsSync(electronCli)) {
    console.error('Error: Electron dependency not found. Please run "npm install" first.');
    process.exit(1);
  }

  // Ensure target applications directory exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Generate desktop entry content
  const desktopEntry = `[Desktop Entry]
Name=Progress Tracker
Comment=Time & Task Progress Tracker with GNOME Calendar integration
Exec=${nodeBinary} ${electronCli} ${projectDir}
Path=${projectDir}
Icon=${iconPath}
Terminal=false
Type=Application
Categories=Utility;Education;ProjectManagement;
StartupWMClass=progress-tracker
StartupNotify=true
`;

  fs.writeFileSync(destFile, desktopEntry, 'utf8');
  fs.chmodSync(destFile, '755');

  // Update desktop database if possible
  try {
    execSync(`update-desktop-database ${destDir}`, { stdio: 'ignore' });
  } catch (e) {
    // Ignore database update failures if utility is absent
  }

  console.log('\n==================================================');
  console.log('🎉 Desktop shortcut registered successfully!');
  console.log(`Location: ${destFile}`);
  console.log('\nInstructions to pin:');
  console.log('1. Press Super/Win key to open GNOME Activities.');
  console.log('2. Search for "Progress Tracker".');
  console.log('3. Right-click the app icon and select "Add to Favorites".');
  console.log('==================================================\n');
} catch (error) {
  console.error('Failed to create desktop shortcut:', error.message);
  process.exit(1);
}
