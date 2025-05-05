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

// Listen for messages from content scripts
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
});