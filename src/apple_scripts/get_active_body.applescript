-- get_active_body.applescript
on run argv
    if (count of argv) < 1 then
        log "Error: Missing argument. Expected AppName."
        return "" -- Return empty string on error for Python to handle
    end if

    set appName to item 1 of argv
    set originalClipboard to missing value
    set theText to "" -- Initialize to empty string

    try
        set originalClipboard to the clipboard as record
    on error errMsg number errNum
        log "Warning: Could not save original clipboard as record. Error: " & errMsg & " (" & errNum & ")"
        set originalClipboard to ""
    end try

    -- Clear the clipboard to ensure we get fresh content from the app
    set the clipboard to ""

    try
        tell application appName
            activate
        end tell
        delay 0.5

        tell application "System Events"
            tell process appName
                set frontmost to true
                delay 0.1

                keystroke "a" using command down -- Select All
                delay 0.1
                keystroke "c" using command down -- Copy
            end tell
        end tell

        delay 0.2 -- Allow time for clipboard to be populated

        -- Now, try to get the text from the clipboard.
        -- This part *should* be text if "Copy" worked on text content.
        try
            set theText to the clipboard as text
        on error errMsgCopy number errNumCopy
            log "Warning: Content copied from " & appName & " was not text or could not be coerced to text. Error: " & errMsgCopy & " (" & errNumCopy & ")"
            set theText to "" -- Return empty if copy didn't yield text
        end try

    on error errMsgOuter number errNumOuter
        if originalClipboard is not missing value then
            try
                set the clipboard to originalClipboard
            on error errMsgInner number errNumInner
                log "Warning: Could not restore original clipboard during error handling. Inner error: " & errMsgInner & " (" & errNumInner & ")"
            end try
        end if
        -- For get_active_body, we might want to return empty string rather than hard erroring to Python
        log "Error during get_active_body UI interaction: " & errMsgOuter
        return ""
    end try

    -- Restore original clipboard
    if originalClipboard is not missing value then
        try
            set the clipboard to originalClipboard
        on error errMsgRestore number errNumRestore
            log "Warning: Could not restore original clipboard after successful operation. Error: " & errMsgRestore & " (" & errNumRestore & ")"
        end try
    end if

    return theText
end run