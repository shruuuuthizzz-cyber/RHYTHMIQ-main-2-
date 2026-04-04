Set-Location -LiteralPath "c:\Users\ADMIN\Downloads\RHYTHMIQ-main (1)\RHYTHMIQ-main\frontend"
$env:PORT = "3001"
$env:BROWSER = "none"
$env:REACT_APP_ADMIN_MODE = "true"
npm.cmd start
