#!/usr/bin/env node

/**
 * Web Crawler using Puppeteer
 * 
 * This crawler visits an entire website, extracts all interactive elements,
 * and stores them with semantic keywords in a structured JSON format.
 * 
 * Features:
 * - Crawls all internal pages of a website
 * - Extracts interactive elements (<button>, <a>, <input>, etc.)
 * - Assigns semantic keywords to elements
 * - Handles dynamic content and SPAs
 * - Avoids external domains and dangerous links
 * - Prevents infinite loops by tracking visited URLs
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs-extra');
const path = require('path');
const { Command } = require('commander');
const chalk = require('chalk');

// CLI configuration
const program = new Command();
program
  .version('1.0.0')
  .description('A full website crawler using Puppeteer')
  .requiredOption('-u, --url <url>', 'Base URL to start crawling from')
  .option('-o, --output <path>', 'Output file path for the crawl results', 'site_elements.json')
  .option('-d, --depth <number>', 'Maximum crawl depth (default: 3)', parseInt, 3)
  .option('-t, --timeout <ms>', 'Page load timeout in milliseconds', parseInt, 30000)
  .option('-w, --wait <ms>', 'Wait time after actions in milliseconds', parseInt, 1000)
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .option('--debug', 'Enable debug mode with more verbose logging', false)
  .option('--click-log <path>', 'Path to save click log', 'click_log.json')
  .option('--chrome-path <path>', 'Path to Chrome executable', '')
  .parse(process.argv);

const options = program.opts();
const baseUrl = options.url;
const outputPath = path.resolve(options.output);
const clickLogPath = path.resolve(options.clickLog);
const isHeadless = options.headless === 'true';
const debug = options.debug;
const MAX_DEPTH = parseInt(options.depth, 10);
const PAGE_TIMEOUT = parseInt(options.timeout, 10);
const WAIT_AFTER_ACTION = parseInt(options.wait, 10);
const userChromePath = options.chromePath;

// Domain extraction helper
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error(`Error extracting domain from ${url}:`, error);
    return null;
  }
}

// Find Chrome executable in common locations
function findChromeExecutable() {
  // Check if user provided a path
  if (userChromePath && fs.existsSync(userChromePath)) {
    return userChromePath;
  }
  
  // Windows paths
  if (process.platform === 'win32') {
    const windowsPaths = [
      process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env.PROGRAMFILES + '\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env['PROGRAMFILES(X86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    
    for (const path of windowsPaths) {
      if (path && fs.existsSync(path)) {
        return path;
      }
    }
  } 
  // macOS paths
  else if (process.platform === 'darwin') {
    const darwinPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ];
    
    for (const path of darwinPaths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }
  } 
  // Linux paths
  else {
    const linuxPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge'
    ];
    
    for (const path of linuxPaths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }
  }
  
  // If we can't find Chrome, throw an error
  throw new Error('Could not find Chrome or Edge installation. Please specify the path with --chrome-path option.');
}

/**
 * Main WebCrawler class that handles the crawling process
 */
class WebCrawler {
  constructor() {
    this.browser = null;
    this.baseDomain = null;
    this.visitedUrls = new Set();
    this.results = {};
    this.clickLog = [];
    this.totalElements = 0;
    this.totalPages = 0;
    this.startTime = Date.now();
  }

  /**
   * Initializes the crawler and starts the crawling process
   */
  async start() {
    try {
      // Extract base domain for comparing internal links
      this.baseDomain = extractDomain(baseUrl);
      if (!this.baseDomain) {
        throw new Error('Invalid base URL');
      }

      console.log(chalk.blue(`Starting crawler for domain: ${this.baseDomain}`));
      console.log(chalk.blue(`Max depth: ${MAX_DEPTH}, Page timeout: ${PAGE_TIMEOUT}ms`));

      // Find Chrome executable
      const executablePath = findChromeExecutable();
      console.log(chalk.blue(`Using browser at: ${executablePath}`));

      // Launch browser
      this.browser = await puppeteer.launch({
        headless: isHeadless ? "new" : false,
        executablePath,
        defaultViewport: { width: 1366, height: 768 },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', 
               '--disable-web-security', '--disable-features=IsolateOrigins,site-per-process', 
               '--ignore-certificate-errors']
      });

      // Start crawling from the base URL
      await this.crawlPage(baseUrl, 0);

      // Output results
      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeJson(outputPath, this.results, { spaces: 2 });
  async crawlPage(url, depth) {
    // Check if we've reached the maximum depth
    if (depth > MAX_DEPTH) {
      if (debug) console.log(chalk.yellow(`Max depth reached at ${url}, stopping branch`));
      return;
    }

    // Check if we've already visited this URL
    if (this.visitedUrls.has(url)) {
      if (debug) console.log(chalk.yellow(`Already visited ${url}, skipping`));
      return;
    }

    // Add the URL to visited set
    this.visitedUrls.add(url);
    this.totalPages++;

    // Status log
    console.log(chalk.blue(`[${depth}/${MAX_DEPTH}] Crawling: ${url}`));

    try {
      // Open a new page
      const page = await this.browser.newPage();

      // Set up page events and handlers
      await this.setupPageEvents(page);
      
      // Navigate to the URL
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: PAGE_TIMEOUT 
      });

      // Wait for the page to be fully loaded
      await page.waitForTimeout(WAIT_AFTER_ACTION);

      // Scroll to bottom to load lazy content
      await this.scrollToBottom(page);

      // Extract elements from this page
      const elements = await this.extractElements(page);
      
      // Store results for this page
      this.results[url] = {
        title: await page.title(),
        elements: elements,
        timestamp: new Date().toISOString()
      };

      // Get all links on the page
      const links = await this.extractLinks(page, url);
      
      // Process clicks and interactions if not at max depth
      if (depth < MAX_DEPTH) {
        await this.processInteractiveElements(page, url, depth);
      }

      // Close the page to free resources
      await page.close();

      // Crawl each discovered link
      for (const link of links) {
        await this.crawlPage(link, depth + 1);
      }

    } catch (error) {
      console.error(chalk.red(`Error crawling ${url}:`), error);
      // Continue with the next URL even if there's an error with this one
    }
  }

  /**
   * Set up page event handlers
   * 
   * @param {puppeteer.Page} page - Puppeteer page object
   */
  async setupPageEvents(page) {
    // Handle dialog events (alert, confirm, prompt)
    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    // Set a reasonable timeout
    page.setDefaultTimeout(PAGE_TIMEOUT);

    // Log console messages from the page
    if (debug) {
      page.on('console', msg => {
        console.log(chalk.gray(`Page console [${msg.type()}]: ${msg.text()}`));
      });
    }
  }

  /**
   * Scroll to the bottom of the page to load lazy content
   * 
   * @param {puppeteer.Page} page - Puppeteer page object
   */
  async scrollToBottom(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    
    // Wait for any lazy-loaded content to appear
    await page.waitForTimeout(500);
  }

  /**
   * Extract all interactive elements from the page
   * 
   * @param {puppeteer.Page} page - Puppeteer page object
   * @returns {Array} Array of extracted elements with their properties
   */
  async extractElements(page) {
    const elements = await page.evaluate(() => {
      const getKeyword = (element) => {
        // Try to extract a semantic keyword from various attributes
        if (element.getAttribute('aria-label')) return element.getAttribute('aria-label');
        if (element.getAttribute('placeholder')) return element.getAttribute('placeholder');
        if (element.getAttribute('alt')) return element.getAttribute('alt');
        if (element.getAttribute('name')) return element.getAttribute('name');
        if (element.getAttribute('id')) return element.getAttribute('id');
        if (element.getAttribute('title')) return element.getAttribute('title');
        if (element.innerText && element.innerText.trim()) return element.innerText.trim();
        return 'Unknown';
      };

      const isVisible = (element) => {
        if (!element) return false;
        
        const style = window.getComputedStyle(element);
        return style && 
               style.visibility !== 'hidden' && 
               style.display !== 'none' && 
               style.opacity !== '0' &&
               element.offsetWidth > 0 &&
               element.offsetHeight > 0;
      };

      // Select all interactive elements
      const selectors = [
        'button', 'a', 'input', 'textarea', 'select',
        '[role="button"]', '[role="link"]', '[role="checkbox"]',
        '[role="radio"]', '[role="tab"]', '[role="menuitem"]',
        '[role="combobox"]', '[role="textbox"]', '[role="listbox"]',
        'img[onclick]', 'img[role="button"]', 'img.clickable', 'div.clickable', 
        'span.clickable', 'div[onclick]', 'span[onclick]'
      ].join(',');

      const nodeList = document.querySelectorAll(selectors);
      const result = [];

      nodeList.forEach((element) => {
        if (!isVisible(element)) return;
        
        // Get element properties
        const tagName = element.tagName.toLowerCase();
        const id = element.id || '';
        const classes = Array.from(element.classList).join(' ');
        const href = element.href || '';
        const type = element.type || '';
        const text = element.innerText ? element.innerText.trim().substring(0, 100) : '';
        const keyword = getKeyword(element);
        
        // Get bounding box for position info
        const rect = element.getBoundingClientRect();
        
        result.push({
          tagName,
          id,
          classes,
          keyword,
          type,
          text: text.replace(/\n/g, ' ').trim(),
          href,
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            centerX: rect.x + rect.width / 2,
            centerY: rect.y + rect.height / 2,
          },
          xpath: getXPath(element)
        });
      });

      // Helper to generate XPath for an element
      function getXPath(element) {
        if (!element) return '';
        
        // If element has an ID, use that for a direct path
        if (element.id) return `//*[@id="${element.id}"]`;
        
        // Otherwise build path from element hierarchy
        const parts = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
          let idx = 0;
          let sibling = element;
          while (sibling) {
            if (sibling.nodeType === Node.ELEMENT_NODE && 
                sibling.tagName === element.tagName) {
              idx++;
            }
            sibling = sibling.previousSibling;
          }
          
          const tagName = element.tagName.toLowerCase();
          const pathIndex = idx > 0 ? `[${idx}]` : '';
          parts.unshift(`${tagName}${pathIndex}`);
          element = element.parentNode;
        }
        
        return `/${parts.join('/')}`;
      }

      return result;
    });

    // Update total count
    this.totalElements += elements.length;
    console.log(chalk.green(`Found ${elements.length} elements on page`));
    
    return elements;
  }

  /**
   * Extract all internal links from the page
   * 
   * @param {puppeteer.Page} page - Puppeteer page object
   * @param {string} currentUrl - Current page URL
   * @returns {Array} Array of internal links
   */
  async extractLinks(page, currentUrl) {
    const links = await page.evaluate((baseDomain) => {
      const isInternalLink = (href) => {
        try {
          // Check if this is a relative URL
          if (href.startsWith('/')) return true;
          
          // Check if URL is on the same domain
          const url = new URL(href);
          return url.hostname === baseDomain;
        } catch {
          return false;
        }
      };

      // Find all links on the page
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const validLinks = anchors
        .map(a => a.href)
        .filter(href => {
          // Check if it's an internal link and not a file download
          const isInternal = isInternalLink(href);
          const isNotFile = !href.match(/\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx|zip|rar)$/i);
          const isNotMailto = !href.startsWith('mailto:');
          const isNotTel = !href.startsWith('tel:');
          const isNotJavascript = !href.startsWith('javascript:');
          const isNotAnchor = !href.includes('#') || href.indexOf('#') === href.length - 1;
          const isNotDangerous = !href.match(/logout|signout|log-out|sign-out|delete|remove/i);
          
          return isInternal && isNotFile && isNotMailto && isNotTel && 
                 isNotJavascript && isNotAnchor && isNotDangerous;
        });

      return [...new Set(validLinks)]; // Remove duplicates
    }, this.baseDomain);

    if (debug) {
          
          return !isDangerous && !isLikelyNavigation(el);
        })
        .map(el => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            text: el.innerText || el.value || '',
            position: {
              x: rect.left + (rect.width / 2),
              y: rect.top + (rect.height / 2)
            }
          };
        });
    });

    if (debug) {
      console.log(chalk.gray(`Found ${clickables.length} clickable elements to process`));
    }

    // Process each clickable element
    for (let i = 0; i < clickables.length && i < 15; i++) { // Limit to 15 clicks per page
      const element = clickables[i];
      
      try {
        // Log the click attempt
        if (debug) {
          console.log(chalk.gray(`Clicking on ${element.tag} "${element.text || element.id}"`));
        }
        
        // Start monitoring for DOM changes
        await page.evaluate(() => {
          window._domChangeObserved = false;
          const observer = new MutationObserver(() => {
            window._domChangeObserved = true;
          });
          observer.observe(document.body, { 
            childList: true,
            subtree: true,
            attributes: true
          });
          window._observer = observer;
        });
        
        // Click on the element by position
        await page.mouse.click(element.position.x, element.position.y);
        
        // Wait for any DOM changes or a fixed timeout
        await page.waitForFunction(() => window._domChangeObserved === true, { 
          timeout: WAIT_AFTER_ACTION
        }).catch(() => {
          // Continue if no changes occur within timeout
        });
        
        // Stop the observer
        await page.evaluate(() => {
          if (window._observer) {
            window._observer.disconnect();
            delete window._observer;
            delete window._domChangeObserved;
          }
        });
        
        // Wait a bit to ensure UI updates completely
        await page.waitForTimeout(300);
        
        // Log the click action
        this.clickLog.push({
          url,
          element: `${element.tag} "${element.text || element.id}"`,
          position: element.position,
          timestamp: new Date().toISOString()
        });
        
        // Extract elements again to capture any new ones from the click action
        const newElements = await this.extractElements(page);
        if (newElements.length > 0) {
          // Add new elements to the results with a note about the triggering action
          const elementKey = `${url}#click-${i}`;
          this.results[elementKey] = {
            parentUrl: url,
            triggerElement: element,
            elements: newElements,
            timestamp: new Date().toISOString()
          };
        }
      } catch (error) {
        console.error(chalk.red(`Error clicking element on ${url}:`), error);
      }
    }
  }
}

// Execute the crawler
(async () => {
  const crawler = new WebCrawler();
  await crawler.start();
})();