// Workflow automation functionality

// Import dependencies from webAgent when loaded
let webAgent;
let userActionTracker;

// Dynamically import the webAgent module
async function loadDependencies() {
    const webAgentModuleUrl = chrome.runtime.getURL('components/webAgent.js');
    const webAgentModule = await import(webAgentModuleUrl);
    webAgent = webAgentModule.webAgent;
    
    // Also load the userActionTracker module
    const trackerModuleUrl = chrome.runtime.getURL('components/userActionTracker.js');
    const trackerModule = await import(trackerModuleUrl);
    userActionTracker = trackerModule;
}

// Load dependencies immediately
loadDependencies();

// Function to generate workflow steps using the LLM
export async function generateWorkflowSteps(task, pageContext) {
    // Create a prompt for the LLM to break down the task
    const prompt = `
I need to automate this task: "${task}" 
on the current page: "${pageContext.title}" (${pageContext.url}).

Page elements available:
${pageContext.elements}

Please break this down into simple step-by-step instructions that a bot can execute.
Format your response EXACTLY as a numbered list of steps, with each step being ONE of these actions:
1. Click on [element_name]
2. Fill [field_name] with [value]
3. Wait for page to load

For example:
1. Fill username with john.doe@example.com
2. Fill password with securepass123
3. Click on Login button
4. Wait for page to load

IMPORTANT: Only include executable steps. Don't include explanations or additional text. Each step must start with a number followed by a period.
`;

    try {
        // Call the LLM API to get workflow steps
        const apiUrl = 'http://localhost:3001/api/generate';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama3.2:latest',
                prompt: prompt,
                stream: false
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to get response from LLM API');
        }

        const data = await response.json();
        const stepsText = data.response;
        
        // Parse the numbered list into individual steps
        const steps = parseSteps(stepsText);
        return steps;
    } catch (error) {
        console.error('Error generating workflow steps:', error);
        throw error;
    }
}

// Function to parse the LLM response into structured steps
function parseSteps(stepsText) {
    // Regular expression to match numbered items
    const stepRegex = /(\d+)\.\s+(.*?)(?=\n\d+\.|\n*$)/gs;
    const steps = [];
    let match;
    
    while ((match = stepRegex.exec(stepsText)) !== null) {
        const stepText = match[2].trim();
        
        // Parse different types of steps
        if (stepText.toLowerCase().startsWith('click on ')) {
            const element = stepText.substring('click on '.length).trim();
            steps.push({ action: 'click', element });
        } 
        else if (stepText.toLowerCase().startsWith('fill ')) {
            const fillRegex = /fill\s+(.*?)\s+with\s+(.*)/i;
            const fillMatch = stepText.match(fillRegex);
            if (fillMatch) {
                const field = fillMatch[1].trim();
                const value = fillMatch[2].trim();
                steps.push({ action: 'fill', field, value });
            }
        }
        else if (stepText.toLowerCase().includes('wait for')) {
            steps.push({ action: 'wait' });
        }
    }
    
    return steps;
}

// Function to gather page context information
export async function getPageContext() {
    // Make sure webAgent is loaded
    if (!webAgent) {
        await loadDependencies();
    }
    
    // Get basic page info
    const basicInfo = webAgent.getPageInfo();
    
    // Collect information about clickable elements
    const buttons = Array.from(document.querySelectorAll(
        'button, input[type="button"], input[type="submit"], a.btn, a[role="button"], .button, [class*="btn"], [role="button"], a'
    )).map(el => {
        const text = el.textContent?.trim() || el.value || el.id || el.name;
        return text ? `- Button: "${text}"` : null;
    }).filter(Boolean);
    
    // Collect form fields
    const fields = Array.from(document.querySelectorAll(
        'input:not([type="button"]):not([type="submit"]), textarea, select'
    )).map(el => {
        const name = el.name || el.id || el.placeholder;
        const type = el.type || el.tagName.toLowerCase();
        return name ? `- Field: "${name}" (${type})` : null;
    }).filter(Boolean);
    
    // Collect form labels that might help identify fields
    const labels = Array.from(document.querySelectorAll('label')).map(label => {
        const text = label.textContent?.trim();
        return text ? `- Label: "${text}"` : null;
    }).filter(Boolean);
    
    return {
        title: basicInfo.title,
        url: basicInfo.url,
        elements: [...buttons, ...fields, ...labels].join('\n')
    };
}

// Function to execute a workflow
export async function executeWorkflow(steps, progressCallback) {
    // Make sure webAgent is loaded
    if (!webAgent) {
        await loadDependencies();
    }
    
    let results = [];
    
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        let result;
        
        // Update progress
        if (progressCallback) {
            progressCallback(`Executing step ${i + 1}/${steps.length}: ${getStepDescription(step)}`);
        }
        
        try {
            // Execute different types of actions
            switch (step.action) {
                case 'click':
                    result = await webAgent.clickButton(step.element);
                    break;
                    
                case 'fill':
                    result = await webAgent.fillFormField(step.field, step.value);
                    break;
                    
                case 'wait':
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    result = "Waited for page";
                    break;
            }
            
            results.push({ step: i + 1, action: getStepDescription(step), result });
            
            // Slight delay between actions to let page respond
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error(`Error executing step ${i + 1}:`, error);
            results.push({ 
                step: i + 1, 
                action: getStepDescription(step), 
                result: `Error: ${error.message}` 
            });
            break;
        }
    }
    
    return results;
}

// Helper to get human-readable step description
export function getStepDescription(step) {
    switch (step.action) {
        case 'click':
            return `Click on "${step.element}"`;
        case 'fill':
            return `Fill "${step.field}" with "${step.value}"`;
        case 'wait':
            return `Wait for page to load`;
        default:
            return `Unknown step: ${JSON.stringify(step)}`;
    }
}

// New functions to integrate with the action tracking system

// Start recording a new workflow
export async function startWorkflowRecording(name = '') {
    if (!userActionTracker) {
        await loadDependencies();
    }
    
    return userActionTracker.startRecording();
}

// Stop recording and get the workflow steps
export async function stopWorkflowRecording() {
    if (!userActionTracker) {
        await loadDependencies();
    }
    
    const recordingResult = userActionTracker.stopRecording();
    
    // Convert the recording to workflow steps format
    const workflowSteps = userActionTracker.convertToWorkflowSteps();
    
    return {
        recordingResult,
        workflowSteps
    };
}

// Save the recorded workflow for LLM training
export async function saveRecordedWorkflow(name = '') {
    if (!userActionTracker) {
        await loadDependencies();
    }
    
    // Generate a default name if not provided
    const filename = name ? 
        `workflow-${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json` :
        null;
    
    return await userActionTracker.saveRecordedActions(filename);
}

// Train LLM with recorded workflows (placeholder for future implementation)
export async function trainLLMWithWorkflow(workflowData) {
    // This would connect to your training service
    // For now, it's just a placeholder returning the data format for training
    
    try {
        // Format data for training
        const trainingData = {
            task: "Perform workflow automation",
            context: {
                url: workflowData.url,
                pageTitle: workflowData.pageTitle,
                timestamp: new Date().toISOString()
            },
            steps: workflowData.actions.map(action => {
                // Convert to training format
                return {
                    action_type: action.type,
                    element_info: action.elementAttributes || {},
                    value: action.value || null
                };
            })
        };
        
        console.log('Training data prepared:', trainingData);
        
        // In a real implementation, this would send data to a training endpoint
        return {
            success: true,
            message: 'Workflow prepared for LLM training',
            trainingData
        };
    } catch (error) {
        console.error('Error preparing training data:', error);
        return {
            success: false,
            message: `Error preparing training data: ${error.message}`
        };
    }
}
