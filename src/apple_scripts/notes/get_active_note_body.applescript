tell application "Notes" to activate
delay 0.5
tell application "System Events"
    tell process "Notes"
        keystroke "a" using command down
        delay 0.1
        keystroke "c" using command down
    end tell
end tell
delay 0.2
set theText to the clipboard
return theText
