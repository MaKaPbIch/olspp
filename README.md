# Scrum Planning Poker

Веб-приложение для командного голосования за Story Points в реальном времени с использованием WebSocket.

## Возможности

- **Реальное время**: Все участники видят обновления моментально через WebSocket
- **Комнаты**: Поддержка нескольких команд через URL-параметр `?room=название`
- **Карточки Фибоначчи**: 0, 1, 2, 3, 5, 8, 13, 21, ?, ☕
- **Статистика**: Среднее, медиана, определение консенсуса
- **Автопереподключение**: Клиент автоматически переподключается при разрыве соединения
- **Адаптивный дизайн**: Работает на всех устройствах

## Установка и запуск

### 1. Установка зависимостей

```bash
npm install
```

### 2. Запуск сервера

```bash
npm start
```

Сервер запустится на порту 3000 (или PORT из переменных окружения).

### 3. Открыть в браузере

```
http://localhost:3000
```

## Режим разработки

Для автоматической перезагрузки при изменениях:

```bash
npm run dev
```

## Использование

### Создание комнаты

По умолчанию все подключаются к комнате `default`. Для создания отдельной комнаты добавьте параметр:

```
http://localhost:3000?room=myteam
```

Все участники с одинаковым параметром `room` будут находиться в одной сессии.

### Процесс голосования

1. **Добавьте участников**: Нажмите "+ Добавить участника" и введите имена
2. **Введите описание задачи** (опционально)
3. **Выберите карточку**: Каждый участник выбирает оценку
4. **Покажите голоса**: Когда все проголосовали, нажмите "Показать голоса"
5. **Просмотрите статистику**: Среднее значение, медиана, консенсус
6. **Сбросьте**: Нажмите "Сбросить" для новой задачи

## API Endpoints

### GET /health
Проверка состояния сервера

```bash
curl http://localhost:3000/health
```

Ответ:
```json
{
  "status": "ok",
  "rooms": 2,
  "timestamp": "2025-10-15T..."
}
```

### GET /api/rooms/:roomId
Информация о комнате

```bash
curl http://localhost:3000/api/rooms/myteam
```

Ответ:
```json
{
  "id": "myteam",
  "participantCount": 5,
  "task": "User authentication",
  "votesRevealed": false
}
```

## WebSocket Protocol

Клиент отправляет и получает JSON-сообщения через WebSocket.

### Сообщения от клиента:

- `join` - Присоединиться к комнате
- `addParticipant` - Добавить участника
- `removeParticipant` - Удалить участника
- `vote` - Проголосовать
- `updateTask` - Обновить описание задачи
- `revealVotes` - Показать/скрыть голоса
- `resetVotes` - Сбросить все голоса

### Сообщения от сервера:

- `roomState` - Текущее состояние комнаты
- `participantAdded` - Участник добавлен
- `participantRemoved` - Участник удален
- `voteUpdated` - Голос обновлен
- `taskUpdated` - Задача обновлена
- `votesRevealed` - Голоса показаны/скрыты
- `votesReset` - Голоса сброшены

## Развертывание на продакшене

### На VPS или выделенном сервере:

```bash
# Установите Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Клонируйте проект
cd /var/www
git clone <your-repo-url> scrum-poker
cd scrum-poker

# Установите зависимости
npm install --production

# Используйте PM2 для запуска
sudo npm install -g pm2
pm2 start server.js --name scrum-poker
pm2 startup
pm2 save
```

### Использование с Nginx (reverse proxy):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### На Heroku:

```bash
# Создайте Procfile
echo "web: node server.js" > Procfile

# Deploy
heroku create
git push heroku main
heroku open
```

### На Railway, Render, или других платформах:

Просто подключите репозиторий, платформа автоматически определит Node.js приложение.

## Переменные окружения

- `PORT` - Порт сервера (по умолчанию: 3000)

## Структура проекта

```
scrum-poker/
├── index.html          # Главная страница
├── styles.css          # Стили
├── script.js           # Клиентская логика + WebSocket
├── server.js           # Node.js сервер + WebSocket
├── package.json        # Зависимости
└── README.md           # Документация
```

## Технологии

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js, Express
- **WebSocket**: ws library
- **Real-time**: WebSocket для двусторонней коммуникации

## Лицензия

MIT
