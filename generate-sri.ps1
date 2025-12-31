# Generate SRI (Subresource Integrity) hashes for frontend files.
# Run this after any changes to JS/CSS files.

$frontendDir = "$PSScriptRoot\frontend"

function Get-SRIHash {
    param([string]$FilePath)
    
    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
    $sha384 = [System.Security.Cryptography.SHA384]::Create()
    $hash = $sha384.ComputeHash($bytes)
    $b64 = [Convert]::ToBase64String($hash)
    return "sha384-$b64"
}

Write-Host "Generating SRI hashes..." -ForegroundColor Cyan
Write-Host ""

$files = @(
    "css/style.css",
    "js/crypto.js",
    "js/websocket.js",
    "js/app.js"
)

$hashes = @{}

foreach ($file in $files) {
    $fullPath = Join-Path $frontendDir $file
    if (Test-Path $fullPath) {
        $hash = Get-SRIHash -FilePath $fullPath
        $hashes[$file] = $hash
        Write-Host "$file" -ForegroundColor Green
        Write-Host "  $hash" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "$file - NOT FOUND" -ForegroundColor Red
    }
}

# Update index.html with SRI hashes.
$indexPath = Join-Path $frontendDir "index.html"
if (Test-Path $indexPath) {
    $content = Get-Content $indexPath -Raw
    
    # Update CSS.
    if ($hashes["css/style.css"]) {
        $content = $content -replace '<link rel="stylesheet" href="css/style.css"[^>]*>', 
            "<link rel=`"stylesheet`" href=`"css/style.css`" integrity=`"$($hashes["css/style.css"])`" crossorigin=`"anonymous`">"
    }
    
    # Update JS files.
    foreach ($jsFile in @("js/crypto.js", "js/websocket.js", "js/app.js")) {
        if ($hashes[$jsFile]) {
            $fileName = $jsFile -replace "js/", ""
            $pattern = "<script src=`"$jsFile`"[^>]*></script>"
            $replacement = "<script src=`"$jsFile`" integrity=`"$($hashes[$jsFile])`" crossorigin=`"anonymous`"></script>"
            $content = $content -replace $pattern, $replacement
        }
    }
    
    Set-Content $indexPath -Value $content -NoNewline
    Write-Host "Updated index.html with SRI hashes!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done! SRI hashes have been added to index.html." -ForegroundColor Cyan
Write-Host "Re-run this script whenever you update JS or CSS files." -ForegroundColor Yellow
