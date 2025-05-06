// Site Crawler UI Controller
import { SiteCrawlerExtension, startExtensionCrawl } from './components/siteCrawler.js';

document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const startUrlInput = document.getElementById('start-url');
  const maxDepthInput = document.getElementById('max-depth');
  const maxPagesInput = document.getElementById('max-pages');
  const ignoreParamsCheckbox = document.getElementById('ignore-params');
  const followExternalCheckbox = document.getElementById('follow-external');
  const includeScreenshotsCheckbox = document.getElementById('include-screenshots');
  
  const startCrawlButton = document.getElementById('start-crawl');
  const stopCrawlButton = document.getElementById('stop-crawl');
  const downloadJsonButton = document.getElementById('download-json');
  const downloadDotButton = document.getElementById('download-dot');
  const downloadElementsButton = document.getElementById('download-elements');
  
  const progressContainer = document.getElementById('progress-container');
  const progressFill = document.getElementById('progress-fill');
  const pagesVisitedElement = document.getElementById('pages-visited');
  const linksFoundElement = document.getElementById('links-found');
  const elementsFoundElement = document.getElementById('elements-found');
  const errorCountElement = document.getElementById('error-count');
  const timeElapsedElement = document.getElementById('time-elapsed');
  
  const errorLog = document.getElementById('error-log');
  const errorMessages = document.getElementById('error-messages');
  
  const resultTabs = document.getElementById('result-tabs');
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  const jsonData = document.getElementById('json-data');
  const graphVisualization = document.getElementById('graph-visualization');
  const elementsData = document.getElementById('elements-data');
  
  // Variables to track state
  let crawler = null;
  let startTime = null;
  let timeUpdateInterval = null;
  let estimatedTotalPages = 0;
  
  // Check if we should auto-start and populate URL from popup
  checkAutoStart();
  
  // Set up the tab system
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      const tabId = this.dataset.tab;
      
      // Update active tab button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      this.classList.add('active');
      
      // Show the selected tab content, hide others
      tabContents.forEach(content => {
        if (content.id === tabId + '-tab') {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });
    });
  });
  
  // Start crawling when the button is clicked
  startCrawlButton.addEventListener('click', function() {
    const startUrl = startUrlInput.value.trim();
    
    if (!startUrl) {
      alert('Please enter a valid starting URL');
      return;
    }
    
    if (!startUrl.startsWith('http://') && !startUrl.startsWith('https://')) {
      alert('URL must start with http:// or https://');
      return;
    }
    
    // Get configuration options
    const options = {
      maxDepth: parseInt(maxDepthInput.value) || 3,
      maxPages: parseInt(maxPagesInput.value) || 50,
      ignoreParams: ignoreParamsCheckbox.checked,
      followExternalLinks: followExternalCheckbox.checked,
      includeScreenshots: includeScreenshotsCheckbox.checked,
    };
    
    // Request permissions as part of a user gesture (resolves the lastError)
    chrome.permissions.request({
      permissions: ['tabs', 'activeTab', 'scripting', 'storage', 'downloads'],
      origins: ['<all_urls>']
    }, function(granted) {
      if (granted) {
        startCrawling(startUrl, options);
      } else {
        alert('Required permissions were not granted');
      }
    });
  });
  
  // Stop crawling when the button is clicked
  stopCrawlButton.addEventListener('click', function() {
    if (crawler) {
      const result = crawler.stopCrawl();
      stopCrawlButton.disabled = true;
      startCrawlButton.disabled = false;
      clearInterval(timeUpdateInterval);
      
      // Enable download buttons
      downloadJsonButton.disabled = false;
      downloadDotButton.disabled = false;
      downloadElementsButton.disabled = false;
      
      // Show result tabs
      resultTabs.classList.remove('hidden');
      
      alert(`Crawling stopped. Visited ${result.pagesVisited} pages with ${result.elementsFound} elements found and ${result.errors} errors.`);
    }
  });
  
  // Download JSON data
  downloadJsonButton.addEventListener('click', function() {
    if (crawler) {
      crawler.downloadGraphJson();
    }
  });
  
  // Download DOT file
  downloadDotButton.addEventListener('click', function() {
    if (crawler) {
      crawler.downloadDotFile();
    }
  });
  
  // Download Elements JSON data
  downloadElementsButton.addEventListener('click', function() {
    if (crawler) {
      crawler.downloadElementsJson();
    }
  });
  
  // Function to start the crawling process
  function startCrawling(url, options) {
    // Reset UI
    progressFill.style.width = '0%';
    pagesVisitedElement.textContent = '0';
    linksFoundElement.textContent = '0';
    elementsFoundElement.textContent = '0';
    errorCountElement.textContent = '0';
    timeElapsedElement.textContent = '0s';
    errorMessages.innerHTML = '';
    errorLog.classList.add('hidden');
    
    // Show progress container
    progressContainer.classList.remove('hidden');
    
    // Update UI state
    startCrawlButton.disabled = true;
    stopCrawlButton.disabled = false;
    downloadJsonButton.disabled = true;
    downloadDotButton.disabled = true;
    downloadElementsButton.disabled = true;
    
    // Hide result tabs until crawl is complete
    resultTabs.classList.add('hidden');
    
    // Set start time
    startTime = Date.now();
    
    // Update elapsed time every second
    timeUpdateInterval = setInterval(updateElapsedTime, 1000);
    
    // Start crawling
    startExtensionCrawl(url, options, updateProgress)
      .then(crawlerInstance => {
        crawler = crawlerInstance;
      })
      .catch(error => {
        console.error('Failed to start crawl:', error);
        errorMessages.innerHTML += `<p>Error starting crawl: ${error.message}</p>`;
        errorLog.classList.remove('hidden');
        
        // Reset UI
        startCrawlButton.disabled = false;
        stopCrawlButton.disabled = true;
        clearInterval(timeUpdateInterval);
      });
  }
  
  // Update progress during crawl
  function updateProgress(progress) {
    if (progress.complete) {
      // Crawl is finished
      pagesVisitedElement.textContent = progress.pagesVisited;
      linksFoundElement.textContent = progress.linksFound;
      elementsFoundElement.textContent = progress.elementsFound || 0;
      errorCountElement.textContent = progress.errors;
      progressFill.style.width = '100%';
      
      // Stop the timer
      clearInterval(timeUpdateInterval);
      
      // Update UI state
      startCrawlButton.disabled = false;
      stopCrawlButton.disabled = true;
      
      // Enable download buttons
      downloadJsonButton.disabled = false;
      downloadDotButton.disabled = false;
      downloadElementsButton.disabled = false;
      
      // Show result tabs
      resultTabs.classList.remove('hidden');
      
      // Display JSON data
      const graphData = crawler.saveGraph();
      jsonData.textContent = JSON.stringify(graphData, null, 2);
      
      // Display Interactive Elements data
      const elements = crawler.getInteractiveElements();
      elementsData.textContent = JSON.stringify(elements, null, 2);
      
      // Try to visualize the graph (requires a visualization library)
      tryVisualizeGraph();
      
      alert(`Crawling completed! Visited ${progress.pagesVisited} pages, found ${progress.linksFound} links and ${progress.elementsFound || 0} interactive elements.`);
      return;
    }
    
    // Update progress stats
    pagesVisitedElement.textContent = progress.pagesVisited;
    linksFoundElement.textContent = progress.linksFound;
    elementsFoundElement.textContent = progress.elementsFound || 0;
    errorCountElement.textContent = progress.errors;
    
    // Update estimated total if it's higher than our current estimate
    if ((progress.pagesTotal) > estimatedTotalPages) {
      estimatedTotalPages = progress.pagesTotal;
    }
    
    // Calculate and update progress bar
    if (estimatedTotalPages > 0) {
      const percent = Math.min(Math.round((progress.pagesVisited / estimatedTotalPages) * 100), 100);
      progressFill.style.width = `${percent}%`;
    }
    
    // Update error log if there are errors
    if (progress.errors > 0) {
      errorLog.classList.remove('hidden');
    }
  }
  
  // Update the elapsed time display
  function updateElapsedTime() {
    if (!startTime) return;
    
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    if (elapsedSeconds < 60) {
      timeElapsedElement.textContent = `${elapsedSeconds}s`;
    } else {
      const minutes = Math.floor(elapsedSeconds / 60);
      const seconds = elapsedSeconds % 60;
      timeElapsedElement.textContent = `${minutes}m ${seconds}s`;
    }
  }
  
  // Try to visualize the graph
  function tryVisualizeGraph() {
    // Check if we have a graph visualization library
    if (crawler) {
      try {
        // Make sure we have nodes to visualize
        const nodeCount = Object.keys(crawler.siteGraph.nodes).length;
        const edgeCount = crawler.siteGraph.edges.length;
        
        if (nodeCount === 0 || edgeCount === 0) {
          // No data to visualize
          graphVisualization.innerHTML = `
            <p>No graph data available to visualize yet.</p>
            <p>Start crawling to collect site structure data.</p>
          `;
          return;
        }
        
        // For now, just show the DOT text
        const dotContent = crawler.exportDotFile();
        
        // If we had a graph library like vis.js or d3.js, we'd initialize it here
        // For now, just show a message about visualizing
        graphVisualization.innerHTML = `
          <p>Graph visualization requires additional libraries.</p>
          <p>You can use the DOT file with tools like Graphviz:</p>
          <pre style="background: #f5f5f5; padding: 10px; max-height: 300px; overflow: auto;">${dotContent}</pre>
        `;
      } catch (error) {
        console.error('Error visualizing graph:', error);
        graphVisualization.innerHTML = `<p>Error visualizing graph: ${error.message}</p>`;
      }
    } else {
      graphVisualization.innerHTML = '<p>No crawler instance available. Start crawling to collect data.</p>';
    }
  }
  
  // Check if we should auto-start the crawler with a URL from the popup
  function checkAutoStart() {
    chrome.storage.local.get(['crawler_start_url', 'crawler_auto_start'], function(data) {
      if (data.crawler_start_url && data.crawler_auto_start) {
        // Populate the URL field
        startUrlInput.value = data.crawler_start_url;
        
        // Clear the auto-start flag so it doesn't start again on page refresh
        chrome.storage.local.set({ 'crawler_auto_start': false });
        
        // Auto click the start button after a short delay to allow the page to fully load
        setTimeout(() => {
          startCrawlButton.click();
        }, 500);
      }
    });
  }
  
  // Try to load a previously saved graph and elements on page load
  function loadSavedGraph() {
    SiteCrawlerExtension.loadGraph()
      .then(graphData => {
        // If we have a saved graph, enable download buttons
        downloadJsonButton.disabled = false;
        downloadDotButton.disabled = false;
        downloadElementsButton.disabled = false;
        
        // Instantiate crawler with the saved data
        const url = graphData.stats.startUrl || 'https://example.com';
        crawler = new SiteCrawlerExtension(url, graphData.config);
        
        // Restore graph data
        crawler.siteGraph = graphData.graph;
        crawler.stats = graphData.stats;
        
        // Show result tabs
        resultTabs.classList.remove('hidden');
        
        // Display JSON data
        jsonData.textContent = JSON.stringify(graphData, null, 2);
        
        // Load elements data
        SiteCrawlerExtension.loadElements()
          .then(elementsData => {
            crawler.interactiveElements = elementsData;
            document.getElementById('elements-data').textContent = JSON.stringify(elementsData, null, 2);
          })
          .catch(error => console.log('No saved elements found:', error));
        
        // Try to visualize the graph
        tryVisualizeGraph();
      })
      .catch(error => {
        console.log('No saved graph found:', error);
      });
  }
  
  // Load previously saved data on page load
  loadSavedGraph();
});