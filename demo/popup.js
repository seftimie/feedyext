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
      
      const commentsDiv = document.createElement('div');
      commentsDiv.id = 'commentsContainer';
      commentsDiv.innerHTML = `<p>Encontrados ${comments.length} comentarios. Analizando sentimientos...</p>`;
      document.body.appendChild(commentsDiv);

      function updateCommentUI(index, comment, sentiment) {
        const commentId = `comment-${index}`;
        let commentElement = document.getElementById(commentId);
        
        if (!commentElement) {
          commentElement = document.createElement('p');
          commentElement.id = commentId;
          commentsDiv.appendChild(commentElement);
        }

        commentElement.innerHTML = `
          <strong>Comentario ${index + 1}:</strong> ${comment.text}<br>
          ${sentiment ? `<strong>Sentimiento:</strong> ${sentiment}` : '<em>Analizando sentimiento...</em>'}
        `;

        if (sentiment) {
          switch(sentiment) {
            case 'positive':
              commentElement.style.borderLeft = '4px solid green';
              break;
            case 'negative':
              commentElement.style.borderLeft = '4px solid red';
              break;
            case 'neutral':
              commentElement.style.borderLeft = '4px solid gray';
              break;
          }
        }
      }

      comments.forEach((comment, index) => {
        updateCommentUI(index, comment, null);
      });

      // Analizar comentarios uno por uno
      for (let i = 0; i < comments.length; i++) {
        const comment = comments[i];
        console.log(`Analizando comentario ${i + 1}/${comments.length}`);
        
        try {
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
            comments[i].sentiment = sentiment[0].result;
            updateCommentUI(i, comment, sentiment[0].result);
          } else {
            updateCommentUI(i, comment, 'neutral');
          }
        } catch (error) {
          console.error(`Error analizando comentario ${i + 1}:`, error);
          updateCommentUI(i, comment, 'neutral');
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      commentsDiv.firstChild.textContent = `Análisis completado: ${comments.length} comentarios procesados`;
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
