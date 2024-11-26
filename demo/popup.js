document.getElementById('getContent').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Primero verificamos las capacidades del modelo
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: async function analyseComment(commentText) {
        try {
          // Verificar si el modelo está disponible
          const capabilities = await ai.languageModel.capabilities();
          if (capabilities.available === "no") {
            console.error('Language model not available on this device/browser');
            return 'neutral';
          }

          // Crear una sesión con la configuración correcta
          const baseSession = await ai.languageModel.create({
            model: "gemini-pro",
            systemPrompt: "You are a sentiment classifier. Your task is to classify text sentiment. You must respond with exactly one word: 'positive', 'negative', or 'neutral'. No other output is allowed.",
            // Configuración de generación
            generationConfig: {
              temperature: 0.1,
              topK: 1,
              maxOutputTokens: 1
            }
          });

          const result = await baseSession.prompt(commentText);
          
          // Limpiar y validar la respuesta
          const sentiment = result.trim().toLowerCase();
          if (!['positive', 'negative', 'neutral'].includes(sentiment)) {
            console.warn('Unexpected model output:', sentiment);
            return 'neutral';
          }

          // Destruir la sesión para liberar memoria
          baseSession.destroy();
          
          return sentiment;
        } catch (error) {
          console.error('Error in sentiment analysis:', error);
          return 'neutral';
        }
      }
    });
    
    // Luego ejecutamos el script principal
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: async () => {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        async function expandAllComments() {
          const expandButtons = document.querySelectorAll(
            'button.feed-shared-inline-show-more-text__see-more-less-toggle.see-more.t-14.t-black--light.t-normal.hoverable-link-text.feed-shared-inline-show-more-text__dynamic-more-text.feed-shared-inline-show-more-text__dynamic-bidi-text'
          );
          
          console.log(`Encontrados ${expandButtons.length} comentarios para expandir`);
          
          for (let button of expandButtons) {
            try {
              button.click();
              await wait(500);
            } catch (err) {
              console.error('Error al expandir comentario:', err);
            }
          }
          console.log('Expansión de comentarios completada');
        }
        
        async function clickLoadMore() {
          const loadMoreButton = document.querySelector('.comments-comments-list__load-more-comments-button--cr');
          
          if (loadMoreButton) {
            console.log('Encontrado botón "Load more". Haciendo clic...');
            loadMoreButton.click();
            await wait(2000);
            await expandAllComments();
            return await clickLoadMore();
          } else {
            console.log('No se encontraron más botones de "Load more"');
            await expandAllComments();
            return;
          }
        }

        console.log('Iniciando carga de comentarios...');
        await clickLoadMore();
        console.log('Carga y expansión de comentarios completada');

        const commentSections = document.querySelectorAll('section.comments-comment-entity__content');
        
        if (commentSections.length === 0) {
          console.log('No se encontraron secciones de comentarios');
          return null;
        }

        const comments = Array.from(commentSections).map(section => ({
          text: section.textContent.trim(),
          sentiment: null
        }));

        console.log(`Se encontraron ${comments.length} comentarios`);
        return comments;
      }
    });
    
    if (results && results[0].result) {
      const comments = results[0].result;
      console.log('Comentarios encontrados:', comments);
      
      // Inicializar contadores
      let sentimentStats = {
        positive: 0,
        neutral: 0,
        negative: 0,
        total: 0
      };

      function updateMetrics(sentiment) {
        sentimentStats[sentiment]++;
        sentimentStats.total++;

        // Actualizar contadores
        ['positive', 'neutral', 'negative'].forEach(type => {
          const count = document.getElementById(`${type}Count`);
          const percentage = document.getElementById(`${type}Percentage`);
          if (count && percentage) {
            count.textContent = sentimentStats[type];
            percentage.textContent = `${Math.round((sentimentStats[type] / sentimentStats.total) * 100)}%`;
          }
        });
      }

      function updateProgressBar(current, total) {
        const progress = document.getElementById('analysisProgress');
        const statusText = document.getElementById('statusText');
        if (progress && statusText) {
          const percentage = (current / total) * 100;
          progress.style.width = `${percentage}%`;
          statusText.textContent = `Analyzing: ${current}/${total} comments`;
        }
      }

      function updateCommentUI(index, comment, sentiment) {
        const commentId = `comment-${index}`;
        let commentElement = document.getElementById(commentId);
        
        if (!commentElement) {
          commentElement = document.createElement('div');
          commentElement.id = commentId;
          commentElement.className = 'comment-card';
          document.getElementById('commentsContainer').appendChild(commentElement);
        }

        commentElement.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>Comment ${index + 1}</strong>
            ${sentiment ? 
              `<span class="sentiment-badge ${sentiment}">${sentiment}</span>` : 
              '<span class="sentiment-badge neutral">analyzing...</span>'}
          </div>
          <p style="margin: 10px 0;">${comment.text}</p>
        `;

        if (sentiment) {
          updateMetrics(sentiment);
        }
      }

      // Crear contenedor de comentarios
      const commentsDiv = document.createElement('div');
      commentsDiv.id = 'commentsContainer';
      commentsDiv.innerHTML = ``;
      document.body.appendChild(commentsDiv);

      // Analizar comentarios en paralelo con un límite de concurrencia
      async function analyzeInParallel(comments, concurrencyLimit = 5) {
        const results = new Array(comments.length);
        let currentIndex = 0;

        async function processComment() {
          while (currentIndex < comments.length) {
            const index = currentIndex++;
            const comment = comments[index];
            
            try {
              console.log(`Analizando comentario ${index + 1}/${comments.length}`);
              updateProgressBar(index + 1, comments.length);

              const sentiment = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: async (commentText) => {
                  const baseSession = await ai.languageModel.create({
                    model: "gemini-pro",
                    systemPrompt: "You are a sentiment classifier. Your task is to classify text sentiment. You must respond with exactly one word: 'positive', 'negative', or 'neutral'. No other output is allowed.",
                    generationConfig: {
                      temperature: 0.1,
                      topK: 1,
                      maxOutputTokens: 1
                    }
                  });

                  const result = await baseSession.prompt(commentText);
                  baseSession.destroy();
                  return result.trim().toLowerCase();
                },
                args: [comment.text]
              });

              if (sentiment && sentiment[0].result) {
                results[index] = sentiment[0].result;
                comments[index].sentiment = sentiment[0].result;
                updateCommentUI(index, comment, sentiment[0].result);
              } else {
                results[index] = 'neutral';
                updateCommentUI(index, comment, 'neutral');
              }
            } catch (error) {
              console.error(`Error analizando comentario ${index + 1}:`, error);
              results[index] = 'neutral';
              updateCommentUI(index, comment, 'neutral');
            }
          }
        }

        // Crear array de promesas para procesar en paralelo
        const workers = Array(concurrencyLimit).fill(null).map(processComment);
        await Promise.all(workers);

        return results;
      }

      // Mostrar comentarios inicialmente
      comments.forEach((comment, index) => {
        updateCommentUI(index, comment, null);
      });

      // Analizar comentarios en paralelo
      try {
        await analyzeInParallel(comments);
        
        // Actualizar estado final
        const statusText = document.getElementById('statusText');
        const progress = document.getElementById('analysisProgress');
        if (statusText) statusText.textContent = 'Analysis Complete';
        if (progress) progress.style.width = '100%';
      } catch (error) {
        console.error('Error en el análisis paralelo:', error);
      }

      // Añadir función para procesar texto y crear nube de palabras
      function createWordCloud(comments) {
        // Lista de palabras a excluir (stop words en español e inglés)
        const stopWords = new Set(['de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'las', 'un', 'por', 'con', 'una', 'su', 'para', 'es', 'al', 'lo', 'como', 'más', 'o', 'pero', 'sus', 'le', 'ha', 'me', 'si', 'sin', 'sobre', 'este', 'ya', 'entre', 'cuando', 'todo', 'esta', 'ser', 'son', 'dos', 'también', 'fue', 'había', 'era', 'muy', 'años', 'hasta', 'desde', 'está', 'mi', 'porque', 'qué', 'sólo', 'han', 'yo', 'hay', 'vez', 'puede', 'todos', 'así', 'nos', 'ni', 'parte', 'tiene', 'él', 'uno', 'donde', 'bien', 'tiempo', 'mismo', 'ese', 'ahora', 'cada', 'e', 'vida', 'otro', 'después', 'te', 'otros', 'aunque', 'esa', 'eso', 'hace', 'otra', 'gobierno', 'tan', 'durante', 'siempre', 'día', 'tanto', 'ella', 'tres', 'sí', 'dijo', 'sido', 'gran', 'país', 'según', 'menos', 'mundo', 'año', 'antes', 'estado', 'contra', 'sino', 'forma', 'caso', 'nada', 'hacer', 'general', 'estaba', 'poco', 'estos', 'presidente', 'mayor', 'ante', 'unos', 'les', 'algo', 'hacia', 'casa', 'ellos', 'ayer', 'quien', 'the', 'and', 'to', 'a', 'of', 'in', 'is', 'it', 'you', 'that', 'he', 'was', 'for', 'on', 'are', 'with', 'as', 'his', 'they', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part']);

        // Procesar todos los comentarios y contar palabras
        const wordCount = {};
        comments.forEach(comment => {
          const words = comment.text.toLowerCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
            .split(/\s+/);
          
          words.forEach(word => {
            if (word.length > 3 && !stopWords.has(word)) {
              wordCount[word] = (wordCount[word] || 0) + 1;
            }
          });
        });

        // Convertir a array, ordenar por frecuencia y tomar solo las top 20
        const sortedWords = Object.entries(wordCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15); // Limitado a 20 palabras

        // Obtener el contenedor
        const cloudContainer = document.getElementById('wordCloud');
        cloudContainer.innerHTML = ''; // Limpiar contenedor

        // Crear elementos para cada palabra
        sortedWords.forEach(([word, count], index) => {
          const wordElement = document.createElement('span');
          wordElement.textContent = word;
          wordElement.className = 'word-cloud-word';
          
          // Calcular tamaño basado en la frecuencia y posición
          const fontSize = Math.max(14, Math.min(40, 14 + count * 3));
          const opacity = Math.max(0.7, Math.min(1, (20 - index) / 20));
          
          wordElement.style.cssText = `
            font-size: ${fontSize}px;
            opacity: ${opacity};
            margin: 5px;
            padding: 5px;
            display: inline-block;
            color: ${getRandomColor()};
            cursor: pointer;
            transition: transform 0.2s;
            font-weight: ${index < 5 ? 'bold' : 'normal'};
          `;

          wordElement.addEventListener('mouseover', () => {
            wordElement.style.transform = 'scale(1.2)';
          });

          wordElement.addEventListener('mouseout', () => {
            wordElement.style.transform = 'scale(1)';
          });

          wordElement.addEventListener('click', () => {
            alert(`"${word}" appears ${count} times`);
          });

          cloudContainer.appendChild(wordElement);
        });
      }

      // Función auxiliar para generar colores aleatorios
      function getRandomColor() {
        const colors = [
          '#2196F3', // Azul
          '#4CAF50', // Verde
          '#F44336', // Rojo
          '#FFC107', // Amarillo
          '#9C27B0', // Púrpura
          '#FF9800', // Naranja
          '#00BCD4', // Cyan
          '#E91E63', // Rosa
          '#3F51B5', // Índigo
          '#009688'  // Teal
        ];
        return colors[Math.floor(Math.random() * colors.length)];
      }

      // Crear la nube de palabras después de procesar todos los comentarios
      createWordCloud(comments);

    } else {
      console.log('No se encontró contenido de comentarios');
    }
    
  } catch (err) {
    console.error('Error al ejecutar el script:', err);
  }
});

document.getElementById('actionButton').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: async () => {
        // Función para esperar un tiempo determinado
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        // Encontrar todos los botones con la clase específica
        const buttons = document.querySelectorAll(
          'button.artdeco-button.artdeco-button--muted.artdeco-button--1.artdeco-button--tertiary.ember-view.social-actions-button.react-button__trigger'
        );
        
        console.log(`Encontrados ${buttons.length} botones para hacer clic`);
        
        // Hacer clic en cada botón con un pequeño delay entre cada uno
        for (let button of buttons) {
          try {
            button.click();
            console.log('Clic realizado en botón');
            // Esperar 500ms entre clics para evitar problemas
            await wait(500);
          } catch (err) {
            console.error('Error al hacer clic en botón:', err);
          }
        }
        
        return {
          totalButtons: buttons.length,
          message: 'Proceso completado'
        };
      }
    });
    
    if (results && results[0].result) {
      const { totalButtons, message } = results[0].result;
      const commentsDiv = document.createElement('div');
      commentsDiv.innerHTML = `<p>Se procesaron ${totalButtons} botones. ${message}</p>`;
      document.body.appendChild(commentsDiv);
    }
    
  } catch (err) {
    console.error('Error al ejecutar el script de acción:', err);
  }
});
