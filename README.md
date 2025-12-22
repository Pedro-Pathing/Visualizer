# Pedro Pathing Visualizer

A powerful, intuitive desktop application for visualizing and planning autonomous robot paths for FIRST Robotics Competition. Built with Electron and Svelte, this tool provides a modern alternative to traditional path planning software.

This repo is designed and maintained primarily on MacOS. While Windows and Linux executables are created (as this is an Electron app), they may become unexpectedly unstable. Please report platform issues as they are discovered. The best temporary fix is to revert to a previous version.

![Version](https://img.shields.io/badge/version-1.2.2-blue.svg)
![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20|%20Windows%20|%20Linux-lightgrey.svg)

> ### This project is currently undergoing rapid updates. Please check back regularly for bug fixes and new features.

## ✨ Features

- **Visual Path Editing**: Intuitive drag-and-drop interface for creating bezier curves, straight lines, and complex paths with snap-to-grid precision
- **Robot Simulation**: Timeline-based animation of robot movement along paths with accurate kinematics and velocity/acceleration settings
- **Sequence-Based Routines**: Create complex autonomous sequences with integrated wait times between path segments
- **Obstacle Management**: Add and edit field obstacles with custom shapes, colors, and collision awareness
- **Multiple Heading Modes**: Constant, linear, and tangential heading interpolation
- **Event Markers**: Place event triggers at specific positions along paths for autonomous routines
- **Cross-Platform**: Native applications for macOS, Windows, and Linux with auto-update support
- **Code Export**: Generate ready-to-use Java code for Pedro Pathing library, including sequential commands for FTC SDK
- **Integrated File Management**: Built-in file browser with save/load, duplicate, mirror, rename, and directory statistics
- **Measurement Tools**: Built-in ruler, protractor, and adjustable grid (12", 24", 36", 48", 6" options)
- **Customizable Appearance**: Choose between light and dark themes, and customize colors for paths and obstacles
- **Field and Robot Customization**: Upload custom field maps and robot images for accurate visualization
- **Locking Functionality**: Prevent accidental modification of critical path segments and starting points
- **Persistent Settings**: All configurations are saved between sessions and can be reset to defaults
- **And so much more!**

## 📦 Installation Options

### **macOS**

**Recommended (One-line Installer):**

```bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingVisualizer/main/install.sh | bash
```

Enter your password when prompted to complete installation.

**Manual Installation:**

1. Download the latest `.dmg` file from [Releases](https://github.com/Mallen220/PedroPathingVisualizer/releases)
2. Double-click to mount the DMG
3. Drag "Pedro Pathing Visualizer.app" to your Applications folder
4. On first run: Right-click → Open, then click "Open" when prompted

### **Windows**

1. Download the `.exe` installer from [Releases](https://github.com/Mallen220/PedroPathingVisualizer/releases)
2. Run the installer and follow the installation wizard
3. Launch from Start Menu or desktop shortcut

### **Linux (Ubuntu/Debian) — x86_64 (amd64) & arm64**

Download either `.deb` (for Debian/Ubuntu) or `.AppImage` for other distros. For x86_64 machines choose the `_amd64.deb` or the standard `.AppImage`; arm64 builds include `arm64` in the filename.

**Using .deb package:**

```bash
sudo dpkg -i Pedro*.deb
```

**Using AppImage:**

```bash
chmod +x Pedro*.AppImage
./Pedro*.AppImage
```

## 🎯 Getting Started

1. **Launch the Application**: Open Pedro Pathing Visualizer from your applications menu
2. **Configure Settings**: Set up your robot dimensions, field map, and preferences in the Settings dialog
3. **Create a Path**: Click "Add Line" to start creating your autonomous path, or use the sequence editor for complex routines
4. **Adjust Points**: Drag start points, end points, and control points to shape your path (enable snap-to-grid for precision)
5. **Set Headings**: Configure robot heading for each segment (constant, linear, or tangential)
6. **Add Obstacles**: Define field obstacles with custom shapes and colors
7. **Create Sequences**: Build complex autonomous routines with paths and timed waits
8. **Simulate**: Use the animation controller to see your robot follow the path with accurate timing
9. **Export**: Generate Java code for use with Pedro Pathing library

## 🛠️ Tool Overview

### Canvas Tools

- **Grid**: Toggle measurement grid with adjustable spacing (6", 12", 24", 36", 48")
- **Snap-to-Grid**: Align points and obstacles to grid for precise placement
- **Ruler**: Measure distances between points on the field
- **Protractor**: Measure angles with lock-to-robot functionality

### Path Editing

- **Multiple Path Segments**: Create complex paths with multiple connected segments
- **Control Points**: Add bezier control points for smooth curves
- **Lock Segments**: Prevent accidental modification of critical path segments
- **Sequence Editor**: Create complex autonomous routines with paths and wait times
- **Event Markers**: Place named events at specific positions for autonomous routines
- **Obstacle System**: Define custom polygons as field obstacles with collision awareness

### Animation & Simulation

- **Timeline Controller**: Play, pause, and scrub through path execution
- **Time Prediction**: Accurate path timing based on robot kinematics
- **Velocity/Acceleration Settings**: Configure robot motion constraints for realistic simulation

### Export Options

- **Java Code**: Full Pedro Pathing library integration code
- **Sequential Commands**: FTC SDK SequentialCommandGroup code with event markers
- **Points Array**: Raw coordinate arrays for custom implementations

## 🔧 Troubleshooting

### macOS

- **"App is damaged and can't be opened"**:

  ```bash
  sudo xattr -rd com.apple.quarantine "/Applications/Pedro Pathing Visualizer.app"
  ```

- **Gatekeeper Blocking**:
  - Go to System Settings → Privacy & Security
  - Scroll down and click "Open Anyway" next to the app

### Windows

- **SmartScreen Warning**: Click "More info" then "Run anyway" for first launch
- **Antivirus False Positive**: Add exception for the application in your antivirus software

### Linux

- **AppImage Permissions**:
  ```bash
  chmod +x *.AppImage
  ```
- **Missing Dependencies**: Ensure libfuse2 is installed for AppImage support

## 🗂️ File Management

The application includes a built-in file manager for organizing your path files (.pp extension):

- **Auto-save Directory**: Defaults to your Pedro Pathing project directory
- **Duplicate Files**: Create copies of existing paths
- **Mirror Paths**: Automatically create horizontally mirrored versions of paths
- **File Organization**: Browse, create, rename, and delete .pp files directly within the app
- **Directory Statistics**: View file counts and sizes at a glance

## 📝 Keyboard Shortcuts

| Shortcut               | Action                   |
| ---------------------- | ------------------------ |
| `Double Click`         | Create new path to point |
| `Cmd/Ctrl + S`         | Save current project     |
| `Cmd/Ctrl + Shift + S` | Save As                  |
| `Space`                | Play/Pause animation     |
| `W`                    | Add new line             |
| `A`                    | Add control point        |
| `S`                    | Remove control point     |
| `Escape`               | Close dialogs            |
| `Cmd/Ctrl + Z`         | Undo                     |
| `Cmd/Ctrl + Shift + Z` | Redo                     |

## 🏗️ Project Structure

```
mallen220-pedropathingvisualizer/
├── electron/           # Electron main process
├── src/               # Svelte frontend
│   ├── lib/          # Reusable components and stores
│   ├── utils/        # Utility functions and classes
│   ├── config/       # Application configurations and defaults
│   └── types/        # TypeScript type definitions
├── public/           # Static assets
├── scripts/          # Build, release, and development scripts
└── .github/         # GitHub Actions workflows
```

## 🧩 Development

### Prerequisites

- Node.js 18+ and npm
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/Mallen220/PedroPathingVisualizer.git
cd PedroPathingVisualizer

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building

```bash
# Build for current platform
npm run dist

# Build all platforms (requires cross-compilation setup)
npm run dist:all

# Build linux x86_64 (amd64) specifically on a mac or CI environment
npm run dist:linux:x64
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style and structure
- Use Prettier for code formatting (configured to run on build)
- Add appropriate TypeScript types
- Test changes on multiple platforms if possible
- Update documentation as needed

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **#16166 Watt's Up** for initial development and inspiration
- **FIRST** community for testing and feedback
- **Pedro Pathing Developers** for the project this is based on
- All contributors who have helped improve the tool

## 🔗 Links

- [GitHub Repository](https://github.com/Mallen220/PedroPathingVisualizer)
- [Releases](https://github.com/Mallen220/PedroPathingVisualizer/releases)
- [Issues](https://github.com/Mallen220/PedroPathingVisualizer/issues)

---

**Note**: This is a community-developed tool not officially affiliated with FIRST or Pedro Pathing. Always test autonomous routines in simulation before running on a physical robot.
