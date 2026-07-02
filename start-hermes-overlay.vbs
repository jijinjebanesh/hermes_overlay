Option Explicit

Dim sh
Set sh = CreateObject("WScript.Shell")

sh.Run _
"""C:\Users\jijin\AppData\Local\Programs\AutoHotkey\v2\AutoHotkey64.exe"" ""C:\Users\jijin\hermes-overlay\hotkey.ahk""", _
0, False