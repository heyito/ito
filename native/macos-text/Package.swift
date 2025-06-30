// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "macos-text",
    platforms: [.macOS(.v11)],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "focused-text-reader",
            dependencies: [],
            linkerSettings: [
                .linkedFramework("ApplicationServices"),
                .linkedFramework("Foundation"),
            ]
        )
    ]
)
