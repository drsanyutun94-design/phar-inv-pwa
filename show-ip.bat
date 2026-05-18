@echo off
echo Your local IP addresses:
echo.
ipconfig | findstr /i "IPv4"
echo.
echo Start the server with: cd backend ^&^& npm start
echo Then access from tablet: http://^<your-ip^>:8080
echo.
pause
