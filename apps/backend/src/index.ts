import express, { Request, Response } from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'path';
import axios from 'axios';
import multer from 'multer';
import fs from 'fs';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import session from 'express-session';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

// Расширение типов для сессии
declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
  }
}

dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.OPENAI_API_KEY) {
  console.warn('ВНИМАНИЕ: OPENAI_API_KEY не найден! Проверьте файл apps/backend/.env');
}
console.log('ENV DEBUG (OPENAI_API_KEY, TMDB_API_KEY):', {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  TMDB_API_KEY: process.env.TMDB_API_KEY
});
console.log('Proxy env:', {
  HTTPS_PROXY: process.env.HTTPS_PROXY,
  HTTP_PROXY: process.env.HTTP_PROXY,
  NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
  ALL_PROXY: process.env.ALL_PROXY
});

const app = express();
const server = http.createServer(app);

// Настройка CORS для продакшена
const allowedOrigins = [
  'http://localhost:5173',
  'https://localhost:5173',
  'https://ai-quiz-production.up.railway.app',
  'https://*.up.railway.app',
  process.env.RAILWAY_STATIC_URL,
  process.env.RAILWAY_PUBLIC_DOMAIN
].filter(Boolean) as string[];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Безопасность
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"]
    }
  }
}));

// Сжатие
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  message: 'Слишком много запросов с этого IP'
});
app.use('/api/', limiter);

// CORS
app.use(cors({ 
  origin: allowedOrigins,
  credentials: true 
}));

// Сессии
app.use(session({
  secret: process.env.SESSION_SECRET || 'quiz-app-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 часа
  }
}));

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/html',
      'application/msword'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый тип файла'));
    }
  }
});

// Middleware для проверки аутентификации
const requireAuth = (req: Request, res: Response, next: Function) => {
  const accessPassword = process.env.ACCESS_PASSWORD || 'default_password';
  
  // Проверяем сессию
  if (req.session && req.session.authenticated) {
    return next();
  }
  
  // Проверяем пароль в заголовке или теле запроса
  const providedPassword = req.headers['x-access-password'] || req.body?.password;
  
  if (providedPassword === accessPassword) {
    req.session.authenticated = true;
    return next();
  }
  
  res.status(401).json({ error: 'Требуется аутентификация' });
};

// Обработка статических файлов frontend
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API endpoints (требуют аутентификации)
app.get('/api/status', requireAuth, (req: Request, res: Response) => {
  res.json({ 
    status: 'running', 
    timestamp: new Date().toISOString(),
    players: Object.keys(scores).length,
    rooms: Object.keys(rooms).length
  });
});

app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

app.get('/tmdb-test', async (req, res) => {
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.status(500).json({ error: 'TMDB_API_KEY не найден' });
  try {
    const page = 1;
    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${tmdbKey}&language=ru-RU&page=${page}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'QuizApp/1.0'
      }
    });
    res.json({
      url,
      status: response.status,
      data: response.data && response.data.results ? response.data.results.slice(0, 2) : response.data
    });
  } catch (err) {
    const e = err as any;
    res.status(500).json({
      error: e.message,
      code: e.code,
      address: e.address,
      port: e.port,
      config: e.config,
      cause: e.cause
    });
  }
});

app.get('/external-test', async (req, res) => {
  const url = req.query.url as string || 'https://jsonplaceholder.typicode.com/todos/1';
  try {
    const response = await axios.get(url);
    res.json({
      url,
      status: response.status,
      data: response.data
    });
  } catch (err) {
    const e = err as any;
    res.status(500).json({
      error: e.message,
      code: e.code,
      address: e.address,
      port: e.port,
      config: e.config,
      cause: e.cause
    });
  }
});

// Endpoint для загрузки файла и генерации вопросов
app.post('/upload-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    console.log(`[upload-file] Загружен файл: ${req.file.originalname}, размер: ${req.file.size}, тип: ${req.file.mimetype}`);

    // Извлекаем текст из файла
    const content = await extractTextFromFile(req.file.path, req.file.mimetype);
    
    if (!content || content.trim().length < 100) {
      return res.status(400).json({ error: 'Файл содержит слишком мало текста для создания вопросов' });
    }

    // Генерируем вопросы с помощью GPT
    const questions = await generateQuestionsFromFileContent(content);
    
    if (!questions || questions.length === 0) {
      return res.status(500).json({ error: 'Не удалось сгенерировать вопросы из файла' });
    }

    // Удаляем временный файл
    fs.unlinkSync(req.file.path);

    console.log(`[upload-file] Успешно создано ${questions.length} вопросов из файла`);

    res.json({
      success: true,
      questions: questions,
      fileName: req.file.originalname,
      contentLength: content.length
    });

  } catch (error: any) {
    console.error(`[upload-file] Ошибка:`, error);
    
    // Удаляем файл в случае ошибки
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: error.message || 'Ошибка при обработке файла',
      details: error.toString()
    });
  }
});

// In-memory score, question progress, and seen questions per user
const scores: Record<string, number> = {};
const seenQuestions: Record<string, Set<number>> = {};
const currentQuestions: Record<string, number> = {};
// Добавляем хранение имён игроков
const playerNames: Record<string, string> = {};
// Лидерборд: массив объектов { name, score }
let leaderboard: { name: string; score: number }[] = [];

// Массив вопросов по темам
const quizTopics: Record<string, { question: string; choices: string[]; answer: string }[]> = {
  "Яндекс": [
    { question: "Сколько ценностей в Яндексе?", choices: ["4", "5", "6", "8"], answer: "5" },
    { question: "В чём заключается миссия Яндекса?", choices: ["Предоставить каждому возможность полностью реализовать свой потенциал", "Делать то, что нравится и свободно выражать своё мнение, воплощая идеи", "Удобно организовать всю информацию в мире и сделать доступной и полезной каждому", "Помогать людям решать задачи и достигать своих целей в жизни"], answer: "Помогать людям решать задачи и достигать своих целей в жизни" },
    { question: "В каком году появилась компания Яндекс?", choices: ["1995", "1997", "2000", "2002"], answer: "2000" },
    { question: "Сколько составляла поисковая доля Яндекса в России в первом квартале 2022 года по замерам Яндекс.Радар?", choices: ["48,7%", "61%", "76%", "39%"], answer: "61%" },
    { question: "Какое знаковое для Яндекса событие произошло в 2002 году?", choices: ["Яндекс провел размещение акций на NASDAQ — фондовой бирже, специализирующейся на высокотехнологичных компаниях", "Зарегистрирована компания Яндекс", "Компания Яндекс стала самоокупаемой", "Произошёл запуск портала yandex.ru"], answer: "Компания Яндекс стала самоокупаемой" },
    { question: "Какое знаковое для Яндекса событие произошло в 2011 году?", choices: ["Открылись Яндекс.Карты. На тот момент сервис предлагал единую карту Европы и подробные схемы трёх городов — Москвы, Петербурга и Киева. На них можно было искать не только адреса, но и музеи, кинотеатры и другие объекты.", "Яндекс провел размещение акций на NASDAQ — фондовой бирже, специализирующейся на высокотехнологичных компаниях", "В этом году появились мобильное приложение для водителей Яндекс.Парковки и музыкальный сервис Яндекс.Радио, где можно найти музыку разных жанров и эпох, под любое занятие и настроение.", "Компания выпустила первое устройство собственной разработки — Яндекс.Станцию."], answer: "Яндекс провел размещение акций на NASDAQ — фондовой бирже, специализирующейся на высокотехнологичных компаниях" },
    { question: "Какое знаковое для Яндекса событие произошло в 1993 году?", choices: ["Придумали слово «Яндекс» В «Аркадии» запустили новую версию поисковой программы, и хотелось дать ей какое-то небанальное название. Илья сидел и выписывал на листочке слова, которые описывали бы суть программы. Поиски шли вокруг слов search и index. Так появилось Yandex — сокращённое от «yet another indexer» («ещё один индексатор»). Аркадий предложил заменить первые две английские буквы на русскую «Я». В итоге программу назвали Яndex.", "23 сентября была впервые анонсирована поисковая машина Яndex-Web", "Зарегистрирована компания «Яндекс»", "Yandex.ru научился искать по специализированным массивам данных — параллельно с поиском по вебу"], answer: "Придумали слово «Яндекс» В «Аркадии» запустили новую версию поисковой программы, и хотелось дать ей какое-то небанальное название. Илья сидел и выписывал на листочке слова, которые описывали бы суть программы. Поиски шли вокруг слов search и index. Так появилось Yandex — сокращённое от «yet another indexer» («ещё один индексатор»). Аркадий предложил заменить первые две английские буквы на русскую «Я». В итоге программу назвали Яndex." },
    { question: "Объем рунета дорос до терабайта. Интернетом на тот момент пользовались 8 % россиян — 8,8 миллиона человек. Ежедневное количество запросов к поиску Яндекса перевалило за два миллиона. О каком времени идёт речь?", choices: ["1999", "2002", "2006", "1997"], answer: "2002" },
    { question: "Какой из сервисов Яндекса открылся вместе с Яндекс.Картинки. и платёжной системой Яндекс. Деньги в 2002 году?", choices: ["Яндекс. Маркет", "Яндекс. Фотки", "Яндекс. Такси", "Яндекс. Доставка"], answer: "Яндекс. Маркет" },
    { question: "В 2003 году Яндекс выплатил своим акционерам первые дивиденды. Это было впервые не только в истории Яндекса, но и вообще в истории российского интернета. Какая была сумма дивидендов?", choices: ["10 тысяч долларов", "100 тысяч долларов", "1 миллион долларов", "640 тысяч долларов"], answer: "100 тысяч долларов" },
    { question: "В 2005 году Яндекс сделал первый шаг за пределы России. Компания открыла представительство и стала развивать сервисы для иностранной аудитории. О какой стране идёт речь?", choices: ["Казахстан", "Турция", "Украина", "Беларусь"], answer: "Украина" },
    { question: "Количество пользователей интернета в России приблизилось к 21 миллиону, месячная аудитория перевалила за 16 миллионов. Чуть больше половины пользователей (51%) обзавелись домашним интернетом. На Яндекс каждый день заглядывали примерно три миллиона человек. О каком времени идёт речь?", choices: ["1999", "2002", "2005", "1997"], answer: "2005" },
    { question: "В каком городе в 2006 году открылся первый удалённый офис разработки Яндекса?", choices: ["Москва", "Санкт-Петербург", "Сочи", "Паттайя"], answer: "Санкт-Петербург" },
    { question: "В каком городе открылся первый региональный коммерческий офис? Позже такие офисы появятся и в других регионах страны. Это позволяло быть ближе к клиентам. Задача коммерческих офисов — помогать местным рекламодателям в работе с продуктами Яндекса.", choices: ["Новосибирск", "Омск", "Екатеринбург", "Казань"], answer: "Екатеринбург" },
    { question: "В 2011 году Компания вышла за пределы постсоветского пространства. 20 сентября Яндекс открыл портал в новой стране. На нем представлены Поиск, Карты, Почта и другие сервисы для местных пользователей. Какая это страна?", choices: ["Израиль", "Франция", "Китай", "Турция"], answer: "Турция" }
  ]
};

// Для каждого игрока храним выбранную тему и массив вопросов этой темы
const playerTopics: Record<string, string> = {};
const playerQuestions: Record<string, { question: string; choices: string[]; answer: string }[]> = {};

// Для хранения использованных вопросов по каждой теме (по тексту вопроса)
const usedQuestionsByTopic: Record<string, Set<string>> = {};

// Для хранения вопросов из файлов для каждого игрока
const fileQuestions: Record<string, QuizQ[]> = {};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY);

type QuizQ = { question: string; choices: string[]; answer: string; type?: 'text' | 'image'; imageUrl?: string };

// Функции для обработки файлов
async function extractTextFromFile(filePath: string, mimeType: string): Promise<string> {
  try {
    console.log(`[extractTextFromFile] Обрабатываем файл: ${filePath}, тип: ${mimeType}`);
    
    if (mimeType === 'application/pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      console.log(`[extractTextFromFile] PDF извлечено ${data.text.length} символов`);
      return data.text;
    }
    
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ path: filePath });
      console.log(`[extractTextFromFile] DOCX извлечено ${result.value.length} символов`);
      return result.value;
    }
    
    if (mimeType === 'text/html') {
      const htmlContent = fs.readFileSync(filePath, 'utf8');
      const $ = cheerio.load(htmlContent);
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      console.log(`[extractTextFromFile] HTML извлечено ${text.length} символов`);
      return text;
    }
    
    if (mimeType === 'text/plain') {
      const text = fs.readFileSync(filePath, 'utf8');
      console.log(`[extractTextFromFile] TXT извлечено ${text.length} символов`);
      return text;
    }
    
    if (mimeType === 'application/msword') {
      // Для .doc файлов используем mammoth
      const result = await mammoth.extractRawText({ path: filePath });
      console.log(`[extractTextFromFile] DOC извлечено ${result.value.length} символов`);
      return result.value;
    }
    
    throw new Error(`Неподдерживаемый тип файла: ${mimeType}`);
  } catch (error) {
    console.error(`[extractTextFromFile] Ошибка при извлечении текста:`, error);
    throw error;
  }
}

async function generateQuestionsFromFileContent(content: string): Promise<QuizQ[]> {
  try {
    console.log(`[generateQuestionsFromFileContent] Генерируем вопросы из ${content.length} символов`);
    
    // Ограничиваем контент для GPT (примерно 3000 токенов для ускорения)
    const maxContentLength = 8000;
    const truncatedContent = content.length > maxContentLength 
      ? content.substring(0, maxContentLength) + '\n\n[Контент обрезан для оптимизации]'
      : content;
    
    const prompt = `Проанализируй следующий текст и создай 10 интересных вопросов с 4 вариантами ответов и правильным ответом. Вопросы должны быть разной сложности: от лёгких к сложным. Используй только информацию из текста.

Текст:
${truncatedContent}

Создай вопросы в формате JSON:
[
  {
    "question": "Вопрос на русском языке",
    "choices": ["Вариант A", "Вариант B", "Вариант C", "Вариант D"],
    "answer": "Правильный ответ (точно как в choices)"
  }
]

Вопросы должны быть разнообразными: фактические, аналитические, на понимание. Избегай слишком простых вопросов.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Ты эксперт по созданию образовательных вопросов. Создавай интересные и разнообразные вопросы на основе предоставленного контента."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.5,
      max_tokens: 1500
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('GPT не вернул ответ');
    }

    console.log(`[generateQuestionsFromFileContent] GPT ответ: ${responseText.substring(0, 200)}...`);

    // Парсим JSON ответ
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Не удалось найти JSON в ответе GPT');
    }

    const questions = JSON.parse(jsonMatch[0]);
    console.log(`[generateQuestionsFromFileContent] Создано ${questions.length} вопросов`);
    
    return questions.map((q: any) => ({
      question: q.question,
      choices: q.choices,
      answer: q.answer,
      type: 'text'
    }));
  } catch (error) {
    console.error(`[generateQuestionsFromFileContent] Ошибка:`, error);
    throw error;
  }
}

async function generateMovieImageQuestion(): Promise<QuizQ | null> {
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) {
    console.error('TMDB_API_KEY не найден! Добавьте его в apps/backend/.env');
    return {
      type: 'text',
      question: 'Внимание! Не настроен ключ TMDB_API_KEY для кино-вопросов. Обратитесь к администратору.',
      choices: ['-', '-', '-', '-'],
      answer: '-',
    };
  }
  try {
    // Получаем случайную страницу популярных фильмов
    const page = Math.floor(Math.random() * 10) + 1;
    console.log(`[generateMovieImageQuestion] Запрашиваем страницу ${page} популярных фильмов...`);
    
    const moviesResp = await axios.get(`https://api.themoviedb.org/3/movie/popular?api_key=${tmdbKey}&language=ru-RU&page=${page}`, {
      timeout: 15000,
      headers: {
        'User-Agent': 'QuizApp/1.0'
      }
    });
    
    console.log(`[generateMovieImageQuestion] Получено ${moviesResp.data.results?.length || 0} фильмов`);
    const movies = moviesResp.data.results;
    if (!movies || movies.length < 4) {
      console.log('[generateMovieImageQuestion] Недостаточно фильмов для создания вопроса');
      return null;
    }
    
    // Выбираем 4 случайных фильма
    const shuffled = movies.sort(() => 0.5 - Math.random());
    const correct = shuffled[0];
    const choices = shuffled.slice(0, 4).map((m: any) => m.title);
    
    // Берём backdrop или постер
    const imageUrl = correct.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${correct.backdrop_path}`
      : correct.poster_path
      ? `https://image.tmdb.org/t/p/w500${correct.poster_path}`
      : undefined;
      
    if (!imageUrl) {
      console.log('[generateMovieImageQuestion] Нет изображения для фильма:', correct.title);
      return null;
    }
    
    console.log(`[generateMovieImageQuestion] Создан вопрос для фильма: ${correct.title}`);
    return {
      type: 'image',
      question: 'Какой фильм изображён на этом кадре?',
      imageUrl,
      choices,
      answer: correct.title,
    };
  } catch (e: any) {
    console.error('TMDB error:', e);
    console.error('TMDB error details:', {
      code: e.code,
      message: e.message,
      status: e.response?.status,
      statusText: e.response?.statusText
    });
    return {
      type: 'text',
      question: 'Ошибка при обращении к TMDB. Проверьте интернет или лимиты API.',
      choices: ['-', '-', '-', '-'],
      answer: '-',
    };
  }
}

async function generateQuestionsForTopic(topic: string): Promise<QuizQ[]> {
  if (!topic || typeof topic !== 'string') return [];
  
  // Для темы "Игра по файлу" - возвращаем пустой массив, так как вопросы будут загружены через файл
  if (topic === 'Игра по файлу') {
    console.log('[generateQuestionsForTopic] Игра по файлу: возвращаем пустой массив');
    return [];
  }
  
  if (topic.toLowerCase().includes('кино') || topic.toLowerCase().includes('фильм')) {
    // Для темы "Кино" — 10 вопросов с кадрами
    const questions: QuizQ[] = [];
    let attempts = 0;
    while (questions.length < 10 && attempts < 20) {
      attempts++;
      const q = await generateMovieImageQuestion();
      if (q && !questions.some(qq => qq.imageUrl === q.imageUrl)) {
        questions.push(q);
      }
    }
    console.log('[generateQuestionsForTopic] Кино: сгенерировано вопросов:', questions.length, questions.map(q => q.question));
    return questions;
  }
  const prompt = (n: number) => `Сгенерируй ${n} уникальных вопросов с 4 вариантами ответов и правильным ответом по теме "${topic}" на русском языке. Формат:\n[\n  {\"question\": \"...\", \"choices\": [\"...\", \"...\", \"...\", \"...\"], \"answer\": \"...\"},\n  ...\n]`;
  if (!usedQuestionsByTopic[topic]) usedQuestionsByTopic[topic] = new Set();
  let uniqueQuestions: QuizQ[] = [];
  let attempts = 0;
  const needed = 10;
  while (uniqueQuestions.length < needed && attempts < 10) {
    attempts++;
    try {
      console.log('OpenAI PROMPT:', prompt(15));
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Ты помощник для создания викторин.' },
          { role: 'user', content: prompt(15) }
        ],
        temperature: 0.7,
        max_tokens: 1200
      });
      const text = completion.choices[0].message?.content || '';
      console.log('OpenAI RAW RESPONSE:', text);
      const match = text.match(/\[.*\]/s);
      const json = match ? match[0] : text;
      console.log('Extracted JSON:', json);
      let questions: QuizQ[];
      try {
        questions = JSON.parse(json);
      } catch (parseErr) {
        console.error('Ошибка парсинга JSON:', parseErr, '\nJSON:', json);
        continue;
      }
      // Фильтрация уже использованных и уже выбранных вопросов
      const filtered = questions.filter(q => !usedQuestionsByTopic[topic].has(q.question) && !uniqueQuestions.some(uq => uq.question === q.question));
      uniqueQuestions = uniqueQuestions.concat(filtered);
    } catch (e) {
      console.error('Ошибка генерации вопросов:', e);
      break;
    }
  }
  // Если после всех попыток вопросов всё равно меньше 10 — дозапрашиваем недостающие
  while (uniqueQuestions.length < needed && attempts < 15) {
    attempts++;
    try {
      const left = needed - uniqueQuestions.length;
      console.log('OpenAI PROMPT (extra):', prompt(left));
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Ты помощник для создания викторин.' },
          { role: 'user', content: prompt(left) }
        ],
        temperature: 0.7,
        max_tokens: 1200
      });
      const text = completion.choices[0].message?.content || '';
      const match = text.match(/\[.*\]/s);
      const json = match ? match[0] : text;
      let questions: QuizQ[];
      try {
        questions = JSON.parse(json);
      } catch (parseErr) {
        console.error('Ошибка парсинга JSON (extra):', parseErr, '\nJSON:', json);
        continue;
      }
      const filtered = questions.filter(q => !usedQuestionsByTopic[topic].has(q.question) && !uniqueQuestions.some(uq => uq.question === q.question));
      uniqueQuestions = uniqueQuestions.concat(filtered);
    } catch (e) {
      console.error('Ошибка генерации вопросов (extra):', e);
      break;
    }
  }
  // Если удалось получить хотя бы 1 вопрос — возвращаем их
  if (uniqueQuestions.length === 0) return [];
  uniqueQuestions.slice(0, needed).forEach(q => usedQuestionsByTopic[topic].add(q.question));
  return uniqueQuestions.slice(0, needed);
}

function getRandomUnseenQuestionIndex(seen: Set<number>, questions: { question: string; choices: string[]; answer: string }[]) {
  const unseen = questions.map((_, idx) => idx).filter(idx => !seen.has(idx));
  if (unseen.length === 0) return null;
  const randIdx = Math.floor(Math.random() * unseen.length);
  return unseen[randIdx];
}

// ====== МУЛЬТИПЛЕЕРНЫЕ КОМНАТЫ И ЧАТ ======
// Структура комнат: { [roomCode]: { players: string[], started: boolean, topic: string, questions: QuizQ[], scores: Record<string, number>, seenQuestions: Record<string, Set<number>>, currentQuestions: Record<string, number>, playerNames: Record<string, string>, chat: { name: string, message: string, time: number }[] } }
// В структуру комнаты добавляю: currentQuestionIndex, answered, timer
const rooms: Record<string, {
  players: string[],
  started: boolean,
  topic: string,
  questions: QuizQ[],
  scores: Record<string, number>,
  seenQuestions: Record<string, Set<number>>,
  currentQuestions: Record<string, number>,
  playerNames: Record<string, string>,
  playerAvatars: Record<string, string>, // <--- новое поле
  chat: { name: string, message: string, time: number }[],
  interactions: { from: string, to: string, type: string, time: number }[], // <--- новое поле
  currentQuestionIndex?: number,
  answered?: Set<string>,
  timer?: NodeJS.Timeout | null,
  ready?: Record<string, boolean>,
  playerAnswers?: Record<string, string>, // Добавляем для хранения ответов игроков
}> = {};

function generateRoomCode(length = 6) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

io.on('connection', (socket: Socket) => {
  console.log('A user connected:', socket.id);
  scores[socket.id] = 0;
  seenQuestions[socket.id] = new Set();



  // ВОССТАНАВЛИВАЮ ОБРАБОТЧИК ОДИНОЧНОЙ ИГРЫ
  socket.on('startGame', async (data: { name: string; topic: string }) => {
    try {
      console.log('[startGame SINGLE] socket.id:', socket.id, 'topic:', data.topic);
      playerNames[socket.id] = data.name;
      playerTopics[socket.id] = data.topic;
      let questions = quizTopics[data.topic] || [];
      
      // Для темы "Игра по файлу" используем сохранённые вопросы из файла
      if (data.topic === 'Игра по файлу') {
        questions = fileQuestions[socket.id] || [];
        if (questions.length === 0) {
          socket.emit('quizQuestion', { 
            question: 'Сначала загрузите файл для создания вопросов.', 
            choices: [], 
            number: 1, 
            total: 1 
          });
          return;
        }
      } else {
        // Если нет вопросов по теме — генерируем через OpenAI
        if (questions.length === 0) {
          if (!process.env.OPENAI_API_KEY) {
            console.error('ОШИБКА: OPENAI_API_KEY не найден! Добавьте ключ в apps/backend/.env');
            socket.emit('quizQuestion', { question: 'Ошибка: отсутствует ключ OpenAI на сервере. Обратитесь к администратору.', choices: [], number: 1, total: 1 });
            return;
          }
          try {
            questions = await generateQuestionsForTopic(data.topic);
            console.log('[startGame SINGLE] после генерации:', questions.length, questions.map(q => q.question));
          } catch (err) {
            console.error('Ошибка генерации вопросов через OpenAI:', err);
            socket.emit('quizQuestion', { question: 'Ошибка генерации вопросов через OpenAI: ' + (err instanceof Error ? err.message : String(err)), choices: [], number: 1, total: 1 });
            return;
          }
          quizTopics[data.topic] = questions;
        }
      }
      playerQuestions[socket.id] = questions;
      seenQuestions[socket.id] = new Set();
      scores[socket.id] = 0;
      if (questions.length === 0) {
        socket.emit('quizQuestion', { question: 'Нет вопросов по выбранной теме.', choices: [], number: 1, total: 1 });
        return;
      }
      const qIdx = getRandomUnseenQuestionIndex(seenQuestions[socket.id], questions);
      if (qIdx !== null) {
        currentQuestions[socket.id] = qIdx;
        seenQuestions[socket.id].add(qIdx);
        const q = questions[qIdx];
        socket.emit('quizQuestion', {
          ...q,
          number: seenQuestions[socket.id].size,
          total: questions.length
        });
        console.log(`Sent quizQuestion #${seenQuestions[socket.id].size} to ${socket.id}:`, q);
      }
      // Добавить новые вопросы в usedQuestionsByTopic
      if (!usedQuestionsByTopic[data.topic]) usedQuestionsByTopic[data.topic] = new Set();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      questions.forEach((q: QuizQ) => usedQuestionsByTopic[data.topic].add(q.question));
    } catch (err) {
      console.error('Ошибка в startGame:', err);
      socket.emit('quizQuestion', { question: 'Произошла ошибка на сервере. Попробуйте другую тему или позже. ' + (err instanceof Error ? err.message : String(err)), choices: [], number: 1, total: 1 });
    }
  });

  // Обработчик для загрузки файла и генерации вопросов
    socket.on('uploadFileForQuestions', async (data: { file: any; name: string }) => {
    console.log(`[uploadFileForQuestions] === НАЧАЛО ОБРАБОТКИ ===`);
    console.log(`[uploadFileForQuestions] Запрос от ${socket.id}, имя: ${data.name}`);
    console.log(`[uploadFileForQuestions] Размер файла: ${data.file.data?.length || 0} байт`);
    console.log(`[uploadFileForQuestions] Тип файла: ${data.file.mimetype}`);
    console.log(`[uploadFileForQuestions] Имя файла: ${data.file.name}`);
    
    try {
      
      // Отправляем подтверждение начала обработки
      socket.emit('fileProcessingStatus', { 
        status: 'processing', 
        message: 'Файл получен. Начинаем обработку...' 
      });

      // Создаем временный файл из данных
      const uploadDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const fileName = `file-${Date.now()}-${Math.round(Math.random() * 1E9)}.tmp`;
      const filePath = path.join(uploadDir, fileName);
      
      // Сохраняем файл
      fs.writeFileSync(filePath, Buffer.from(data.file.data));
      
      try {
        // Извлекаем текст из файла
        socket.emit('fileProcessingStatus', { 
          status: 'processing', 
          message: 'Извлекаем текст из файла...' 
        });
        
        const content = await extractTextFromFile(filePath, data.file.mimetype);
        
        if (!content || content.trim().length < 100) {
          throw new Error('Файл содержит слишком мало текста для создания вопросов');
        }

        // Генерируем вопросы с помощью GPT
        socket.emit('fileProcessingStatus', { 
          status: 'processing', 
          message: 'Создаём вопросы с помощью AI...' 
        });
        
        const questions = await generateQuestionsFromFileContent(content);
        
        if (!questions || questions.length === 0) {
          throw new Error('Не удалось сгенерировать вопросы из файла');
        }

        // Сохраняем вопросы для этого игрока
        fileQuestions[socket.id] = questions;
        playerTopics[socket.id] = 'Игра по файлу';
        playerQuestions[socket.id] = questions;
        seenQuestions[socket.id] = new Set();
        scores[socket.id] = 0;

        // Отправляем статус успешной обработки
        socket.emit('fileProcessingStatus', { 
          status: 'success', 
          message: `Создано ${questions.length} вопросов из файла "${data.file.name}"`,
          questions: questions
        });

        console.log(`[uploadFileForQuestions] Успешно создано ${questions.length} вопросов для ${socket.id}`);

      } finally {
        // Удаляем временный файл
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

    } catch (error: any) {
      console.error(`[uploadFileForQuestions] Ошибка:`, error);
      socket.emit('fileProcessingStatus', { 
        status: 'error', 
        message: error.message || 'Ошибка при обработке файла' 
      });
    }
  });

  socket.on('submitAnswer', (data: { answer: string; name: string; code?: string }) => {
    // Проверяем, есть ли code - если есть, это мультиплеер, пропускаем
    if (data.code) {
      return; // Мультиплеер обрабатывается в другом обработчике
    }
    
    const questions = playerQuestions[socket.id] || [];
    const qIdx = currentQuestions[socket.id];
    const quizQuestion = questions[qIdx];
    
    // Проверяем, не истекло ли время
    const isTimeExpired = data.answer === 'TIME_EXPIRED';
    const isCorrect = isTimeExpired ? false : (quizQuestion && data.answer === quizQuestion.answer);
    
    if (isCorrect) {
      scores[socket.id] = (scores[socket.id] || 0) + 1;
    }
    
    socket.emit('answerResult', {
      correct: !!isCorrect,
      score: scores[socket.id] || 0
    });
    console.log(`[submitAnswer SINGLE] Sent answerResult to ${socket.id}:`, { correct: !!isCorrect, score: scores[socket.id] || 0, timeExpired: isTimeExpired });
    
    // If player has answered all questions, end the game
    if (seenQuestions[socket.id].size >= questions.length) {
      const name = playerNames[socket.id] || data.name || 'Игрок';
      leaderboard = [
        ...leaderboard.filter(entry => entry.name !== name),
        { name, score: scores[socket.id] }
      ]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // top-10
      io.emit('leaderboard', leaderboard);
      socket.emit('gameOver', { score: scores[socket.id], total: questions.length });
      return;
    }
    
    // Добавляем задержку, чтобы игрок успел увидеть результат
    setTimeout(() => {
      // Send a new random, not-yet-seen question
      const newQIdx = getRandomUnseenQuestionIndex(seenQuestions[socket.id], questions);
      if (newQIdx !== null) {
        currentQuestions[socket.id] = newQIdx;
        seenQuestions[socket.id].add(newQIdx);
        const q = questions[newQIdx];
        socket.emit('quizQuestion', {
          ...q,
          number: seenQuestions[socket.id].size,
          total: questions.length
        });
        console.log(`Sent quizQuestion #${seenQuestions[socket.id].size} to ${socket.id}:`, q);
      }
    }, 2000); // 2 секунды задержки
  });

  socket.on('restartGame', async (data: { name: string; topic: string }) => {
    scores[socket.id] = 0;
    seenQuestions[socket.id] = new Set();
    playerNames[socket.id] = data.name;
    playerTopics[socket.id] = data.topic;
    let questions = quizTopics[data.topic] || [];
    if (questions.length === 0) {
      questions = await generateQuestionsForTopic(data.topic);
      quizTopics[data.topic] = questions;
    }
    playerQuestions[socket.id] = questions;
    if (questions.length === 0) {
      socket.emit('quizQuestion', { question: 'Нет вопросов по выбранной теме.', choices: [], number: 1, total: 1 });
      return;
    }
    const qIdx = getRandomUnseenQuestionIndex(seenQuestions[socket.id], questions);
    if (qIdx !== null) {
      currentQuestions[socket.id] = qIdx;
      seenQuestions[socket.id].add(qIdx);
      const q = questions[qIdx];
      socket.emit('quizQuestion', {
        ...q,
        number: seenQuestions[socket.id].size,
        total: questions.length
      });
      console.log(`(RESTART) Sent quizQuestion #${seenQuestions[socket.id].size} to ${socket.id}:`, q);
    }
    // Добавить новые вопросы в usedQuestionsByTopic
    if (!usedQuestionsByTopic[data.topic]) usedQuestionsByTopic[data.topic] = new Set();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    questions.forEach((q: QuizQ) => usedQuestionsByTopic[data.topic].add(q.question));
  });

  // Создать комнату
  socket.on('createRoom', (data: { name: string; topic: string; avatar: string }, cb) => {
    // Проверяем лимит комнат (максимум 8)
    if (Object.keys(rooms).length >= 8) {
      cb({ error: 'Достигнут лимит комнат (8). Попробуйте позже.' });
      return;
    }
    
    let code;
    do { code = generateRoomCode(); } while (rooms[code]);
    rooms[code] = {
      players: [socket.id],
      started: false,
      topic: data.topic,
      questions: [],
      scores: { [socket.id]: 0 },
      seenQuestions: { [socket.id]: new Set() },
      currentQuestions: {},
      playerNames: { [socket.id]: data.name },
      playerAvatars: { [socket.id]: data.avatar },
      chat: [],
      interactions: [],
      ready: { [socket.id]: false },
    };
    socket.join(code);
    cb({ code });
  });

  // Присоединиться к комнате
  socket.on('joinRoom', async (data: { code: string; name: string; avatar: string }, cb) => {
    const room = rooms[data.code];
    if (!room || room.started) {
      cb({ error: 'Комната не найдена или уже начата' });
      return;
    }
    
    // Проверяем лимит игроков в комнате (максимум 8)
    if (room.players.length >= 8) {
      cb({ error: 'Комната заполнена (максимум 8 игроков)' });
      return;
    }
    room.players.push(socket.id);
    room.scores[socket.id] = 0;
    room.seenQuestions[socket.id] = new Set();
    room.playerNames[socket.id] = data.name;
    room.playerAvatars[socket.id] = data.avatar; // <---
    if (!room.ready) room.ready = {};
    room.ready[socket.id] = false;
    // socket.join не поддерживает callback в socket.io v4+, поэтому используем await (если поддерживается)
    if (socket.join.length === 1) {
      // async/await join
      await socket.join(data.code);
      cb({ success: true, topic: room.topic });
      io.to(data.code).emit('playersUpdate', {
        players: room.players.map(id => ({
          id,
          name: room.playerNames[id],
          avatar: room.playerAvatars[id],
          answered: !!room.answered?.has(id)
        }))
      });
    } else {
      // fallback: последовательный вызов
      socket.join(data.code);
      cb({ success: true, topic: room.topic });
      io.to(data.code).emit('playersUpdate', {
        players: room.players.map(id => ({
          id,
          name: room.playerNames[id],
          avatar: room.playerAvatars[id],
          answered: !!room.answered?.has(id)
        }))
      });
    }
  });

  // Новый обработчик: игрок готов
  socket.on('readyToStart', (data: { code: string }, cb) => {
    const room = rooms[data.code];
    if (!room) return;
    if (!room.ready) room.ready = {};
    room.ready[socket.id] = true;
    io.to(data.code).emit('readyUpdate', { ready: room.ready });
    cb && cb({ success: true });
  });

  // Старт игры в комнате
  socket.on('startGame', async (data: { code: string }, cb) => {
    const room = rooms[data.code];
    if (!room || room.started) {
      cb && cb({ error: 'Комната не найдена или уже начата' });
      return;
    }
    if (!room.ready) room.ready = {};
    if (room.players.some(id => !room.ready![id])) {
      cb && cb({ error: 'Не все игроки готовы!' });
      return;
    }
    console.log('[startGame MULTI] room.code:', data.code, 'topic:', room.topic);
    if (!room.topic || typeof room.topic !== 'string' || !room.topic.trim()) {
      cb && cb({ error: 'Не выбрана тема для игры. Попробуйте ещё раз.' });
      room.started = false;
      return;
    }
    room.started = true;
    let questions = quizTopics[room.topic] || [];
    
    // Для темы "Игра по файлу" используем вопросы из файла хоста
    if (room.topic === 'Игра по файлу') {
      const hostId = room.players[0]; // Первый игрок - хост
      questions = fileQuestions[hostId] || [];
      if (questions.length === 0) {
        cb && cb({ error: 'Хост не загрузил файл. Попросите хоста загрузить файл перед началом игры.' });
        room.started = false;
        return;
      }
    } else if (questions.length === 0) {
      questions = await generateQuestionsForTopic(room.topic);
      quizTopics[room.topic] = questions;
      console.log('[startGame MULTI] после генерации:', questions.length, questions.map(q => q.question));
    }
    if (questions.length === 0) {
      cb && cb({ error: 'Не удалось сгенерировать вопросы по выбранной теме. Попробуйте другую тему.' });
      room.started = false;
      return;
    }
    room.questions = questions;
    room.scores = {};
    room.currentQuestionIndex = 0;
    room.answered = new Set();
    room.players.forEach(id => {
      room.scores[id] = 0;
      room.seenQuestions[id] = new Set();
    });
    sendSynchronizedQuestion(data.code);
    io.to(data.code).emit('playersUpdate', {
      players: room.players.map(id => ({
        id,
        name: room.playerNames[id],
        avatar: room.playerAvatars[id],
        answered: !!room.answered?.has(id)
      }))
    });
    cb && cb({ success: true });
  });

  function sendSynchronizedQuestion(code: string) {
    const room = rooms[code];
    if (!room) return;
    const idx = room.currentQuestionIndex ?? 0;
    if (idx >= room.questions.length) {
      // Игра окончена для всех
      room.players.forEach(id => {
        io.to(id).emit('gameOver', { score: room.scores[id], total: room.questions.length });
      });
      const leaderboard = room.players.map(pid => ({ name: room.playerNames[pid], score: room.scores[pid] || 0 }))
        .sort((a, b) => b.score - a.score);
      io.to(code).emit('leaderboard', leaderboard);
      room.started = false;
      if (room.timer) clearTimeout(room.timer);
      return;
    }
    room.answered = new Set();
    // Отправить вопрос всем
    const q = room.questions[idx];
    console.log(`[sendSynchronizedQuestion] code: ${code}, idx: ${idx}, question: ${q.question}`);
    console.log(`[sendSynchronizedQuestion] players:`, room.players.map(id => ({ id, name: room.playerNames[id] })));
    room.players.forEach(id => {
      console.log('[sendSynchronizedQuestion][to player]', id, { ...q, number: idx + 1, total: room.questions.length });
      io.to(id).emit('quizQuestion', { ...q, number: idx + 1, total: room.questions.length });
    });
    // Лидерборд
    const leaderboard = room.players.map(pid => ({ name: room.playerNames[pid], score: room.scores[pid] || 0 }))
      .sort((a, b) => b.score - a.score);
    io.to(code).emit('leaderboard', leaderboard);
    // Таймер запускается только один раз на вопрос
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => {
      // Всем неответившим отправить answerResult (пропуск)
      room.players.forEach(id => {
        if (!room.answered?.has(id)) {
          io.to(id).emit('answerResult', { correct: false, score: room.scores[id] || 0 });
        }
      });
      // После таймаута — переход к следующему вопросу для всех
      room.currentQuestionIndex = (room.currentQuestionIndex ?? 0) + 1;
      sendSynchronizedQuestion(code);
    }, 15000);
  }

  // submitAnswer теперь учитывает синхронизацию
  socket.on('submitAnswer', (data: { code: string; answer: string }, cb) => {
    console.log('[submitAnswer MULTI] received:', data, 'from:', socket.id);
    const room = rooms[data.code];
    if (!room || !room.started) {
      console.log('[submitAnswer MULTI] room not found or not started');
      return;
    }
    const id = socket.id;
    const idx = room.currentQuestionIndex ?? 0;
    const quizQuestion = room.questions[idx];
    if (!quizQuestion || room.answered?.has(id)) {
      console.log('[submitAnswer MULTI] no question or already answered');
      return;
    }
    
    // Сохраняем ответ игрока для определения правильности позже
    if (!room.playerAnswers) room.playerAnswers = {};
    room.playerAnswers[id] = data.answer;
    
    const isCorrect = quizQuestion && data.answer === quizQuestion.answer;
    if (isCorrect) room.scores[id] = (room.scores[id] || 0) + 1;
    room.answered?.add(id);
    
    console.log('[submitAnswer MULTI] sending received confirmation to:', id);
    // Отправляем только подтверждение получения ответа (БЕЗ результата!)
    cb && cb({ received: true, score: room.scores[id] || 0 });
    
    // Отправляем обновление состояния игроков
    io.to(data.code).emit('playersUpdate', {
      players: room.players.map(pid => ({
        id: pid,
        name: room.playerNames[pid],
        avatar: room.playerAvatars[pid],
        answered: !!room.answered?.has(pid)
      }))
    });
    
    console.log('[submitAnswer MULTI] answered size:', room.answered?.size, 'players length:', room.players.length);
    // Если все ответили — показываем результаты всем и переходим к следующему вопросу
    if (room.answered?.size === room.players.length) {
      console.log('[submitAnswer MULTI] all players answered, showing results');
      if (room.timer) clearTimeout(room.timer);
      
      // Показываем результаты всем игрокам с правильными ответами
      room.players.forEach(pid => {
        const playerScore = room.scores[pid] || 0;
        const playerAnswer = room.playerAnswers?.[pid];
        const playerCorrect = playerAnswer && quizQuestion && playerAnswer === quizQuestion.answer;
        
        console.log('[submitAnswer MULTI] sending answerResult to:', pid, 'correct:', !!playerCorrect);
        io.to(pid).emit('answerResult', { 
          correct: !!playerCorrect,
          score: playerScore 
        });
      });
      
      // Очищаем ответы для следующего вопроса
      room.playerAnswers = {};
      
      // Задержка перед следующим вопросом
      setTimeout(() => {
        room.currentQuestionIndex = (room.currentQuestionIndex ?? 0) + 1;
        sendSynchronizedQuestion(data.code);
      }, 2000); // 2 секунды задержки
    } else {
      console.log('[submitAnswer MULTI] waiting for more players to answer');
    }
  });

  // Чат: отправка сообщения
  socket.on('sendMessage', (data: { code: string; message: string }, cb) => {
    const room = rooms[data.code];
    if (!room) return;
    const name = room.playerNames[socket.id] || 'Игрок';
    const msg = { name, message: data.message, time: Date.now() };
    room.chat.push(msg);
    io.to(data.code).emit('chatMessage', msg);
    cb && cb({ success: true });
  });

  // Взаимодействия между игроками
  // Новое событие: playerInteraction
  socket.on('playerInteraction', (data: { code: string; to: string; type: string }, cb) => {
    console.log('[SERVER] playerInteraction received:', data, '| from:', socket.id);
    const room = rooms[data.code];
    if (!room) {
      console.log('[SERVER] playerInteraction: room not found', data.code);
      return;
    }
    const from = socket.id;
    const interaction = { from, to: data.to, type: data.type, time: Date.now() };
    room.interactions.push(interaction);
    console.log('[SERVER] room.players:', room.players);
    console.log('[SERVER] room.playerNames:', room.playerNames);
    console.log('[SERVER] Emitting playerInteraction to room:', data.code, 'interaction:', interaction);
    io.to(data.code).emit('playerInteraction', interaction);
    cb && cb({ success: true });
  });

  // Отключение игрока
  socket.on('disconnect', () => {
    delete scores[socket.id];
    delete seenQuestions[socket.id];
    delete currentQuestions[socket.id];
    delete playerNames[socket.id];
    delete playerTopics[socket.id];
    delete playerQuestions[socket.id];
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.indexOf(socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        delete room.scores[socket.id];
        delete room.seenQuestions[socket.id];
        delete room.currentQuestions[socket.id];
        delete room.playerNames[socket.id];
        delete room.playerAvatars[socket.id]; // <---
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          io.to(code).emit('playersUpdate', {
            players: room.players.map(id => ({
              id,
              name: room.playerNames[id],
              avatar: room.playerAvatars[id],
              answered: !!room.answered?.has(id)
            }))
          });
        }
      }
    }
  });
});

// Use environment port or default to 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 