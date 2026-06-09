; Hermes Overlay F2 Global Hotkey Script v2
; Requires AutoHotkey v2.0+
; Toggles the Hermes overlay window directly via WinExist/WinActivate.
; Uses DetectHiddenWindows so it can find the window even when Electron
; creates it with show: false (hidden until first toggle).
; No reliance on Electron's unreliable globalShortcut passthrough.
; If Hermes is not running, launches it.

#Requires AutoHotkey v2.0
#SingleInstance Force

overlayDir := "C:\Users\jijin\hermes-overlay"
overlayTitle := "Hermes ahk_exe electron.exe"  ; Matches the exact title and process

; Must be able to find hidden windows (Electron creates HWND even with show: false)
DetectHiddenWindows(true)
SetTitleMatchMode(3) ; Exact title match

#HotIf !WinExist(overlayTitle)
^+h:: {
    global overlayDir

    ; Window doesn't exist yet — launch the overlay
    ToolTip("🚀 Launching Hermes...", 10, 10)
    SetTimer(() => ToolTip(), 2000)

    try {
        Run(overlayDir "\launch.bat", overlayDir, "Hide")
    } catch as e {
        MsgBox("Error launching overlay: " e.Message)
    }
}
#HotIf

; Hard kill switch: Ctrl+Alt+Shift+F2
^!+h:: {
    ToolTip("🛑 Force Closing Hermes...", 10, 10)
    SetTimer(() => ToolTip(), 1000)
    try {
        Run("taskkill /F /IM electron.exe", , "Hide")
    }
}

ToolTip("Ctrl+Shift+H Daemon Active — Press Ctrl+Shift+H to toggle Hermes", 10, 10)
SetTimer(() => ToolTip(), 3000)