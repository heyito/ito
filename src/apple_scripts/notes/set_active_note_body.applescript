on run argv
    set newContent to item 1 of argv

    -- Set clipboard (without user interference)
    set the clipboard to newContent

    tell application "Notes" to activate
    delay 0.5

    tell application "System Events"
        tell process "Notes"
            keystroke "a" using command down
            delay 0.1
            keystroke "v" using command down -- paste new content
        end tell
    end tell
end run