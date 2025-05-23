-- set_active_body.applescript
on run argv
    if (count of argv) < 2 then
        log "Error: Missing arguments. Expected AppName and NewContent."
        return 
    end if

    set appName to item 1 of argv
    set newContent to item 2 of argv

    set originalClipboard to missing value -- Use 'missing value' to indicate it hasn't been set

    try
        -- Try to preserve the full clipboard content, not just text
        set originalClipboard to the clipboard as record
    on error errMsg number errNum
        -- If clipboard is empty or can't be read as record,
        -- we can store it as an empty string for restoration,
        -- or decide not to restore if it was problematic.
        -- For simplicity, let's just log and it will be effectively empty for restore.
        log "Warning: Could not save original clipboard as record. Error: " & errMsg & " (" & errNum & ")"
        set originalClipboard to "" -- Fallback to empty string
    end try

    -- Set the clipboard to the new content
    set the clipboard to newContent

    try
        tell application appName
            activate
        end tell
        delay 0.5 -- Give app time to activate and come to the front

        tell application "System Events"
            tell process appName
                -- Ensure the application and a window are ready for input
                set frontmost to true
                delay 0.1 -- Small delay for focus if needed

                keystroke "a" using command down -- Select All
                delay 0.1 -- Wait for select all to register
                keystroke "v" using command down -- Paste
            end tell
        end tell

        delay 0.2 -- Allow paste operation to complete

    on error errMsgOuter number errNumOuter
        -- Attempt to restore clipboard even if the main operation failed
        if originalClipboard is not missing value then
            try
                set the clipboard to originalClipboard
            on error errMsgInner number errNumInner
                log "Warning: Could not restore original clipboard during error handling. Inner error: " & errMsgInner & " (" & errNumInner & ")"
            end try
        end if
        -- Re-throw the original error so Python knows something went wrong
        error "Error during set_active_body UI interaction: " & errMsgOuter number errNumOuter
    end try

    -- Restore original clipboard
    if originalClipboard is not missing value then
        try
            set the clipboard to originalClipboard
        on error errMsgRestore number errNumRestore
            log "Warning: Could not restore original clipboard after successful operation. Error: " & errMsgRestore & " (" & errNumRestore & ")"
        end try
    end if

end run