document.addEventListener('DOMContentLoaded', () => {
    const articleContent = document.getElementById('articleContent');
    const aiSelectToggle = document.getElementById('aiSelectToggle');
    const articleUrl = 'https://www.microsoft.com/en-us/research/articles/a-periodic-table-for-machine-learning/';
    // Define the proxy URL - Now points to the Vercel serverless function route
    const proxyUrl = '/api/fetch-article';

    let isAiSelectMode = false;
    let selectedElement = null;
    let fullArticleText = ""; // Store full article text for context

    // --- 1. Fetch and Render Article --- 
    async function fetchAndRenderArticle() {
        articleContent.innerHTML = '<p>Fetching article via proxy...</p>';
        try {
            // Construct the URL for the proxy, passing the target URL as a query parameter
            const fetchUrl = `${proxyUrl}?url=${encodeURIComponent(articleUrl)}`;
            console.log('Fetching from proxy:', fetchUrl);

            const response = await fetch(fetchUrl);

            if (!response.ok) {
                // Try to get error details from the proxy response
                let errorDetails = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json(); // Proxy sends JSON on error
                    errorDetails = errorData.error || JSON.stringify(errorData);
                } catch (e) {
                    // If response is not JSON, use text
                    errorDetails = await response.text();
                } 
                throw new Error(errorDetails);
            }
            
            const html = await response.text();
            // Store the raw HTML or parsed text for context
            // Storing parsed text might be better
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            fullArticleText = doc.body.textContent || ""; // Simple text extraction for context
            
            parseAndDisplayArticle(html);

        } catch (error) {
            console.error('Error fetching or parsing article:', error);
            articleContent.innerHTML = `<p>Failed to load article. Check if the proxy server is running. <br>Error: ${error.message}</p>`;
             // Optionally load placeholder if fetch fails completely
             // loadPlaceholderContent(); 
        }
    }

    function parseAndDisplayArticle(html) {
        // TODO: Implement robust HTML parsing to extract the main content
        // This is a very simplified example and likely needs refinement
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // --- Let's try a more specific selector based on observed structure ---
        let mainContentElement = doc.querySelector('div.single-post__content'); 

        if (!mainContentElement) {
            // Fallback to the previous semantic selector attempt
            console.warn("Primary selector 'div.single-post__content' failed, trying 'main article'...");
            mainContentElement = doc.querySelector('main article');
        }

        if (!mainContentElement) {
            // Fallback to the previous specific selector attempt
             console.warn('Selector "main article" failed, trying "div[class*="content--article-body"] article"...');
            mainContentElement = doc.querySelector('div[class*="content--article-body"] article');
        }
        
        if (!mainContentElement) {
            // Fallback selectors if the primary ones fail
             console.warn("Specific content selectors failed, trying generic fallbacks 'article' or 'main'...");
             mainContentElement = doc.querySelector('article') || doc.querySelector('main');
        }

        if (!mainContentElement || mainContentElement.tagName === 'BODY') {
            console.warn("Could not find specific article container, using document.body. Parsing might include extra elements.");
            mainContentElement = doc.body;
        }
        // --- End of content area selection --- 

        if (mainContentElement) {
            console.log("Found content container:", mainContentElement.tagName, mainContentElement.className);
            // Clear loading message
            articleContent.innerHTML = '';
            // Append relevant child nodes (paragraphs, images, headings, lists, blockquotes)
            // We iterate through direct children and filter by common content tags.
            const children = Array.from(mainContentElement.children);
            console.log(`Container has ${children.length} direct children.`);
            let addedNodes = 0;
            children.forEach(node => {
                // Filter for common block-level content elements
                 if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'IMG', 'UL', 'OL', 'BLOCKQUOTE', 'FIGURE', 'TABLE'].includes(node.tagName)) {
                    // Special handling for images: ensure src attributes are absolute if needed
                    // (The MS Research page seems to use relative paths sometimes)
                    if (node.tagName === 'IMG' || node.tagName === 'FIGURE') {
                        const imgs = node.tagName === 'IMG' ? [node] : node.querySelectorAll('img');
                        imgs.forEach(img => {
                            // Create a URL object from the img.src relative to the original article URL
                            try {
                                const absoluteSrc = new URL(img.getAttribute('src'), articleUrl).href;
                                img.setAttribute('src', absoluteSrc);
                                console.log(`Adjusted image src to: ${absoluteSrc}`);
                            } catch (e) {
                                console.warn(`Could not make absolute URL for image src: ${img.getAttribute('src')}`, e);
                                // Optionally remove the image or leave it as is if it fails
                                // img.remove(); 
                            }
                        });
                    }
                    
                    // Ensure elements don't have nested interactive elements that might interfere
                    node.querySelectorAll('button, a[href]').forEach(interactive => interactive.remove());
                    
                    // Add the cleaned node
                    articleContent.appendChild(node.cloneNode(true));
                    addedNodes++;
                 }
            });
            console.log(`Added ${addedNodes} nodes to the article content.`);
             makeElementsSelectable(); // Make the newly added elements selectable
        } else {
             console.error("Could not find *any* suitable content container using selectors.");
             articleContent.innerHTML = '<p>Could not parse main article content even with fallbacks.</p>';
        }
    }

    // Placeholder function (no longer the primary way to load)
    function loadPlaceholderContent() {
        // Example: Load content if fetch fails or CORS is an issue
        articleContent.innerHTML = `
            <h2>Placeholder Content</h2>
            <p>This is the first paragraph. Direct fetching from the URL is often blocked by browser security (CORS). We need a backend proxy or browser extension for live fetching during development.</p>
            <img src="https://via.placeholder.com/600x200.png?text=Placeholder+Image" alt="Placeholder Image">
            <p>This is another paragraph. Click the "Enable AI Select" button, then click on a paragraph or image to select it.</p>
            <p>Once selected, interaction buttons (Explain/Simplify) would appear (though they are not implemented yet).</p>
        `;
        makeElementsSelectable();
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
        console.log(`Action: ${type} on element:`, element);
        removeInteractionOptions(); // Hide buttons immediately

        // Show loading state (optional, could add a spinner or message)
        element.classList.add('ai-loading'); // Example class for loading style
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'ai-response ai-loading-indicator';
        loadingIndicator.innerHTML = '<h4>Processing...</h4><p>Contacting AI assistant...</p>';
        insertOrReplaceResponse(element, loadingIndicator); // Insert loading indicator

        // Get the selected text content (simple approach)
        const selectedText = element.textContent;

        try {
            // Call the serverless function
            const response = await fetch('/api/llm-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    selectedText: selectedText,
                    actionType: type,
                    context: fullArticleText // Send full article text as context
                }),
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

    // --- Initial Setup --- 
    aiSelectToggle.addEventListener('click', toggleAiSelectMode);
    fetchAndRenderArticle(); // Initial article load via proxy

}); 