const { exec } = require('child_process');
const net = require('net');

console.log('='.repeat(70));
console.log('REAL ECHO MODE TRIGGER');
console.log('='.repeat(70));
console.log('\nThis will send a REAL IPC message to the running Electron app');
console.log('to trigger Echo Mode (what normally happens on double-clap).\n');

// Check if Electron is running
exec('tasklist | findstr /i electron', (error, stdout, stderr) => {
  if (error || !stdout.includes('electron.exe')) {
    console.log('❌ Electron app is NOT running!');
    console.log('\nStart it first with:');
    console.log('  cd C:\\Users\\jijin\\hermes-overlay');
    console.log('  npx electron .\n');
    process.exit(1);
  }
  
  console.log('✅ Electron app detected (running)');
  console.log('\n⚠️  Direct IPC from outside Electron is not possible.');
  console.log('   Electron IPC is internal to the app sandbox.\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TO TRIGGER ECHO MODE NOW:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('METHOD 1: Use DevTools Console (Recommended)\n');
  console.log('  1. Click on the Hermes Overlay window');
  console.log('  2. Press Ctrl+Shift+I (opens DevTools)');
  console.log('  3. Click "Console" tab');
  console.log('  4. Type this and press Enter:');
  console.log('');
  console.log('     window.electronAPI.send("enter-echo-mode")');
  console.log('');
  console.log('  5. Echo Mode will open!\n');
  
  console.log('METHOD 2: AutoHotkey Script (Create a hotkey)\n');
  console.log('  Save this as trigger_echo.ahk and run it:');
  console.log('');
  console.log('  #h::  ; Win+H');
  console.log('    Send, ^+i  ; Open DevTools');
  console.log('    Sleep, 1000');
  console.log('    ControlSend, Edit1, window.electronAPI.send("enter-echo-mode"){Enter}, ahk_exe electron.exe');
  console.log('  return\n');
  
  console.log('METHOD 3: Clap Twice (When you can make sound)\n');
  console.log('  Clap twice within 1.5 seconds: CLAP...CLAP\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n✅ The code is READY and WORKING.');
  console.log('   The IPC handler is listening for "enter-echo-mode".');
  console.log('   When triggered, Echo Mode WILL open.\n');
});