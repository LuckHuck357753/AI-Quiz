import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import AvatarPicker from './AvatarPicker';
import OvalTable, { OvalTablePlayer } from './OvalTable';

console.log('[frontend] socket.id при инициализации:', io().id);

const socket: Socket = io({
  timeout: 20000,
  transports: ['websocket', 'polling'],
  upgrade: true,
  rememberUpgrade: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000
});

type QuizQuestion = {
  question: string;
  choices: string[];
  number?: number;
  total?: number;
  imageUrl?: string;
};

type AnswerResult = {
  correct: boolean;
  score: number;
};

type GameOver = {
  score: number;
  total: number;
};

// ДОБАВЛЯЕМ МУЛЬТИПЛЕЕРНЫЕ СОСТОЯНИЯ

type RoomState =
  | { mode: 'init' }
  | { mode: 'creating'; name: string; topic: string }
  | { mode: 'joining'; name: string; code: string }
  | { mode: 'waiting'; code: string; players: any[]; isHost: boolean; topic: string }
  | { mode: 'playing'; code: string; players: any[]; isHost: boolean; topic: string }
  | { mode: 'gameover'; code: string; players: any[]; isHost: boolean; topic: string };

// ДОБАВЛЯЮ ВЫБОР РЕЖИМА (single/multi)
type MainMode = 'select' | 'single' | 'multi';

function App() {
  const [connected, setConnected] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestion | null>(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<null | { correct: boolean }>(null);
  const [questionNumber, setQuestionNumber] = useState<number>(1);
  const [totalQuestions, setTotalQuestions] = useState<number>(10);
  const [gameOver, setGameOver] = useState<null | GameOver>(null);
  const [name, setName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [started, setStarted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([]);
  const [buttonsDisabled, setButtonsDisabled] = useState(false);
  const nextQuestionTimeout = useRef<NodeJS.Timeout | null>(null);
  const [topic, setTopic] = useState('');
  const [topicMode, setTopicMode] = useState<'movie' | 'custom'>('custom');
  const topics = [
    'Яндекс',
    'Игра по файлу',
  ];
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [avatar, setAvatar] = useState('');

  // Мультиплеерные состояния
  const [roomState, setRoomState] = useState<RoomState>({ mode: 'init' });
  const [roomCode, setRoomCode] = useState('');
  const [roomPlayers, setRoomPlayers] = useState<any[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [chat, setChat] = useState<{ name: string; message: string; time: number }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatScrollRef] = useState(() => React.createRef<HTMLDivElement>());

  // ДОБАВЛЯЮ ВЫБОР РЕЖИМА (single/multi)
  const [mainMode, setMainMode] = useState<MainMode>('select');
  const mainModeRef = useRef(mainMode);
  useEffect(() => {
    mainModeRef.current = mainMode;
  }, [mainMode]);

  // Состояния для аутентификации
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const roomStateRef = useRef(roomState);
  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  // ДОБАВЛЯЮ ХУКИ ДЛЯ ТАЙМЕРА МУЛЬТИПЛЕЕРА НА ВЕРХНИЙ УРОВЕНЬ
  const [multiTimer, setMultiTimer] = useState(15);
  // Таймер теперь управляется только сервером: setMultiTimer(15) вызывается только при получении quizQuestion

  // Таймер для одиночной игры
  const [singleTimer, setSingleTimer] = useState(15);
  const singleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Добавляю состояние готовности игроков
  const [readyState, setReadyState] = useState<Record<string, boolean>>({});
  const [isReady, setIsReady] = useState(false);

  // Состояние для отслеживания ответа в мультиплеере
  const [hasAnswered, setHasAnswered] = useState(false);

  // Состояния для работы с файлами
  const [fileUploadStatus, setFileUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [fileUploadMessage, setFileUploadMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [processingProgress, setProcessingProgress] = useState<number>(0);

  // Таймер для одиночной игры - обновление каждую секунду
  useEffect(() => {
    if (mainMode === 'single' && quiz && !gameOver && singleTimer > 0 && !buttonsDisabled) {
      const interval = setInterval(() => {
        setSingleTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            // Когда таймер достигает 0, автоматически отправляем неправильный ответ
            setTimeout(() => {
              if (mainMode === 'single' && quiz && !buttonsDisabled) {
                console.log('[singleTimer] Time expired (from useEffect), sending wrong answer');
                setButtonsDisabled(true);
                socket.emit('submitAnswer', { answer: 'TIME_EXPIRED', name });
              }
            }, 100); // Небольшая задержка для корректного обновления состояния
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [mainMode, quiz, gameOver, singleTimer, buttonsDisabled]);

  // Таймер для мультиплеера - обновление каждую секунду
  useEffect(() => {
    if (mainMode === 'multi' && roomState.mode === 'playing' && quiz && multiTimer > 0 && !buttonsDisabled) {
      const interval = setInterval(() => {
        setMultiTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            // Когда таймер достигает 0, автоматически отправляем неправильный ответ
            setTimeout(() => {
              if (mainMode === 'multi' && roomState.mode === 'playing' && quiz && !buttonsDisabled && 'code' in roomState) {
                console.log('[multiTimer] Time expired (from useEffect), sending wrong answer');
                setButtonsDisabled(true);
                setHasAnswered(true);
                socket.emit('submitAnswer', { code: roomState.code, answer: 'TIME_EXPIRED' }, (result: { received?: boolean; correct?: boolean; score: number }) => {
                  if (result.received) {
                    setScore(result.score);
                  }
                });
              }
            }, 100); // Небольшая задержка для корректного обновления состояния
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [mainMode, roomState, quiz, multiTimer, buttonsDisabled]);

  useEffect(() => {
    function onReadyUpdate(data: { ready: Record<string, boolean> }) {
      setReadyState(data.ready);
      console.log('[frontend][readyUpdate] readyState:', data.ready);
    }
    socket.on('readyUpdate', onReadyUpdate);
    return () => { socket.off('readyUpdate', onReadyUpdate); };
  }, []);

  useEffect(() => {
    function onPlayersUpdate(data: { players: any[] }) {
      setRoomPlayers(data.players);
      console.log('[frontend][playersUpdate] roomPlayers:', data.players);
    }
    socket.on('playersUpdate', onPlayersUpdate);
    return () => { socket.off('playersUpdate', onPlayersUpdate); };
  }, []);

  useEffect(() => {
    function onChatMessage(msg: { name: string; message: string; time: number }) {
      setChat(prev => [...prev, msg]);
      console.log('[frontend][chatMessage] received:', msg);
    }
    socket.on('chatMessage', onChatMessage);
    return () => { socket.off('chatMessage', onChatMessage); };
  }, []);

  // --- Emoji chat block (обязательно внутри App!) ---
  const emojiList = [
    '😀','😁','😂','🤣','😅','😊','😍','😘','😎','😜','🤔','😇','😱','🥳','👍','👏','🙏','🔥','💯','🎉','🥲','😏','😢','😭','😡','🤡','🤖','👻','💩','🙈','🙉','🙊'
  ];
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  // --- GIF chat block ---
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState<{url: string, preview: string}[]>([]);
  const gifPickerRef = useRef<HTMLDivElement>(null);
  const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY;
  useEffect(() => {
    if (!showGifPicker || !gifSearch.trim()) return;
    const controller = new AbortController();
    console.log('GIPHY_API_KEY:', GIPHY_API_KEY); // debug
    fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(gifSearch)}&limit=16&rating=pg`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        setGifResults((data.data || []).map((g: any) => ({ url: g.images.original.url, preview: g.images.fixed_height_small.url })));
      });
    return () => controller.abort();
  }, [showGifPicker, gifSearch]);
  // Закрытие emoji/gif picker при клике вне
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (showGifPicker && gifPickerRef.current && !gifPickerRef.current.contains(e.target as Node)) {
        setShowGifPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showEmojiPicker, showGifPicker]);
  // --- End emoji block ---

  // --- Emoji взаимодействий ---
  const INTERACTION_EMOJI: Record<string, string> = {
    flowers: '💐',
    tomato: '🍅',
    respect: '🤝',
    cocktail: '🍸',
    tease: '😜',
  };
  const INTERACTION_LABEL: Record<string, string> = {
    flowers: 'Цветы',
    tomato: 'Помидор',
    respect: 'Респект',
    cocktail: 'Коктейль',
    tease: 'Подразнил',
  };
  const [activeInteraction, setActiveInteraction] = useState<null | {
    from: string;
    to: string;
    type: string;
    time: number;
  }>(null);
  // Функция для генерации цвета по id
  function getColorById(id: string) {
    // Палитра из 10 ярких цветов
    const palette = [
      '#e57373', // красный
      '#64b5f6', // синий
      '#81c784', // зелёный
      '#ffd54f', // жёлтый
      '#ba68c8', // фиолетовый
      '#4dd0e1', // бирюзовый
      '#ffb74d', // оранжевый
      '#a1887f', // коричневый
      '#90a4ae', // серо-голубой
      '#f06292', // розовый
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  }
  const [interactionToast, setInteractionToast] = useState<null | { fromName: string; toName: string; type: string; fromId?: string; toId?: string }>(null);
  function getAvatarCoords(id: string, players: any[]) {
    const idx = players.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const n = players.length;
    const width = 510, height = 300, rx = width / 2 - 40, ry = height / 2 - 40;
    const centerX = width / 2, centerY = height / 2;
    const angle = -Math.PI / 2 + idx * ((2 * Math.PI) / n);
    return {
      x: centerX + rx * Math.cos(angle),
      y: centerY + ry * Math.sin(angle),
    };
  }

  // Функция для генерации уведомления о взаимодействии
  function getInteractionPhrase(type: string, fromName: string, toName: string) {
    switch (type) {
      case 'flowers': return `${fromName} подарил цветы ${toName}`;
      case 'tomato': return `${fromName} кинул помидор в ${toName}`;
      case 'respect': return `${fromName} выразил респект ${toName}`;
      case 'cocktail': return `${fromName} подарил коктейль ${toName}`;
      case 'tease': return `${fromName} подразнил ${toName}`;
      default: return `${fromName} взаимодействовал с ${toName}`;
    }
  }

  // Функция для полного сброса всех состояний мультиплеера
  function resetMultiplayerState() {
    console.log('[frontend][resetMultiplayerState] called');
    setRoomState({ mode: 'init' });
    setNameInput('');
    setTopic('');
    setRoomCode('');
    setIsHost(false);
    setIsReady(false);
    setReadyState({});
    setChat([]);
    setLeaderboard([]);
    setQuiz(null);
    setFeedback(null);
    setGameOver(null);
    setHasAnswered(false); // Сбрасываем состояние ответа
    setMultiTimer(15); // Сбрасываем мультиплеерный таймер
    // Очищаем таймер одиночной игры
    if (singleTimerRef.current) {
      clearTimeout(singleTimerRef.current);
      singleTimerRef.current = null;
    }
    setSingleTimer(15);
  }

  // При выборе мультиплеера — сбрасываем всё и подписки
  useEffect(() => {
    if (mainMode === 'multi') {
      console.log('[frontend][useEffect mainMode] mainMode changed to multi, call resetMultiplayerState');
      resetMultiplayerState();
    }
    // eslint-disable-next-line
  }, [mainMode]);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      console.log('[frontend][socket] connected', socket.id);
      
      // Если файл обрабатывается и произошло переподключение, показываем статус
      if (fileUploadStatus === 'processing') {
        setFileUploadMessage('Соединение восстановлено. Ожидаем ответа сервера...');
      }
      (window as any)._debugSocketId = socket.id;
      console.log('[frontend][socket] socket.off quizQuestion (onConnect)');
      socket.off('quizQuestion');
      console.log('[frontend][socket] socket.on quizQuestion (onConnect)');
      socket.on('quizQuestion', (data: QuizQuestion) => {
        const currentMainMode = mainModeRef.current;
        const currentRoomState = roomStateRef.current;
        console.log('[frontend][quizQuestion] received:', data, 'mainMode:', currentMainMode, 'roomState:', currentRoomState, 'socket.id:', socket.id);
        if (currentMainMode === 'single') {
          setLoadingQuestions(false);
          setQuiz(data);
          setFeedback(null);
          setQuestionNumber(data.number || 1);
          setTotalQuestions(data.total || 10);
          setGameOver(null);
          setButtonsDisabled(false);
          setSingleTimer(15); // Запускаем таймер
          startSingleTimer(); // Запускаем таймер
          console.log('[frontend][quizQuestion] setQuiz (single), feedback reset to null, timer started', data);
          return;
        }
        if (currentMainMode !== 'multi' && (!currentRoomState || !('code' in currentRoomState))) {
          console.log('[frontend][quizQuestion] skipped: mainMode !== multi && (!roomState || !code in roomState)', currentMainMode, currentRoomState);
          return;
        }
        if (currentRoomState.mode === 'waiting') {
          setRoomState(prev => prev.mode === 'waiting' ? { ...prev, mode: 'playing' } : prev);
        }
        console.log('[frontend][quizQuestion] (multi) roomState:', currentRoomState, 'roomPlayers:', roomPlayers);
        setLoadingQuestions(false);
        setQuiz(data);
        setFeedback(null);
        setQuestionNumber(data.number || 1);
        setTotalQuestions(data.total || 10);
        setGameOver(null);
        setButtonsDisabled(false);
        setHasAnswered(false); // Сбрасываем состояние ответа при новом вопросе
        setMultiTimer(15); // Сбрасываем таймер на 15 секунд
        console.log('[frontend][quizQuestion] setQuiz (multi), timer reset to 15', data);
      });

      // Обработчик результата ответа
      socket.on('answerResult', (data: AnswerResult) => {
        console.log('[frontend][answerResult] received:', data);
        console.log('[frontend][answerResult] setting feedback:', { correct: data.correct });
        setFeedback({ correct: data.correct });
        setScore(data.score);
        if (mainModeRef.current === 'single') {
          stopSingleTimer(); // Останавливаем таймер
        } else if (mainModeRef.current === 'multi') {
          // В мультиплеере останавливаем таймер при получении результата
          setMultiTimer(0);
        }
        console.log('[frontend][answerResult] feedback and score set');
      });

      // Обработчик окончания игры
      socket.on('gameOver', (data: GameOver) => {
        console.log('[frontend][gameOver] received:', data);
        setGameOver(data);
        setButtonsDisabled(true);
      });

      // Обработчик статуса обработки файла
      socket.on('fileProcessingStatus', (data: { status: string; message: string; questions?: any[] }) => {
        console.log('[frontend][fileProcessingStatus] received:', data);
        setFileUploadStatus(data.status as 'idle' | 'processing' | 'success' | 'error');
        setFileUploadMessage(data.message);
        
        if (data.status === 'processing') {
          // Обновляем прогресс в зависимости от сообщения
          if (data.message.includes('Извлекаем текст')) {
            setProcessingProgress(50);
            setProcessingStep('Извлечение текста');
          } else if (data.message.includes('Создаём вопросы')) {
            setProcessingProgress(80);
            setProcessingStep('Генерация вопросов');
          } else if (data.message.includes('Файл получен')) {
            setProcessingProgress(30);
            setProcessingStep('Обработка файла');
          }
        } else if (data.status === 'success') {
          setProcessingProgress(100);
          setProcessingStep('Готово!');
          setFileUploadMessage('✅ ' + data.message + ' Игра готова к запуску!');
        } else if (data.status === 'error') {
          setProcessingProgress(0);
          setProcessingStep('Ошибка');
        }
      });
    };
    const onDisconnect = () => { 
      setConnected(false); 
      console.log('[frontend][socket] disconnected', socket.id); 
      
      // Если файл обрабатывается, показываем сообщение о переподключении
      if (fileUploadStatus === 'processing') {
        setFileUploadMessage('Соединение потеряно. Переподключаемся...');
      }
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      console.log('[frontend][socket] socket.off quizQuestion (cleanup)');
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('quizQuestion');
      socket.off('answerResult');
      socket.off('gameOver');
      // Очищаем таймеры при размонтировании
      if (singleTimerRef.current) {
        clearTimeout(singleTimerRef.current);
      }
    };
  }, []);

  // Подписка на взаимодействия между игроками
  useEffect(() => {
    function onInteraction(data: { from: string; to: string; type: string; time: number }) {
      setActiveInteraction(data);
      setTimeout(() => setActiveInteraction(null), 1500);
      // Теперь уведомление показываем всем игрокам
      const fromPlayer = (roomPlayers as any[]).find((p: any) => p.id === data.from);
      const toPlayer = (roomPlayers as any[]).find((p: any) => p.id === data.to);
      setInteractionToast({ fromName: fromPlayer?.name || 'Кто-то', toName: toPlayer?.name || 'Игроку', type: data.type, fromId: fromPlayer?.id, toId: toPlayer?.id });
      setTimeout(() => setInteractionToast(null), 2000);
    }
    socket.on('playerInteraction', onInteraction);
    return () => { socket.off('playerInteraction', onInteraction); };
  }, [roomPlayers]);

  // Добавляю обработчик взаимодействий между игроками
  const handlePlayerInteraction = (player: any, type: string) => {
    if (!roomState || !('code' in roomState)) return;
    if (!player.id) return;
    socket.emit('playerInteraction', { code: roomState.code, to: player.id, type });
  };

  const handleStart = () => {
    if (!nameInput.trim() || (topicMode === 'custom' && !topic.trim())) return;
    setName(nameInput.trim());
    setStarted(true);
    setLoadingQuestions(true);
    const sendTopic = topicMode === 'movie' ? 'Кино' : topic.trim();
    socket.emit('startGame', { name: nameInput.trim(), topic: sendTopic });
  };

  // Функции для работы с файлами
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileUploadStatus('idle');
      setProcessingProgress(0);
      setProcessingStep('');
      setFileUploadMessage('Файл выбран. Нажмите "Обработать файл" для создания вопросов.');
    }
  };

  const handleFileUpload = () => {
    console.log('[frontend][handleFileUpload] Функция вызвана');
    console.log('[frontend][handleFileUpload] selectedFile:', selectedFile);
    console.log('[frontend][handleFileUpload] nameInput:', nameInput);
    console.log('[frontend][handleFileUpload] fileUploadStatus:', fileUploadStatus);
    
    if (!selectedFile) {
      console.log('[frontend][handleFileUpload] Выход из функции: файл не выбран');
      return;
    }
    
    if (!nameInput.trim()) {
      console.log('[frontend][handleFileUpload] Выход из функции: имя не введено');
      alert('Пожалуйста, введите ваше имя перед обработкой файла');
      return;
    }
    
    setFileUploadStatus('processing');
    setProcessingProgress(0);
    setProcessingStep('Загрузка файла');
    setFileUploadMessage('Подготавливаем файл для отправки...');
    
    // Читаем файл как ArrayBuffer
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const uint8Array = new Uint8Array(arrayBuffer);
      
      setProcessingProgress(20);
      setProcessingStep('Отправка на сервер');
      setFileUploadMessage('Отправляем файл на сервер...');
      
      console.log('[frontend][handleFileUpload] Отправляем файл на сервер:', {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type,
        dataLength: uint8Array.length
      });
      
      // Проверяем размер файла - если больше 500KB, предупреждаем
      if (uint8Array.length > 500 * 1024) {
        console.log('[frontend][handleFileUpload] Большой файл, отправляем частями...');
        setFileUploadMessage('Файл большой, отправляем частями...');
      }
      
      // Отправляем файл с таймаутом и обработкой ошибок
      try {
        socket.emit('uploadFileForQuestions', { 
          file: {
            name: selectedFile.name,
            mimetype: selectedFile.type,
            data: Array.from(uint8Array)
          }, 
          name: nameInput.trim() 
        });
        
        console.log('[frontend][handleFileUpload] Событие uploadFileForQuestions отправлено');
        
        // Добавляем таймаут для ожидания ответа
        setTimeout(() => {
          if (fileUploadStatus === 'processing') {
            console.log('[frontend][handleFileUpload] Таймаут - проверяем соединение...');
            setFileUploadMessage('Проверяем соединение с сервером...');
          }
        }, 10000); // 10 секунд таймаут
        
      } catch (error) {
        console.error('[frontend][handleFileUpload] Ошибка отправки:', error);
        setFileUploadStatus('error');
        setFileUploadMessage('Ошибка отправки файла. Попробуйте еще раз.');
      }
    };
    
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleAnswer = (choice: string) => {
    if (!started || !name || buttonsDisabled) return;
    console.log('[handleAnswer] sending answer:', choice, 'from:', name, 'mainMode:', mainMode);
    setButtonsDisabled(true);
    if (mainMode === 'single') {
      stopSingleTimer(); // Останавливаем таймер при ответе
    }
    socket.emit('submitAnswer', { answer: choice, name });
    console.log('[handleAnswer] answer sent to server');
  };

  const handleRestart = () => {
    setScore(0);
    setFeedback(null);
    setGameOver(null);
    setQuiz(null);
    setQuestionNumber(1);
    setButtonsDisabled(false);
    setSingleTimer(15);
    if (singleTimerRef.current) {
      clearTimeout(singleTimerRef.current);
      singleTimerRef.current = null;
    }
    socket.emit('restartGame', { name, topic });
  };

  // Функция для запуска таймера одиночной игры
  const startSingleTimer = () => {
    if (singleTimerRef.current) {
      clearTimeout(singleTimerRef.current);
    }
    setSingleTimer(15);
    // Теперь таймер управляется через useEffect, поэтому здесь только сбрасываем значение
    console.log('[startSingleTimer] Timer started, set to 15 seconds');
  };

  // Функция для остановки таймера одиночной игры
  const stopSingleTimer = () => {
    if (singleTimerRef.current) {
      clearTimeout(singleTimerRef.current);
      singleTimerRef.current = null;
    }
    // Останавливаем таймер, устанавливая его в 0
    setSingleTimer(0);
    console.log('[stopSingleTimer] Timer stopped');
  };

  // Мультиплеер: создать комнату
  const handleCreateRoom = async () => {
    setMainMode('multi'); // Явно мультиплеер
    setRoomState({ mode: 'creating', name: nameInput, topic });
    socket.emit('createRoom', { name: nameInput.trim(), topic: topic.trim(), avatar }, (res: { code?: string; error?: string }) => {
      console.log('[handleCreateRoom][callback]', res);
      if (!res || !res.code) {
        alert(res?.error || 'Ошибка создания комнаты');
        setRoomState({ mode: 'init' });
        return;
      }
      setRoomCode(res.code);
      setIsHost(true);
      setRoomPlayers([{ name: nameInput.trim(), avatar, id: socket.id, answered: false }]);
      setRoomState({ mode: 'waiting', code: res.code, players: [{ name: nameInput.trim(), avatar, id: socket.id, answered: false }], isHost: true, topic: topic });
    });
  };
  // Мультиплеер: войти в комнату
  const handleJoinRoom = async () => {
    setMainMode('multi'); // Явно мультиплеер
    setRoomState({ mode: 'joining', name: nameInput, code: roomCode });
    socket.emit('joinRoom', { name: nameInput.trim(), code: roomCode, avatar }, (res: { success?: boolean; error?: string; topic?: string }) => {
      if (res.success) {
        setRoomCode(roomCode);
        setIsHost(false);
        setRoomPlayers([]);
        setRoomState({ mode: 'waiting', code: roomCode, players: [], isHost: false, topic: res.topic || '' });
      } else {
        alert(res.error || 'Ошибка входа в комнату');
        setRoomState({ mode: 'init' });
      }
    });
  };
  // Мультиплеер: старт игры
  const handleStartRoomGame = () => {
    setMainMode('multi'); // Явно мультиплеер
    console.log('[handleStartRoomGame] mainMode:', mainMode, 'roomState:', roomState, 'socket.id:', socket.id);
    socket.emit('startGame', { code: roomCode }, (res: { success?: boolean; error?: string }) => {
      if (res.success) {
        setRoomState((prev) => prev.mode === 'waiting' ? { ...prev, mode: 'playing' } : prev);
      } else {
        alert(res.error || 'Ошибка старта игры');
        setRoomState({ mode: 'init' });
        setMainMode('select');
      }
    });
  };
  // Мультиплеер: отправить сообщение
  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    socket.emit('sendMessage', { code: roomCode, message: chatInput }, () => {
      setChatInput('');
    });
  };

  // Функция аутентификации
  const handleAuth = async () => {
    if (!authPassword.trim()) {
      setAuthError('Введите пароль');
      return;
    }

    setIsAuthLoading(true);
    setAuthError('');

    try {
      const response = await fetch('/api/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-access-password': authPassword.trim()
        },
        credentials: 'include'
      });

      if (response.ok) {
        setIsAuthenticated(true);
        setAuthError('');
      } else {
        setAuthError('Неверный пароль');
      }
    } catch (error) {
      setAuthError('Ошибка подключения к серверу');
      console.error('Auth error:', error);
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Экран аутентификации
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center w-full max-w-md p-6 bg-gray-800 rounded shadow-lg">
          <h1 className="text-3xl font-bold mb-6">AI Quiz</h1>
          <p className="text-gray-300 mb-6">Введите пароль для доступа к игре</p>
          
          <div className="mb-4">
            <input
              type="password"
              placeholder="Пароль"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              className="w-full px-4 py-2 rounded text-black mb-2"
              disabled={isAuthLoading}
            />
          </div>
          
          {authError && (
            <div className="text-red-400 mb-4 text-sm">{authError}</div>
          )}
          
          <button
            onClick={handleAuth}
            disabled={isAuthLoading}
            className="w-full px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white font-bold"
          >
            {isAuthLoading ? 'Проверяем...' : 'Войти'}
          </button>
        </div>
      </div>
    );
  }

  // UI: главный экран выбора режима
  if (mainMode === 'select') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center w-full max-w-md p-6 bg-gray-800 rounded shadow-lg">
          <h1 className="text-3xl font-bold mb-4">AI Quiz</h1>
          <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-bold mb-4 w-full" onClick={() => setMainMode('single')}>Одиночная игра</button>
          <button className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded text-white font-bold w-full" onClick={() => setMainMode('multi')}>Мультиплеер</button>
        </div>
      </div>
    );
  }

  // ОДИНОЧНАЯ ИГРА (старая логика)
  if (mainMode === 'single') {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="text-center w-full max-w-md p-6 bg-gray-800 rounded shadow-lg">
        <div className="mb-4 text-2xl font-bold text-blue-300">Счёт: {score}</div>
        <h1 className="text-3xl font-bold mb-4">AI Quiz</h1>
        <p className="mb-2">Статус: {connected ? <span className="text-green-400">● Подключено</span> : <span className="text-red-400">● Нет связи</span>}</p>
          <div>
        {loadingQuestions ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-4">
            <div className="flex items-center justify-center">
              <span className="inline-block w-8 h-8 border-4 border-yellow-300 border-t-transparent rounded-full animate-spin mr-3"></span>
              <span className="text-lg text-yellow-300">Готовим вопросы на выбранную вами тему...</span>
            </div>
          </div>
        ) : !started ? (
          <div className="mt-8">
            <div className="mb-4">
              <h3 className="text-lg font-bold mb-2 text-blue-300">Выберите тему:</h3>
              <div className="flex justify-center gap-4 mb-4">
                <button
                  className={`px-4 py-2 rounded font-bold ${topicMode === 'movie' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-blue-300'}`}
                  onClick={() => { setTopicMode('movie'); setTopic('Кино'); }}
                >
                  🎬 Кино
                </button>
                <button
                  className={`px-4 py-2 rounded font-bold ${topic === 'Яндекс' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-blue-300'}`}
                  onClick={() => { setTopic('Яндекс'); setTopicMode('custom'); }}
                >
                  🔍 Яндекс
                </button>
                <button
                  className={`px-4 py-2 rounded font-bold ${topic === 'Игра по файлу' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-blue-300'}`}
                  onClick={() => { setTopic('Игра по файлу'); setTopicMode('custom'); }}
                >
                  📄 Игра по файлу
                </button>
                <button
                  className={`px-4 py-2 rounded font-bold ${topicMode === 'custom' && topic !== 'Яндекс' && topic !== 'Игра по файлу' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-blue-300'}`}
                  onClick={() => { setTopicMode('custom'); setTopic(''); }}
                >
                  ✏️ Своя тема
                </button>
              </div>
              {topicMode === 'custom' && topic !== 'Яндекс' && topic !== 'Игра по файлу' && (
                <input
                  className="px-4 py-2 rounded text-black w-2/3 mb-4"
                  type="text"
                  placeholder="Введите тематику (например, Наука, Футбол, Космос...)"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  autoFocus
                />
              )}
              
              {/* Интерфейс для загрузки файла */}
              {topic === 'Игра по файлу' && (
                <div className="mt-4 p-4 bg-gray-700 rounded">
                  <h4 className="text-lg font-bold mb-2 text-blue-300">Загрузите файл для создания вопросов</h4>
                  <p className="text-sm text-gray-300 mb-3">
                    Поддерживаемые форматы: PDF, DOCX, TXT, HTML (до 100 МБ)
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    ⏱️ Время обработки: 15-30 секунд в зависимости от размера файла
                  </p>
                  
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.html,.doc"
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  />
                  
                  {selectedFile && (
                    <div className="mt-2 text-sm text-green-300">
                      📄 Выбран файл: {selectedFile.name}
                    </div>
                  )}
                  
                  {fileUploadMessage && fileUploadStatus === 'idle' && (
                    <div className="mt-3 text-blue-300 text-sm">
                      💡 {fileUploadMessage}
                    </div>
                  )}
                  
                  {fileUploadStatus === 'processing' && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-yellow-300 text-sm font-semibold">{processingStep}</span>
                        <span className="text-yellow-300 text-sm">{processingProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-600 rounded-full h-2 mb-2">
                        <div 
                          className="bg-yellow-300 h-2 rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${processingProgress}%` }}
                        ></div>
                      </div>
                      <div className="flex items-center justify-center">
                        <span className="inline-block w-4 h-4 border-2 border-yellow-300 border-t-transparent rounded-full animate-spin mr-2"></span>
                        <span className="text-yellow-300 text-sm">{fileUploadMessage}</span>
                      </div>
                    </div>
                  )}
                  
                  {fileUploadStatus === 'error' && (
                    <div className="mt-3 text-red-300 text-sm">
                      ❌ {fileUploadMessage}
                    </div>
                  )}
                  
                  {fileUploadStatus === 'success' && (
                    <div className="mt-3 text-green-300 text-sm font-bold">
                      {fileUploadMessage}
                    </div>
                  )}
                  
                  <button
                    className={`mt-3 px-4 py-2 rounded text-white font-bold text-sm ${
                      fileUploadStatus === 'success' 
                        ? 'bg-green-600 hover:bg-green-700' 
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                    onClick={handleFileUpload}
                    disabled={!selectedFile || fileUploadStatus === 'processing'}
                  >
                    {fileUploadStatus === 'success' ? '✅ Файл обработан' : 'Обработать файл'}
                  </button>
                </div>
              )}
            </div>
            <input
              className="px-4 py-2 rounded text-black w-2/3 mb-4"
              type="text"
              placeholder="Введите имя"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
            />
            <br />
            <button
              className={`px-6 py-2 rounded text-white font-bold ${
                !nameInput.trim() || !topic.trim() || (topic === 'Игра по файлу' && fileUploadStatus !== 'success')
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              onClick={handleStart}
              disabled={!nameInput.trim() || !topic.trim() || (topic === 'Игра по файлу' && fileUploadStatus !== 'success')}
            >
              {topic === 'Игра по файлу' && fileUploadStatus !== 'success' 
                ? '⏳ Сначала обработайте файл' 
                : '🎮 Начать игру'
              }
            </button>
                <button className="mt-4 px-4 py-2 bg-gray-600 rounded text-white font-bold w-full" onClick={() => setMainMode('select')}>Назад</button>
          </div>
        ) : gameOver ? (
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-yellow-400 mb-4">Игра окончена</h2>
            <div className="text-lg mb-2">Ваш итоговый счёт: <span className="font-bold text-blue-300">{gameOver.score} / {gameOver.total}</span></div>
            <h3 className="text-xl font-bold mt-6 mb-2 text-yellow-300">Таблица лидеров</h3>
            <ol className="text-left max-w-xs mx-auto">
              {leaderboard.map((entry, idx) => (
                <li key={idx} className="mb-1">
                  <span className="font-bold">{idx + 1}.</span> {entry.name} — <span className="text-blue-300">{entry.score}</span>
                </li>
              ))}
            </ol>
            <button
              className="mt-6 px-6 py-2 bg-green-600 hover:bg-green-700 rounded text-white font-bold transition"
              onClick={handleRestart}
            >
              Играть ещё раз
            </button>
                <button className="mt-4 px-4 py-2 bg-gray-600 rounded text-white font-bold w-full" onClick={() => setMainMode('select')}>Назад</button>
          </div>
            ) : quiz && !gameOver && (
          <div className="mt-6">
            <div className="mb-2 text-lg text-gray-300">Вопрос {questionNumber} из {totalQuestions}</div>
            <div className="mb-2 text-yellow-300 font-bold">Осталось времени: {singleTimer} сек</div>
            {quiz.imageUrl && (
              <img
                src={quiz.imageUrl}
                alt="Кадр из фильма"
                className="mx-auto mb-4 rounded shadow max-h-64"
                style={{ objectFit: 'cover' }}
              />
            )}
            <h2 className="text-xl font-semibold mb-2">{quiz.question}</h2>
            <div className="flex flex-col items-center gap-2">
              {quiz.choices.map((choice, idx) => (
                <button
                  key={idx}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium w-full max-w-xs"
                  onClick={() => handleAnswer(choice)}
                  disabled={buttonsDisabled}
                >
                  {choice}
                </button>
              ))}
            </div>
            {feedback && (
                  <div className={`mt-4 text-lg font-bold ${feedback.correct ? 'text-green-400' : 'text-red-400'}`}>{feedback.correct ? 'Верно!' : 'Неверно!'}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // МУЛЬТИПЛЕЕР (как было реализовано ранее)
  if (mainMode === 'multi' && roomState.mode === 'init') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center w-full max-w-md p-6 bg-gray-800 rounded shadow-lg">
          <h1 className="text-3xl font-bold mb-4">AI Quiz — Мультиплеер</h1>
          <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-bold mb-4 w-full" onClick={() => setRoomState({ mode: 'creating', name: '', topic: '' })}>Создать комнату</button>
          <button className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded text-white font-bold w-full" onClick={() => setRoomState({ mode: 'joining', name: '', code: '' })}>Войти по коду</button>
          <button className="mt-4 px-4 py-2 bg-gray-600 rounded text-white font-bold w-full" onClick={() => setMainMode('select')}>Назад</button>
        </div>
      </div>
    );
  }
  if (mainMode === 'multi' && roomState.mode === 'creating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center w-full max-w-md p-6 bg-gray-800 rounded shadow-lg">
          <h2 className="text-2xl font-bold mb-4">Создать комнату</h2>
          <input className="px-4 py-2 rounded text-black w-2/3 mb-4" type="text" placeholder="Ваше имя" value={nameInput} onChange={e => setNameInput(e.target.value)} />
                      <div className="mb-4">
              <h3 className="text-lg font-bold mb-2 text-blue-300">Выберите тему:</h3>
              <div className="flex justify-center gap-4 mb-4">
                <button
                  className={`px-4 py-2 rounded font-bold ${topicMode === 'movie' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-blue-300'}`}
                  onClick={() => { setTopicMode('movie'); setTopic('Кино'); }}
                >
                  🎬 Кино
                </button>
                <button
                  className={`px-4 py-2 rounded font-bold ${topic === 'Яндекс' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-blue-300'}`}
                  onClick={() => { setTopic('Яндекс'); setTopicMode('custom'); }}
                >
                  🔍 Яндекс
                </button>
                <button
                  className={`px-4 py-2 rounded font-bold ${topic === 'Игра по файлу' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-blue-300'}`}
                  onClick={() => { setTopic('Игра по файлу'); setTopicMode('custom'); }}
                >
                  📄 Игра по файлу
                </button>
                <button
                  className={`px-4 py-2 rounded font-bold ${topicMode === 'custom' && topic !== 'Яндекс' && topic !== 'Игра по файлу' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-blue-300'}`}
                  onClick={() => { setTopicMode('custom'); setTopic(''); }}
                >
                  ✏️ Своя тема
                </button>
              </div>
            <input
              className="px-4 py-2 rounded text-black w-2/3 mb-4"
              type="text"
              placeholder="Тема викторины"
              value={topicMode === 'movie' ? 'Кино' : topic}
              onChange={e => setTopic(e.target.value)}
              disabled={topicMode === 'movie'}
            />
            
            {/* Интерфейс для загрузки файла в мультиплеере */}
            {topic === 'Игра по файлу' && (
              <div className="mt-4 p-4 bg-gray-700 rounded">
                <h4 className="text-lg font-bold mb-2 text-blue-300">Загрузите файл для создания вопросов</h4>
                <p className="text-sm text-gray-300 mb-3">
                  Поддерживаемые форматы: PDF, DOCX, TXT, HTML (до 100 МБ)
                </p>
                <p className="text-xs text-gray-400 mb-3">
                  ⏱️ Время обработки: 15-30 секунд в зависимости от размера файла
                </p>
                
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.html,.doc"
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
                
                {selectedFile && (
                  <div className="mt-2 text-sm text-green-300">
                    📄 Выбран файл: {selectedFile.name}
                  </div>
                )}
                
                {fileUploadMessage && fileUploadStatus === 'idle' && (
                  <div className="mt-3 text-blue-300 text-sm">
                    💡 {fileUploadMessage}
                  </div>
                )}
                
                {fileUploadStatus === 'processing' && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-yellow-300 text-sm font-semibold">{processingStep}</span>
                      <span className="text-yellow-300 text-sm">{processingProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-600 rounded-full h-2 mb-2">
                      <div 
                        className="bg-yellow-300 h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${processingProgress}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-center">
                      <span className="inline-block w-4 h-4 border-2 border-yellow-300 border-t-transparent rounded-full animate-spin mr-2"></span>
                      <span className="text-yellow-300 text-sm">{fileUploadMessage}</span>
                    </div>
                  </div>
                )}
                
                {fileUploadStatus === 'error' && (
                  <div className="mt-3 text-red-300 text-sm">
                    ❌ {fileUploadMessage}
                  </div>
                )}
                
                {fileUploadStatus === 'success' && (
                  <div className="mt-3 text-green-300 text-sm font-bold">
                    {fileUploadMessage}
                  </div>
                )}
                
                <button
                  className={`mt-3 px-4 py-2 rounded text-white font-bold text-sm ${
                    fileUploadStatus === 'success' 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  onClick={handleFileUpload}
                  disabled={!selectedFile || fileUploadStatus === 'processing'}
                >
                  {fileUploadStatus === 'success' ? '✅ Файл обработан' : 'Обработать файл'}
                </button>
              </div>
            )}
          </div>
          <AvatarPicker value={avatar} onChange={setAvatar} />
                      <button 
            className={`px-6 py-2 rounded text-white font-bold w-full mt-4 ${
              !nameInput.trim() || !topic.trim() || !avatar || (topic === 'Игра по файлу' && fileUploadStatus !== 'success')
                ? 'bg-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            onClick={handleCreateRoom} 
            disabled={!nameInput.trim() || !topic.trim() || !avatar || (topic === 'Игра по файлу' && fileUploadStatus !== 'success')}
          >
            {topic === 'Игра по файлу' && fileUploadStatus !== 'success' 
              ? '⏳ Сначала обработайте файл' 
              : 'Создать'
            }
          </button>
          <button className="mt-4 px-4 py-2 bg-gray-600 rounded text-white font-bold w-full" onClick={() => setRoomState({ mode: 'init' })}>Назад</button>
          <button className="mt-4 px-4 py-2 bg-gray-600 rounded text-white font-bold w-full" onClick={() => setMainMode('select')}>Выйти в меню</button>
        </div>
      </div>
    );
  }
  if (mainMode === 'multi' && roomState.mode === 'joining') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center w-full max-w-md p-6 bg-gray-800 rounded shadow-lg">
          <h2 className="text-2xl font-bold mb-4">Войти в комнату</h2>
          <input className="px-4 py-2 rounded text-black w-2/3 mb-4" type="text" placeholder="Ваше имя" value={nameInput} onChange={e => setNameInput(e.target.value)} />
          <input className="px-4 py-2 rounded text-black w-2/3 mb-4" type="text" placeholder="Код комнаты" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} />
          <AvatarPicker value={avatar} onChange={setAvatar} />
          <button className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded text-white font-bold w-full mt-4" onClick={handleJoinRoom} disabled={!nameInput.trim() || !roomCode.trim() || !avatar}>Войти</button>
          <button className="mt-4 px-4 py-2 bg-gray-600 rounded text-white font-bold w-full" onClick={() => setRoomState({ mode: 'init' })}>Назад</button>
          <button className="mt-4 px-4 py-2 bg-gray-600 rounded text-white font-bold w-full" onClick={() => setMainMode('select')}>Выйти в меню</button>
        </div>
      </div>
    );
  }
  if (mainMode === 'multi' && (roomState.mode === 'waiting' || roomState.mode === 'playing')) {
    const isObjectPlayers = typeof roomPlayers[0] === 'object' && roomPlayers[0] !== null && 'avatar' in roomPlayers[0];
    const tablePlayers: OvalTablePlayer[] = roomPlayers.map((p: any, i: number) =>
      isObjectPlayers ? { id: p.id || String(i), name: p.name, avatar: p.avatar, answered: p.answered, color: getColorById(p.id || String(i)) } : { id: String(i), name: p, avatar: '', answered: false, color: getColorById(String(i)) }
    );
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="flex flex-row justify-center gap-8 w-full max-w-[1400px]">
          {/* Левая колонка: игровой блок */}
          <div className="flex-1 flex flex-col items-center justify-center min-w-[320px] max-w-md">
            {roomState.mode === 'waiting' ? (
              <div className="text-center w-full max-w-md p-6 bg-gray-800 rounded shadow-lg">
                <h2 className="text-2xl font-bold mb-4">Ожидание игроков</h2>
                <div className="mb-2">Код комнаты: <span className="font-mono text-yellow-300 text-xl">{roomState.code}</span></div>
                <div className="mb-4">Тема: <span className="text-blue-300 font-semibold">{roomState.topic}</span></div>
                <div className="mb-4">Игроки:</div>
                <ul className="mb-4">
                  {roomPlayers.map((p: any, i) => (
                    <li key={i} className="text-lg flex items-center justify-center gap-2">
                      {isObjectPlayers && p.avatar && <img src={p.avatar} alt="avatar" className="w-8 h-8 rounded-full object-cover border-2 border-blue-400" />}
                      {!isObjectPlayers && <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xl border-2 border-blue-400">?</div>}
                      {isObjectPlayers ? p.name : p}
                      {readyState && Object.values(readyState)[i] ? <span className="text-green-400">✔️</span> : <span className="text-gray-400">⏳</span>}
                    </li>
                  ))}
                </ul>
                {!isReady && <button className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 rounded text-white font-bold w-full" onClick={() => {
                  socket.emit('readyToStart', { code: roomState.code }, () => setIsReady(true));
                }}>Готов</button>}
                {roomState.isHost && tablePlayers.length > 0 && tablePlayers.every((p, idx) => readyState && Object.values(readyState)[idx]) && <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-bold w-full mt-2" onClick={handleStartRoomGame}>Начать игру</button>}
                <button className="mt-4 px-4 py-2 bg-gray-600 rounded text-white font-bold w-full" onClick={() => setRoomState({ mode: 'init' })}>Выйти</button>
                <button className="mt-4 px-4 py-2 bg-gray-600 rounded text-white font-bold w-full" onClick={() => setMainMode('select')}>Выйти в меню</button>
              </div>
            ) : (
              // Игровой процесс (оставляем как было)
              <div className="w-full max-w-md p-6 bg-gray-800 rounded shadow-lg mb-4">
                <div className="mb-2">Код комнаты: <span className="font-mono text-yellow-300 text-xl">{roomState.code}</span></div>
                <div className="mb-2">Тема: <span className="text-blue-300 font-semibold">{roomState.topic}</span></div>
                <div className="mb-2">Игроки: {roomPlayers.join(', ')}</div>
                {/* Игровой процесс */}
                {quiz ? (
                  <>
                    <div className="mb-2 text-lg text-gray-300">Вопрос {questionNumber} из {totalQuestions}</div>
                    <div className="mb-2 text-yellow-300 font-bold">Осталось времени: {multiTimer} сек</div>
                    {quiz.imageUrl && (
                      <img
                        src={quiz.imageUrl}
                        alt="Кадр из фильма"
                        className="mx-auto mb-4 rounded shadow max-h-64"
                        style={{ objectFit: 'cover' }}
                      />
                    )}
                    <h2 className="text-xl font-semibold mb-2">{quiz.question}</h2>
                    <div className="flex flex-col items-center gap-2">
                      {quiz.choices.map((choice, idx) => (
                        <button
                          key={idx}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium w-full max-w-xs"
                          onClick={() => {
                            setButtonsDisabled(true);
                            setHasAnswered(true); // Отмечаем, что игрок ответил
                            socket.emit('submitAnswer', { code: roomState.code, answer: choice }, (result: { received?: boolean; correct?: boolean; score: number }) => {
                              // Если пришло только подтверждение получения ответа, не показываем результат
                              if (result.received) {
                                // Просто обновляем счет, но не показываем результат
                                setScore(result.score);
                              } else if (result.correct !== undefined) {
                                // Показываем результат только когда все ответили
                                setFeedback({ correct: result.correct });
                                setScore(result.score);
                              }
                            });
                          }}
                          disabled={buttonsDisabled || multiTimer === 0}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                    {feedback && (
                      <div className={`mt-4 text-lg font-bold ${feedback.correct ? 'text-green-400' : 'text-red-400'}`}>{feedback.correct ? 'Верно!' : 'Неверно!'}</div>
                    )}
                    {hasAnswered && !feedback && (
                      <div className="mt-4 text-lg font-bold text-blue-400">Ответ принят. Ожидайте ответа других игроков...</div>
                    )}
                  </>
                ) : gameOver ? (
                  <div className="mt-8">
                    <h2 className="text-2xl font-bold text-yellow-400 mb-4">Игра окончена</h2>
                    <div className="text-lg mb-2">Ваш итоговый счёт: <span className="font-bold text-blue-300">{gameOver.score} / {gameOver.total}</span></div>
                    <h3 className="text-xl font-bold mt-6 mb-2 text-yellow-300">Таблица лидеров</h3>
                    <ol className="text-left max-w-xs mx-auto">
                      {leaderboard.map((entry, idx) => (
                        <li key={idx} className="mb-1">
                          <span className="font-bold">{idx + 1}.</span> {entry.name} — <span className="text-blue-300">{entry.score}</span>
                        </li>
                      ))}
                    </ol>
                    <button className="mt-4 px-4 py-2 bg-gray-600 rounded text-white font-bold w-full" onClick={() => setMainMode('select')}>Выйти в меню</button>
                  </div>
                ) : (
                  <div className="mt-8 text-yellow-300">Ожидание вопроса...</div>
                )}
                <h3 className="text-xl font-bold mt-6 mb-2 text-yellow-300">Таблица лидеров</h3>
                <ol className="text-left max-w-xs mx-auto mb-2">
                  {leaderboard.length === 0 ? (
                    <li className="mb-1 text-gray-400">Нет данных</li>
                  ) : (
                    leaderboard.map((entry, idx) => (
                      <li key={idx} className="mb-1">
                        <span className="font-bold">{idx + 1}.</span> {entry.name} — <span className="text-blue-300">{entry.score}</span>
                      </li>
                    ))
                  )}
                </ol>
                <button className="mt-4 px-4 py-2 bg-gray-600 rounded text-white font-bold w-full" onClick={() => setMainMode('select')}>Выйти в меню</button>
              </div>
            )}
          </div>
          {/* Центр: чат */}
          <div className="flex-1 flex flex-col items-center justify-center min-w-[320px] max-w-md">
            <div className="w-full max-w-md p-4 bg-gray-800 rounded-lg shadow-lg flex flex-col border border-gray-700" style={{ minHeight: 320, maxHeight: 400 }}>
              <div className="text-lg font-bold text-yellow-300 mb-2">Чат игроков</div>
              <div className="flex-1 overflow-y-auto mb-2 pr-1" ref={chatScrollRef} style={{ minHeight: 180 }}>
                {chat.length === 0 ? (
                  <div className="text-gray-400 text-center mt-8">Нет сообщений</div>
                ) : (
                  chat.map((msg, i) => (
                    <div key={i} className="mb-1">
                      <span className="font-bold" style={{color: (() => {
                        let id = undefined;
                        if (tablePlayers) {
                          const found = tablePlayers.find(p => p.name === msg.name);
                          if (found) id = found.id;
                        }
                        return getColorById(id || msg.name);
                      })()}}>{msg.name}:</span>{' '}
                      {msg.message.match(/https?:\/\/.*\.(?:gif)/i) ? (
                        <img src={msg.message.trim()} alt="gif" className="inline w-24 h-24 object-cover rounded align-middle" />
                      ) : (
                        msg.message
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 relative">
                <button
                  className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded-full text-xl relative"
                  title="Emoji"
                  type="button"
                  onClick={() => setShowEmojiPicker(v => !v)}
                >😊</button>
                {showEmojiPicker && (
                  <div ref={emojiPickerRef} className="absolute left-0 bottom-10 z-20 bg-gray-800 border border-gray-700 rounded shadow-lg p-2 flex flex-wrap w-64">
                    {emojiList.map(e => (
                      <button
                        key={e}
                        className="text-2xl p-1 hover:bg-gray-700 rounded"
                        type="button"
                        onClick={() => {
                          setChatInput(chatInput + e);
                          setShowEmojiPicker(false);
                        }}
                      >{e}</button>
                    ))}
                  </div>
                )}
                <button
                  className="w-10 h-8 flex items-center justify-center bg-gray-700 rounded text-xs font-bold text-blue-300 relative"
                  title="GIF"
                  type="button"
                  onClick={() => setShowGifPicker(v => !v)}
                >GIF</button>
                {showGifPicker && (
                  <div ref={gifPickerRef} className="absolute left-10 bottom-10 z-20 bg-gray-800 border border-gray-700 rounded shadow-lg p-2 w-80">
                    <input
                      className="w-full px-2 py-1 mb-2 rounded text-black"
                      type="text"
                      placeholder="Поиск GIF..."
                      value={gifSearch}
                      onChange={e => setGifSearch(e.target.value)}
                      autoFocus
                    />
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                      {gifResults.map(gif => (
                        <img
                          key={gif.url}
                          src={gif.preview}
                          alt="gif"
                          className="w-20 h-20 object-cover rounded cursor-pointer hover:scale-110 transition"
                          onClick={() => {
                            setChatInput(chatInput + ' ' + gif.url + ' ');
                            setShowGifPicker(false);
                          }}
                        />
                      ))}
                      {gifSearch && gifResults.length === 0 && <div className="text-gray-400 text-sm">Нет результатов</div>}
                    </div>
                  </div>
                )}
                <input className="flex-1 px-3 py-2 rounded text-black" type="text" placeholder="Сообщение..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
                <button className="ml-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-bold" onClick={handleSendMessage}>➤</button>
              </div>
            </div>
          </div>
          {/* Правая колонка: стол игроков */}
          <div className="flex-1 flex flex-col items-center justify-center min-w-[340px] max-w-lg">
            <div className="relative" style={{ width: 510, height: 300 }}>
              <OvalTable
                players={tablePlayers}
                onInteraction={handlePlayerInteraction}
                width={510}
                height={300}
                myId={socket.id}
              />
              {/* Анимация взаимодействия */}
              {activeInteraction && (() => {
                const from = getAvatarCoords(activeInteraction.from, tablePlayers);
                const to = getAvatarCoords(activeInteraction.to, tablePlayers);
                if (!from || !to) return null;
                const emoji = INTERACTION_EMOJI[activeInteraction.type] || '✨';
                return (
                  <div
                    className="pointer-events-none"
                    style={{
                      position: 'absolute',
                      left: from.x - 18,
                      top: from.y - 18,
                      width: 36,
                      height: 36,
                      zIndex: 50,
                      transition: 'transform 1.2s cubic-bezier(.4,2,.6,1)',
                      transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(1.2)`
                    }}
                  >
                    <span style={{ fontSize: 36 }}>{emoji}</span>
                  </div>
                );
              })()}
              {/* Всплывающее уведомление для получателя */}
              {interactionToast && (
                <div className="fixed left-1/2 top-20 -translate-x-1/2 bg-gray-900 text-yellow-200 px-6 py-3 rounded-lg shadow-lg border border-yellow-400 text-lg z-50 animate-fade-in">
                  <span style={{color: getColorById(interactionToast.fromId || '')}}>{interactionToast.fromName}</span> {getInteractionPhrase(interactionToast.type, '', '')}
                  <span style={{color: getColorById(interactionToast.toId || '')}}>{interactionToast.toName}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // fallback на случай некорректного состояния
  return null;
}

export default App; 