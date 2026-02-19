// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SlopMiles",
    platforms: [.iOS(.v18)],
    dependencies: [
        .package(url: "https://github.com/mb1337/vdot-calc-swift", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "SlopMiles",
            dependencies: [
                .product(name: "VDotCalculator", package: "vdot-calc-swift"),
            ],
            path: "SlopMiles"
        ),
        .testTarget(
            name: "SlopMilesTests",
            dependencies: ["SlopMiles"],
            path: "SlopMilesTests"
        ),
    ]
)
