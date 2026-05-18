@echo off
echo Testing Pharma Inventory Application Structure...
echo.

echo Checking frontend files:
if exist "frontend\index.html" (
    echo ✓ index.html exists
) else (
    echo ✗ index.html missing
)

if exist "frontend\styles.css" (
    echo ✓ styles.css exists
) else (
    echo ✗ styles.css missing
)

if exist "frontend\app.js" (
    echo ✓ app.js exists
) else (
    echo ✗ app.js missing
)

if exist "frontend\manifest.json" (
    echo ✓ manifest.json exists
) else (
    echo ✗ manifest.json missing
)

if exist "frontend\sw.js" (
    echo ✓ sw.js exists
) else (
    echo ✗ sw.js missing
)

echo.
echo Checking backend files:
if exist "backend\server.js" (
    echo ✓ server.js exists
) else (
    echo ✗ server.js missing
)

if exist "backend\package.json" (
    echo ✓ backend package.json exists
) else (
    echo ✗ backend package.json missing
)

if exist "backend\.env" (
    echo ✓ .env exists
) else (
    echo ✗ .env missing
)

echo.
echo Checking if all required dependencies are listed in backend package.json:
findstr /C:"express" "backend\package.json" >nul && (echo ✓ express dependency found) || (echo ✗ express dependency missing)
findstr /C:"googleapis" "backend\package.json" >nul && (echo ✓ googleapis dependency found) || (echo ✗ googleapis dependency missing)
findstr /C:"cors" "backend\package.json" >nul && (echo ✓ cors dependency found) || (echo ✗ cors dependency missing)
findstr /C:"dotenv" "backend\package.json" >nul && (echo ✓ dotenv dependency found) || (echo ✗ dotenv dependency missing)

echo.
echo Application structure verification complete!
pause