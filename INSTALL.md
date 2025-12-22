# Installation Instructions for macOS

## For Users Without Terminal Experience:

### Method 1: DMG File

1. Download the `.dmg` file
2. Double-click to mount it
3. Drag the app to your Applications folder
4. When you first run it, you'll see a security warning
5. Go to **System Settings** --> **Privacy & Security**
6. Scroll down and click **"Open Anyway"** next to the app name
7. Confirm by clicking **"Open"**

### Method 2: ZIP File

1. Download the `.zip` file
2. Double-click to extract
3. Move the `.app` file to your Applications folder
4. Follow steps 4-7 above

## Troubleshooting:

- If you see "App is damaged and can't be opened":
  - Open Terminal
  - Run: `sudo xattr -rd com.apple.quarantine /Applications/Pedro\ Pathing\ Visualizer.app`
  - Try opening again
