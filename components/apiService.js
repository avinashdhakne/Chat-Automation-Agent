// API communication

// Function to fetch response from Ollama API via proxy server
export async function getOllamaResponse(prompt) {
    console.log("Sending request to proxy server with prompt:", prompt);

    try {
        const response = await fetch('http://localhost:3001/api/generate', {
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
            console.error('Error querying proxy server:', response.statusText);
            throw new Error('Failed to fetch response from proxy server.');
        }

        const data = await response.json();
        console.log("Received response from proxy server:", data);
        return data.response; // The generated text will be in the 'response' field
    } catch (error) {
        console.error("API call failed:", error);
        throw error;
    }
}

// Prepare prompts with additional context
export function preparePromptWithContext(userMessage) {
    const pageContext = `Page: ${document.title} (${window.location.href})`;
    return `[Context: ${pageContext}] User message: ${userMessage}`;
}
