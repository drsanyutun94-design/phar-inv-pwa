@echo off
echo Allowing incoming connections on port 8080...
netsh advfirewall firewall add rule name="Pharma Inventory App (TCP 8080)" dir=in action=allow protocol=TCP localport=8080
echo.
echo Done! You can now access the app from other devices on your WiFi.
echo.
pause
