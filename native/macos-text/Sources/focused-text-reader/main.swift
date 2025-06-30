import AppKit
import Foundation

func getFocusedText() -> String? {
    // 1. Get the frontmost application.
    guard let frontmostApp = NSWorkspace.shared.frontmostApplication else { return nil }
    let pid = frontmostApp.processIdentifier
    let appElement = AXUIElementCreateApplication(pid)

    // 2. Get the focused element from that specific application.
    var focusedElement: AnyObject?
    let result = AXUIElementCopyAttributeValue(
        appElement, kAXFocusedUIElementAttribute as CFString, &focusedElement)

    if result != .success {
        // If this fails, the app may not be cooperative.
        return nil
    }

    // 3. From the focused element, get its value.
    var textValue: AnyObject?
    guard let element = focusedElement as! AXUIElement? else { return nil }
    let valueResult = AXUIElementCopyAttributeValue(
        element, kAXValueAttribute as CFString, &textValue)

    if valueResult == .success {
        return textValue as? String
    }

    return nil
}

let output = getFocusedText() ?? ""
print(output)
