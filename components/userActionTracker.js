// User action tracking functionality for workflow automation

// Define storage for recorded actions
let recordedActions = [];
let isRecording = false;
let recordingStartTime = null;

// Start recording user actions
export function startRecording() {
    // Reset the recorded actions
    recordedActions = [];
    isRecording = true;
    recordingStartTime = new Date();
    
    console.log('User action recording started');
    return 'Started recording user actions. Perform your workflow now.';
}

// Stop recording user actions
export function stopRecording() {
    isRecording = false;
    const recordingEndTime = new Date();
    const duration = (recordingEndTime - recordingStartTime) / 1000; // in seconds
    
    console.log(`User action recording stopped. Recorded ${recordedActions.length} actions in ${duration}s`);
    
    // Return recorded actions for potential immediate use
    return {
        actions: recordedActions,
        summary: `Recorded ${recordedActions.length} actions over ${duration.toFixed(1)} seconds`
    };
}

// Record a single user action
export function recordAction(action) {
    if (!isRecording) return;
    
    // Add timestamp and page context to the action
    const actionWithContext = {
        ...action,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        title: document.title
    };
    
    recordedActions.push(actionWithContext);
    console.log('Action recorded:', actionWithContext);
}

// Check if recording is in progress
export function isCurrentlyRecording() {
    return isRecording;
}

// Get recorded actions
export function getRecordedActions() {
    return recordedActions;
}

// Save recorded actions to a file
export async function saveRecordedActions(filename = null) {
    if (recordedActions.length === 0) {
        return { success: false, message: 'No actions have been recorded' };
    }
    
    try {
        // Default filename with timestamp if not provided
        if (!filename) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            filename = `recorded-actions-${timestamp}.json`;
        }
        
        // Prepare data for export
        const exportData = {
            recordingDate: recordingStartTime ? recordingStartTime.toISOString() : new Date().toISOString(),
            url: window.location.href,
            pageTitle: document.title,
            actionCount: recordedActions.length,
            actions: recordedActions
        };
        
        // Convert to JSON string
        const jsonData = JSON.stringify(exportData, null, 2);
        
        // Create a blob and download link
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        
        // Trigger download
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Also send to background script for storage if extension api available
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                action: 'saveRecordedActions',
                data: exportData,
                filename: filename
            });
        }
        
        return {
            success: true,
            message: `Saved ${recordedActions.length} actions to ${filename}`
        };
    } catch (error) {
        console.error('Error saving recorded actions:', error);
        return {
            success: false,
            message: `Error saving recorded actions: ${error.message}`
        };
    }
}

// Convert recorded actions to workflow steps format
export function convertToWorkflowSteps() {
    if (recordedActions.length === 0) {
        return { success: false, message: 'No actions have been recorded' };
    }
    
    try {
        const steps = [];
        
        // Process each recorded action to workflow step format
        recordedActions.forEach((action, index) => {
            switch (action.type) {
                case 'click':
                    steps.push({ 
                        action: 'click',
                        element: action.target || action.elementText || `element-${index}`
                    });
                    break;
                case 'input':
                    steps.push({ 
                        action: 'fill',
                        field: action.targetName || action.elementId || `field-${index}`,
                        value: action.value || ''
                    });
                    break;
                case 'navigation':
                    steps.push({ action: 'wait' });
                    break;
            }
        });
        
        return {
            success: true,
            steps: steps,
            message: `Generated ${steps.length} workflow steps`
        };
    } catch (error) {
        console.error('Error converting to workflow steps:', error);
        return {
            success: false,
            message: `Error converting to workflow steps: ${error.message}`
        };
    }
}

// Set up event listeners to track user actions
export function setupActionTracking() {
    // Track clicks
    document.addEventListener('click', function(event) {
        if (!isRecording) return;
        
        const target = event.target;
        const tagName = target.tagName.toLowerCase();
        const elementId = target.id;
        const elementText = target.textContent?.trim() || '';
        
        recordAction({
            type: 'click',
            target: elementId || elementText || tagName,
            tagName: tagName,
            elementId: elementId,
            elementText: elementText,
            elementClasses: Array.from(target.classList).join(' '),
            elementAttributes: getElementAttributes(target)
        });
    }, true);
    
    // Track form inputs
    document.addEventListener('input', function(event) {
        if (!isRecording) return;
        
        const target = event.target;
        const tagName = target.tagName.toLowerCase();
        
        // Only record form elements
        if (['input', 'textarea', 'select'].includes(tagName)) {
            let value = target.value;
            
            // For privacy, mask sensitive inputs
            if (target.type === 'password') {
                value = '********'; // Mask passwords
            }
            
            recordAction({
                type: 'input',
                targetName: target.name || target.id,
                tagName: tagName,
                inputType: target.type,
                value: value,
                elementAttributes: getElementAttributes(target)
            });
        }
    });
    
    // Track form submissions
    document.addEventListener('submit', function(event) {
        if (!isRecording) return;
        
        const form = event.target;
        
        recordAction({
            type: 'submit',
            formId: form.id,
            formAction: form.action,
            formMethod: form.method
        });
    });
    
    // Track page navigation
    window.addEventListener('beforeunload', function() {
        if (!isRecording) return;
        
        recordAction({
            type: 'navigation',
            fromUrl: window.location.href
        });
    });
    
    console.log('Action tracking event listeners have been set up');
    return true;
}

// Helper function to get relevant element attributes
function getElementAttributes(element) {
    const attributes = {};
    const relevantAttributes = [
        'id', 'name', 'class', 'type', 'href', 'src', 
        'alt', 'title', 'role', 'aria-label', 'placeholder',
        'data-testid', 'data-id', 'data-automation-id'
    ];
    
    for (const attr of relevantAttributes) {
        if (element.hasAttribute(attr)) {
            attributes[attr] = element.getAttribute(attr);
        }
    }
    
    return attributes;
}

// Initialize when imported
setupActionTracking();