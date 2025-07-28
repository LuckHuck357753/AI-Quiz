# Development workflow script for AI Quiz
# Automates safe development process with staging environment

param(
    [string]$Action = "help",
    [string]$Message = ""
)

function Show-Help {
    Write-Host "AI Quiz - Development Workflow" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\dev-workflow.ps1 [action] [message]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Actions:" -ForegroundColor Green
    Write-Host "  start     - Start development (switch to dev branch)" -ForegroundColor White
    Write-Host "  commit    - Save changes to dev branch" -ForegroundColor White
    Write-Host "  deploy    - Push changes to staging" -ForegroundColor White
    Write-Host "  test      - Check staging status" -ForegroundColor White
    Write-Host "  merge     - Merge dev to master (when ready)" -ForegroundColor White
    Write-Host "  status    - Show current status" -ForegroundColor White
    Write-Host "  help      - Show this help" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\dev-workflow.ps1 start" -ForegroundColor Gray
    Write-Host "  .\dev-workflow.ps1 commit 'Add new feature'" -ForegroundColor Gray
    Write-Host "  .\dev-workflow.ps1 deploy" -ForegroundColor Gray
}

function Start-Development {
    Write-Host "Switching to dev branch..." -ForegroundColor Yellow
    git checkout dev
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully switched to dev branch" -ForegroundColor Green
        Write-Host "You can now safely make changes!" -ForegroundColor Cyan
    } else {
        Write-Host "Error switching to dev branch" -ForegroundColor Red
    }
}

function Save-Changes {
    if ([string]::IsNullOrEmpty($Message)) {
        $Message = Read-Host "Enter commit message"
    }
    
    Write-Host "Saving changes to dev branch..." -ForegroundColor Yellow
    git add .
    git commit -m $Message
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Changes saved to dev branch" -ForegroundColor Green
    } else {
        Write-Host "Error saving changes" -ForegroundColor Red
    }
}

function Deploy-ToStaging {
    Write-Host "Pushing changes to staging..." -ForegroundColor Yellow
    git push origin dev
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Changes pushed to staging" -ForegroundColor Green
        Write-Host "Railway will automatically deploy changes..." -ForegroundColor Cyan
        Write-Host "Wait 2-3 minutes and check staging domain" -ForegroundColor Yellow
    } else {
        Write-Host "Error pushing to staging" -ForegroundColor Red
    }
}

function Test-Staging {
    Write-Host "Checking staging status..." -ForegroundColor Yellow
    Write-Host "Check the following:" -ForegroundColor Cyan
    Write-Host "  1. Open staging domain in browser" -ForegroundColor White
    Write-Host "  2. Make sure game loads" -ForegroundColor White
    Write-Host "  3. Test new features" -ForegroundColor White
    Write-Host "  4. Check logs in Railway Dashboard" -ForegroundColor White
}

function Merge-ToProduction {
    Write-Host "WARNING: You are about to merge dev to master!" -ForegroundColor Red
    $confirm = Read-Host "This will deploy changes to production. Continue? (y/N)"
    
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        Write-Host "Switching to master..." -ForegroundColor Yellow
        git checkout master
        
        Write-Host "Merging dev to master..." -ForegroundColor Yellow
        git merge dev
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Pushing to production..." -ForegroundColor Yellow
            git push origin master
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Successfully deployed to production!" -ForegroundColor Green
                Write-Host "Congratulations! New features are available to users!" -ForegroundColor Cyan
            } else {
                Write-Host "Error pushing to production" -ForegroundColor Red
            }
        } else {
            Write-Host "Error merging branches" -ForegroundColor Red
        }
    } else {
        Write-Host "Merge cancelled" -ForegroundColor Yellow
    }
}

function Show-Status {
    Write-Host "Current status:" -ForegroundColor Cyan
    Write-Host ""
    
    # Current branch
    $branch = git branch --show-current
    Write-Host "Current branch: $branch" -ForegroundColor White
    
    # Status changes
    $status = git status --porcelain
    if ($status) {
        Write-Host "Unsaved changes:" -ForegroundColor Yellow
        $status | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    } else {
        Write-Host "Working directory is clean" -ForegroundColor Green
    }
    
    # Recent commits
    Write-Host ""
    Write-Host "Recent commits:" -ForegroundColor Cyan
    git log --oneline -3 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
}

# Main logic
switch ($Action.ToLower()) {
    "start" { Start-Development }
    "commit" { Save-Changes }
    "deploy" { Deploy-ToStaging }
    "test" { Test-Staging }
    "merge" { Merge-ToProduction }
    "status" { Show-Status }
    default { Show-Help }
} 