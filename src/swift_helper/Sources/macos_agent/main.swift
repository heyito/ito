import Foundation
import Cocoa
import ApplicationServices
import Vision

// --- Constants ---

let kAXLinkRole = "AXLink"
let kAXStatusBarRole = "AXStatusBar"

let interestingRoles: Set<String> = [
    kAXButtonRole,
    kAXTextFieldRole,
    kAXMenuItemRole,
    kAXStaticTextRole,
    kAXImageRole,
    kAXTextAreaRole,
    kAXCheckBoxRole,
    kAXRadioButtonRole,
    kAXGroupRole,            // Containers with tooltip/description
    kAXLinkRole,             // Clickable hyperlinks
    kAXToolbarRole,          // May contain controls
    kAXStatusBarRole,        // Sometimes has descriptive text
    kAXDisclosureTriangleRole // Often unlabeled but clickable
]

let specialContextRoles: Set<String> = [
    kAXSheetRole,
    kAXPopoverRole
]

let kAXVisibleAttribute = "AXVisible"
let kAXFrameAttribute = "AXFrame"
let kAXPositionAttribute = "AXPosition"
let kAXSizeAttribute = "AXSize"
let kAXHelpAttribute = "AXHelp"
let kAXDescriptionAttribute = "AXDescription"
let kAXIdentifierAttribute = "AXIdentifier"
let kAXPlaceholderValueAttribute = "AXPlaceholderValue"

// --- Helpers ---

func saveScreenshot(image: CGImage, filename: String = "capture-inten.png") {
    let bitmapRep = NSBitmapImageRep(cgImage: image)
    guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
        print("Failed to create PNG data")
        return
    }
    let url = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(filename)
    do {
        try pngData.write(to: url)
    } catch {
        print("❌ Failed to save screenshot: \(error)")
    }
}

func getLabels(for element: AXUIElement) -> [String: String] {
    let attributes = [
        ("title", kAXTitleAttribute),
        ("value", kAXValueAttribute),
        ("label", kAXLabelValueAttribute),
        ("help", kAXHelpAttribute),
        ("description", kAXDescriptionAttribute),
        ("identifier", kAXIdentifierAttribute),
        ("placeholder", kAXPlaceholderValueAttribute)
    ]

    var result: [String: String] = [:]

    for (key, attr) in attributes {
        var value: AnyObject?
        if AXUIElementCopyAttributeValue(element, attr as CFString, &value) == .success,
           let str = value as? String, !str.isEmpty {
            result[key] = str
        }
    }

    return result
}

func getFrame(for element: AXUIElement) -> [String: Int]? {
    var frameValue: AnyObject?
    if AXUIElementCopyAttributeValue(element, kAXFrameAttribute as CFString, &frameValue) == .success,
       let frameValue = frameValue, CFGetTypeID(frameValue) == AXValueGetTypeID() {
        
        let axValue = frameValue as! AXValue
        var frame = CGRect.zero
        AXValueGetValue(axValue, .cgRect, &frame)
        
        return [
            "x": Int(frame.origin.x),
            "y": Int(frame.origin.y),
            "width": Int(frame.size.width),
            "height": Int(frame.size.height),
            "center_x": Int(frame.origin.x + frame.size.width / 2),
            "center_y": Int(frame.origin.y + frame.size.height / 2)
        ]
    }
    return nil
}

func walkChildren(element: AXUIElement, output: inout [[String: Any]], depth: Int = 0, maxDepth: Int = 3) {
    if depth > maxDepth { return }

    var children: AnyObject?
    if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &children) != .success {
        return
    }

    guard let childElements = children as? [AXUIElement] else { return }

    for child in childElements {
        var roleObj: AnyObject?
        if AXUIElementCopyAttributeValue(child, kAXRoleAttribute as CFString, &roleObj) != .success {
            continue
        }
        guard let role = roleObj as? String else { continue }

        var visibleObj: AnyObject?
        if AXUIElementCopyAttributeValue(child, kAXVisibleAttribute as CFString, &visibleObj) == .success,
           let visible = visibleObj as? Bool, !visible {
            continue
        }

        if interestingRoles.contains(role) {
            output.append([
                "role": role.replacingOccurrences(of: "AX", with: ""),
                "labels": getLabels(for: child),
                "frame": getFrame(for: child) ?? [:]
            ])
        }

        let nextMaxDepth = specialContextRoles.contains(role) ? (maxDepth + 2) : maxDepth
        walkChildren(element: child, output: &output, depth: depth + 1, maxDepth: nextMaxDepth)
    }
}

func captureOCRText(focusedWindow: AXUIElement) -> [[String: Any]] {
    var result: [[String: Any]] = []

    var positionValue: AnyObject?
    var sizeValue: AnyObject?

    AXUIElementCopyAttributeValue(focusedWindow, kAXPositionAttribute as CFString, &positionValue)
    AXUIElementCopyAttributeValue(focusedWindow, kAXSizeAttribute as CFString, &sizeValue)

    guard let positionValue = positionValue, let sizeValue = sizeValue else {
        print("Failed to get window position or size")
        return result
    }

    let pos = positionValue as! AXValue
    let sz = sizeValue as! AXValue

    var windowOrigin = CGPoint.zero
    var windowSize = CGSize.zero
    AXValueGetValue(pos, .cgPoint, &windowOrigin)
    AXValueGetValue(sz, .cgSize, &windowSize)

    let windowRect = CGRect(origin: windowOrigin, size: windowSize)

    // Capture just the window image, not the full screen
    guard let windowImage = CGWindowListCreateImage(
        windowRect, // Rect is in points
        [.optionOnScreenOnly],
        kCGNullWindowID,
        [.bestResolution, .boundsIgnoreFraming] // Image result is in pixels
    ) else {
        print("Failed to capture window image")
        return [] // Return empty array on failure
    }

    // Determine the scale factor
    // Find the screen containing the window's top-left corner
    let mainScreenScale = NSScreen.main?.backingScaleFactor ?? 1.0 // Fallback
    var windowScreenScale = mainScreenScale
    for screen in NSScreen.screens {
        if screen.frame.contains(windowRect.origin) { // screen.frame is also in points
            windowScreenScale = screen.backingScaleFactor
            break
        }
    }
    // Note: A window could span multiple screens with different scales.
    // Using the scale of the screen containing the origin is a reasonable heuristic.

    let requestHandler = VNImageRequestHandler(cgImage: windowImage, options: [:])
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    do {
        try requestHandler.perform([request])
    } catch {
        print("OCR failed: \(error)")
        return result
    }

    guard let observations = request.results else {
        return result
    }

    let windowImageWidth = CGFloat(windowImage.width)
    let windowImageHeight = CGFloat(windowImage.height)

    for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let text = candidate.string
        let boundingBox = observation.boundingBox // Normalized, bottom-left origin

        // Calculate dimensions in PIXELS relative to the image
        let localX_pixels = boundingBox.minX * windowImageWidth
        let localY_pixels = (1 - boundingBox.maxY) * windowImageHeight // Top-left origin now
        let localWidth_pixels = boundingBox.width * windowImageWidth
        let localHeight_pixels = boundingBox.height * windowImageHeight

        // Convert PIXEL offsets within the image to POINT offsets
        let localX_points = localX_pixels / windowScreenScale
        let localY_points = localY_pixels / windowScreenScale
        let localWidth_points = localWidth_pixels / windowScreenScale
        let localHeight_points = localHeight_pixels / windowScreenScale

        // Add POINT offsets to the window's POINT origin to get global POINT coordinates
        let globalX = Int(windowOrigin.x + localX_points)
        let globalY = Int(windowOrigin.y + localY_points)

        result.append([
            "text": text,
            "bounds": [
                "x": globalX,
                "y": globalY,
                "width": Int(localWidth_points),
                "height": Int(localHeight_points)
            ]
        ])
    }

    return result
}

func findBestMatches(ocrTexts: [[String: Any]], elements: [[String: Any]]) -> [[String: Any]] {
    var mappings: [[String: Any]] = []

    for ocr in ocrTexts {
        guard let bounds = ocr["bounds"] as? [String: Int],
              let text = ocr["text"] as? String else { continue }

        let ocrCenterX = bounds["x", default: 0] + bounds["width", default: 0] / 2
        let ocrCenterY = bounds["y", default: 0] + bounds["height", default: 0] / 2

        var bestDistance = Double.greatestFiniteMagnitude
        var bestElement: [String: Any]? = nil

        for elem in elements {
            guard let frame = elem["frame"] as? [String: Int] else { continue }

            let elemCenterX = frame["x", default: 0] + frame["width", default: 0] / 2
            let elemCenterY = frame["y", default: 0] + frame["height", default: 0] / 2

            let dx = Double(ocrCenterX - elemCenterX)
            let dy = Double(ocrCenterY - elemCenterY)
            let distance = sqrt(dx * dx + dy * dy)

            if distance < bestDistance {
                bestDistance = distance
                bestElement = elem
            }
        }

        if let best = bestElement {
            mappings.append([
                "ocr_text": text,
                "matched_element": best,
                "distance": bestDistance
            ])
        }
    }

    return mappings
}

// --- Main Program ---

let arguments = CommandLine.arguments

guard arguments.count >= 2 else {
    print("Error: missing command")
    exit(1)
}

let command = arguments[1]

if command == "get-window-info" {
    if let app = NSWorkspace.shared.frontmostApplication {
        let appName = app.localizedName ?? "Unknown App"
        let pid = app.processIdentifier
        let appElement = AXUIElementCreateApplication(pid)

        var focusedWindowRef: AnyObject?
        let result = AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &focusedWindowRef)

        guard result == .success, let focusedWindow = focusedWindowRef else {
            print("Failed to get focused window")
            exit(1)
        }

        let axWindow = focusedWindow as! AXUIElement

        var windowTitleObj: AnyObject?
        var windowTitle = "Unknown Window"

        if AXUIElementCopyAttributeValue(axWindow, kAXTitleAttribute as CFString, &windowTitleObj) == .success,
           let titleString = windowTitleObj as? String {
            windowTitle = titleString
        }

        var elements: [[String: Any]] = []
        walkChildren(element: axWindow, output: &elements)
        let ocrResults = captureOCRText(focusedWindow: axWindow)
        let ocrMappings = findBestMatches(ocrTexts: ocrResults, elements: elements)

        let dict: [String: Any] = [
            "application": appName,
            "window": windowTitle,
            "accessibility_elements": elements,
            "ocr_texts": ocrResults,
            "ocr_to_element_mappings": ocrMappings,
            "screen_dimensions": [
                "width": Int(NSScreen.main?.frame.width ?? 0),
                "height": Int(NSScreen.main?.frame.height ?? 0)
            ]
        ]

        if let jsonData = try? JSONSerialization.data(withJSONObject: dict, options: [.prettyPrinted]),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
    }
} else {
    print("Unknown command or wrong arguments.")
}