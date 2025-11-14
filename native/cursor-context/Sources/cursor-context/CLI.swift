import ArgumentParser
import Foundation

struct CursorContextCLI: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "cursor-context",
        abstract: "Extract cursor context from the focused text element",
        discussion: """
        This tool uses macOS Accessibility APIs to extract text around the cursor position
        in the currently focused text field or editor.
        """
    )

    @Option(name: .long, help: "Maximum characters to capture before the cursor")
    var before: Int = 1000

    @Option(name: .long, help: "Maximum characters to capture after the cursor")
    var after: Int = 1000

    @Option(name: .long, help: "Delay in seconds before capturing context")
    var delay: Int = 0

    @Flag(name: .long, help: "Enable debug logging to stderr")
    var debug: Bool = false

    mutating func run() throws {
        // Set global debug flag
        DEBUG_LOG = debug

        // Wait for specified delay if provided
        if delay > 0 {
            if debug {
                fputs("Waiting \(delay) second(s) before capturing...\n", stderr)
            }
            Thread.sleep(forTimeInterval: TimeInterval(delay))
        }

        // Get cursor context with specified parameters
        let result = getCursorContext(maxCharsBefore: before, maxCharsAfter: after)

        // Encode and print JSON result
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]

        guard let jsonData = try? encoder.encode(result),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            throw CLIError.encodingFailed
        }

        print(jsonString)
    }
}

enum CLIError: Error, CustomStringConvertible {
    case encodingFailed

    var description: String {
        switch self {
        case .encodingFailed:
            return "Failed to encode result as JSON"
        }
    }
}
