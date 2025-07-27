# Используем Node.js 18
FROM node:18-alpine

# Устанавливаем pnpm
RUN npm install -g pnpm

# Создаем рабочую директорию
WORKDIR /app

# Копируем файлы конфигурации
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

# Устанавливаем все зависимости
RUN pnpm install --frozen-lockfile

# Копируем исходный код
COPY apps/backend ./apps/backend
COPY apps/frontend ./apps/frontend

# Собираем frontend
WORKDIR /app/apps/frontend
RUN pnpm build

# Собираем backend
WORKDIR /app/apps/backend
RUN pnpm build

# Создаем папку для загрузок
RUN mkdir -p uploads

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["node", "dist/index.js"] 