# Многоэтапная сборка для оптимизации размера
FROM node:18-alpine AS builder

# Устанавливаем pnpm
RUN npm install -g pnpm

# Копируем файлы конфигурации
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

# Устанавливаем зависимости
RUN pnpm install --frozen-lockfile

# Копируем исходный код
COPY apps/backend ./apps/backend
COPY apps/frontend ./apps/frontend

# Собираем frontend
WORKDIR /apps/frontend
RUN pnpm build

# Собираем backend
WORKDIR /apps/backend
RUN pnpm build

# Продакшн этап
FROM node:18-alpine AS production

# Устанавливаем pnpm
RUN npm install -g pnpm

# Создаем пользователя для безопасности
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Копируем package.json и устанавливаем только продакшн зависимости
COPY --from=builder /apps/backend/package.json ./
COPY --from=builder /apps/backend/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Копируем собранный backend
COPY --from=builder /apps/backend/dist ./dist
COPY --from=builder /apps/backend/src ./src

# Копируем собранный frontend
COPY --from=builder /apps/frontend/dist ./public

# Создаем папку для загрузок
RUN mkdir -p uploads && chown -R nodejs:nodejs uploads

# Переключаемся на пользователя nodejs
USER nodejs

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["node", "dist/index.js"] 