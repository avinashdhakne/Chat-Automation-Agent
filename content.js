// Main content script for the chatbot extension
console.log("Chatbot content script is running!");

// Use chrome.runtime.getURL to get the correct URLs for module imports
const uiModuleUrl = chrome.runtime.getURL('components/ui.js');
const webAgentModuleUrl = chrome.runtime.getURL('components/webAgent.js');
const chatLogicModuleUrl = chrome.runtime.getURL('components/chatLogic.js');
const apiServiceModuleUrl = chrome.runtime.getURL('components/apiService.js');
const workflowAutomationUrl = chrome.runtime.getURL('components/workflowAutomation.js');
const userActionTrackerUrl = chrome.runtime.getURL('components/userActionTracker.js');

// Dynamic imports using the correct URLs
async function initializeChatbot() {
    try {
        // Import all modules dynamically
        const [uiModule, webAgentModule, chatLogicModule, apiServiceModule, workflowModule, trackerModule] = await Promise.all([
            import(uiModuleUrl),
            import(webAgentModuleUrl),
            import(chatLogicModuleUrl),
            import(apiServiceModuleUrl),
            import(workflowAutomationUrl),
            import(userActionTrackerUrl)
        ]);
        
        // Extract functions and objects from modules
        const { createChatbotUI, addHighlightStyles, appendMessage, maximizeChatbot, restoreChatbot } = uiModule;
        const { webAgent } = webAgentModule;
        const { processNaturalLanguage } = chatLogicModule;
        const { getOllamaResponse, preparePromptWithContext } = apiServiceModule;
        const { 
            startWorkflowRecording, 
            stopWorkflowRecording, 
            saveRecordedWorkflow
        } = workflowModule;
        
        // Initialize UI components
        addHighlightStyles();
        const ui = createChatbotUI();
        
        // Add recording status indicator to UI
        const recordingIndicator = document.createElement('div');
        recordingIndicator.id = 'recording-indicator';
        recordingIndicator.style.display = 'none';
        recordingIndicator.style.position = 'fixed';
        recordingIndicator.style.top = '10px';
        recordingIndicator.style.right = '10px';
        recordingIndicator.style.backgroundColor = '#ff5722';
        recordingIndicator.style.color = 'white';
        recordingIndicator.style.padding = '5px 10px';
        recordingIndicator.style.borderRadius = '5px';
        recordingIndicator.style.zIndex = '10000';
        recordingIndicator.style.fontSize = '12px';
        recordingIndicator.textContent = '🔴 Recording';
        document.body.appendChild(recordingIndicator);
        
        // Modify the input container to include circular record button and arrow send button
        const inputContainer = ui.elements.userInput.parentNode;
        
        // Remove the old send button
        if (ui.elements.sendBtn) {
            ui.elements.sendBtn.remove();
        }
        
        // Create circular record button
        const recordBtn = document.createElement('button');
        recordBtn.id = 'record-btn';
        recordBtn.style.width = '36px';
        recordBtn.style.height = '36px';
        recordBtn.style.borderRadius = '50%';
        recordBtn.style.backgroundColor = '#0066cc';
        recordBtn.style.color = 'white';
        recordBtn.style.border = 'none';
        recordBtn.style.display = 'flex';
        recordBtn.style.alignItems = 'center';
        recordBtn.style.justifyContent = 'center';
        recordBtn.style.margin = '0 5px';
        recordBtn.style.cursor = 'pointer';
        recordBtn.style.flexShrink = '0';
        recordBtn.innerHTML = '⚫'; // Record icon
        recordBtn.title = 'Start Recording Actions';
        
        // Create stop recording button (initially hidden)
        const stopRecordBtn = document.createElement('button');
        stopRecordBtn.id = 'stop-record-btn';
        stopRecordBtn.style.width = '36px';
        stopRecordBtn.style.height = '36px';
        stopRecordBtn.style.borderRadius = '50%';
        stopRecordBtn.style.backgroundColor = '#ff5722';
        stopRecordBtn.style.color = 'white';
        stopRecordBtn.style.border = 'none';
        stopRecordBtn.style.display = 'none'; // Hidden initially
        stopRecordBtn.style.alignItems = 'center';
        stopRecordBtn.style.justifyContent = 'center';
        stopRecordBtn.style.margin = '0 5px';
        stopRecordBtn.style.cursor = 'pointer';
        stopRecordBtn.style.flexShrink = '0';
        stopRecordBtn.innerHTML = '⏹️'; // Stop icon
        stopRecordBtn.title = 'Stop Recording';
        
        // Create arrow send button
        const sendBtn = document.createElement('button');
        sendBtn.id = 'send-btn';
        sendBtn.style.width = '36px';
        sendBtn.style.height = '36px';
        sendBtn.style.borderRadius = '50%';
        sendBtn.style.backgroundColor = '#0066cc';
        sendBtn.style.color = 'white';
        sendBtn.style.border = 'none';
        sendBtn.style.display = 'flex';
        sendBtn.style.alignItems = 'center';
        sendBtn.style.justifyContent = 'center';
        sendBtn.style.cursor = 'pointer';
        sendBtn.style.flexShrink = '0';
        sendBtn.innerHTML = '➤'; // Arrow icon
        sendBtn.title = 'Send Message';
        
        // Append buttons to input container
        inputContainer.appendChild(recordBtn);
        inputContainer.appendChild(stopRecordBtn);
        inputContainer.appendChild(sendBtn);
        
        // Update references in UI elements
        ui.elements.sendBtn = sendBtn;
        ui.elements.recordBtn = recordBtn;
        ui.elements.stopRecordBtn = stopRecordBtn;
        
        // Set up event listeners for the chatbot interface
        ui.elements.minimizeBtn.addEventListener('click', () => {
            ui.container.style.display = 'none';
            ui.minimized.style.display = 'flex';
        });
        
        ui.minimized.addEventListener('click', () => {
            ui.minimized.style.display = 'none';
            ui.container.style.display = 'flex';
        });
        
        // Add maximize button functionality
        ui.elements.maximizeBtn.addEventListener('click', () => {
            // Check if already maximized
            if (ui.container.dataset.isMaximized === 'true') {
                // Restore to normal size
                restoreChatbot(ui.container);
                ui.elements.maximizeBtn.textContent = '⬓'; // Change icon to maximize
                ui.elements.maximizeBtn.title = 'Maximize to left side';
            } else {
                // Maximize to left side
                maximizeChatbot(ui.container);
                ui.elements.maximizeBtn.textContent = '❐'; // Change icon to restore
                ui.elements.maximizeBtn.title = 'Restore to normal size';
            }
        });
        
        // Add keyboard event for Enter key
        ui.elements.userInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                ui.elements.sendBtn.click();
            }
        });
        
        // Handle recording button clicks
        let currentWorkflowName = '';
        
        recordBtn.addEventListener('click', async () => {
            try {
                // Prompt for workflow name
                const workflowName = prompt('Enter a name for this workflow recording:', 'my-workflow');
                if (workflowName === null) return; // User canceled
                
                currentWorkflowName = workflowName;
                
                // Start recording
                const message = await startWorkflowRecording(workflowName);
                appendMessage(ui.elements.chatbox, 'Chatbot', message);
                
                // Update UI
                recordingIndicator.style.display = 'block';
                recordBtn.style.display = 'none';
                stopRecordBtn.style.display = 'flex';
            } catch (error) {
                console.error('Error starting recording:', error);
                appendMessage(ui.elements.chatbox, 'Chatbot', `Error starting recording: ${error.message}`);
            }
        });
        
        stopRecordBtn.addEventListener('click', async () => {
            try {
                // Stop recording
                const result = await stopWorkflowRecording();
                
                // Save the recorded workflow
                const saveResult = await saveRecordedWorkflow(currentWorkflowName);
                
                // Update UI
                recordingIndicator.style.display = 'none';
                recordBtn.style.display = 'flex';
                stopRecordBtn.style.display = 'none';
                
                // Show results
                appendMessage(ui.elements.chatbox, 'Chatbot', 
                    `Recording stopped. ${result.recordingResult.summary}\n` +
                    `${saveResult.message}\n` +
                    `These actions can be used to train the LLM for workflow automation.`
                );
                
                // Reset workflow name
                currentWorkflowName = '';
            } catch (error) {
                console.error('Error stopping recording:', error);
                appendMessage(ui.elements.chatbox, 'Chatbot', `Error stopping recording: ${error.message}`);
                
                // Reset UI anyway
                recordingIndicator.style.display = 'none';
                recordBtn.style.display = 'flex';
                stopRecordBtn.style.display = 'none';
            }
        });
        
        // Main send button handler
        ui.elements.sendBtn.addEventListener('click', async () => {
            const userMessage = ui.elements.userInput.value.trim();
            if (userMessage) {
                // Display user message
                appendMessage(ui.elements.chatbox, 'User', userMessage);
                ui.elements.userInput.value = '';
                console.log("User message:", userMessage);
                
                // Show thinking indicator
                const thinkingMessage = appendMessage(ui.elements.chatbox, 'Chatbot', 'Thinking...');
                
                try {
                    // First check if it's a web action in natural language (now async)
                    const actionResponse = await processNaturalLanguage(userMessage, ui.elements);
                    
                    // Remove the thinking message
                    ui.elements.chatbox.removeChild(thinkingMessage);
                    
                    if (actionResponse) {
                        // Check if this is a workflow response
                        if (typeof actionResponse === 'object' && actionResponse.type === 'workflow') {
                            // Show initial workflow message
                            const workflowMessage = appendMessage(ui.elements.chatbox, 'Chatbot', 
                                `I'll help you with "${actionResponse.task}". Analyzing what needs to be done...`);
                            
                            // Execute the workflow with progress updates
                            const progressCallback = (update) => {
                                workflowMessage.lastChild.textContent = update;
                                ui.elements.chatbox.scrollTop = ui.elements.chatbox.scrollHeight;
                            };
                            
                            try {
                                const result = await actionResponse.execute(progressCallback);
                                
                                // After completion, add a new message showing final status
                                setTimeout(() => {
                                    appendMessage(ui.elements.chatbox, 'Chatbot', result.message);
                                }, 1000);
                                
                            } catch (workflowError) {
                                console.error('Workflow execution error:', workflowError);
                                appendMessage(ui.elements.chatbox, 'Chatbot', 
                                    `I encountered an error while trying to complete this task: ${workflowError.message}`);
                            }
                        } else {
                            // It's a regular action command
                            appendMessage(ui.elements.chatbox, 'Chatbot', actionResponse);
                        }
                    } else {
                        // It's a regular chat message - include page context
                        const enhancedPrompt = preparePromptWithContext(userMessage);
                        
                        // Show new thinking message
                        const chatThinkingMsg = appendMessage(ui.elements.chatbox, 'Chatbot', 'Thinking...');
                        
                        try {
                            const chatbotResponse = await getOllamaResponse(enhancedPrompt);
                            // Replace the thinking message
                            ui.elements.chatbox.removeChild(chatThinkingMsg);
                            appendMessage(ui.elements.chatbox, 'Chatbot', chatbotResponse);
                        } catch (error) {
                            console.error('Error getting response from proxy server:', error);
                            // Replace the thinking message
                            ui.elements.chatbox.removeChild(chatThinkingMsg);
                            appendMessage(ui.elements.chatbox, 'Chatbot', 'Sorry, something went wrong.');
                        }
                    }
                } catch (error) {
                    console.error('Error processing message:', error);
                    ui.elements.chatbox.removeChild(thinkingMessage);
                    appendMessage(ui.elements.chatbox, 'Chatbot', 'Sorry, I had trouble processing your request.');
                }
            }
        });
        
        // Listen for messages from background script (for context menu actions)
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('Content script received message:', message);
            
            if (message.action === 'startRecording') {
                recordBtn.click();
                sendResponse({ success: true });
            } 
            else if (message.action === 'stopRecording') {
                stopRecordBtn.click();
                sendResponse({ success: true });
            } 
            else if (message.action === 'extractElements') {
                const elements = extractInteractiveElements();
                sendResponse({ success: true, elements: elements });
            }
            
            return true; // Keep the message channel open for async response
        });
        
        // Add welcome message
        appendMessage(ui.elements.chatbox, 'Chatbot', 'Hello! I\'m your assistant. I can chat normally or help you interact with this webpage. Try asking me to "click a button" or "fill a form field". You can also record your actions using the red record button.');
    } catch (error) {
        console.error('Failed to initialize chatbot:', error);
        // Try to add an error message to the page
        const errorMsg = document.createElement('div');
        errorMsg.style.position = 'fixed';
        errorMsg.style.bottom = '20px';
        errorMsg.style.right = '20px';
        errorMsg.style.backgroundColor = '#f44336';
        errorMsg.style.color = 'white';
        errorMsg.style.padding = '15px';
        errorMsg.style.borderRadius = '5px';
        errorMsg.style.zIndex = '10000';
        errorMsg.textContent = 'Chatbot failed to initialize. Please check the console for errors.';
        document.body.appendChild(errorMsg);
    }
}

// Start initialization
initializeChatbot();

// Element extraction for site crawler
function extractInteractiveElements() {
    // Container for all elements with their keywords
    const elements = [];
    
    // Extract inputs
    const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea');
    inputs.forEach(input => {
        const element = {
            type: input.tagName.toLowerCase(),
            inputType: input.getAttribute('type') || 'text',
            placeholder: input.getAttribute('placeholder') || '',
            ariaLabel: input.getAttribute('aria-label') || '',
            name: input.getAttribute('name') || '',
            id: input.getAttribute('id') || '',
            required: input.required || false,
            selector: generateUniqueSelector(input)
        };
        
        // Generate keyword
        element.keyword = generateKeyword(element);
        elements.push(element);
    });
    
    // Extract buttons
    const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
    buttons.forEach(button => {
        const element = {
            type: 'button',
            text: button.innerText || button.value || '',
            ariaLabel: button.getAttribute('aria-label') || '',
            name: button.getAttribute('name') || '',
            id: button.getAttribute('id') || '',
            selector: generateUniqueSelector(button)
        };
        
        // Generate keyword
        element.keyword = generateKeyword(element);
        elements.push(element);
    });
    
    // Extract links
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
        const element = {
            type: 'link',
            href: link.getAttribute('href'),
            text: link.innerText.trim() || link.getAttribute('title') || '',
            ariaLabel: link.getAttribute('aria-label') || '',
            id: link.getAttribute('id') || '',
            selector: generateUniqueSelector(link)
        };
        
        // Generate keyword
        element.keyword = generateKeyword(element);
        elements.push(element);
    });
    
    // Extract select dropdowns
    const selects = document.querySelectorAll('select');
    selects.forEach(select => {
        const options = Array.from(select.options).map(option => option.text);
        const element = {
            type: 'select',
            options: options,
            ariaLabel: select.getAttribute('aria-label') || '',
            name: select.getAttribute('name') || '',
            id: select.getAttribute('id') || '',
            selector: generateUniqueSelector(select)
        };
        
        // Generate keyword
        element.keyword = generateKeyword(element);
        elements.push(element);
    });
    
    // Extract images
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        const element = {
            type: 'img',
            src: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || '',
            id: img.getAttribute('id') || '',
            selector: generateUniqueSelector(img)
        };
        
        // Generate keyword
        element.keyword = generateKeyword(element);
        elements.push(element);
    });
    
    return {
        url: window.location.href,
        title: document.title,
        elements: elements
    };
}

// Generate a keyword for an element based on its attributes
function generateKeyword(element) {
    let keyword = '';
    
    // Try different attributes in order of preference
    if (element.ariaLabel) {
        keyword = element.ariaLabel;
    } else if (element.placeholder) {
        keyword = element.placeholder;
    } else if (element.alt) {
        keyword = element.alt;
    } else if (element.name) {
        keyword = element.name;
    } else if (element.id) {
        keyword = element.id;
    } else if (element.text && element.text.trim()) {
        keyword = element.text.trim();
    } else {
        // Generate a keyword based on element type and a random string
        keyword = `${element.type}_${Math.random().toString(36).substring(2, 10)}`;
    }
    
    // Clean up the keyword
    return keyword
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .substring(0, 50); // Keep keywords reasonably sized
}

// Generate a unique CSS selector for an element
function generateUniqueSelector(element) {
    if (element.id) {
        return `#${element.id}`;
    }
    
    if (element.className && typeof element.className === 'string' && element.className.trim() !== '') {
        const classes = element.className.split(' ')
            .filter(c => c.trim() !== '')
            .map(c => `.${c}`)
            .join('');
        if (classes) {
            return `${element.tagName.toLowerCase()}${classes}`;
        }
    }
    
    // Path selector as fallback
    let path = element.tagName.toLowerCase();
    let parent = element.parentElement;
    let pathLimit = 5; // Limit the path depth
    
    while (parent && pathLimit > 0) {
        path = `${parent.tagName.toLowerCase()} > ${path}`;
        parent = parent.parentElement;
        pathLimit--;
    }
    
    return path;
}

// Variable to track if we're recording
let isRecording = false;
let recordedActions = [];
let startTimestamp = 0;

// Start recording user actions
function startRecording() {
    console.log('Starting to record user actions');
    isRecording = true;
    recordedActions = [];
    startTimestamp = Date.now();
    
    // Add listeners for user interactions
    document.addEventListener('click', recordClick);
    document.addEventListener('input', recordInput);
    document.addEventListener('change', recordChange);
    
    // Highlight the page or show recording status
    addRecordingIndicator();
}

// Stop recording
function stopRecording() {
    console.log('Stopping recording');
    isRecording = false;
    
    // Remove listeners
    document.removeEventListener('click', recordClick);
    document.removeEventListener('input', recordInput);
    document.removeEventListener('change', recordChange);
    
    // Remove recording indicator
    removeRecordingIndicator();
    
    // Save the recording
    saveRecording();
}

// Record click events
function recordClick(event) {
    if (!isRecording) return;
    
    const element = event.target;
    const timeOffset = Date.now() - startTimestamp;
    
    // Skip if it's on the recording indicator
    if (element.closest('#recording-indicator')) return;
    
    // Determine what was clicked
    const action = {
        type: 'click',
        timeOffset,
        timestamp: new Date().toISOString(),
        element: {
            tagName: element.tagName,
            id: element.id,
            className: element.className,
            innerText: element.innerText ? element.innerText.substring(0, 100) : '',
            href: element.href || '',
            selector: generateUniqueSelector(element)
        }
    };
    
    recordedActions.push(action);
    console.log('Recorded click:', action);
}

// Record input events (typing)
function recordInput(event) {
    if (!isRecording) return;
    
    const element = event.target;
    const timeOffset = Date.now() - startTimestamp;
    
    // Skip if it's on the recording indicator
    if (element.closest('#recording-indicator')) return;
    
    // Only record for input-capable elements
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable) {
        const value = element.value || element.innerText;
        
        const action = {
            type: 'input',
            timeOffset,
            timestamp: new Date().toISOString(),
            element: {
                tagName: element.tagName,
                id: element.id,
                className: element.className,
                inputType: element.type,
                name: element.name,
                value: value ? value.substring(0, 100) : '',
                selector: generateUniqueSelector(element)
            }
        };
        
        // Debounce input recording
        if (recordedActions.length > 0) {
            const lastAction = recordedActions[recordedActions.length - 1];
            if (lastAction.type === 'input' && 
                lastAction.element.selector === action.element.selector &&
                timeOffset - lastAction.timeOffset < 1000) {
                // Update the last action instead of adding a new one
                lastAction.element.value = action.element.value;
                lastAction.timeOffset = timeOffset;
                lastAction.timestamp = action.timestamp;
                return;
            }
        }
        
        recordedActions.push(action);
        console.log('Recorded input:', action);
    }
}

// Record select/checkbox/radio changes
function recordChange(event) {
    if (!isRecording) return;
    
    const element = event.target;
    const timeOffset = Date.now() - startTimestamp;
    
    // Skip if it's on the recording indicator
    if (element.closest('#recording-indicator')) return;
    
    let value;
    if (element.type === 'checkbox' || element.type === 'radio') {
        value = element.checked;
    } else {
        value = element.value;
    }
    
    const action = {
        type: 'change',
        timeOffset,
        timestamp: new Date().toISOString(),
        element: {
            tagName: element.tagName,
            id: element.id,
            className: element.className,
            inputType: element.type,
            name: element.name,
            value,
            selector: generateUniqueSelector(element)
        }
    };
    
    recordedActions.push(action);
    console.log('Recorded change:', action);
}

// Save the recording to the background script
function saveRecording() {
    const recordingData = {
        url: window.location.href,
        title: document.title,
        startTime: new Date(startTimestamp).toISOString(),
        endTime: new Date().toISOString(),
        actions: recordedActions
    };
    
    const filename = `recording_${Date.now()}.json`;
    
    chrome.runtime.sendMessage({
        action: 'saveRecordedActions',
        data: recordingData,
        filename
    }, (response) => {
        if (response && response.success) {
            console.log('Recording saved:', response);
        } else {
            console.error('Failed to save recording:', response);
        }
    });
}

// Add a visual indicator that recording is in progress
function addRecordingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'recording-indicator';
    indicator.style.position = 'fixed';
    indicator.style.top = '10px';
    indicator.style.right = '10px';
    indicator.style.padding = '10px 20px';
    indicator.style.background = 'rgba(255, 0, 0, 0.7)';
    indicator.style.color = 'white';
    indicator.style.borderRadius = '5px';
    indicator.style.fontFamily = 'Arial, sans-serif';
    indicator.style.fontSize = '14px';
    indicator.style.zIndex = '9999';
    indicator.textContent = 'Recording Actions...';
    
    document.body.appendChild(indicator);
}

// Remove the recording indicator
function removeRecordingIndicator() {
    const indicator = document.getElementById('recording-indicator');
    if (indicator) {
        indicator.parentNode.removeChild(indicator);
    }
}

// After the page loads, check if we're in crawler mode (run by the extension)
if (window.location.href.includes('crawler=true') || document.referrer.includes('chrome-extension://')) {
    // This page is being viewed as part of a crawl
    console.log('Page loaded in crawler mode');
    
    // Extract all interactive elements and send them to background
    setTimeout(() => {
        const elements = extractInteractiveElements();
        chrome.runtime.sendMessage({
            action: 'savePageElements',
            url: window.location.href,
            elements: elements
        }, (response) => {
            console.log('Elements saved response:', response);
        });
    }, 1000); // Small delay to ensure page is fully loaded
}

// If this script is injected by the site crawler, extract elements immediately
if (window.crawlerExtraction) {
    return extractInteractiveElements();
}