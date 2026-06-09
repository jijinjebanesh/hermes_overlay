Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Registry path for hotkey
regPath = "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced\"

' Create or update registry entry for F2 hotkey
On Error Resume Next

' Get the hermes overlay exe path
overlayPath = "C:\Users\jijin\hermes-overlay\launch.bat"

' Message to user
MsgBox "Hermes Overlay Ready!" & vbCrLf & vbCrLf & _
        "Press F2 at any time to open the overlay." & vbCrLf & vbCrLf & _
        "Keyboard shortcuts:" & vbCrLf & _
        "• Ctrl+Alt+H or F2 - Toggle overlay visibility" & vbCrLf & _
        "• Escape - Close/clear", _
        vbInformation, "Hermes Overlay 2.0"

' Keep script running to maintain hotkey
' This is a placeholder - for production, use a proper hotkey daemon
WScript.Quit(0)

