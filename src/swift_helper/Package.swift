// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "macos_agent",
    platforms: [
        .macOS(.v12),
    ],
    targets: [
        .executableTarget(
            name: "macos_agent",
            path: "Sources/macos_agent"
        ),
    ]
)