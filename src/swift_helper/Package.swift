// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "inten_macos_agent",
    platforms: [
        .macOS(.v12),
    ],
    targets: [
        .executableTarget(
            name: "inten_macos_agent",
            path: "Sources/inten_macos_agent"
        ),
    ]
)