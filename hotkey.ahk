; Hermes Overlay Global Hotkey Script
; Requires AutoHotkey v2.0+
; Toggles the Hermes overlay window via HTTP IPC to Electron
; Electron controls its own visibility properly via mainWindow.show()/hide()

#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent

overlayDir := "C:\Users\jijin\hermes-overlay"
overlayTitle := "Hermes ahk_exe electron.exe"
electronExe := overlayDir "\node_modules\electron\dist\electron.exe"
scriptPath := overlayDir "\dist-electron\main.js"

DetectHiddenWindows(true)
SetTitleMatchMode(2)

global windowVisible := false

hwnd := WinExist(overlayTitle)
if (hwnd) {
    WS_VISIBLE := 0x10000000
    style := DllCall("GetWindowLong", "ptr", hwnd, "int", -16, "uint")
    windowVisible := (style & WS_VISIBLE) != 0
}

f4:: {
    global windowVisible
    
    hwnd := WinExist(overlayTitle)
    
    if (hwnd) {
        try {
            req := ComObject("WinHttp.WinHttpRequest.5.1")
            req.Open("POST", "http://localhost:34567/toggle", false)
            req.Send()
            windowVisible := !windowVisible
            
        } catch {
            if (windowVisible) {
                WinHide("ahk_id " hwnd)
                windowVisible := false
               
            } else {
                WinShow("ahk_id " hwnd)
                WinRestore("ahk_id " hwnd)
                WinActivate("ahk_id " hwnd)
                windowVisible := true
            }
        }
    } else {
        ToolTip("🚀 Launching Hermes...", 10, 10)
        windowVisible := false
        try {
            Run(electronExe . " " . scriptPath, overlayDir)
            
            startTime := A_TickCount
            loop {
                Sleep(100)
                hwnd := WinExist(overlayTitle)
                if (hwnd) {
                    Sleep(300)
                    try {
                        req := ComObject("WinHttp.WinHttpRequest.5.1")
                        req.Open("POST", "http://localhost:34567/show", false)
                        req.Send()
                        windowVisible := true
                        SetTimer(() => ToolTip(), -1) ; Immediately hide any existing ToolTip
                    } catch {
                        WinShow("ahk_id " hwnd)
                        WinActivate("ahk_id " hwnd)
                        windowVisible := true
                    }
                    break
                }
                if (A_TickCount - startTime > 5000) {
                    ToolTip("❌ Launch timeout", 10, 10)
                    break
                }
            }
        } catch as e {
            MsgBox("Error launching Hermes: " e.Message, "Error", "T2")
        }
    }
    
    SetTimer(() => ToolTip(), -1500)
}

^!+f4:: {
    ToolTip("🛑 Force Closing Hermes...", 10, 10)
    SetTimer(() => ToolTip(), -1000)
    try {
        ProcessClose("electron.exe")
    }
}

ToolTip("F4 Daemon Active — Press F4 to toggle Hermes", 10, 10)

SetTimer(() => ToolTip(), -3000)