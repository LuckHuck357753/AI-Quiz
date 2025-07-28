# 🚀 Скрипт для безопасной разработки игры
# Автоматизирует рабочий процесс с staging-окружением

param(
    [string]$Action = "help",
    [string]$Message = ""
)

function Show-Help {
    Write-Host "🎮 AI Quiz - Рабочий процесс разработки" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Использование: .\dev-workflow.ps1 [действие] [сообщение]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Действия:" -ForegroundColor Green
    Write-Host "  start     - Начать разработку (переключиться на dev ветку)" -ForegroundColor White
    Write-Host "  commit    - Сохранить изменения в dev ветке" -ForegroundColor White
    Write-Host "  deploy    - Отправить изменения в staging" -ForegroundColor White
    Write-Host "  test      - Проверить статус staging" -ForegroundColor White
    Write-Host "  merge     - Слить dev в master (когда все готово)" -ForegroundColor White
    Write-Host "  status    - Показать текущий статус" -ForegroundColor White
    Write-Host "  help      - Показать эту справку" -ForegroundColor White
    Write-Host ""
    Write-Host "Примеры:" -ForegroundColor Yellow
    Write-Host "  .\dev-workflow.ps1 start" -ForegroundColor Gray
    Write-Host "  .\dev-workflow.ps1 commit 'Добавил новую функцию'" -ForegroundColor Gray
    Write-Host "  .\dev-workflow.ps1 deploy" -ForegroundColor Gray
}

function Start-Development {
    Write-Host "🔄 Переключаюсь на ветку dev..." -ForegroundColor Yellow
    git checkout dev
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Успешно переключился на ветку dev" -ForegroundColor Green
        Write-Host "💡 Теперь можете безопасно вносить изменения!" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Ошибка при переключении на dev ветку" -ForegroundColor Red
    }
}

function Save-Changes {
    if ([string]::IsNullOrEmpty($Message)) {
        $Message = Read-Host "Введите сообщение коммита"
    }
    
    Write-Host "💾 Сохраняю изменения в dev ветке..." -ForegroundColor Yellow
    git add .
    git commit -m $Message
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Изменения сохранены в dev ветке" -ForegroundColor Green
    } else {
        Write-Host "❌ Ошибка при сохранении изменений" -ForegroundColor Red
    }
}

function Deploy-ToStaging {
    Write-Host "🚀 Отправляю изменения в staging..." -ForegroundColor Yellow
    git push origin dev
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Изменения отправлены в staging" -ForegroundColor Green
        Write-Host "🔄 Railway автоматически развернет изменения..." -ForegroundColor Cyan
        Write-Host "⏱️  Подождите 2-3 минуты и проверьте staging домен" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Ошибка при отправке в staging" -ForegroundColor Red
    }
}

function Test-Staging {
    Write-Host "🧪 Проверяю статус staging..." -ForegroundColor Yellow
    Write-Host "📋 Проверьте следующие пункты:" -ForegroundColor Cyan
    Write-Host "   1. Откройте staging домен в браузере" -ForegroundColor White
    Write-Host "   2. Убедитесь, что игра загружается" -ForegroundColor White
    Write-Host "   3. Протестируйте новые функции" -ForegroundColor White
    Write-Host "   4. Проверьте логи в Railway Dashboard" -ForegroundColor White
}

function Merge-ToProduction {
    Write-Host "⚠️  ВНИМАНИЕ: Вы собираетесь слить dev в master!" -ForegroundColor Red
    $confirm = Read-Host "Это развернет изменения в production. Продолжить? (y/N)"
    
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        Write-Host "🔄 Переключаюсь на master..." -ForegroundColor Yellow
        git checkout master
        
        Write-Host "🔀 Сливаю dev в master..." -ForegroundColor Yellow
        git merge dev
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "🚀 Отправляю в production..." -ForegroundColor Yellow
            git push origin master
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Успешно развернуто в production!" -ForegroundColor Green
                Write-Host "🎉 Поздравляю! Новые функции доступны пользователям!" -ForegroundColor Cyan
            } else {
                Write-Host "❌ Ошибка при отправке в production" -ForegroundColor Red
            }
        } else {
            Write-Host "❌ Ошибка при слиянии веток" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ Слияние отменено" -ForegroundColor Yellow
    }
}

function Show-Status {
    Write-Host "📊 Текущий статус:" -ForegroundColor Cyan
    Write-Host ""
    
    # Текущая ветка
    $branch = git branch --show-current
    Write-Host "🌿 Текущая ветка: $branch" -ForegroundColor White
    
    # Статус изменений
    $status = git status --porcelain
    if ($status) {
        Write-Host "📝 Есть несохраненные изменения:" -ForegroundColor Yellow
        $status | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    } else {
        Write-Host "✅ Рабочая директория чистая" -ForegroundColor Green
    }
    
    # Последние коммиты
    Write-Host ""
    Write-Host "📜 Последние коммиты:" -ForegroundColor Cyan
    git log --oneline -3 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
}

# Основная логика
switch ($Action.ToLower()) {
    "start" { Start-Development }
    "commit" { Save-Changes }
    "deploy" { Deploy-ToStaging }
    "test" { Test-Staging }
    "merge" { Merge-ToProduction }
    "status" { Show-Status }
    default { Show-Help }
} 