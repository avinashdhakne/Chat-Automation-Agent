// Workflow Manager JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Tab switching functionality
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.panel');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetPanel = tab.getAttribute('data-tab');
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show target panel, hide others
            panels.forEach(panel => {
                panel.classList.remove('active');
                if (panel.id === `${targetPanel}-panel`) {
                    panel.classList.add('active');
                }
            });
        });
    });
    
    // Load workflows when page loads
    loadWorkflows();
    
    // Set up import/export functionality
    document.getElementById('export-all-btn').addEventListener('click', exportAllWorkflows);
    document.getElementById('import-btn').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', importWorkflow);
});

// Load all workflows from extension storage
function loadWorkflows() {
    chrome.runtime.sendMessage({ action: 'listWorkflowFiles' }, function(response) {
        if (response && response.success) {
            displayWorkflows(response.files);
        } else {
            displayNoWorkflows('No workflows found or error loading workflows');
        }
    });
}

// Display workflows in the list
function displayWorkflows(workflowFiles) {
    const workflowList = document.getElementById('workflow-list');
    
    if (!workflowFiles || workflowFiles.length === 0) {
        displayNoWorkflows('No recorded workflows found');
        return;
    }
    
    // Clear loading message
    workflowList.innerHTML = '';
    
    // For each workflow file, fetch its contents from storage
    workflowFiles.forEach(file => {
        chrome.storage.local.get(`recording_${file.filename}`, function(result) {
            const workflowData = result[`recording_${file.filename}`];
            
            if (workflowData) {
                const workflowItem = createWorkflowItemElement(workflowData, file.filename);
                workflowList.appendChild(workflowItem);
            }
        });
    });
}

// Create HTML element for a workflow item
function createWorkflowItemElement(workflow, filename) {
    const item = document.createElement('div');
    item.className = 'workflow-item';
    
    // Format the date nicely
    const recordingDate = new Date(workflow.recordingDate);
    const formattedDate = recordingDate.toLocaleString();
    
    // Setup the item structure
    item.innerHTML = `
        <div class="workflow-header">
            <div class="workflow-title">${filename}</div>
            <div class="workflow-date">${formattedDate}</div>
        </div>
        <div class="workflow-url">${workflow.url}</div>
        <div class="workflow-stats">
            <div>${workflow.actionCount} actions</div>
            <div>Page: ${workflow.pageTitle}</div>
        </div>
        <div class="workflow-actions">
            <button class="details-button">View Details</button>
            <button class="export-button">Export</button>
            <button class="train-button">Use for Training</button>
            <button class="delete-button">Delete</button>
        </div>
        <div class="workflow-details">
            <h3>Actions:</h3>
            <div class="action-list">
                ${workflow.actions.map((action, index) => {
                    return `<div class="action-item">
                        <span class="action-type">${index + 1}. ${action.type}:</span> 
                        ${getActionDescription(action)}
                    </div>`;
                }).join('')}
            </div>
        </div>
    `;
    
    // Add event listeners
    item.querySelector('.details-button').addEventListener('click', () => {
        const details = item.querySelector('.workflow-details');
        if (details.style.display === 'block') {
            details.style.display = 'none';
        } else {
            details.style.display = 'block';
        }
    });
    
    item.querySelector('.export-button').addEventListener('click', () => {
        exportWorkflow(workflow, filename);
    });
    
    item.querySelector('.train-button').addEventListener('click', () => {
        useForTraining(workflow, filename);
    });
    
    item.querySelector('.delete-button').addEventListener('click', () => {
        deleteWorkflow(filename, item);
    });
    
    return item;
}

// Get human-readable description of an action
function getActionDescription(action) {
    switch (action.type) {
        case 'click':
            return `Clicked on "${action.target || action.elementText || action.tagName}" (${action.tagName})`;
        case 'input':
            return `Entered "${action.value}" in ${action.targetName || action.elementId || 'field'}`;
        case 'submit':
            return `Submitted form ${action.formId || ''}`;
        case 'navigation':
            return `Navigated from ${action.fromUrl}`;
        default:
            return JSON.stringify(action);
    }
}

// Display a message when no workflows are found
function displayNoWorkflows(message) {
    const workflowList = document.getElementById('workflow-list');
    workflowList.innerHTML = `<div class="no-workflows">${message}</div>`;
}

// Export a single workflow
function exportWorkflow(workflow, filename) {
    const dataStr = JSON.stringify(workflow, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = filename || 'workflow-export.json';
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

// Export all workflows as a zip file
function exportAllWorkflows() {
    chrome.runtime.sendMessage({ action: 'listWorkflowFiles' }, function(response) {
        if (response && response.success && response.files.length > 0) {
            const exportList = document.getElementById('export-list');
            exportList.innerHTML = '';
            
            response.files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'workflow-item';
                item.innerHTML = `
                    <div class="workflow-header">
                        <div class="workflow-title">${file.filename}</div>
                    </div>
                    <button class="export-single-btn">Export</button>
                `;
                
                item.querySelector('.export-single-btn').addEventListener('click', () => {
                    chrome.storage.local.get(`recording_${file.filename}`, function(result) {
                        const workflowData = result[`recording_${file.filename}`];
                        if (workflowData) {
                            exportWorkflow(workflowData, file.filename);
                        }
                    });
                });
                
                exportList.appendChild(item);
            });
        } else {
            const exportList = document.getElementById('export-list');
            exportList.innerHTML = '<div class="no-workflows">No workflows available for export</div>';
        }
    });
}

// Import a workflow from a JSON file
function importWorkflow(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const workflow = JSON.parse(e.target.result);
            
            // Generate a filename if not present
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `imported-workflow-${timestamp}.json`;
            
            // Save to extension storage
            chrome.storage.local.set({
                [`recording_${filename}`]: workflow,
                [`workflow_file_${filename}`]: `workflows/${filename}`
            }, function() {
                alert(`Workflow imported successfully as ${filename}`);
                loadWorkflows(); // Refresh the list
            });
        } catch (error) {
            alert('Error importing workflow: ' + error.message);
        }
    };
    reader.readAsText(file);
    
    // Reset the file input so the same file can be selected again
    event.target.value = '';
}

// Delete a workflow
function deleteWorkflow(filename, element) {
    if (confirm(`Are you sure you want to delete this workflow: ${filename}?`)) {
        // Delete from extension storage
        chrome.storage.local.remove([
            `recording_${filename}`, 
            `workflow_file_${filename}`
        ], function() {
            // Remove from UI
            element.remove();
            
            // Check if there are no more workflows
            const workflowList = document.getElementById('workflow-list');
            if (workflowList.children.length === 0) {
                displayNoWorkflows('No recorded workflows found');
            }
        });
    }
}

// Send workflow to background script for LLM training
function useForTraining(workflow, filename) {
    chrome.runtime.sendMessage({
        action: 'trainLLMWithWorkflow',
        data: workflow,
        filename: filename
    }, function(response) {
        if (response && response.success) {
            alert('Workflow sent for LLM training');
        } else {
            alert('Error sending workflow for training');
        }
    });
}