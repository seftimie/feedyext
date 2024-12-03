let currentTabInfo = null;
let currentFilter = 'all';

function resetAnalysis() {
  const sentimentStats = {
    positive: 0,
    neutral: 0,
    negative: 0,
    total: 0
  };

  ['positive', 'neutral', 'negative'].forEach(type => {
    const count = document.getElementById(`${type}Count`);
    const percentage = document.getElementById(`${type}Percentage`);
    if (count && percentage) {
      count.textContent = '0';
      percentage.textContent = '0%';
    }
  });

  const commentsContainer = document.getElementById('commentsContainer');
  if (commentsContainer) {
    commentsContainer.innerHTML = '';
  }

  const wordCloud = document.getElementById('wordCloud');
  if (wordCloud) {
    wordCloud.innerHTML = '';
  }

  const progress = document.getElementById('analysisProgress');
  const statusText = document.getElementById('statusText');
  if (progress) progress.style.width = '0%';
  if (statusText) statusText.textContent = 'Ready to analyze';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'resetData') {
    currentTabInfo = message.tabInfo;
    resetAnalysis();
    
    const statusText = document.getElementById('statusText');
    if (statusText) {
      statusText.textContent = `Ready to analyze: ${currentTabInfo.title}`;
    }
  }
});

document.getElementById('getContent').addEventListener('click', async () => {
  if (!currentTabInfo) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabInfo = {
      url: tab.url,
      title: tab.title
    };
  }

  const baseIngestUrl = await import("./services/settings.js").then(module => module.getApiUrl());
  const companiesModule = await import("./services/companies.js");

  if (!await companiesModule.getSelectedCompany()) {
    alert('Please select a company first');
    return;
  }

  resetAnalysis();
  
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
            // model: "gemini-pro",
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
    const basePostText = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        const container = document.getElementsByClassName("tvm-parent-container")[0];
        return container ? container.innerText : '';
      }
    });

    const text = basePostText[0].result;

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
          const loadMoreButton = Array.from(document.querySelectorAll('button')).find(
            button => button.textContent.trim() === 'Load more comments'
          );
          
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

        // Usar el nuevo selector para obtener los comentarios
        const comments = document.querySelectorAll('.comments-comment-item__main-content');
        const commentsData = [];

        comments.forEach(comment => {
          const text = comment.innerText.trim()
            // Limpiar el texto de espacios extras y saltos de línea
            .replace(/\s+/g, ' ')
            // Eliminar cualquier texto que sea un enlace a un perfil (que comience con /in/)
            .replace(/\/in\/[^\s]+/g, '')
            // Eliminar URLs
            .replace(/https?:\/\/[^\s]+/g, '')
            // Limpiar espacios múltiples que pudieran quedar
            .replace(/\s+/g, ' ')
            .trim();

          if (text) {
            commentsData.push({
              text: text,
              sentiment: null
            });
          }
        });

        console.log(`Se encontraron ${commentsData.length} comentarios`);
        return commentsData;
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

        // Set the data-sentiment attribute
        const sentimentValue = sentiment ? sentiment.toLowerCase() : 'neutral';
        commentElement.setAttribute('data-sentiment', sentimentValue);
        commentElement.className = `comment-card ${sentimentValue}`;

        commentElement.innerHTML = `
          <div class="comment-content">
            <div class="comment-header">
              <div class="comment-info">
                <strong>Comment ${index + 1}</strong>
                <span class="sentiment-badge ${sentimentValue}">${sentiment || 'analyzing...'}</span>
              </div>
              <p class="comment-text">${comment.text}</p>
            </div>
            
            <div class="comment-actions ${sentiment ? "" : "hidden"}">
              <button class="generate-answers-btn" data-comment-id="${commentId}">
                <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd" />
                </svg>
                Generate Answer
              </button>
              <div id="answers-${commentId}" class="answers-container hidden"></div>
            </div>
          </div>
        `;

        // Add click handler for generate answers button


        const generateBtn = commentElement.querySelector('.generate-answers-btn');
        if (generateBtn) {
          generateBtn.addEventListener('click', async () => {
            const answersContainer = document.getElementById(`answers-${commentId}`);
            if (answersContainer) {
              // Show loading state
              generateBtn.disabled = true;
              generateBtn.innerHTML = `
                <svg class="btn-icon spinner" width="16" height="16" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              `;
              const companiesModule = await import("./services/companies.js");
              try {
                const selectedCompany = await companiesModule.getSelectedCompany();
                const companies = await companiesModule.getCompanies();
                const company = companies.find(c => c.id === selectedCompany);

                if (!company) {
                  throw new Error('Please select a company first');
                }

                const response = await fetch(`${baseIngestUrl}/replies`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    company: company.name,
                    url: currentTabInfo.url,
                    plataforma: "linkedin",
                    company_context: company.context || `${company.name} is a company focused on providing excellent service to its customers.`,
                    text: text,
                    comments: [{ texto: comment.text, label: comment.sentiment }]
                  })
                });

                if (!response.ok) {
                  throw new Error('Failed to generate answers');
                }

                const data = await response.json();
                const reply = data.comments[0].reply;
                
                // Show answer
                answersContainer.innerHTML = `
                  <div class="answers-box">
                    <div class="answers-header">
                      <h4 class="answers-title">Suggested Response:</h4>
                      <button class="regenerate-btn" title="Generate new response">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    <div class="answers-list">
                      <div class="answer-item">
                        <p class="answer-text">${reply}</p>
                        <button class="copy-answer-btn" data-answer="${reply.replace(/"/g, '&quot;')}">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                `;

                // Add copy functionality
                answersContainer.querySelectorAll('.copy-answer-btn').forEach(btn => {
                  btn.addEventListener('click', async () => {
                    const answer = btn.dataset.answer;
                    await navigator.clipboard.writeText(answer);
                    
                    // Show copied feedback
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = `
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor" class="text-success">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                    `;
                    setTimeout(() => {
                      btn.innerHTML = originalHTML;
                    }, 2000);
                  });
                });

                answersContainer.classList.remove('hidden');
              } catch (error) {
                console.error('Error generating answers:', error);
                answersContainer.innerHTML = `
                  <div class="error-message">
                    Failed to generate answers. Please try again.
                  </div>
                `;
                answersContainer.classList.remove('hidden');
              } finally {
                generateBtn.classList.add('hidden');
              }
            }
          });
        }

        if (sentiment) {
          updateMetrics(sentiment);
          // Apply current filter
          if (currentFilter !== 'all' && currentFilter !== sentimentValue) {
            commentElement.style.display = 'none';
          } else {
            commentElement.style.display = 'block';
          }
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

        // First check if AI Language Model is available
        let useCloud = false;
        try {
          const modelCheck = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: async () => {
              if (!self.ai || !self.ai.languageModel) {
                return false;
              }
              const capabilities = await ai.languageModel.capabilities();
              return capabilities.available !== "no";
            }
          });
          useCloud = !modelCheck[0].result;
        } catch (error) {
          console.log("Error checking AI capabilities, falling back to cloud:", error);
          useCloud = true;
        }

        if (useCloud) {
          console.log("Using cloud service for sentiment analysis");
          const cloudResults = await analyzeWithCloud(comments);
          cloudResults.forEach((sentiment, index) => {
            results[index] = sentiment;
            comments[index].sentiment = sentiment;
            updateCommentUI(index, comments[index], sentiment);
            updateProgressBar(index + 1, comments.length);
          });
          return results;
        }

        // If AI Language Model is available, use the original local analysis logic
        async function processComment() {
          while (currentIndex < comments.length) {
            const index = currentIndex++;
            const comment = comments[index];
            
            try {
              console.log(`Analyzing comment ${index + 1}/${comments.length}`);
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
              console.error(`Error analyzing comment ${index + 1}:`, error);
              results[index] = 'neutral';
              updateCommentUI(index, comment, 'neutral');
            }
          }
        }

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

        // Get selected company info
        const companiesModule = await import("./services/companies.js");
        const selectedCompanyId = await companiesModule.getSelectedCompany();
        const companies = await companiesModule.getCompanies();
        const selectedCompany = companies.find(c => c.id === selectedCompanyId);

        if (!selectedCompany) {
          throw new Error('No company selected');
        }

        // Antes de enviar el payload completo, intentemos limpiarlo
        const cleanText = text => {
          return text
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/\n+/g, ' ') // Replace multiple newlines with space
            .trim();
        };

        const commentData = {
          company: selectedCompany.name,
          url: currentTabInfo.url,
          plataforma: "linkedin",
          text: cleanText(text),
          comments: comments.map(comment => ({
            texto: cleanText(comment.text),
            label: comment.sentiment
          }))
        };

        try {
          const response = await fetch(`${baseIngestUrl}/ingest`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(commentData)
          });

          if (!response.ok) {
            // Intentar obtener el mensaje de error del servidor
            const errorText = await response.text();
            console.error('Server response:', {
              status: response.status,
              statusText: response.statusText,
              body: errorText
            });
            throw new Error(`HTTP error! status: ${response.status}. Server message: ${errorText}`);
          }

          console.log('Data successfully sent to endpoint');
          if (statusText) statusText.textContent = 'Analysis Complete - Data Sent';
        } catch (error) {
          console.error('Error sending data to endpoint:', error);
          if (statusText) statusText.textContent = 'Analysis Complete - Error Sending Data';
          
          // Mostrar el error en la UI para debugging
          const errorDiv = document.createElement('div');
          errorDiv.className = 'error-message';
          errorDiv.style.color = 'red';
          errorDiv.style.padding = '10px';
          errorDiv.textContent = `Error: ${error.message}`;
          document.getElementById('commentsContainer').prepend(errorDiv);
        }

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
          
          // Reducir la escala del tamaño de fuente
          const fontSize = Math.max(10, Math.min(16, 10 + count)); // Reducido de (14, 40) a (10, 16)
          const opacity = Math.max(0.7, Math.min(1, (15 - index) / 15));
          
          wordElement.style.cssText = `
            font-size: ${fontSize}px;
            opacity: ${opacity};
            margin: 3px;
            padding: 3px;
            display: inline-block;
            color: ${getRandomColor()};
            cursor: pointer;
            transition: transform 0.2s;
            font-weight: ${index < 5 ? '500' : 'normal'};
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
          message: 'Process completed'
        };
      }
    });
    
    if (results && results[0].result) {
      const { totalButtons, message } = results[0].result;
      const commentsDiv = document.createElement('div');
      commentsDiv.innerHTML = `<p>Successfully liked ${totalButtons} comments. ${message}</p>`;
      document.getElementById('actionButton').insertAdjacentElement('afterend', commentsDiv);
    }
    
  } catch (err) {
    console.error('Error al ejecutar el script de acción:', err);
  }
});

function filterComments(sentiment) {
  currentFilter = sentiment.toLowerCase();
  console.log('Filtering comments by:', currentFilter); // Debug log

  const comments = document.querySelectorAll('.comment-card');
  console.log('Found comments:', comments.length); // Debug log

  comments.forEach(comment => {
    const commentSentiment = comment.getAttribute('data-sentiment');
    console.log('Comment sentiment:', commentSentiment); // Debug log

    if (currentFilter === 'all') {
      comment.style.display = 'block';
    } else {
      comment.style.display = commentSentiment === currentFilter ? 'block' : 'none';
    }
  });

  // Update active button state
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`#filter-${currentFilter}`).classList.add('active');
}

// Add event listeners for filter buttons
document.addEventListener('DOMContentLoaded', () => {
  const filterButtons = {
    'all': document.getElementById('filter-all'),
    'positive': document.getElementById('filter-positive'),
    'neutral': document.getElementById('filter-neutral'),
    'negative': document.getElementById('filter-negative')
  };

  Object.entries(filterButtons).forEach(([sentiment, button]) => {
    if (button) {
      button.addEventListener('click', () => {
        console.log('Filter button clicked:', sentiment); // Debug log
        filterComments(sentiment);
      });
    }
  });
});

function addCommentToUI(comment) {
    const commentElement = document.createElement('div');
    commentElement.className = 'comment-item';
    commentElement.setAttribute('data-sentiment', comment.sentiment.toLowerCase());
    // Resto del código existente para crear el elemento del comentario...
}

async function analyzeWithCloud(comments) {
  try {
    const settingsModule = await import("./services/settings.js");
    const apiUrl = await settingsModule.getApiUrl();
    const response = await fetch(`${apiUrl}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        comments: comments.map(comment => ({ texto: comment.text }))
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.comments.map(comment => comment.label);
  } catch (error) {
    console.error('Error in cloud analysis:', error);
    return comments.map(() => 'neutral'); // Fallback to neutral for all comments in case of error
  }
}

document.addEventListener('DOMContentLoaded', async function() {

  const settingsModule = await import("./services/settings.js");
  await settingsModule.initializeSettings();

  // Get DOM elements
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  // Tab switching functionality
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
      });

      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      const tabId = tab.dataset.tab + 'Tab';
      const tabContent = document.getElementById(tabId);
      if (tabContent) {
        tabContent.classList.add('active');
        tabContent.style.display = 'block';
      }
      
      // Re-render company list when switching to company tab
      if (tab.dataset.tab === 'company') {
        companiesModule.renderCompanyList();
      }
    });
  });

  const companiesModule = await import("./services/companies.js");

  // Render initial company list
  await companiesModule.renderCompanyList();

  // Handle company form submission
  const addCompanyForm = document.getElementById('addCompanyForm');
  if (addCompanyForm) {
    addCompanyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(e.target);
      const company = {
        name: formData.get('companyName'),
        linkedInUrl: formData.get('companyLinkedIn'),
        logoUrl: formData.get('companyLogo'),
        context: formData.get('companyContext')
      };

      try {
        await companiesModule.addCompany(company);
        await companiesModule.renderCompanyList();
        
        // Reset form
        e.target.reset();
      } catch (error) {
        console.error('Error adding company:', error);
      }
    });
  }

  // Handle company selection
  const companyList = document.querySelector('.company-list');
  if (companyList) {
    companyList.addEventListener('click', async (e) => {
      const companyItem = e.target.closest('.company-item');
      const deleteBtn = e.target.closest('.delete-company-btn');

      if (deleteBtn) {
        // Handle delete button click
        e.stopPropagation();
        const companyId = companyItem.dataset.id;
        try {
          await companiesModule.deleteCompany(companyId);
          await companiesModule.renderCompanyList();
        } catch (error) {
          console.error('Error deleting company:', error);
        }
      } else if (companyItem) {
        // Handle company selection
        const companyId = companyItem.dataset.id;
        try {
          await companiesModule.setSelectedCompany(companyId);
          await companiesModule.renderCompanyList();
        } catch (error) {
          console.error('Error selecting company:', error);
        }
      }
    });
  }

  // Handle delete all companies
  const deleteAllBtn = document.getElementById('deleteAllCompanies');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete all companies? This action cannot be undone.')) {
        try {
          await companiesModule.deleteAllCompanies();
          await companiesModule.renderCompanyList();
        } catch (error) {
          console.error('Error deleting all companies:', error);
        }
      }
    });
  }

  // Handle tooltip interactions for company context
  const handleTooltips = () => {
    const contextPreviews = document.querySelectorAll('.context-preview');
    contextPreviews.forEach(preview => {
      const tooltip = preview.querySelector('.context-tooltip');
      if (tooltip) {
        preview.addEventListener('mouseenter', () => {
          tooltip.style.display = 'block';
        });
        preview.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });
      }
    });
  };

  // Call handleTooltips initially and after any list updates
  handleTooltips();
});

// Add this function after updateCommentUI
async function generateAnswersForComment(comment, basePostText, commentId, sentiment) {
  const answersContainer = document.getElementById(`answers-${commentId}`);
  if (!answersContainer) return;
  const settingsModule = await import("./services/settings.js");
  const companiesModule = await import("./services/companies.js");
  try {
    const apiUrl = await settingsModule.getApiUrl();
    const selectedCompany = await companiesModule.getSelectedCompany();
    const companies = await companiesModule.getCompanies();
    const company = companies.find(c => c.id === selectedCompany);

    if (!company) {
      throw new Error('Please select a company first');
    }

    const response = await fetch(`${apiUrl}/replies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        company_context: company.context || `${company.name} is a company focused on providing excellent service to its customers.`,
        text: basePostText,
        comments: [{ texto: comment.text }]
      })
    });

    if (!response.ok) {
      throw new Error('Failed to generate answers');
    }

    const data = await response.json();
    const reply = data.comments[0].reply;
    
    // Show answer
    answersContainer.innerHTML = `
      <div class="answers-box">
        <div class="answers-header">
          <h4 class="answers-title">Suggested Response:</h4>
          <button class="regenerate-btn" title="Generate new response">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
        <div class="answers-list">
          <div class="answer-item">
            <p class="answer-text">${reply}</p>
            <button class="copy-answer-btn" data-answer="${reply.replace(/"/g, '&quot;')}">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    // Add copy functionality
    answersContainer.querySelectorAll('.copy-answer-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const answer = btn.dataset.answer;
        await navigator.clipboard.writeText(answer);
        
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor" class="text-success">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
        `;
        setTimeout(() => {
          btn.innerHTML = originalHTML;
        }, 2000);
      });
    });

    answersContainer.classList.remove('hidden');
    return true;
  } catch (error) {
    console.error('Error generating answers:', error);
    answersContainer.innerHTML = `
      <div class="error-message">
        ${error.message === 'Please select a company first' 
          ? 'Please select a company before generating answers.' 
          : 'Failed to generate answers. Please try again.'}
      </div>
    `;
    answersContainer.classList.remove('hidden');
    return false;
  }
}

// Add this in your DOMContentLoaded event listener
document.getElementById('generateAllAnswers')?.addEventListener('click', async () => {
  const generateAllBtn = document.getElementById('generateAllAnswers');
  const comments = document.querySelectorAll('.comment-card');
  
  if (!comments.length) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const basePostText = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        const container = document.getElementsByClassName("tvm-parent-container")[0];
        return container ? container.innerText : '';
      }
    });

  const text = basePostText[0].result;

  generateAllBtn.disabled = true;
  const originalBtnText = generateAllBtn.innerHTML;
  let progress = 0;

  // Add progress text
  const progressText = document.createElement('div');
  progressText.className = 'generate-all-progress';
  generateAllBtn.parentNode.appendChild(progressText);

  generateAllBtn.innerHTML = `
    <svg class="btn-icon spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    Generating...
  `;

  try {
    for (const comment of comments) {
      const commentId = comment.id;
      const sentiment = comment.getAttribute('data-sentiment');
      const commentText = comment.querySelector('.comment-text')?.textContent;

      if (commentText) {
        await generateAnswersForComment({ text: commentText}, text, commentId, sentiment);
        progress++;
        progressText.textContent = `Generated ${progress} of ${comments.length} responses`;
      }
    }
  } finally {
    generateAllBtn.disabled = false;
    generateAllBtn.innerHTML = originalBtnText;
    
    // Remove progress text after a delay
    setTimeout(() => {
      progressText.remove();
    }, 3000);
  }
});


