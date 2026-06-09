; Hermes Overlay F9 Global Hotkey Script
; Requires AutoHotkey v2.0+
; Toggles the Hermes overlay window directly via WinExist/WinActivate
; Uses DetectHiddenWindows so it can find the window even when Electron
; creates it with show: false (hidden until first toggle)

#Requires AutoHotkey v2.0
#SingleInstance Force

overlayDir := "C:\Users\jijin\hermes-overlay"
overlayTitle := "Hermes ahk_exe electron.exe"

; Must be able to find hidden windows (Electron creates HWND even with show: false)
DetectHiddenWindows(true)
SetTitleMatchMode(3) ; Exact title match

; F9 - Toggle Hermes overlay
F9:: {
    global overlayDir
    global overlayTitle
    
    ; Try to find existing window (including hidden)
    hwnd := WinExist(overlayTitle)
    
    if (hwnd) {
        ; Window exists - toggle visibility
        if WinIsActive(overlayTitle) {
            ; Window is active - hide it
            WinHide(overlayTitle)
            ToolTip("🔒 Hermes Hidden", 10, 10)
        } else {
            ; Window exists but not focused - show and activate it
            WinShow(overlayTitle)
            WinActivate(overlayTitle)
            ToolTip("✅ Hermes Activated", 10, 10)
        }
    } else {
        ; Window doesn't exist - launch it
        ToolTip("🚀 Launching Hermes...", 10, 10)
        
        try {
            Run(overlayDir "\launch.bat", overlayDir, "Hide")
        } catch as e {
            MsgBox("Error launching overlay: " e.Message, "Error", "T2")
        }
    }
    
    ; Auto-hide tooltip after 1.5 seconds
    SetTimer(() => ToolTip(), -1500)
}

; Ctrl+Alt+Shift+F9 - Hard kill switch
^!+F9:: {
    ToolTip("🛑 Force Closing Hermes...", 10, 10)
    SetTimer(() => ToolTip(), -1000)
    try {
        Run("taskkill /F /IM electron.exe", , "Hide")
    }
}

; Startup notification
ToolTip("F9 Hotkey Active — Press F9 to toggle Hermes", 10, 10)
SetTimer(() => ToolTip(), -3000)