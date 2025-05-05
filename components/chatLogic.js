// Chat processing logic

// We'll dynamically import webAgent and workflowAutomation when this module is loaded
let webAgent;
let workflowAutomation;

// Dynamically import the required modules
async function loadDependencies() {
    const webAgentModuleUrl = chrome.runtime.getURL('components/webAgent.js');
    const webAgentModule = await import(webAgentModuleUrl);
    webAgent = webAgentModule.webAgent;
    
    const workflowAutomationUrl = chrome.runtime.getURL('components/workflowAutomation.js');
    const workflowAutomationModule = await import(workflowAutomationUrl);
    workflowAutomation = workflowAutomationModule;
}

// Load dependencies immediately
loadDependencies();

// Natural language processing for commands
export async function processNaturalLanguage(message, uiElements) {
    // Make sure dependencies are loaded
    if (!webAgent || !workflowAutomation) {
        await loadDependencies();
    }
    
    const msg = message.toLowerCase();
    
    // Check for workflow automation patterns
    // Look for task-oriented commands like "login to", "register on", "fill out the form"
    const workflowPatterns = [
        /login to (.+)/i,
        /sign in to (.+)/i,
        /log( me)? in/i,
        /register( on| at| for)? (.+)/i,
        /sign up for (.+)/i, 
        /create( an)? account/i,
        /fill out (.+) form/i,
        /complete (.+) form/i,
        /submit (.+) form/i,
        /automate (.+)/i,
        /do (.+) for me/i,
        /help me (.+)/i
    ];
    
    // Check if message matches any workflow pattern
    for (const pattern of workflowPatterns) {
        if (pattern.test(msg)) {
            // It's a workflow automation request
            try {
                return {
                    type: 'workflow',
                    task: message,
                    execute: async (progressCallback) => {
                        // Get page context
                        const pageContext = await workflowAutomation.getPageContext();
                        
                        // First message indicating we're analyzing
                        if (progressCallback) {
                            progressCallback(`Analyzing task: "${message}"...`);
                        }
                        
                        // Generate workflow steps using LLM
                        const steps = await workflowAutomation.generateWorkflowSteps(message, pageContext);
                        
                        if (steps.length === 0) {
                            return { 
                                success: false, 
                                message: "I couldn't determine how to complete this task on the current page." 
                            };
                        }
                        
                        // Display the steps before execution
                        const stepsMessage = steps.map((step, i) => 
                            `${i+1}. ${workflowAutomation.getStepDescription ? 
                              workflowAutomation.getStepDescription(step) : 
                              JSON.stringify(step)}`
                        ).join('\n');
                        
                        if (progressCallback) {
                            progressCallback(`I'll help you "${message}" with these steps:\n${stepsMessage}\n\nExecuting steps...`);
                        }
                        
                        // Execute the workflow
                        const results = await workflowAutomation.executeWorkflow(steps, progressCallback);
                        
                        // Check if all steps succeeded
                        const failed = results.find(r => r.result && r.result.startsWith('Error'));
                        
                        return {
                            success: !failed,
                            steps: stepsMessage,
                            results: results,
                            message: failed ? 
                                `I attempted to ${message} but ran into an issue on step ${failed.step}: ${failed.result}` :
                                `Successfully completed "${message}"`
                        };
                    }
                };
            } catch (error) {
                console.error('Error processing workflow:', error);
                return `I had trouble automating that task. Error: ${error.message}`;
            }
        }
    }

    // If not a workflow, check for click patterns
    const clickButtonPattern = /(?:please\s+)?(?:click|press|tap|select|choose)\s+(?:on\s+)?(?:the\s+)?(?:button\s+|link\s+)?(?:(?:with|that\s+says|labeled|saying|containing)\s+)?['"]?([^'"]+?)['"]?(?:\s+button|\s+link)?(?:\s+number\s+(?:\[)?(\d+)(?:\])?)?(?:\s+please)?[.!]*$/i;
    const clickMatch = msg.match(clickButtonPattern);
    
    if (clickMatch) {
        const buttonText = clickMatch[1];
        const buttonNum = clickMatch[2] ? parseInt(clickMatch[2]) : null;
        return webAgent.clickButton(buttonText, buttonNum);
    }
    
    // Fill form patterns
    const fillPattern = /(?:please\s+)?(?:fill|enter|input|put|type|set)\s+(?:in\s+)?(?:the\s+)?(?:field|input|form|textbox|textarea)?\s*(?:(?:labeled|with|called|named)\s+)?['"]?([^'"]+?)['"]?(?:\s+(?:with|to|as)\s+)(?:value\s+)?['"]?(.+?)['"]?(?:\s+number\s+(\d+))?(?:\s+please)?[.!]*$/i;
    const fillMatch = msg.match(fillPattern);
    
    if (fillMatch) {
        const fieldName = fillMatch[1];
        const value = fillMatch[2];
        const fieldNum = fillMatch[3] ? parseInt(fillMatch[3]) : null;
        return webAgent.fillFormField(fieldName, value, fieldNum);
    }
    
    // Page info patterns
    if (/what\s+(?:page|website|site)\s+(?:am\s+I\s+on|is\s+this)/i.test(msg)) {
        const info = webAgent.getPageInfo();
        return `You are on: "${info.title}" at ${info.url}`;
    }
    
    // Help pattern
    if (/(?:how\s+(?:do|can)\s+I\s+use|help|what\s+can\s+you\s+do)/i.test(msg)) {
        return `I can help you interact with this webpage. Try phrases like:
- "Click the Submit button"
- "Fill username with john123" 
- "What page is this?"
- "Click button Login number 2" (when multiple buttons exist)
- "Login to this website" (I'll automate the entire workflow)`;
    }
    
    // No command detected
    return null;
}
