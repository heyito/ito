set json to "["

tell application "Notes"
    set firstNote to true
    repeat with theFolder in folders
        repeat with n in notes of theFolder
            set noteName to my escapeQuotes(name of n)
            
            if not firstNote then
                set json to json & ","
            else
                set firstNote to false
            end if
            
            set json to json & "\"" & noteName & "\""
        end repeat
    end repeat
end tell

set json to json & "]"

-- write to Desktop
set exportPath to (POSIX path of (path to desktop)) & "note_titles.json"
do shell script "echo " & quoted form of json & " > " & quoted form of exportPath

-- escape helper
on escapeQuotes(t)
    set t to replaceText(t, "\\", "\\\\")
    set t to replaceText(t, "\"", "\\\"")
    set t to replaceText(t, return, "\\n")
    set t to replaceText(t, linefeed, "\\n")
    return t
end escapeQuotes

-- simple replace function
on replaceText(theText, searchString, replacementString)
    set AppleScript's text item delimiters to searchString
    set theItems to text items of theText
    set AppleScript's text item delimiters to replacementString
    set theText to theItems as text
    set AppleScript's text item delimiters to ""
    return theText
end replaceText
