chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'getOllamaResponse') {
    const prompt = message.prompt;

    try {
      // Connect directly to the Ollama API with the correct format for /api/generate
      const response = await fetch('http://localhost:11434/api/generate', {
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
        console.error('Error querying Ollama API directly:', response.statusText);
        sendResponse({ error: `Failed to fetch response from Ollama. Status: ${response.status} ${response.statusText}` });
        return;
      }

      const data = await response.json();
      sendResponse({ response: data.response }); // The /api/generate endpoint returns the generated text in the 'response' field
    } catch (error) {
      console.error('Error querying Ollama API directly:', error);
      sendResponse({ error: `An error occurred while fetching the response: ${error.message}` });
    }
  }

  return true; // Keep the message channel open for async response
});