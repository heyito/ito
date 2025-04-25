on run argv
    set appName to item 1 of argv
    tell application appName to activate
    delay 0.5
    tell application "System Events"
        tell process appName
            keystroke "a" using command down
            delay 0.1
            keystroke "c" using command down
        end tell
    end tell
    delay 0.2
    set theText to the clipboard
    return theText
end run