# Setup script for GitHub release
# Run this to copy frontend files from your working project

$sourcePath = "C:\Users\Administrator\Desktop\All Projects\SecureChat\frontend"
$destPath = "C:\Users\Administrator\Desktop\All Projects\SecureChat\github-release\frontend"

# Create directories
New-Item -ItemType Directory -Force -Path "$destPath\js" | Out-Null
New-Item -ItemType Directory -Force -Path "$destPath\css" | Out-Null

# Copy frontend files
Copy-Item "$sourcePath\index.html" "$destPath\" -Force
Copy-Item "$sourcePath\favicon.svg" "$destPath\" -Force
Copy-Item "$sourcePath\js\*.js" "$destPath\js\" -Force
Copy-Item "$sourcePath\css\*.css" "$destPath\css\" -Force
Copy-Item "$sourcePath\build.js" "$destPath\" -Force
Copy-Item "$sourcePath\build.ps1" "$destPath\" -Force
Copy-Item "$sourcePath\capacitor.config.json" "$destPath\" -Force

# Copy package.json if exists
if (Test-Path "$sourcePath\package.json") {
    Copy-Item "$sourcePath\package.json" "$destPath\" -Force
}

Write-Host "Frontend files copied to github-release folder!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. cd C:\Users\Administrator\Desktop\All Projects\SecureChat\github-release"
Write-Host "2. git init"
Write-Host "3. git add ."
Write-Host "4. git commit -m 'Initial commit'"
Write-Host "5. git remote add origin https://github.com/yourusername/securechat.git"
Write-Host "6. git push -u origin main"
