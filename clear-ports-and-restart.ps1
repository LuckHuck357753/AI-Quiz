# Остановить процессы, использующие порты 4001 и 5173
$ErrorActionPreference = "Continue"
$ports = @(4001, 5173)
$anyKilled = $false

foreach (${port} in $ports) {
    Write-Host "Проверяю порт ${port}..."
    try {
        $netstat = netstat -aon | Select-String ":${port} " | Select-String "LISTENING"
        if ($netstat) {
            $lines = $netstat | ForEach-Object { $_.ToString() }
            $procIds = @()
            foreach ($line in $lines) {
                $columns = $line -split '\s+'
                $procId = $columns[-1]
                if ($procId -match '^\d+$' -and -not ($procIds -contains $procId)) {
                    $procIds += $procId
                }
            }
            if ($procIds.Count -gt 0) {
                Write-Host "Найдено PID для порта ${port}: $($procIds -join ', ')"
                foreach (${procId} in $procIds) {
                    try {
                        Write-Host "Пробую завершить процесс PID ${procId} на порту ${port}..."
                        taskkill /PID ${procId} /F | Write-Host
                        Write-Host "Процесс PID ${procId} завершён."
                        $anyKilled = $true
                    } catch {
                        Write-Host "Не удалось завершить процесс PID ${procId}. $_"
                    }
                }
            } else {
                Write-Host "Порт ${port} занят, но PID не найден."
            }
        } else {
            Write-Host "Порт ${port} свободен."
        }
    } catch {
        Write-Host "Ошибка при проверке порта ${port}: $_"
    }
}

if ($anyKilled) {
    Write-Host "`nВсе занятые порты освобождены. Запускаю сервера..."
} else {
    Write-Host "`nПорты были свободны. Запускаю сервера..."
}

try {
    Write-Host "Запуск pnpm dev..."
    pnpm dev
} catch {
    Write-Host "Ошибка при запуске pnpm dev: $_"
} 