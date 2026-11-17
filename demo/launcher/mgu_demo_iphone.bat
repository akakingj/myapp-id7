@echo off
rem MGU demo for an iPhone / iPad on the same Wi-Fi: the demo as mgu_demo.bat starts it, also on this PC's home network.
rem The address to open on the phone (with its key) shows in this window and as a QR code in the demo's panel on the PC.
rem Windows Firewall may ask once: allow Node.js on private networks.
cd /d "%~dp0"
call mgu_demo.bat --lan
