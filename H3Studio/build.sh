#!/bin/zsh
set -euo pipefail
project_dir="${0:A:h}"
app_dir="${1:-$project_dir/../build/H3 Studio.app}"
mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources"
cp "$project_dir"/Resources/* "$app_dir/Contents/Resources/"
swiftc -target "$(uname -m)-apple-macos13.0" -parse-as-library -swift-version 5 -O -framework AppKit -framework WebKit -framework UniformTypeIdentifiers "$project_dir/Sources/RemoteImage.swift" "$project_dir/Sources/App.swift" -o "$app_dir/Contents/MacOS/H3Studio"
cat > "$app_dir/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>H3Studio</string>
<key>CFBundleIdentifier</key><string>com.nellertcai.h3studio</string>
<key>CFBundleName</key><string>H3 Studio</string>
<key>CFBundleDisplayName</key><string>H3 Studio</string>
<key>CFBundleVersion</key><string>10</string>
<key>CFBundleShortVersionString</key><string>1.5.3</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
codesign --force --deep --sign - "$app_dir"
