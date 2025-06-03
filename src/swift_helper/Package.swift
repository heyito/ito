// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "ito_macos_agent",
    platforms: [
        .macOS(.v12),
    ],
    targets: [
        .executableTarget(
            name: "ito_macos_agent",
            path: "Sources/ito_macos_agent"
        ),
    ]
)