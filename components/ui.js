// UI Components for the chatbot

// Create and append the chatbot UI to the page
export function createChatbotUI() {
    // Create the chatbot container
    const chatbotContainer = document.createElement('div');
    chatbotContainer.id = 'chatbot-container';
    chatbotContainer.style.position = 'fixed';
    chatbotContainer.style.bottom = '20px';
    chatbotContainer.style.right = '20px';
    chatbotContainer.style.width = '300px';
    chatbotContainer.style.height = '400px';
    chatbotContainer.style.border = '1px solid #0066cc';
    chatbotContainer.style.borderRadius = '10px';
    chatbotContainer.style.backgroundColor = '#ffffff';
    chatbotContainer.style.boxShadow = '0 4px 8px rgba(0, 102, 204, 0.3)';
    chatbotContainer.style.zIndex = '9999';
    chatbotContainer.style.display = 'flex';
    chatbotContainer.style.flexDirection = 'column';
    chatbotContainer.style.overflow = 'hidden';
    chatbotContainer.style.transition = 'all 0.3s ease'; // Add transition for smooth size changes

    // Add the chatbot UI
    chatbotContainer.innerHTML = `
        <div style="background-color: #0066cc; color: white; padding: 10px; font-weight: bold; border-top-left-radius: 10px; border-top-right-radius: 10px; display: flex; justify-content: space-between; align-items: center;">
            <span>Chatbot Assistant</span>
            <div style="display: flex; gap: 10px;">
                <button id="maximize-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px; font-weight: bold;" title="Maximize to left side">⬓</button>
                <button id="minimize-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px; font-weight: bold;" title="Minimize">−</button>
            </div>
        </div>
        <div id="chatbox" style="flex: 1; overflow-y: auto; padding: 10px; border-bottom: 1px solid #0066cc; background-color: #ffffff;"></div>
        <div id="input-container" style="display: flex; align-items: center; padding: 8px;">
            <input type="text" id="user-input" placeholder="Type your message..." style="flex: 1; padding: 10px; border: none; outline: none; background-color: #f0f8ff; border-radius: 20px;" />
            <!-- Buttons will be added dynamically in content.js -->
        </div>
    `;

    // Append the chatbot to the page
    document.body.appendChild(chatbotContainer);

    // Create a minimized version of the chatbot
    const minimizedChatbot = document.createElement('div');
    minimizedChatbot.id = 'minimized-chatbot';
    minimizedChatbot.style.position = 'fixed';
    minimizedChatbot.style.bottom = '20px';
    minimizedChatbot.style.right = '20px';
    minimizedChatbot.style.width = '50px';
    minimizedChatbot.style.height = '50px';
    minimizedChatbot.style.borderRadius = '50%';
    minimizedChatbot.style.backgroundColor = '#0066cc';
    minimizedChatbot.style.color = 'white';
    minimizedChatbot.style.display = 'none'; // Initially hidden
    minimizedChatbot.style.justifyContent = 'center';
    minimizedChatbot.style.alignItems = 'center';
    minimizedChatbot.style.cursor = 'pointer';
    minimizedChatbot.style.boxShadow = '0 4px 8px rgba(0, 102, 204, 0.3)';
    minimizedChatbot.style.zIndex = '9999';
    minimizedChatbot.innerHTML = `<span style="font-size: 20px;">💬</span>`;

    document.body.appendChild(minimizedChatbot);
    
    return {
        container: chatbotContainer,
        minimized: minimizedChatbot,
        elements: {
            chatbox: document.getElementById('chatbox'),
            userInput: document.getElementById('user-input'),
            minimizeBtn: document.getElementById('minimize-btn'),
            maximizeBtn: document.getElementById('maximize-btn')
            // sendBtn will be added in content.js
        }
    };
}

// Function to maximize chatbot to 25% of left side of screen
export function maximizeChatbot(container) {
    // Save current position for returning to normal mode later
    container.dataset.originalRight = container.style.right;
    container.dataset.originalBottom = container.style.bottom;
    container.dataset.originalWidth = container.style.width;
    container.dataset.originalHeight = container.style.height;
    
    // Set to right side with 25% width and full height
    container.style.right = '0';
    container.style.top = '0';
    container.style.bottom = '0';
    container.style.left = 'auto';
    container.style.width = '25%';
    container.style.height = '100%';
    container.style.borderRadius = '0';
    
    // Mark as maximized
    container.dataset.isMaximized = 'true';
}

// Function to restore chatbot to normal size
export function restoreChatbot(container) {
    // Restore original position and size
    container.style.left = 'auto';
    container.style.top = 'auto';
    container.style.right = container.dataset.originalRight || '20px';
    container.style.bottom = container.dataset.originalBottom || '20px';
    container.style.width = container.dataset.originalWidth || '300px';
    container.style.height = container.dataset.originalHeight || '400px';
    container.style.borderRadius = '10px';
    
    // Mark as not maximized
    container.dataset.isMaximized = 'false';
}

// Add CSS for button highlighting
export function addHighlightStyles() {
    const highlightStyle = document.createElement('style');
    highlightStyle.textContent = `
        .chatbot-highlight {
            outline: 3px solid #ff5722 !important;
            box-shadow: 0 0 10px #ff5722 !important;
            position: relative;
            z-index: 9998;
            transition: all 0.3s ease;
        }
        .chatbot-highlight-number {
            position: absolute;
            top: -10px;
            left: -10px;
            background-color: #ff5722;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 12px;
            z-index: 10000;
        }
        #recording-indicator {
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    `;
    document.head.appendChild(highlightStyle);
}

// Function to append messages to the chatbox
export function appendMessage(chatbox, sender, message) {
    const messageElement = document.createElement('div');
    messageElement.style.display = 'flex';
    messageElement.style.alignItems = 'flex-start';
    messageElement.style.gap = '10px';
    messageElement.style.padding = '10px';
    messageElement.style.margin = '5px 0';
    messageElement.style.borderRadius = '5px';
    
    // Create icon
    const iconElement = document.createElement('div');
    iconElement.style.width = '30px';
    iconElement.style.height = '30px';
    iconElement.style.borderRadius = '50%';
    iconElement.style.display = 'flex';
    iconElement.style.justifyContent = 'center';
    iconElement.style.alignItems = 'center';
    iconElement.style.flexShrink = '0';
    
    // Create message content
    const contentElement = document.createElement('div');
    contentElement.style.flexGrow = '1';
    contentElement.textContent = message;
    
    // Blue and white theme for messages
    if (sender === 'User') {
        messageElement.style.backgroundColor = '#e6f2ff';
        messageElement.style.border = '1px solid #cce0ff';
        contentElement.style.color = '#0066cc';
        
        // User icon
        iconElement.style.backgroundColor = '#0066cc';
        iconElement.style.color = 'white';
        iconElement.textContent = '👤';
    } else {
        messageElement.style.backgroundColor = '#e6f2ff';
        messageElement.style.border = '1px solid #cce0ff';
        contentElement.style.color = '#0066cc';
        
        // Chatbot icon
        iconElement.style.backgroundColor = '#0066cc';
        iconElement.style.color = 'white';
        iconElement.textContent = '🤖';
    }
    
    messageElement.appendChild(iconElement);
    messageElement.appendChild(contentElement);
    chatbox.appendChild(messageElement);
    chatbox.scrollTop = chatbox.scrollHeight; // Scroll to the bottom
    
    return messageElement;
}
