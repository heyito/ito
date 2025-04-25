on run argv
    set appName to item 1 of argv
    set newContent to item 2 of argv

    set the clipboard to newContent

    tell application appName to activate
    delay 0.5
    
    tell application "System Events"
        tell process appName
            keystroke "a" using command down
            delay 0.1
            keystroke "v" using command down
        end tell
    end tell
end run