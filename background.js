console.log("This is background file of the extension.");

// Collection to store recorded user actions across sessions
const recordedActionsStorage = {
    // Store for recording files
    recordedActions: {},
    
    // Save a new recording to storage
    saveRecording: function(data, filename) {
        this.recordedActions[filename] = data;
        // Also save to extension storage if available
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
                [`recording_${filename}`]: data
            });
        }
        
        // Save to workflows directory in the extension
        saveRecordingToWorkflowsDir(data, filename);
        
        console.log(`Recording saved: ${filename}`);
        return true;
    },
    
    // Get all stored recordings
    getAllRecordings: function() {
        return this.recordedActions;
    }
};

// Site Crawler state management
const siteCrawlerState = {
    // Flag to indicate if a crawl is currently running
    isRunning: false,
    
    // Storage for interactive elements with keywords
    elements: {},
    
    // URL currently being processed
    currentUrl: null,
    
    // Store elements for a specific page
    saveElements: function(url, pageElements) {
        const urlKey = this.getUrlKey(url);
        this.elements[urlKey] = pageElements;
        
        // Save to chrome storage
        chrome.storage.local.set({
            'site_crawler_elements': this.elements
        });
        
        return true;
    },
    
    // Get all stored elements
    getAllElements: function() {
        return this.elements;
    },
    
    // Search for elements by keyword
    searchElementsByKeyword: function(keyword) {
        const results = {};
        
        for (const urlKey in this.elements) {
            const pageElements = this.elements[urlKey].elements.filter(element => 
                element.keyword && element.keyword.includes(keyword.toLowerCase())
            );
            
            if (pageElements.length > 0) {
                results[urlKey] = {
                    url: this.elements[urlKey].url,
                    title: this.elements[urlKey].title,
                    elements: pageElements
                };
            }
        }
        
        return results;
    },
    
    // Create a key from URL for storage
    getUrlKey: function(url) {
        try {
            const parsedUrl = new URL(url);
            let path = parsedUrl.pathname;
            
            // Remove trailing slash
            if (path.endsWith('/') && path !== '/') {
                path = path.slice(0, -1);
            }
            
            // For root path, use 'home'
            if (path === '/') {
                path = '/home';
            }
            
            // Remove leading slash and replace special chars
            const id = path
                .substring(1)
                .replace(/[^a-zA-Z0-9]/g, '_')
                .toLowerCase();
            
            return id || 'home';
        } catch (error) {
            console.error(`Error generating ID for ${url}:`, error);
            return 'unknown_' + Math.random().toString(36).substring(2, 10);
        }
    }
};

// Initialize site crawler elements from storage
chrome.storage.local.get(['site_crawler_elements'], function(result) {
    if (result && result.site_crawler_elements) {
        siteCrawlerState.elements = result.site_crawler_elements;
    }
});

// Function to save recording to workflows directory using FileSystem API
function saveRecordingToWorkflowsDir(data, filename) {
    try {
        // Use the extension's workflow directory
        const workflowDirPath = chrome.runtime.getURL('workflows');
        const fileContent = JSON.stringify(data, null, 2);
        
        // For browser extensions, we can use the chrome.downloads API to save the file
        // We'll create a data URL and trigger a download that the user can save to the workflows dir
        const blob = new Blob([fileContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
            url: url,
            filename: `workflows/${filename}`,
            saveAs: false
        }, (downloadId) => {
            console.log(`File saved with download ID: ${downloadId}`);
        });
        
        // Store the file reference for later access
        chrome.storage.local.set({
            [`workflow_file_${filename}`]: `workflows/${filename}`
        });
        
    } catch (error) {
        console.error('Error saving to workflows directory:', error);
    }
}

// Function to list all workflow files in the workflows directory
function listWorkflowFiles() {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => {
            const workflowFiles = [];
            for (const key in items) {
                if (key.startsWith('workflow_file_')) {
                    workflowFiles.push({
                        filename: key.replace('workflow_file_', ''),
                        path: items[key]
                    });
                }
            }
            resolve(workflowFiles);
        });
    });
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background script received message:", message);
    
    if (message.action === 'saveRecordedActions') {
        try {
            const result = recordedActionsStorage.saveRecording(message.data, message.filename);
            sendResponse({ success: true, message: 'Recording saved in background storage' });
        } catch (error) {
            console.error('Error saving recording in background:', error);
            sendResponse({ success: false, message: error.message });
        }
        return true; // Keep the message channel open for async response
    }
    
    if (message.action === 'listWorkflowFiles') {
        listWorkflowFiles().then(files => {
            sendResponse({ success: true, files });
        });
        return true; // Keep the message channel open for async response
    }
    
    // Site crawler message handlers
    if (message.action === 'startCrawling') {
        siteCrawlerState.isRunning = true;
        siteCrawlerState.currentUrl = message.startUrl;
        
        // Open the crawler page with the current URL
        chrome.storage.local.set({
            'crawler_start_url': message.startUrl,
            'crawler_auto_start': true
        }, function() {
            chrome.runtime.openOptionsPage();
        });
        
        sendResponse({ success: true, message: 'Starting crawler' });
        return true;
    }
    
    if (message.action === 'stopCrawling') {
        siteCrawlerState.isRunning = false;
        sendResponse({ success: true, message: 'Crawler stopped' });
        return true;
    }
    
    if (message.action === 'savePageElements') {
        try {
            const result = siteCrawlerState.saveElements(message.url, message.elements);
            sendResponse({ success: true, message: 'Elements saved' });
        } catch (error) {
            console.error('Error saving page elements:', error);
            sendResponse({ success: false, message: error.message });
        }
        return true;
    }
    
    if (message.action === 'searchElements') {
        try {
            const results = siteCrawlerState.searchElementsByKeyword(message.keyword);
            sendResponse({ success: true, results });
        } catch (error) {
            console.error('Error searching elements:', error);
            sendResponse({ success: false, message: error.message });
        }
        return true;
    }
    
    if (message.action === 'getAllElements') {
        sendResponse({ 
            success: true, 
            elements: siteCrawlerState.getAllElements() 
        });
        return true;
    }
    
    // Handle other message types here
});

// Add context menu option for starting/stopping recording
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'startRecording',
        title: 'Start Recording User Actions',
        contexts: ['page']
    });
    
    chrome.contextMenus.create({
        id: 'stopRecording',
        title: 'Stop Recording & Save',
        contexts: ['page']
    });
    
    chrome.contextMenus.create({
        id: 'manageWorkflows',
        title: 'Manage Recorded Workflows',
        contexts: ['page']
    });
    
    // Add site crawler context menu items
    chrome.contextMenus.create({
        id: 'separator1',
        type: 'separator',
        contexts: ['page']
    });
    
    chrome.contextMenus.create({
        id: 'startCrawling',
        title: 'Start Crawling This Site',
        contexts: ['page']
    });
    
    chrome.contextMenus.create({
        id: 'openCrawlerSettings',
        title: 'Open Site Crawler Settings',
        contexts: ['page']
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'startRecording') {
        chrome.tabs.sendMessage(tab.id, { action: 'startRecording' });
    } 
    else if (info.menuItemId === 'stopRecording') {
        chrome.tabs.sendMessage(tab.id, { action: 'stopRecording' });
    }
    else if (info.menuItemId === 'manageWorkflows') {
        chrome.tabs.create({ url: chrome.runtime.getURL('workflow-manager.html') });
    }
    // Site crawler context menu handlers
    else if (info.menuItemId === 'startCrawling') {
        // Start crawling on the current site
        siteCrawlerState.isRunning = true;
        siteCrawlerState.currentUrl = tab.url;
        
        // Open the crawler page with the current URL
        chrome.storage.local.set({
            'crawler_start_url': tab.url,
            'crawler_auto_start': true
        }, function() {
            chrome.runtime.openOptionsPage();
        });
    }
    else if (info.menuItemId === 'openCrawlerSettings') {
        chrome.runtime.openOptionsPage();
    }
});