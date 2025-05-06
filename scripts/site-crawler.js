// Site crawler that maps all possible navigation flows through a website
// Stores the site structure as a directed graph

// Dependencies
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { URL } from 'url';
import { fileURLToPath } from 'url';

// Configuration
const DEFAULT_CONFIG = {
  maxDepth: 3,             // Maximum crawl depth
  maxPages: 100,           // Maximum number of pages to visit
  maxLinksPerPage: 50,     // Maximum links to follow from each page
  timeout: 30000,          // Page load timeout in milliseconds
  respectRobotsTxt: true,  // Whether to respect robots.txt
  saveScreenshots: true,   // Whether to save screenshots
  outputDir: './output',   // Output directory
  screenshotsDir: './output/screenshots', // Screenshots directory
  exportGraph: true,       // Whether to export the graph
  graphOutputPath: './output/site-graph.json', // Path to save the graph
  ignoreParams: true,      // Whether to ignore URL parameters
  followExternalLinks: false, // Whether to follow links to external domains
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewportWidth: 1280,
  viewportHeight: 800
};

/**
 * SiteCrawler Class
 * Crawls a website and builds a graph of all possible navigation flows
 */
class SiteCrawler {
  constructor(startUrl, config = {}) {
    this.startUrl = startUrl;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.browser = null;
    this.baseHostname = new URL(startUrl).hostname;
    
    // The graph representation of the site
    this.siteGraph = {
      nodes: {}, // Pages
      edges: []  // Navigation links between pages
    };
    
    // Keep track of visited URLs to avoid loops
    this.visitedUrls = new Set();
    
    // Queue of URLs to visit
    this.urlQueue = [];
    
    // Stats
    this.stats = {
      pagesVisited: 0,
      linksFound: 0,
      startTime: null,
      endTime: null,
      errors: []
    };
  }
  
  /**
   * Generate a unique ID for a URL
   */
  getNodeId(url) {
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
   * Extract metadata from a page
   */
  async extractPageMetadata(page, url) {
    try {
      // Get page metadata
      const metadata = await page.evaluate(() => {
        // Title and description
        const title = document.title;
        const descriptionTag = document.querySelector('meta[name="description"]');
        const description = descriptionTag ? descriptionTag.getAttribute('content') : '';
        
        // Get all headings
        const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({
          level: parseInt(h.tagName.substring(1)),
          text: h.innerText.trim()
        }));
        
        // Count important elements
        const links = document.querySelectorAll('a').length;
        const forms = document.querySelectorAll('form').length;
        const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]').length;
        const inputs = document.querySelectorAll('input:not([type="button"]):not([type="submit"]), textarea, select').length;
        
        return {
          title,
          description,
          headings,
          links,
          forms,
          buttons,
          inputs
        };
      });
      
      // Take screenshot if enabled
      let screenshotPath = '';
      if (this.config.saveScreenshots) {
        const filename = `${this.getNodeId(url)}.png`;
        screenshotPath = path.join(this.config.screenshotsDir, filename);
        await page.screenshot({ path: screenshotPath, fullPage: false });
      }
      
      return { ...metadata, screenshot: screenshotPath };
    } catch (error) {
      this.stats.errors.push(`Error extracting metadata from ${url}: ${error.message}`);
      return {
        title: '',
        description: '',
        headings: [],
        links: 0,
        forms: 0,
        buttons: 0,
        inputs: 0,
        screenshot: ''
      };
    }
  }
  
  /**
   * Extract all links from a page
   */
  async extractLinks(page, currentUrl) {
    try {
      // Extract all links and their metadata
      const links = await page.evaluate((maxLinks) => {
        const results = [];
        
        // Get all <a> elements
        const linkElements = document.querySelectorAll('a');
        
        // Process each link, up to the maximum
        for (let i = 0; i < Math.min(linkElements.length, maxLinks); i++) {
          const link = linkElements[i];
          const href = link.getAttribute('href');
          
          if (href) {
            results.push({
              url: href,
              text: link.innerText.trim() || link.getAttribute('title') || '',
              type: 'link',
              selector: getUniqueSelector(link)
            });
          }
        }
        
        // Get clickable buttons and form submissions (simplified)
        const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
        for (let i = 0; i < buttons.length; i++) {
          const button = buttons[i];
          results.push({
            type: 'button',
            text: button.innerText || button.value || button.id || 'Button',
            selector: getUniqueSelector(button)
          });
        }
        
        function getUniqueSelector(element) {
          if (element.id) return `#${element.id}`;
          if (element.className) {
            const classes = Array.from(element.classList).join('.');
            return classes ? `${element.tagName.toLowerCase()}.${classes}` : element.tagName.toLowerCase();
          }
          return element.tagName.toLowerCase();
        }
        
        return results;
      }, this.config.maxLinksPerPage);
      
      return links;
    } catch (error) {
      this.stats.errors.push(`Error extracting links from ${currentUrl}: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Crawl a single page and extract all information
   */
  async crawlPage(url, depth = 0) {
    if (!this.shouldCrawl(url) || depth > this.config.maxDepth || 
        this.stats.pagesVisited >= this.config.maxPages) {
      return;
    }
    
    // Mark as visited before we start to avoid duplicate crawling
    this.visitedUrls.add(url);
    
    try {
      // Log progress
      console.log(`Crawling (${depth}/${this.config.maxDepth}): ${url}`);
      
      // Open a new page
      const page = await this.browser.newPage();
      
      // Set user agent and viewport
      await page.setUserAgent(this.config.userAgent);
      await page.setViewport({ 
        width: this.config.viewportWidth, 
        height: this.config.viewportHeight 
      });
      
      // Navigate to URL with timeout
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: this.config.timeout 
      });
      
      // Extract page metadata and add node to graph
      const metadata = await this.extractPageMetadata(page, url);
      const nodeId = this.addNode(url, metadata);
      
      // Extract all links on the page
      const links = await this.extractLinks(page, url);
      this.stats.linksFound += links.length;
      
      // Process outbound links
      for (const link of links) {
        if (link.type === 'link' && link.url) {
          const normalizedUrl = this.normalizeUrl(link.url, url);
          
          if (normalizedUrl && this.shouldCrawl(normalizedUrl)) {
            // Add edge to graph
            this.addEdge(url, normalizedUrl, {
              type: 'link',
              text: link.text,
              selector: link.selector
            });
            
            // Add to queue for later processing
            this.urlQueue.push({
              url: normalizedUrl,
              depth: depth + 1
            });
          }
        } else if (link.type === 'button') {
          // Add special node for button interactions
          // This is simplified - in reality, we'd need to track form submissions and button clicks
          const buttonNodeId = `${nodeId}_button_${link.text.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          
          // Add hypothetical state after button click (can be enhanced with actual actions)
          this.siteGraph.nodes[buttonNodeId] = {
            id: buttonNodeId,
            url: `${url}#action-${link.text}`,
            title: `After ${link.text} on ${metadata.title}`,
            virtual: true,
            parentUrl: url,
            actionType: 'button',
            actionText: link.text,
            actionSelector: link.selector,
            lastVisited: new Date().toISOString()
          };
          
          // Add edge for this button
          this.siteGraph.edges.push({
            from: nodeId,
            to: buttonNodeId,
            type: 'button',
            text: link.text,
            selector: link.selector,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // Increment counter
      this.stats.pagesVisited++;
      
      // Close page
      await page.close();
    } catch (error) {
      this.stats.errors.push(`Error crawling ${url}: ${error.message}`);
    }
  }
  
  /**
   * Start the crawling process
   */
  async crawl() {
    try {
      // Set start time
      this.stats.startTime = new Date().toISOString();
      
      // Create output directories
      await fs.mkdir(this.config.outputDir, { recursive: true });
      if (this.config.saveScreenshots) {
        await fs.mkdir(this.config.screenshotsDir, { recursive: true });
      }
      
      // Launch browser
      this.browser = await puppeteer.launch({
        headless: 'new', // Use new headless mode
        defaultViewport: {
          width: this.config.viewportWidth,
          height: this.config.viewportHeight
        }
      });
      
      // Add start URL to queue
      this.urlQueue.push({ url: this.startUrl, depth: 0 });
      
      // Process queue
      while (this.urlQueue.length > 0 && 
             this.stats.pagesVisited < this.config.maxPages) {
        const { url, depth } = this.urlQueue.shift();
        await this.crawlPage(url, depth);
      }
      
      // Set end time
      this.stats.endTime = new Date().toISOString();
      
      // Export graph if configured
      if (this.config.exportGraph) {
        await this.exportGraph();
      }
      
      // Close browser
      await this.browser.close();
      
      // Return the site graph and stats
      return {
        graph: this.siteGraph,
        stats: this.stats
      };
    } catch (error) {
      this.stats.errors.push(`Error during crawl: ${error.message}`);
      
      // Close browser if it's open
      if (this.browser) {
        await this.browser.close();
      }
      
      throw error;
    }
  }
  
  /**
   * Export the site graph to a file
   */
  async exportGraph() {
    try {
      // Add stats information to the graph
      const fullGraph = {
        graph: this.siteGraph,
        stats: {
          ...this.stats,
          nodeCount: Object.keys(this.siteGraph.nodes).length,
          edgeCount: this.siteGraph.edges.length
        },
        config: this.config
      };
      
      // Export as JSON
      await fs.writeFile(
        this.config.graphOutputPath, 
        JSON.stringify(fullGraph, null, 2)
      );
      
      console.log(`Site graph exported to: ${this.config.graphOutputPath}`);
      
      return this.config.graphOutputPath;
    } catch (error) {
      this.stats.errors.push(`Error exporting graph: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Visualize graph relationships (create a DOT file for Graphviz)
   */
  async visualizeGraph() {
    try {
      const dotLines = ['digraph SiteMap {', '  rankdir=LR;', '  node [shape=box, style=filled, fillcolor=lightblue];'];
      
      // Add nodes
      Object.values(this.siteGraph.nodes).forEach(node => {
        const label = node.title || node.url.split('/').pop() || 'Page';
        const id = node.id;
        
        // Virtual nodes are shown differently
        if (node.virtual) {
          dotLines.push(`  "${id}" [label="${label}", fillcolor=lightgreen];`);
        } else {
          dotLines.push(`  "${id}" [label="${label}"];`);
        }
      });
      
      // Add edges
      this.siteGraph.edges.forEach(edge => {
        const fromId = edge.from;
        const toId = edge.to;
        const label = edge.text || edge.type || '';
        
        if (edge.type === 'button') {
          dotLines.push(`  "${fromId}" -> "${toId}" [label="${label}", color=red];`);
        } else {
          dotLines.push(`  "${fromId}" -> "${toId}" [label="${label}"];`);
        }
      });
      
      dotLines.push('}');
      
      // Write DOT file
      const dotPath = path.join(this.config.outputDir, 'site-graph.dot');
      await fs.writeFile(dotPath, dotLines.join('\n'));
      
      console.log(`Graph visualization exported to: ${dotPath}`);
      return dotPath;
    } catch (error) {
      this.stats.errors.push(`Error creating visualization: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Helper function to start a crawl with a simple interface
 */
export async function crawlSite(startUrl, options = {}) {
  const crawler = new SiteCrawler(startUrl, options);
  
  try {
    const result = await crawler.crawl();
    
    if (options.visualize !== false) {
      await crawler.visualizeGraph();
    }
    
    return result;
  } catch (error) {
    console.error('Crawling failed:', error);
    throw error;
  }
}

// If this is run as a script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const startUrl = process.argv[2];
  
  if (!startUrl) {
    console.error('Please provide a starting URL');
    process.exit(1);
  }
  
  console.log(`Starting site crawler at: ${startUrl}`);
  
  crawlSite(startUrl)
    .then(() => console.log('Crawl completed successfully'))
    .catch(error => {
      console.error('Crawl failed:', error);
      process.exit(1);
    });
}