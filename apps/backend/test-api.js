const axios = require('axios');
const https = require('https');

async function testTMDB() {
  const apiKey = 'bb5f86cd8137409506cff869febf15af';
  
  // Попробуем несколько IP-адресов TMDB
  const testUrls = [
    {
      name: 'Прямой IP TMDB',
      url: `https://104.16.61.155/3/movie/popular?api_key=${apiKey}&language=ru-RU&page=1`,
      headers: { 'Host': 'api.themoviedb.org' }
    },
    {
      name: 'Альтернативный IP',
      url: `https://151.101.0.155/3/movie/popular?api_key=${apiKey}&language=ru-RU&page=1`,
      headers: { 'Host': 'api.themoviedb.org' }
    }
  ];
  
  for (const test of testUrls) {
    console.log(`\n🔄 Тестируем: ${test.name}`);
    console.log('URL:', test.url);
    
    try {
      const response = await axios.get(test.url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'QuizApp/1.0',
          ...test.headers
        },
        // Отключаем проверку сертификата для теста
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        })
      });
      
      console.log('✅ API работает!');
      console.log('Статус:', response.status);
      console.log('Количество фильмов:', response.data.results?.length || 0);
      console.log('Первый фильм:', response.data.results?.[0]?.title || 'Нет данных');
      return; // Успех!
      
    } catch (error) {
      console.log('❌ Ошибка:');
      console.log('Код:', error.code);
      console.log('Сообщение:', error.message);
      if (error.response) {
        console.log('HTTP статус:', error.response.status);
      }
    }
  }
  
  console.log('\n❌ Все IP-адреса не работают');
}

testTMDB(); 