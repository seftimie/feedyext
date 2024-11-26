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
      commentsDiv.innerHTML = `<p>Encontrados ${comments.length} comentarios. Analizando sentimientos...</p>`;
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
