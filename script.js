document.addEventListener('DOMContentLoaded', () => {
    // Get references to new elements
    const urlInput = document.getElementById('urlInput');
    const loadUrlButton = document.getElementById('loadUrlButton');
    const exampleLinksContainer = document.querySelector('.example-links');
    const contentArea = document.getElementById('contentArea');
    const errorMessageDiv = document.getElementById('errorMessage');
    
    const articleContent = document.getElementById('articleContent');
    const aiSelectToggle = document.getElementById('aiSelectToggle');
    const proxyUrl = '/api/fetch-article'; // Keep using the Vercel function route

    let isAiSelectMode = false;
    let selectedElement = null;
    let fullArticleText = ""; 
    let currentArticleUrl = ""; // Store the currently loaded URL

    // --- Helper Functions --- 
    function showErrorMessage(message) {
        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
    }

    function clearErrorMessage() {
        errorMessageDiv.textContent = '';
        errorMessageDiv.style.display = 'none';
    }

    function resetUI() {
        console.log("Resetting UI...");
        clearErrorMessage();
        contentArea.style.display = 'none';
        articleContent.innerHTML = ''; // Clear previous article
        aiSelectToggle.style.display = 'none'; // Hide FAB
        fullArticleText = "";
        currentArticleUrl = "";
        isAiSelectMode = false;
        selectedElement = null;
        removeInteractionOptions();
        // Reset button text if needed
        aiSelectToggle.textContent = 'Enable AI Select';
        document.body.classList.remove('ai-select-mode');
    }

    // --- 1. Fetch and Render Article --- 
    async function loadArticleFromUrl(urlToLoad) {
        console.log(`--- Loading article from URL: ${urlToLoad} ---`);
        resetUI(); // Clear previous state
        loadUrlButton.disabled = true; // Disable button while loading
        loadUrlButton.textContent = 'Loading...';
        
        // Basic URL validation
        if (!urlToLoad || !urlToLoad.startsWith('http')) {
            showErrorMessage('Please enter a valid URL (starting with http or https).');
            loadUrlButton.disabled = false;
            loadUrlButton.textContent = 'Load URL';
            return;
        }
        
        currentArticleUrl = urlToLoad; // Store the URL we are loading
        articleContent.innerHTML = '<p>Fetching article via proxy...</p>'; // Show temp message in hidden area
        contentArea.style.display = 'block'; // Show content area for loading message

        try {
            const fetchUrl = `${proxyUrl}?url=${encodeURIComponent(currentArticleUrl)}`;
            console.log('Fetching from proxy:', fetchUrl);
            const response = await fetch(fetchUrl);

            if (!response.ok) {
                let errorDetails = `Failed to fetch: ${response.status}`;
                try {
                    const errorData = await response.json(); 
                    errorDetails += ` - ${errorData.error || JSON.stringify(errorData)}`;
                } catch (e) {
                     try { errorDetails += ` - ${await response.text()}` } catch (e2) {} 
                } 
                throw new Error(errorDetails);
            }
            
            console.log("[loadArticleFromUrl] Fetch OK, reading response body...");
            const html = await response.text();
            console.log(`[loadArticleFromUrl] Response body read (${html.length} chars), parsing HTML...`);
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            console.log("[loadArticleFromUrl] HTML parsed into DOM document.");

            // Extract text content *after* successful fetch
            fullArticleText = doc.body.textContent || ""; 
            
            console.log("Fetch successful, parsing content...");
            parseAndDisplayArticle(html, doc); // Pass the parsed doc to avoid re-parsing
            aiSelectToggle.style.display = 'flex'; // Show FAB only on success

        } catch (error) {
            console.error('Error fetching or parsing article:', error);
            // Display error in the main area instead of the URL section
            contentArea.style.display = 'block';
            articleContent.innerHTML = `<p class="error-message">Failed to load article. <br>Error: ${error.message}</p>`;
            // Hide FAB on error
            aiSelectToggle.style.display = 'none';
        } finally {
             loadUrlButton.disabled = false; // Re-enable button
             loadUrlButton.textContent = 'Load URL';
        }
        console.log(`--- Finished loading article from URL: ${urlToLoad} ---`);
    }

    // Modified parseAndDisplayArticle to accept parsed doc and use currentArticleUrl
    function parseAndDisplayArticle(html, doc) { 
        console.log("[parseAndDisplayArticle] Started parsing...");
        // --- Selector Logic (Try specific -> generic article -> generic project -> fallback main/body) --- 
        let mainContentElement = doc.querySelector('div.single-post__content'); // MS Research blog/article

        if (!mainContentElement) { 
            console.warn("Selector 'div.single-post__content' failed, trying project page containers...");
            // Common patterns for project page content within main
            mainContentElement = doc.querySelector('main div[class*="section--body"]') || 
                                 doc.querySelector('main div[class*="content-container"]') ||
                                 doc.querySelector('main div.content'); // Add more specific project selectors if needed
        }

        if (!mainContentElement) {
             console.warn("Project page selectors failed, trying generic <article>...");
             mainContentElement = doc.querySelector('article'); // General article tag
        }

         if (!mainContentElement) {
             console.warn("Generic <article> selector failed, trying generic <main>...");
             mainContentElement = doc.querySelector('main'); // General main tag
         }

        // Specific handling for <main class="project"> with a single child container
        // if (mainContentElement && mainContentElement.tagName === 'MAIN' && mainContentElement.classList.contains('project') && mainContentElement.children.length === 1) {
        //     console.warn("Selected <main class='project'> has only one child. Assuming child is the actual content container.");
        //     mainContentElement = mainContentElement.children[0]; // Re-target to the single child - Handled by ms-row check below now
        // }

        // If still no specific container, fallback to body but warn the user
        if (!mainContentElement || mainContentElement.tagName === 'BODY') {
            console.warn("Could not find specific article container, using document.body. Parsing might include extra elements.");
            mainContentElement = doc.body;
        }
        // --- End of content area selection --- 

        if (mainContentElement) {
            console.log("Found content container:", mainContentElement.tagName, mainContentElement.className);
            articleContent.innerHTML = ''; // Clear loading message
            
            let elementsToParse = [];
            // If it's the specific project structure (main -> div.ms-row -> columns), parse the columns' children
            if (mainContentElement.tagName === 'DIV' && mainContentElement.classList.contains('ms-row') && mainContentElement.classList.contains('block-content') && mainContentElement.children.length > 0) {
                 console.warn("Container is div.ms-row. Parsing children of its children (columns/sections).");
                 Array.from(mainContentElement.children).forEach(columnOrSection => {
                     elementsToParse.push(...Array.from(columnOrSection.children));
                 });
             } else {
                 // Default: parse direct children of the found container
                 elementsToParse = Array.from(mainContentElement.children);
             }

            console.log(`Iterating through ${elementsToParse.length} elements for content.`);
            let addedNodes = 0;
            elementsToParse.forEach(node => {
                 if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'IMG', 'UL', 'OL', 'BLOCKQUOTE', 'FIGURE', 'TABLE'].includes(node.tagName)) {
                    // Special handling for images: use currentArticleUrl as base
                    if (node.tagName === 'IMG' || node.tagName === 'FIGURE') {
                        const imgs = node.tagName === 'IMG' ? [node] : node.querySelectorAll('img');
                        imgs.forEach(img => {
                            try {
                                const absoluteSrc = new URL(img.getAttribute('src'), currentArticleUrl).href; // Use current URL
                                img.setAttribute('src', absoluteSrc);
                            } catch (e) {
                                console.warn(`Could not make absolute URL for image src: ${img.getAttribute('src')}`, e);
                            }
                        });
                    }
                    
                    node.querySelectorAll('button, a[href]').forEach(interactive => interactive.remove());
                    articleContent.appendChild(node.cloneNode(true));
                    addedNodes++;
                 }
            });
            console.log(`Added ${addedNodes} nodes to the article content.`);
             makeElementsSelectable(); 
        } else {
             console.error("Could not find *any* suitable content container using selectors.");
             articleContent.innerHTML = '<p class="error-message">Could not parse main article content from the fetched HTML.</p>';
             aiSelectToggle.style.display = 'none'; // Hide FAB if parsing fails
        }
        console.log("[parseAndDisplayArticle] Finished parsing.");
    }

    // --- 2. Selection Logic --- 
    function toggleAiSelectMode() {
        isAiSelectMode = !isAiSelectMode;
        aiSelectToggle.textContent = isAiSelectMode ? 'Disable AI Select' : 'Enable AI Select';
        document.body.classList.toggle('ai-select-mode', isAiSelectMode);
        removeInteractionOptions(); // Remove buttons when toggling mode

        if (!isAiSelectMode && selectedElement) {
            // If mode is turned off, deselect any selected element
            selectedElement.classList.remove('ai-selected');
            selectedElement = null;
        }
        console.log("AI Select Mode:", isAiSelectMode);
    }

    function handleElementClick(event) {
        if (!isAiSelectMode) return; // Only act if AI select mode is on

        // Ensure we are targeting a direct child of articleContent (p, img, h2, etc.)
        // and not something inside those elements or the AI response divs.
        const target = event.target.closest('#articleContent > *:not(.ai-response)'); 

        if (target && target.parentElement === articleContent) {
            console.log("Clicked on:", target.tagName);
            
            // If clicking the already selected element, deselect it
            if (selectedElement === target) {
                 selectedElement.classList.remove('ai-selected');
                 selectedElement = null;
                 removeInteractionOptions();
            } else {
                // Deselect previous element
                if (selectedElement) {
                    selectedElement.classList.remove('ai-selected');
                }

                // Select new element
                selectedElement = target;
                selectedElement.classList.add('ai-selected');
                showInteractionOptions(selectedElement);
            }
            console.log("Selected element:", selectedElement);
        } else {
             // If clicked outside a valid target, deselect
             if (selectedElement) {
                 selectedElement.classList.remove('ai-selected');
                 selectedElement = null;
                 removeInteractionOptions();
             }
        }
    }
    
    function makeElementsSelectable() {
        // Add click listeners to direct children of articleContent
        Array.from(articleContent.children).forEach(el => {
            // Avoid adding listeners to the AI response blocks
            if (!el.classList.contains('ai-response')) {
                 el.removeEventListener('click', handleElementClick);
                 el.addEventListener('click', handleElementClick);
            }
        });
    }

    // --- 3. Interaction Options (Placeholder) ---
    function showInteractionOptions(element) {
        // Remove existing options first
        removeInteractionOptions(); 

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'ai-options'; // Use class for styling

        const explainButton = document.createElement('button');
        explainButton.textContent = 'Explain';
        explainButton.onclick = () => handleInteraction('explain', element);

        const simplifyButton = document.createElement('button');
        simplifyButton.textContent = 'Simplify';
        simplifyButton.onclick = () => handleInteraction('simplify', element);

        optionsContainer.appendChild(explainButton);
        optionsContainer.appendChild(simplifyButton);

        // Position the options above the selected element
        const rect = element.getBoundingClientRect();
        optionsContainer.style.position = 'absolute'; // Position relative to viewport initially
        optionsContainer.style.top = `${window.scrollY + rect.top - optionsContainer.offsetHeight - 5}px`; // Place above, adjust 5px margin
        optionsContainer.style.left = `${window.scrollX + rect.left}px`;
        optionsContainer.style.zIndex = '10'; // Ensure it's above content

        document.body.appendChild(optionsContainer);

        // Re-calculate top position after rendering to get height
         requestAnimationFrame(() => {
            optionsContainer.style.top = `${window.scrollY + rect.top - optionsContainer.offsetHeight - 5}px`;
        });
    }

    function removeInteractionOptions() {
         const existingOptions = document.querySelector('.ai-options');
         if (existingOptions) {
             existingOptions.remove();
         }
    }

    // --- 4. Handle Interaction (Mock LLM Call) --- 
    async function handleInteraction(type, element) { // Make function async
        console.log(`[handleInteraction] Action: ${type} on element:`, element.tagName);
        removeInteractionOptions(); // Hide buttons immediately

        // Show loading state (optional, could add a spinner or message)
        element.classList.add('ai-loading'); // Example class for loading style
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'ai-response ai-loading-indicator';
        loadingIndicator.innerHTML = '<h4>Processing...</h4><p>Contacting AI assistant...</p>';
        insertOrReplaceResponse(element, loadingIndicator); // Insert loading indicator

        // --- Prepare data payload --- 
        let payload = {
            actionType: type,
            context: fullArticleText // Send full article text as context
        };

        if (element.tagName === 'IMG') {
            payload.imageUrl = element.src;
            payload.imageAlt = element.alt;
            console.log("Preparing payload for IMAGE:", payload);
        } else if (element.tagName === 'FIGURE') {
             const img = element.querySelector('img');
             if (img) {
                 payload.imageUrl = img.src;
                 payload.imageAlt = img.alt;
                 console.log("Preparing payload for FIGURE with IMAGE:", payload);
             } else {
                  // Fallback for figures without images (unlikely for interaction)
                  payload.selectedText = element.textContent;
                  console.log("Preparing payload for FIGURE (no image found, using textContent):", payload);
             }
        } else {
             payload.selectedText = element.textContent; // Get the selected text content
             console.log("Preparing payload for TEXT element:", payload);
        }
        // --- End Prepare data payload --- 

        console.log("[handleInteraction] Sending request to /api/llm-request with payload:", payload);

        try {
            // Call the serverless function
            const response = await fetch('/api/llm-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload), // Send the prepared payload
            });

            element.classList.remove('ai-loading'); // Remove loading style

            if (!response.ok) {
                let errorMsg = `API request failed: ${response.status}`;
                 try { 
                    const errData = await response.json();
                     errorMsg = errData.error || JSON.stringify(errData);
                 } catch (e) { /* Ignore if response wasn't JSON */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            const llmResponseText = data.response;

            console.log("[handleInteraction] Received successful LLM response.");
            // Insert the actual LLM response
            insertAiResponse(element, type, llmResponseText);

        } catch (error) {
            console.error('Error during LLM interaction:', error);
            element.classList.remove('ai-loading'); // Ensure loading style is removed on error
            // Display error message instead of response
            insertAiResponse(element, 'error', `Error: ${error.message}`);
        }
        
        // --- Original code for deselecting etc. ---
        if (selectedElement) {
            selectedElement.classList.remove('ai-selected');
            selectedElement = null;
        }
         isAiSelectMode = false; // Turn off select mode after action
         aiSelectToggle.textContent = 'Enable AI Select';
         document.body.classList.remove('ai-select-mode');
    }

    // --- 5. Dynamic Content Insertion --- 
    // Helper to insert or replace the AI response/loading block
    function insertOrReplaceResponse(targetElement, responseDiv) {
         const existingResponse = targetElement.nextElementSibling;
         if (existingResponse && (existingResponse.classList.contains('ai-response') || existingResponse.classList.contains('ai-loading-indicator'))) {
             targetElement.parentNode.replaceChild(responseDiv, existingResponse);
         } else {
             targetElement.parentNode.insertBefore(responseDiv, targetElement.nextSibling);
         }
    }
    
    function insertAiResponse(targetElement, type, responseContent) {
         // Remove any existing AI response related to this target element first (handled by insertOrReplaceResponse now)
//         const existingResponse = targetElement.nextElementSibling;
//         if (existingResponse && existingResponse.classList.contains('ai-response')) {
//             existingResponse.remove();
//         }

        const responseDiv = document.createElement('div');
        responseDiv.className = 'ai-response'; // General class

        const heading = document.createElement('h4');
        // Adjust heading based on type (explain, simplify, error)
        switch (type) {
            case 'explain':
                heading.textContent = 'Explanation:';
                break;
            case 'simplify':
                heading.textContent = 'Simplified:';
                break;
            case 'error':
                 heading.textContent = 'Error:';
                 responseDiv.classList.add('ai-error'); // Add error class for styling
                 break;
            default:
                 heading.textContent = 'Response:';
        }
        
        const contentP = document.createElement('p');
        // Use innerHTML in case the LLM response contains basic formatting (bold, italics)
        // Be cautious with unsanitized LLM responses in a real app!
        contentP.innerHTML = responseContent; 

        responseDiv.appendChild(heading);
        responseDiv.appendChild(contentP);

        // Insert or replace the response block
        insertOrReplaceResponse(targetElement, responseDiv);
        
        console.log(`Inserted AI response (${type}) after:`, targetElement);
        
        // Re-enable selection listeners as inserting might affect siblings
        makeElementsSelectable();
    }

    // --- Event Listeners --- 

    // --- Initial Setup --- 
    // Remove initial fetch
    // fetchAndRenderArticle(); 
    
    // Add listener for the Load URL button
    loadUrlButton.addEventListener('click', () => {
        console.log("Load URL button clicked.");
        const url = urlInput.value.trim();
        loadArticleFromUrl(url);
    });

    // Add listener for Enter key in URL input
    urlInput.addEventListener('keypress', (event) => {
         if (event.key === 'Enter') {
             event.preventDefault(); // Prevent form submission if it were in a form
             loadUrlButton.click(); // Trigger button click
         }
    });

    // Add listeners for example links
    if (exampleLinksContainer) {
         exampleLinksContainer.addEventListener('click', (event) => {
             console.log("Click detected within example links container.");
             if (event.target.tagName === 'A' && event.target.dataset.url) {
                 console.log(`Example link clicked: ${event.target.textContent}`);
                 event.preventDefault();
                 urlInput.value = event.target.dataset.url;
                 loadUrlButton.click(); // Trigger load
             }
         });
    }

    aiSelectToggle.addEventListener('click', toggleAiSelectMode); // Keep FAB listener

    console.log("Initial script setup complete. Waiting for user input.");

}); 