// Site crawler that maps all possible navigation flows through a website
// Extension-compatible version - works with Chrome extensions API
// Stores the site structure as a directed graph and interactive elements with keywords

/**
 * Configuration settings for the site crawler
 */
const DEFAULT_CONFIG = {
  maxDepth: 3,             // Maximum crawl depth
  maxPages: 100,           // Maximum number of pages to visit
  maxLinksPerPage: 50,     // Maximum links to follow from each page
  ignoreParams: true,      // Whether to ignore URL parameters
  followExternalLinks: false, // Whether to follow links to external domains
  includeScreenshots: true, // Whether to capture screenshots
  captureButtonInteractions: true, // Whether to include button interactions in graph
  storageKey: 'site_crawler_graph', // Storage key for saving the graph
  elementStorageKey: 'site_crawler_elements' // Storage key for saving interactive elements
};

/**
 * SiteCrawlerExtension class
 * Browser extension compatible version of the site crawler
 */
export class SiteCrawlerExtension {
  constructor(startUrl, config = {}) {
    this.startUrl = startUrl;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.baseHostname = new URL(startUrl).hostname;
    
    // The graph representation of the site
    this.siteGraph = {
      nodes: {}, // Pages
      edges: []  // Navigation links between pages
    };
    
    // Collection of interactive elements with keywords
    this.interactiveElements = {};
    
    // Keep track of visited URLs to avoid loops
    this.visitedUrls = new Set();
    
    // Queue of URLs to visit
    this.urlQueue = [];
    
    // Stats
    this.stats = {
      pagesVisited: 0,
      linksFound: 0,
      elementsFound: 0,
      startTime: null,
      endTime: null,
      errors: []
    };

    // Listen for tab updates to track page loads
    this.setupTabListeners();

    // Current crawl state
    this.crawlInProgress = false;
    this.tabIds = [];
    this.progressCallback = null;
    
    // Load any previously stored elements
    this.loadStoredElements();
  }

  /**
   * Set up Chrome tab listeners
   */
  setupTabListeners() {
    if (chrome && chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (this.crawlInProgress && this.tabIds.includes(tabId) && changeInfo.status === 'complete') {
          // Page has loaded, now we can analyze it
          this.processLoadedPage(tab);
        }
      });
    }
  }
  
  /**
   * Load previously stored interactive elements
   */
  loadStoredElements() {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([this.config.elementStorageKey], (result) => {
        if (result[this.config.elementStorageKey]) {
          this.interactiveElements = result[this.config.elementStorageKey];
        }
      });
    }
  }
  
  /**
   * Save interactive elements to storage
   */
  saveElements() {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ 
        [this.config.elementStorageKey]: this.interactiveElements 
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving interactive elements:', chrome.runtime.lastError);
        }
      });
    }
    return this.interactiveElements;
  }
  
  /**
   * Generate a unique ID for a URL
   */
  getNodeId(url) {
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
      this.stats.errors.push(`Error generating ID for ${url}: ${error.message}`);
      return 'unknown_' + Math.random().toString(36).substring(2, 10);
    }
  }
  
  /**
   * Generate a unique keyword for an interactive element
   * Enhanced to extract better semantic meaning from UI elements
   */
  generateElementKeyword(element) {
    let keyword = '';
    let type = element.type || '';
    
    // Actions that might be associated with this element
    let actionHint = '';
    
    // Try different attributes in order of preference
    if (element.ariaLabel) {
      keyword = element.ariaLabel;
    } else if (element.placeholder) {
      keyword = element.placeholder;
    } else if (element.alt) {
      keyword = element.alt;
    } else if (element.name) {
      keyword = element.name;
    } else if (element.id) {
      keyword = element.id;
    } else if (element.text && element.text.trim()) {
      keyword = element.text.trim();
    } else {
      // Generate a keyword based on element type and a random string
      keyword = `${element.type}_${Math.random().toString(36).substring(2, 10)}`;
    }
    
    // Check for common action verbs in the keyword
    const actionWords = ['create', 'add', 'edit', 'update', 'delete', 'remove', 'submit', 
                        'save', 'cancel', 'close', 'open', 'search', 'filter', 'select', 
                        'upload', 'download', 'validate', 'verify', 'run', 'execute', 'apply'];
    
    for (const action of actionWords) {
      if (keyword.toLowerCase().includes(action)) {
        actionHint = action;
        break;
      }
    }
    
    // Add action hint to type for better semantic understanding
    if (actionHint) {
      type = `${actionHint}_${type}`;
    }
    
    // Extract context from parent element if available
    if (element.contextHint) {
      type = `${type}_in_${element.contextHint}`;
    }
    
    // Clean up the keyword
    keyword = keyword
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .substring(0, 50); // Keep keywords reasonably sized
      
    return {
      primary: keyword,
      type: type,
      fullKeyword: `${type}_${keyword}`.substring(0, 60)
    };
  }
  
  /**
   * Normalize URL by removing tracking parameters,
   * fragments, and standardizing format
   */
  normalizeUrl(url, base) {
    try {
      const absoluteUrl = new URL(url, base);
      
      // Remove fragments (#)
      absoluteUrl.hash = '';
      
      // Optionally remove query parameters if configured
      if (this.config.ignoreParams) {
        absoluteUrl.search = '';
      }
      
      return absoluteUrl.toString();
    } catch (error) {
      this.stats.errors.push(`Error normalizing URL ${url}: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Check if we should crawl this URL based on various rules
   */
  shouldCrawl(url) {
    try {
      const parsedUrl = new URL(url);
      
      // Skip non-HTTP protocols (mailto:, tel:, etc.)
      if (!parsedUrl.protocol.startsWith('http')) {
        return false;
      }
      
      // Skip external domains if not allowed
      if (!this.config.followExternalLinks && parsedUrl.hostname !== this.baseHostname) {
        return false;
      }
      
      // Skip already visited URLs
      if (this.visitedUrls.has(url)) {
        return false;
      }
      
      // Skip common file types that aren't web pages
      const fileExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.zip', 
                             '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
      if (fileExtensions.some(ext => parsedUrl.pathname.toLowerCase().endsWith(ext))) {
        return false;
      }
      
      return true;
    } catch (error) {
      this.stats.errors.push(`Error checking URL ${url}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Add a node to the site graph representing a page
   */
  addNode(url, metadata = {}) {
    const id = this.getNodeId(url);
    
    // Add node if it doesn't exist
    if (!this.siteGraph.nodes[id]) {
      this.siteGraph.nodes[id] = {
        id,
        url,
        title: metadata.title || '',
        description: metadata.description || '',
        headings: metadata.headings || [],
        links: metadata.links || 0,
        forms: metadata.forms || 0,
        buttons: metadata.buttons || 0,
        inputs: metadata.inputs || 0,
        screenshot: metadata.screenshot || '',
        lastVisited: new Date().toISOString()
      };
    } else {
      // Update existing node with new information
      this.siteGraph.nodes[id] = {
        ...this.siteGraph.nodes[id],
        ...metadata,
        lastVisited: new Date().toISOString()
      };
    }
    
    return id;
  }
  
  /**
   * Add an edge to the site graph representing a link between pages
   */
  addEdge(fromUrl, toUrl, metadata = {}) {
    const fromId = this.getNodeId(fromUrl);
    const toId = this.getNodeId(toUrl);
    
    const edge = {
      from: fromId,
      to: toId,
      type: metadata.type || 'link', // link, form, button, etc.
      text: metadata.text || '',
      selector: metadata.selector || '',
      timestamp: new Date().toISOString()
    };
    
    this.siteGraph.edges.push(edge);
  }

  /**
   * Process a page that has been loaded in a tab
   */
  async processLoadedPage(tab) {
    const url = tab.url;
    const tabId = tab.id;

    // Execute script to extract metadata from the page
    try {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: this.extractPageDataScript,
      }, (results) => {
        if (!results || !results[0] || chrome.runtime.lastError) {
          this.stats.errors.push(`Error extracting data from ${url}: ${chrome.runtime.lastError?.message || 'Unknown error'}`);
          this.continueToNextUrl();
          return;
        }

        const pageData = results[0].result;
        
        // Take screenshot if enabled and possible
        if (this.config.includeScreenshots) {
          try {
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
              if (chrome.runtime.lastError) {
                console.error('Screenshot error:', chrome.runtime.lastError);
                // Continue without a screenshot
                this.processPageData(url, pageData);
              } else if (dataUrl) {
                // Safe assignment - only set if both pageData and dataUrl exist
                if (pageData) {
                  pageData.screenshot = dataUrl;
                }
                this.processPageData(url, pageData);
              } else {
                // No screenshot, but that's okay
                console.log('No screenshot captured, continuing without it');
                this.processPageData(url, pageData);
              }
            });
          } catch (error) {
            console.error('Screenshot error:', error);
            // Continue without a screenshot
            this.processPageData(url, pageData);
          }
        } else {
          this.processPageData(url, pageData);
        }
      });
    } catch (error) {
      this.stats.errors.push(`Error executing script on ${url}: ${error.message}`);
      this.continueToNextUrl();
    }
  }

  /**
   * Script executed in page context to extract data
   * Enhanced to capture more UI context and workflow hints
   */
  extractPageDataScript() {
    // Title and description
    const title = document.title;
    const descriptionTag = document.querySelector('meta[name="description"]');
    const description = descriptionTag ? descriptionTag.getAttribute('content') : '';
    
    // Page URL path to help identify the current view
    const path = window.location.pathname;
    
    // Get all headings - useful for page context
    const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({
      level: parseInt(h.tagName.substring(1)),
      text: h.innerText.trim()
    }));
    
    // Count important elements
    const links = document.querySelectorAll('a').length;
    const forms = document.querySelectorAll('form').length;
    const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]').length;
    const inputs = document.querySelectorAll('input:not([type="button"]):not([type="submit"]), textarea, select').length;
    
    // Extract all links
    const extractedLinks = [];
    const linkElements = document.querySelectorAll('a');
    
    for (let i = 0; i < linkElements.length; i++) {
      const link = linkElements[i];
      const href = link.getAttribute('href');
      
      if (href) {
        // Get surrounding text context
        const parentNode = link.parentNode;
        let contextHint = '';
        
        if (parentNode) {
          // Try to find a parent with an ID or class that might provide context
          let currentNode = parentNode;
          for (let j = 0; j < 3 && currentNode !== document.body; j++) {
            if (currentNode.id) {
              contextHint = currentNode.id;
              break;
            } else if (currentNode.className) {
              contextHint = currentNode.className.split(' ')[0];
              break;
            }
            currentNode = currentNode.parentNode;
          }
        }
        
        extractedLinks.push({
          url: href,
          text: link.innerText.trim() || link.getAttribute('title') || '',
          type: 'link',
          selector: getUniqueSelector(link),
          contextHint: contextHint
        });
      }
    }
    
    // Extract buttons with detailed information for keywords
    const extractedButtons = [];
    const buttonElements = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
    
    for (let i = 0; i < buttonElements.length; i++) {
      const button = buttonElements[i];
      
      // Analyze safety of the button (for auto-clicking logic)
      // Skip buttons that might log out, delete/remove data, or navigate away
      const buttonText = (button.innerText || button.value || '').toLowerCase();
      const isSafeButton = !/(logout|log out|sign out|delete|remove)/i.test(buttonText);
      
      // Determine what form the button might be associated with
      let formId = null;
      let formAction = null;
      
      if (button.form) {
        formId = button.form.id || null;
        formAction = button.form.action || null;
      }
      
      // Determine button context by looking at closest container
      let contextHint = '';
      let currentNode = button.parentNode;
      
      for (let j = 0; j < 3 && currentNode !== document.body; j++) {
        if (currentNode.id) {
          contextHint = currentNode.id;
          break;
        } else if (currentNode.className) {
          contextHint = currentNode.className.split(' ')[0];
          break;
        }
        currentNode = currentNode.parentNode;
      }
      
      extractedButtons.push({
        type: 'button',
        text: button.innerText || button.value || button.id || 'Button',
        selector: getUniqueSelector(button),
        ariaLabel: button.getAttribute('aria-label') || '',
        id: button.id || '',
        name: button.name || '',
        isSafeButton: isSafeButton,
        formId: formId,
        formAction: formAction,
        contextHint: contextHint
      });
    }
    
    // Extract form information to better understand workflows
    const extractedForms = [];
    const formElements = document.querySelectorAll('form');
    
    for (let i = 0; i < formElements.length; i++) {
      const form = formElements[i];
      const formFields = [];
      
      // Get form fields
      const fields = form.querySelectorAll('input, textarea, select');
      for (let j = 0; j < fields.length; j++) {
        const field = fields[j];
        if (field.type === 'button' || field.type === 'submit') continue;
        
        formFields.push({
          name: field.name || '',
          id: field.id || '',
          type: field.type || field.tagName.toLowerCase(),
          required: field.required,
          placeholder: field.placeholder || '',
          label: findLabelText(field)
        });
      }
      
      extractedForms.push({
        id: form.id || '',
        action: form.action || '',
        method: form.method || 'get',
        selector: getUniqueSelector(form),
        fields: formFields
      });
    }
    
    // Extract other interactive elements
    const interactiveElements = [];
    
    // Inputs
    const inputElements = document.querySelectorAll('input:not([type="button"]):not([type="submit"]), textarea');
    for (let i = 0; i < inputElements.length; i++) {
      const input = inputElements[i];
      interactiveElements.push({
        type: input.tagName.toLowerCase(),
        inputType: input.getAttribute('type') || 'text',
        placeholder: input.getAttribute('placeholder') || '',
        ariaLabel: input.getAttribute('aria-label') || '',
        name: input.name || '',
        id: input.id || '',
        required: input.required,
        selector: getUniqueSelector(input),
        label: findLabelText(input),
        contextHint: findContainerContext(input)
      });
    }
    
    // Select dropdowns
    const selectElements = document.querySelectorAll('select');
    for (let i = 0; i < selectElements.length; i++) {
      const select = selectElements[i];
      interactiveElements.push({
        type: 'select',
        ariaLabel: select.getAttribute('aria-label') || '',
        name: select.name || '',
        id: select.id || '',
        options: Array.from(select.options).map(option => option.text),
        selector: getUniqueSelector(select),
        label: findLabelText(select),
        contextHint: findContainerContext(select)
      });
    }
    
    // Images
    const imageElements = document.querySelectorAll('img');
    for (let i = 0; i < imageElements.length; i++) {
      const img = imageElements[i];
      interactiveElements.push({
        type: 'img',
        src: img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
        selector: getUniqueSelector(img),
        contextHint: findContainerContext(img)
      });
    }
    
    // Helper function to find label text for form elements
    function findLabelText(element) {
      // First check for a label that references this element by ID
      if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) {
          return label.textContent.trim();
        }
      }
      
      // Then check if the element is inside a label
      let parent = element.parentNode;
      while (parent && parent !== document) {
        if (parent.tagName === 'LABEL') {
          // Remove the element's own text from the label text
          const labelText = parent.textContent;
          return labelText.trim();
        }
        parent = parent.parentNode;
      }
      
      // Check for preceding text node or element that might be a label
      const previousSibling = element.previousSibling;
      if (previousSibling) {
        if (previousSibling.nodeType === 3) { // Text node
          return previousSibling.textContent.trim();
        } else if (previousSibling.nodeType === 1) { // Element node
          return previousSibling.textContent.trim();
        }
      }
      
      return '';
    }
    
    // Helper function to find container context
    function findContainerContext(element) {
      let currentNode = element.parentNode;
      for (let j = 0; j < 3 && currentNode && currentNode !== document.body; j++) {
        if (currentNode.id) {
          return currentNode.id;
        } else if (currentNode.className) {
          return currentNode.className.split(' ')[0];
        }
        currentNode = currentNode.parentNode;
      }
      return '';
    }
    
    // Helper function for generating CSS selectors
    function getUniqueSelector(element) {
      if (element.id) return `#${element.id}`;
      if (element.className) {
        const classes = Array.from(element.classList).join('.');
        return classes ? `${element.tagName.toLowerCase()}.${classes}` : element.tagName.toLowerCase();
      }
      return element.tagName.toLowerCase();
    }
    
    // Detect modals or popups present on the page
    const modals = [];
    const modalElements = document.querySelectorAll('[role="dialog"], .modal, .popup, .dialog');
    
    for (let i = 0; i < modalElements.length; i++) {
      const modal = modalElements[i];
      // Check if the modal is visible
      const style = window.getComputedStyle(modal);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        modals.push({
          selector: getUniqueSelector(modal),
          title: modal.querySelector('h1, h2, h3, h4, h5, .title, .header')?.textContent.trim() || '',
          buttons: Array.from(modal.querySelectorAll('button, input[type="button"], input[type="submit"]'))
            .map(btn => btn.textContent || btn.value || 'Button')
        });
      }
    }
    
    return {
      title,
      description,
      path,
      headings,
      links,
      forms,
      buttons,
      inputs,
      extractedLinks,
      extractedButtons,
      extractedForms,
      interactiveElements,
      modals,
      url: window.location.href,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Process the data extracted from a page
   * Enhanced to build better workflow understanding
   */
  processPageData(url, pageData) {
    try {
      // Add this page as a node with enriched metadata
      this.addNode(url, {
        ...pageData,
        isFormPage: pageData.extractedForms && pageData.extractedForms.length > 0,
        hasModals: pageData.modals && pageData.modals.length > 0,
        // Identify page type based on content and structure
        pageType: this.inferPageType(pageData)
      });
      
      // Mark this URL as visited and increment counter
      this.visitedUrls.add(url);
      this.stats.pagesVisited++;
      
      // Process interactive elements with enhanced keywords
      if (pageData.interactiveElements && pageData.interactiveElements.length) {
        const urlKey = this.getNodeId(url);
        
        if (!this.interactiveElements[urlKey]) {
          this.interactiveElements[urlKey] = {
            url: url,
            title: pageData.title,
            path: pageData.path,
            pageType: this.inferPageType(pageData),
            elements: []
          };
        }
        
        // Add the page's interactive elements to our collection with enhanced keywords
        pageData.interactiveElements.forEach(element => {
          const keywords = this.generateElementKeyword(element);
          this.interactiveElements[urlKey].elements.push({
            ...element,
            keywords
          });
          this.stats.elementsFound++;
        });
        
        // Add forms as workflow steps
        if (pageData.extractedForms && pageData.extractedForms.length) {
          if (!this.interactiveElements[urlKey].forms) {
            this.interactiveElements[urlKey].forms = [];
          }
          
          pageData.extractedForms.forEach(form => {
            this.interactiveElements[urlKey].forms.push({
              ...form,
              formType: this.inferFormType(form)
            });
          });
        }
        
        // Save collected elements to storage
        this.saveElements();
      }
      
      // Process extracted buttons
      if (pageData.extractedButtons && pageData.extractedButtons.length) {
        const urlKey = this.getNodeId(url);
        
        if (!this.interactiveElements[urlKey]) {
          this.interactiveElements[urlKey] = {
            url: url,
            title: pageData.title,
            path: pageData.path,
            elements: []
          };
        }
        
        // Add buttons to our collection of interactive elements with enhanced context
        pageData.extractedButtons.forEach(button => {
          const keywords = this.generateElementKeyword({
            type: 'button',
            text: button.text,
            ariaLabel: button.ariaLabel,
            id: button.id,
            name: button.name,
            contextHint: button.contextHint
          });
          
          this.interactiveElements[urlKey].elements.push({
            type: 'button',
            text: button.text,
            selector: button.selector,
            ariaLabel: button.ariaLabel,
            id: button.id,
            name: button.name,
            isSafeButton: button.isSafeButton,
            formId: button.formId,
            formAction: button.formAction,
            contextHint: button.contextHint,
            keywords
          });
          this.stats.elementsFound++;
        });
        
        // Save collected elements to storage
        this.saveElements();
      }
      
      // Process links for potential navigation
      if (pageData.extractedLinks && pageData.extractedLinks.length) {
        this.stats.linksFound += pageData.extractedLinks.length;
        
        // Process links found on the page
        for (const link of pageData.extractedLinks) {
          const normalizedUrl = this.normalizeUrl(link.url, url);
          
          if (normalizedUrl && this.shouldCrawl(normalizedUrl)) {
            // Add edge connecting current page to target
            this.addEdge(url, normalizedUrl, {
              type: 'link',
              text: link.text,
              selector: link.selector
            });
            
            // Add to queue if depth permits
            const currentDepth = this.getDepthForUrl(url);
            if (currentDepth < this.config.maxDepth) {
              this.urlQueue.push({
                url: normalizedUrl,
                depth: currentDepth + 1
              });
            }
          }
        }
      }
      
      // Add hypothetical button interactions if enabled
      if (this.config.captureButtonInteractions && pageData.extractedButtons) {
        const nodeId = this.getNodeId(url);
        
        for (const button of pageData.extractedButtons) {
          const buttonNodeId = `${nodeId}_button_${button.text.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          
          // Create a virtual node representing the state after clicking this button
          this.siteGraph.nodes[buttonNodeId] = {
            id: buttonNodeId,
            url: `${url}#action-${button.text}`,
            title: `After ${button.text} on ${pageData.title}`,
            virtual: true, // This is not a real page, but a virtual state
            parentUrl: url,
            actionType: 'button',
            actionText: button.text,
            actionSelector: button.selector,
            lastVisited: new Date().toISOString()
          };
          
          // Add edge for this button interaction
          this.siteGraph.edges.push({
            from: nodeId,
            to: buttonNodeId,
            type: 'button',
            text: button.text,
            selector: button.selector,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      this.updateProgress();
      this.continueToNextUrl();
    } catch (error) {
      this.stats.errors.push(`Error processing page data from ${url}: ${error.message}`);
      this.continueToNextUrl();
    }
  }

  /**
   * Find the depth of a URL in our crawl
   */
  getDepthForUrl(url) {
    // For the starting URL, depth is 0
    if (url === this.startUrl) return 0;
    
    // Otherwise, search for this URL in our queue to get its depth
    const entry = this.urlQueue.find(item => item.url === url);
    return entry ? entry.depth : this.config.maxDepth; // Default to max depth if not found
  }

  /**
   * Move on to the next URL in the queue
   */
  continueToNextUrl() {
    if (this.tabIds.length > 0) {
      // Close the current tab
      const tabId = this.tabIds.shift();
      try {
        chrome.tabs.remove(tabId, () => {
          this.processNextUrl();
        });
      } catch (error) {
        this.stats.errors.push(`Error closing tab ${tabId}: ${error.message}`);
        this.processNextUrl();
      }
    } else {
      this.processNextUrl();
    }
  }

  /**
   * Process the next URL in the queue
   */
  processNextUrl() {
    if (this.urlQueue.length > 0 && this.stats.pagesVisited < this.config.maxPages && this.crawlInProgress) {
      const next = this.urlQueue.shift();
      this.crawlUrl(next.url);
    } else {
      this.finishCrawl();
    }
  }

  /**
   * Crawl a specific URL
   */
  crawlUrl(url) {
    // Skip if we've already visited this URL or shouldn't crawl it
    if (!this.shouldCrawl(url)) {
      this.processNextUrl();
      return;
    }
    
    try {
      // Create a new tab to load the URL
      chrome.tabs.create({ url: url, active: false }, (tab) => {
        if (chrome.runtime.lastError) {
          this.stats.errors.push(`Error creating tab for ${url}: ${chrome.runtime.lastError.message}`);
          this.processNextUrl();
          return;
        }

        // Add to our list of tabs
        this.tabIds.push(tab.id);
        
        // Tab listener will handle when the page is loaded
        // We set a timeout in case the page never loads
        setTimeout(() => {
          if (this.tabIds.includes(tab.id)) {
            this.stats.errors.push(`Timeout waiting for ${url} to load`);
            this.continueToNextUrl();
          }
        }, 30000);
      });
    } catch (error) {
      this.stats.errors.push(`Error crawling ${url}: ${error.message}`);
      this.processNextUrl();
    }
  }

  /**
   * Update progress during crawl
   */
  updateProgress() {
    if (this.progressCallback) {
      const progress = {
        pagesVisited: this.stats.pagesVisited,
        pagesTotal: this.stats.pagesVisited + this.urlQueue.length,
        linksFound: this.stats.linksFound,
        elementsFound: this.stats.elementsFound,
        errors: this.stats.errors.length
      };
      
      this.progressCallback(progress);
    }
  }

  /**
   * Start the crawling process
   */
  startCrawl(progressCallback = null) {
    if (this.crawlInProgress) {
      throw new Error('Crawl already in progress');
    }

    try {
      // Set up crawler state
      this.crawlInProgress = true;
      this.stats.startTime = new Date().toISOString();
      this.progressCallback = progressCallback;
      
      // Add start URL to queue
      this.urlQueue = [{ url: this.startUrl, depth: 0 }];
      
      // Start processing
      this.processNextUrl();
      
      return true;
    } catch (error) {
      this.stats.errors.push(`Error starting crawl: ${error.message}`);
      this.crawlInProgress = false;
      return false;
    }
  }

  /**
   * Stop the crawling process
   */
  stopCrawl() {
    this.crawlInProgress = false;
    
    // Close any open tabs
    this.tabIds.forEach(tabId => {
      try {
        chrome.tabs.remove(tabId);
      } catch (error) {
        console.error(`Error closing tab ${tabId}:`, error);
      }
    });
    
    this.tabIds = [];
    this.stats.endTime = new Date().toISOString();
    
    return {
      success: true,
      pagesVisited: this.stats.pagesVisited,
      elementsFound: this.stats.elementsFound,
      errors: this.stats.errors.length
    };
  }

  /**
   * Finish the crawling process
   */
  finishCrawl() {
    this.crawlInProgress = false;
    this.stats.endTime = new Date().toISOString();
    
    // Save the graph to extension storage
    this.saveGraph();
    
    if (this.progressCallback) {
      this.progressCallback({
        complete: true,
        pagesVisited: this.stats.pagesVisited,
        linksFound: this.stats.linksFound,
        elementsFound: this.stats.elementsFound,
        errors: this.stats.errors.length,
        nodeCount: Object.keys(this.siteGraph.nodes).length,
        edgeCount: this.siteGraph.edges.length
      });
    }
  }

  /**
   * Save the graph to extension storage
   */
  saveGraph() {
    const graphData = {
      graph: this.siteGraph,
      stats: {
        ...this.stats,
        nodeCount: Object.keys(this.siteGraph.nodes).length,
        edgeCount: this.siteGraph.edges.length
      },
      config: this.config
    };
    
    try {
      chrome.storage.local.set({ [this.config.storageKey]: graphData }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving graph:', chrome.runtime.lastError);
        } else {
          console.log('Graph saved to extension storage');
        }
      });
    } catch (error) {
      console.error('Error saving graph:', error);
    }
    
    return graphData;
  }

  /**
   * Get all interactive elements with keywords
   */
  getInteractiveElements() {
    return this.interactiveElements;
  }

  /**
   * Load graph from extension storage
   */
  static loadGraph(storageKey = DEFAULT_CONFIG.storageKey) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(storageKey, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (result[storageKey]) {
            resolve(result[storageKey]);
          } else {
            reject(new Error('No graph found in storage'));
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Load interactive elements from extension storage
   */
  static loadElements(storageKey = DEFAULT_CONFIG.elementStorageKey) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(storageKey, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (result[storageKey]) {
            resolve(result[storageKey]);
          } else {
            resolve({}); // Return empty object if no elements found
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Export the site graph as a DOT file for visualization
   */
  exportDotFile() {
    const dotLines = ['digraph SiteMap {', '  rankdir=LR;', '  node [shape=box, style=filled, fillcolor=lightblue];'];
    
    // Check if we have nodes to visualize
    const nodes = Object.values(this.siteGraph.nodes);
    if (nodes.length === 0) {
      // Add a dummy node if no nodes exist
      dotLines.push('  "no_data" [label="No data collected yet", fillcolor=lightgrey];');
      dotLines.push('}');
      return dotLines.join('\n');
    }
    
    // Add nodes
    nodes.forEach(node => {
      try {
        const label = node.title || node.url?.split('/')?.pop() || 'Page';
        const id = node.id;
        
        // Virtual nodes are shown differently
        if (node.virtual) {
          dotLines.push(`  "${id}" [label="${label}", fillcolor=lightgreen];`);
        } else {
          dotLines.push(`  "${id}" [label="${label}"];`);
        }
      } catch (error) {
        console.error('Error adding node to DOT file:', error, node);
      }
    });
    
    // Check if we have edges
    if (this.siteGraph.edges.length === 0 && nodes.length > 0) {
      // If we have nodes but no edges, ensure the graph is still valid
      dotLines.push(`  // No connections between nodes`);
    } else {
      // Add edges
      this.siteGraph.edges.forEach(edge => {
        try {
          if (!edge.from || !edge.to) return; // Skip invalid edges
          
          const fromId = edge.from;
          const toId = edge.to;
          const label = edge.text || edge.type || '';
          
          if (edge.type === 'button') {
            dotLines.push(`  "${fromId}" -> "${toId}" [label="${label}", color=red];`);
          } else {
            dotLines.push(`  "${fromId}" -> "${toId}" [label="${label}"];`);
          }
        } catch (error) {
          console.error('Error adding edge to DOT file:', error, edge);
        }
      });
    }
    
    dotLines.push('}');
    
    return dotLines.join('\n');
  }

  /**
   * Download the graph as a JSON file
   */
  downloadGraphJson() {
    const graphData = {
      graph: this.siteGraph,
      elements: this.interactiveElements,
      stats: {
        ...this.stats,
        nodeCount: Object.keys(this.siteGraph.nodes).length,
        edgeCount: this.siteGraph.edges.length,
        elementCount: this.stats.elementsFound
      },
      config: this.config
    };

    const dataStr = JSON.stringify(graphData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const filename = `site-graph-${new Date().toISOString().slice(0, 10)}.json`;
    
    chrome.downloads.download({
      url: dataUri,
      filename: filename,
      saveAs: true
    });
  }

  /**
   * Download the interactive elements as a JSON file
   */
  downloadElementsJson() {
    const elementsData = {
      elements: this.interactiveElements,
      stats: {
        elementCount: this.stats.elementsFound,
        pageCount: Object.keys(this.interactiveElements).length
      }
    };

    const dataStr = JSON.stringify(elementsData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const filename = `site-elements-${new Date().toISOString().slice(0, 10)}.json`;
    
    chrome.downloads.download({
      url: dataUri,
      filename: filename,
      saveAs: true
    });
  }

  /**
   * Download the DOT file for visualization
   */
  downloadDotFile() {
    const dotContent = this.exportDotFile();
    const dataUri = 'data:text/plain;charset=utf-8,' + encodeURIComponent(dotContent);
    const filename = `site-graph-${new Date().toISOString().slice(0, 10)}.dot`;
    
    chrome.downloads.download({
      url: dataUri,
      filename: filename,
      saveAs: true
    });
  }
}

/**
 * Helper function to start a crawl with a simple interface
 * @param {string} startUrl - The URL to start crawling from
 * @param {object} options - Configuration options
 * @param {function} progressCallback - Callback function for progress updates
 * @returns {Promise} - Promise that resolves when crawling starts
 */
export function startExtensionCrawl(startUrl, options = {}, progressCallback = null) {
  const crawler = new SiteCrawlerExtension(startUrl, options);
  return crawler.startCrawl(progressCallback)
    .then(() => crawler)
    .catch(error => {
      console.error('Error starting crawl:', error);
      throw error;
    });
}