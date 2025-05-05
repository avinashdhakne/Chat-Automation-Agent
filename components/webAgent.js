// Web agent functionality

// Define the web agent module
export const webAgent = {
    // Store highlighted elements
    highlightedElements: [],
    
    // Clear all highlights
    clearHighlights: function() {
        this.highlightedElements.forEach(el => {
            el.classList.remove('chatbot-highlight');
            const numIndicator = el.querySelector('.chatbot-highlight-number');
            if (numIndicator) {
                numIndicator.remove();
            }
        });
        this.highlightedElements = [];
    },
    
    // Highlight multiple elements
    highlightElements: function(elements) {
        this.clearHighlights();
        
        elements.forEach((el, index) => {
            // Add highlight class
            el.classList.add('chatbot-highlight');
            this.highlightedElements.push(el);
            
            // Add number indicator
            const numIndicator = document.createElement('div');
            numIndicator.className = 'chatbot-highlight-number';
            numIndicator.textContent = (index + 1).toString();
            el.style.position = 'relative';
            el.appendChild(numIndicator);
        });
        
        return elements.length;
    },
    
    // Find buttons by text content
    findButtons: function(buttonText) {
        // Look for common clickable elements
        const allPossibleButtons = Array.from(document.querySelectorAll(
            'button, input[type="button"], input[type="submit"], a.btn, a[role="button"], .button, [class*="btn"], [role="button"], a'
        ));
        
        const buttonTextLower = buttonText.toLowerCase();
        
        // Filter buttons that contain the text
        const matchingButtons = allPossibleButtons.filter(btn => {
            const content = (btn.textContent || btn.value || '').trim().toLowerCase();
            return content.includes(buttonTextLower);
        });
        
        // Look for additional elements with onclick handlers or pointer cursor
        if (matchingButtons.length === 0) {
            const allElements = Array.from(document.querySelectorAll('*'));
            return allElements.filter(el => {
                const hasText = (el.textContent || '').toLowerCase().includes(buttonTextLower);
                const isClickable = el.onclick || getComputedStyle(el).cursor === 'pointer';
                return hasText && isClickable && el.offsetWidth > 0 && el.offsetHeight > 0;
            });
        }
        
        return matchingButtons;
    },
    
    // Click a specific button
    clickButton: function(buttonText, buttonIndex = null) {
        const buttons = this.findButtons(buttonText);
        
        if (buttons.length === 0) {
            return `❌ No buttons found with text: "${buttonText}"`;
        }
        else if (buttons.length === 1 || buttonIndex !== null) {
            // Single button found or index specified
            const index = buttonIndex !== null ? buttonIndex - 1 : 0;
            if (index >= 0 && index < buttons.length) {
                // Highlight briefly then click
                this.highlightElements([buttons[index]]);
                setTimeout(() => {
                    buttons[index].click();
                    setTimeout(() => this.clearHighlights(), 1000);
                }, 500);
                return `✅ Clicked button: "${buttonText}"`;
            } else {
                return `❌ Button index ${buttonIndex} is out of range. Found ${buttons.length} buttons.`;
            }
        } 
        else {
            // Multiple buttons found, highlight all and return info
            const count = this.highlightElements(buttons);
            return `Found ${count} buttons with text "${buttonText}". Please specify which one to click using "click button [${buttonText}] number [1-${count}]"`;
        }
    },
    
    // Form field functions
    findFormFields: function(fieldName) {
        // Look for input fields, textareas, and select elements
        const allInputs = Array.from(document.querySelectorAll('input:not([type="button"]):not([type="submit"]), textarea, select'));
        const fieldNameLower = fieldName.toLowerCase();
        
        // Find by name, id, placeholder attributes
        let matchingInputs = allInputs.filter(input => {
            const name = (input.name || '').toLowerCase();
            const id = (input.id || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            
            return name.includes(fieldNameLower) || 
                   id.includes(fieldNameLower) || 
                   placeholder.includes(fieldNameLower);
        });
        
        // If nothing found, try looking for labels
        if (matchingInputs.length === 0) {
            const labels = Array.from(document.querySelectorAll('label'));
            labels.forEach(label => {
                if (label.textContent.toLowerCase().includes(fieldNameLower)) {
                    if (label.htmlFor) {
                        const input = document.getElementById(label.htmlFor);
                        if (input) {
                            matchingInputs.push(input);
                        }
                    } else {
                        // Check for inputs inside the label
                        const inputs = label.querySelectorAll('input, textarea, select');
                        if (inputs.length > 0) {
                            matchingInputs = matchingInputs.concat(Array.from(inputs));
                        }
                    }
                }
            });
        }
        
        return matchingInputs;
    },
    
    fillFormField: function(fieldName, value, fieldIndex = null) {
        const fields = this.findFormFields(fieldName);
        
        if (fields.length === 0) {
            return `❌ No form field found with name: "${fieldName}"`;
        }
        else if (fields.length === 1 || fieldIndex !== null) {
            // Single field found or index specified
            const index = fieldIndex !== null ? fieldIndex - 1 : 0;
            if (index >= 0 && index < fields.length) {
                const field = fields[index];
                
                // Highlight the field
                this.highlightElements([field]);
                
                // Handle different field types
                if (field.tagName === 'SELECT') {
                    // For dropdown, find the option
                    const option = Array.from(field.options).find(opt => 
                        opt.text.toLowerCase().includes(value.toLowerCase())
                    );
                    
                    if (option) {
                        field.value = option.value;
                    } else {
                        field.value = value;
                    }
                } else {
                    field.value = value;
                }
                
                // Trigger events for reactivity
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                
                setTimeout(() => this.clearHighlights(), 1500);
                return `✅ Filled "${fieldName}" with "${value}"`;
            } else {
                return `❌ Field index ${fieldIndex} is out of range. Found ${fields.length} fields.`;
            }
        } 
        else {
            // Multiple fields found, highlight all and return info
            const count = this.highlightElements(fields);
            return `Found ${count} fields matching "${fieldName}". Please specify which one to fill using "fill field ${fieldName} with ${value} number [1-${count}]"`;
        }
    },
    
    // Get page info
    getPageInfo: function() {
        return {
            title: document.title,
            url: window.location.href,
            headings: Array.from(document.querySelectorAll('h1, h2, h3'))
                .map(h => `${h.tagName}: ${h.textContent.trim()}`)
                .slice(0, 5)
        };
    }
};
