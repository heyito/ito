import Foundation
import Cocoa
import ApplicationServices
import Vision

/**
TODO:
Potential trimming on context: 
- Trim the is_selected, is_focus, is_enabled if they are false in accessibility_elements. Prompt that if they are there, they are true
 Otherwise, they are false
- Consider providing just one of the pairs of x, center_x, y, center_y
**/

// --- Constants ---

let kAXLinkRole = "AXLink"
let kAXStatusBarRole = "AXStatusBar"
let kAXWebAreaRole = "AXWebArea"
      
let interestingRoles: Set<String> = [
    kAXButtonRole,
    kAXTextFieldRole,
    kAXTextAreaRole,
    kAXStaticTextRole,
    kAXImageRole,
    kAXCheckBoxRole,
    kAXRadioButtonRole,
    kAXPopUpButtonRole,        // Often used for dropdowns
    kAXMenuButtonRole,         // Similar to popups
    kAXMenuItemRole,
    kAXLinkRole,
    kAXGroupRole,              // General container, often has a title/desc
    kAXToolbarRole,
    kAXScrollAreaRole,         // Important for scrollable content
    kAXWebAreaRole,            // CRITICAL for Electron/web-based UI content
    kAXListRole,
    kAXTableRole,
    kAXOutlineRole,
    kAXTabGroupRole,
    kAXSplitGroupRole,
    kAXDisclosureTriangleRole,
    kAXValueIndicatorRole,     // e.g., sliders, progress bars
    kAXIncrementorRole,        // Stepper controls
    // kAXWindowRole (if you want to list sub-windows/dialogs explicitly)
    // kAXSheetRole, kAXDrawerRole, kAXPopoverRole (if you want to detail these)
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
let kAXFocusedAttribute = "AXFocused"
let kAXSelectedAttribute = "AXSelected" 
let kAXValueAttribute = "AXValue"       

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

func walkChildren(element: AXUIElement, output: inout [[String: Any]], depth: Int = 0, maxDepth: Int = 1000) {
    if depth > maxDepth { return }

    var children: AnyObject?
    if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &children) != .success {
        return
    }

    guard let childElements = children as? [AXUIElement] else { return }

    for child in childElements {
        var roleObj: AnyObject?
        guard AXUIElementCopyAttributeValue(child, kAXRoleAttribute as CFString, &roleObj) == .success,
              let role = roleObj as? String else {
            continue
        }
        
        var visibleObj: AnyObject?
        var isActuallyVisible = true
        if AXUIElementCopyAttributeValue(child, kAXVisibleAttribute as CFString, &visibleObj) == .success {
            if let visible = visibleObj as? Bool, !visible {
                isActuallyVisible = false
            }
        }
        if !isActuallyVisible {
            continue
        }
        
        if interestingRoles.contains(role) {
            var elementInfo: [String: Any] = [
                "role": role.replacingOccurrences(of: "AX", with: ""),
                "frame": getFrame(for: child) ?? [:]
            ]

            let labels = getLabels(for: child)
            if !labels.isEmpty {
                elementInfo["labels"] = labels
            }

            var axEnabled: AnyObject?
            var isEnabled = true 
            if AXUIElementCopyAttributeValue(child, kAXEnabledAttribute as CFString, &axEnabled) == .success {
                if let enabledBool = axEnabled as? Bool {
                    isEnabled = enabledBool
                }
                // If axEnabled is not a Bool, isEnabled remains true (or handle as error if needed)
            }
            elementInfo["is_enabled"] = isEnabled

            // is_focused: Default to false
            var axFocused: AnyObject?
            var isFocused = false
            if AXUIElementCopyAttributeValue(child, kAXFocusedAttribute as CFString, &axFocused) == .success {
                if let focusedBool = axFocused as? Bool {
                    isFocused = focusedBool
                }
            }
            elementInfo["is_focused"] = isFocused

            // is_selected: Default to false
            var axSelected: AnyObject?
            var isSelected = false
            if AXUIElementCopyAttributeValue(child, kAXSelectedAttribute as CFString, &axSelected) == .success {
                if let selectedBool = axSelected as? Bool {
                    isSelected = selectedBool
                }
            }
            elementInfo["is_selected"] = isSelected

            var axValue: AnyObject?
            if AXUIElementCopyAttributeValue(child, kAXValueAttribute as CFString, &axValue) == .success {
                if let strValue = axValue as? String {
                    elementInfo["current_value"] = strValue
                } else if let numValue = axValue as? NSNumber {
                    elementInfo["current_value"] = numValue // Store as original NSNumber (can be Int, Float, Bool)
                    // Derive is_checked for relevant roles if value is a number (often 0 or 1)
                    if role == kAXCheckBoxRole || role == kAXRadioButtonRole {
                        elementInfo["is_checked"] = numValue.boolValue // NSNumber.boolValue is (value != 0)
                    }
                } else if let boolValue = axValue as? Bool { // kAXValue can sometimes directly be a Bool
                     elementInfo["current_value"] = boolValue
                     if role == kAXCheckBoxRole || role == kAXRadioButtonRole { // Or other toggle-like roles
                        elementInfo["is_checked"] = boolValue
                    }
                }
                // Note: kAXValueAttribute can also be other AXValue types (e.g., for ranges, dates).
                // For simplicity, we're primarily capturing String, NSNumber, and Bool here.
                // If you need to handle other types from kAXValueAttribute, you'd add more checks.
            }

            // Ensure 'is_checked' defaults to false for relevant roles if not set by kAXValueAttribute
            if (role == kAXCheckBoxRole || role == kAXRadioButtonRole) && elementInfo["is_checked"] == nil {
                elementInfo["is_checked"] = false
            }

            if([kAXGroupRole, kAXListRole, kAXOutlineRole, kAXSplitGroupRole].contains(role) && (elementInfo["labels"] as? [String: String])?["title"] == nil) {
                // Don't add groups without a title
            } else {
                output.append(elementInfo)
            }

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
            ],
            "confidence": candidate.confidence,
        ])
    }

    return result
}

func enrichOCRTextsInPlace(ocrTexts: inout [[String: Any]], elements: [[String: Any]]) {
    // let maxAcceptableMatchDistance: Double = 75.0 // Example

    for i in 0..<ocrTexts.count {
        // ocrTexts[i] is the dictionary we want to potentially modify
        guard let bounds = ocrTexts[i]["bounds"] as? [String: Int],
              let _ = ocrTexts[i]["text"] as? String else {
            continue
        }

        let ocrCenterX = bounds["x", default: 0] + bounds["width", default: 0] / 2
        let ocrCenterY = bounds["y", default: 0] + bounds["height", default: 0] / 2

        var bestDistance = Double.greatestFiniteMagnitude
        var bestElementIndex: Int? = nil

        for (elementIndex, elem) in elements.enumerated() {
            guard let frame = elem["frame"] as? [String: Int] else { continue }

            let elemCenterX = frame["x", default: 0] + frame["width", default: 0] / 2
            let elemCenterY = frame["y", default: 0] + frame["height", default: 0] / 2

            let dx = Double(ocrCenterX - elemCenterX)
            let dy = Double(ocrCenterY - elemCenterY)
            let distance = sqrt(dx * dx + dy * dy)

            // if distance < bestDistance && distance <= maxAcceptableMatchDistance {
            if distance < bestDistance {
                bestDistance = distance
                bestElementIndex = elementIndex
            }
        }

        if let foundIndex = bestElementIndex {
            ocrTexts[i]["matched_element_index"] = foundIndex
            ocrTexts[i]["match_distance"] = bestDistance
        }
        // If no match, ocrTexts[i] remains unchanged (without the new keys)
    }
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
        var ocrResults = captureOCRText(focusedWindow: axWindow)
        enrichOCRTextsInPlace(ocrTexts: &ocrResults, elements: elements)

        let dict: [String: Any] = [
            "application": appName,
            "window": windowTitle,
            "accessibility_elements": elements,
            "ocr_texts": ocrResults,
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