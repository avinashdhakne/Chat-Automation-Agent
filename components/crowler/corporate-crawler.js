#!/usr/bin/env node

/**
 * Corporate Web Crawler using Puppeteer Core
 * 
 * Enhanced crawler with features to handle corporate environments:
 * - Corporate proxy support
 * - SSL/certificate error handling
 * - Authentication support
 * - Retry mechanisms
 * - Better error handling
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const readline = require('readline');

// Default configuration
const config = {
  url: process.argv[2],
  outputPath: path.resolve('./output/site_elements.json'),
  headless: true,
  timeout: 60000,
  waitTime: 2000,
  retries: 3,
  proxy: null,
  ignoreHttpsErrors: true,
  useAuth: false,
  username: '',
  password: '',
  depth: 1
};

// Create readline interface for interactive mode
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promise-based readline question
function question(query) {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
}

// Find Chrome executable in common locations
async function findChromeExecutable() {
  // Windows paths
  if (process.platform === 'win32') {
    const windowsPaths = [
      process.env['PROGRAMFILES'] + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env.PROGRAMFILES + '\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env['PROGRAMFILES(X86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    
    for (const path of windowsPaths) {
      if (path && fs.existsSync(path)) {
        console.log(chalk.green(`Found browser at: ${path}`));
        return path;
      }
    }
  }
  // Other platforms
  else if (process.platform === 'darwin') {
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ];
    for (const path of macPaths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }
  } else {
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
  
  throw new Error('Could not find Chrome or Edge installation.');
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error(`Error extracting domain from ${url}:`, error);
    return null;
  }
}

// Interactive mode to collect crawling configuration
async function runInteractiveMode() {
  console.log(chalk.blue('=== Corporate Web Crawler - Interactive Mode ==='));
  
  // Get URL
  if (!config.url) {
    config.url = await question(chalk.green('Enter URL to crawl: '));
    if (!config.url) {
      console.log(chalk.red('Error: URL is required'));
      rl.close();
      return false;
    }
  }
  
  // Get headless mode
  const headlessAnswer = await question(chalk.green(`Run in headless mode? (yes/no) [${config.headless ? 'yes' : 'no'}]: `));
  if (headlessAnswer.toLowerCase() === 'no') config.headless = false;
  
  // Get crawl depth
  const depthAnswer = await question(chalk.green(`Crawl depth (1 for single page, 2+ for following links) [${config.depth}]: `));
  if (depthAnswer) config.depth = parseInt(depthAnswer, 10);
  
  // Get proxy
  const useProxyAnswer = await question(chalk.green('Use corporate proxy? (yes/no) [no]: '));
  if (useProxyAnswer.toLowerCase() === 'yes') {
    config.proxy = await question(chalk.green('Enter proxy URL (e.g. http://proxy.company.com:8080): '));
  }
  
  // Get authentication
  const useAuthAnswer = await question(chalk.green('Use authentication? (yes/no) [no]: '));
  if (useAuthAnswer.toLowerCase() === 'yes') {
    config.useAuth = true;
    config.username = await question(chalk.green('Username: '));
    config.password = await question(chalk.green('Password: '));
  }
  
  // Get timeout
  const timeoutAnswer = await question(chalk.green(`Page timeout in ms [${config.timeout}]: `));
  if (timeoutAnswer) config.timeout = parseInt(timeoutAnswer, 10);
  
  // Get output path
  const outputAnswer = await question(chalk.green(`Output file [${config.outputPath}]: `));
  if (outputAnswer) config.outputPath = path.resolve(outputAnswer);
  
  console.log(chalk.blue('\nCrawler Configuration:'));
  console.log(chalk.yellow(`URL: ${config.url}`));
  console.log(chalk.yellow(`Headless: ${config.headless}`));
  console.log(chalk.yellow(`Depth: ${config.depth}`));
  console.log(chalk.yellow(`Proxy: ${config.proxy || 'None'}`));
  console.log(chalk.yellow(`Authentication: ${config.useAuth ? 'Yes' : 'No'}`));
  console.log(chalk.yellow(`Timeout: ${config.timeout}ms`));
  console.log(chalk.yellow(`Output: ${config.outputPath}`));
  
  const confirmAnswer = await question(chalk.green('\nStart crawling? (yes/no) [yes]: '));
  if (confirmAnswer.toLowerCase() === 'no') {
    console.log(chalk.red('Crawling cancelled'));
    rl.close();
    return false;
  }
  
  rl.close();
  return true;
}

// Extract interactive elements from a page
async function extractElements(page) {
  return page.evaluate(() => {
    // Helper to get semantic keyword
    const getKeyword = (element) => {
      if (element.getAttribute('aria-label')) return element.getAttribute('aria-label');
      if (element.getAttribute('placeholder')) return element.getAttribute('placeholder');
      if (element.getAttribute('alt')) return element.getAttribute('alt');
      if (element.getAttribute('name')) return element.getAttribute('name');
      if (element.getAttribute('id')) return element.getAttribute('id');
      if (element.getAttribute('title')) return element.getAttribute('title');
      if (element.innerText && element.innerText.trim()) return element.innerText.trim();
      return 'Unknown';
    };

    // Check if element is visible
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

    // Select interactive elements
    const selectors = [
      'button', 'a', 'input', 'textarea', 'select',
      '[role="button"]', '[role="link"]', '[role="checkbox"]',
      '[role="radio"]', '[role="tab"]', '[role="menuitem"]',
      'img[onclick]', 'img[role="button"]', 'div[onclick]', 'span[onclick]'
    ].join(',');

    // Get elements
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
      
      // Get element position
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
          height: rect.height
        }
      });
    });

    return result;
  });
}

// Extract internal links from a page
async function extractLinks(page, baseDomain) {
  return page.evaluate((domain) => {
    const isInternalLink = (href) => {
      try {
        if (href.startsWith('/')) return true;
        const url = new URL(href);
        return url.hostname === domain;
      } catch {
        return false;
      }
    };

    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const validLinks = anchors
      .map(a => a.href)
      .filter(href => {
        const isInternal = isInternalLink(href);
        const isNotFile = !href.match(/\.(pdf|jpg|jpeg|png|gif|doc|docx|zip)$/i);
        const isNotMailto = !href.startsWith('mailto:');
        const isNotTel = !href.startsWith('tel:');
        const isNotJavascript = !href.startsWith('javascript:');
        const isNotDangerous = !href.match(/logout|signout|delete|remove/i);
        
        return isInternal && isNotFile && isNotMailto && isNotTel && isNotJavascript && isNotDangerous;
      });

    return [...new Set(validLinks)]; // Remove duplicates
  }, baseDomain);
}

// Navigate to a page with retry mechanism
async function navigateWithRetry(page, url, retries = 3) {
  try {
    console.log(chalk.blue(`Navigating to ${url}`));
    
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: config.timeout
    });
    
    return true;
  } catch (error) {
    console.error(chalk.red(`Navigation error (${url}):`, error.message));
    
    if (retries <= 0) {
      console.error(chalk.red(`Failed to navigate to ${url} after multiple attempts`));
      return false;
    }
    
    console.log(chalk.yellow(`Retrying navigation to ${url}... (${retries} attempts left)`));
    await new Promise(resolve => setTimeout(resolve, 2000));
    return navigateWithRetry(page, url, retries - 1);
  }
}

// Main crawler function
async function crawl() {
  let browser = null;
  let visitedUrls = new Set();
  let results = {};
  
  try {
    // Run in interactive mode if no URL provided
    if (!config.url) {
      const shouldContinue = await runInteractiveMode();
      if (!shouldContinue) return;
    }
    
    console.log(chalk.blue('=== Starting Corporate Web Crawler ==='));
    console.log(chalk.blue(`URL to crawl: ${config.url}`));
    
    // Find Chrome executable
    const executablePath = await findChromeExecutable();
    
    // Set up browser launch options
    const launchOptions = {
      headless: config.headless ? "new" : false,
      executablePath,
      defaultViewport: { width: 1366, height: 768 },
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--allow-running-insecure-content'
      ],
      ignoreHTTPSErrors: config.ignoreHttpsErrors
    };
    
    // Add proxy if specified
    if (config.proxy) {
      console.log(chalk.blue(`Using proxy: ${config.proxy}`));
      launchOptions.args.push(`--proxy-server=${config.proxy}`);
    }
    
    // Launch browser
    browser = await puppeteer.launch(launchOptions);
    console.log(chalk.green('Browser launched successfully!'));
    
    // Set up context
    const context = await browser.createIncognitoBrowserContext();
    const page = await context.newPage();
    
    // Set up authentication if needed
    if (config.useAuth) {
      await page.authenticate({
        username: config.username,
        password: config.password
      });
    }
    
    // Set up error handling for the page
    page.on('error', error => {
      console.error(chalk.red('Page error:'), error);
    });
    
    page.on('pageerror', error => {
      console.error(chalk.red('Page error:'), error);
    });
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(chalk.red(`Console error: ${msg.text()}`));
      }
    });
    
    // Crawl starting URL
    await crawlUrl(page, config.url, 0);
    
    // Save all results
    await fs.ensureDir(path.dirname(config.outputPath));
    await fs.writeJson(config.outputPath, results, { spaces: 2 });
    console.log(chalk.green(`Results saved to ${config.outputPath}`));
    
  } catch (error) {
    console.error(chalk.red('Crawler error:'), error);
  } finally {
    if (browser) {
      await browser.close();
      console.log(chalk.blue('Browser closed'));
    }
  }
  
  // Recursive function to crawl URLs
  async function crawlUrl(page, url, depth) {
    // Skip if already visited
    if (visitedUrls.has(url)) {
      return;
    }
    
    // Add to visited set
    visitedUrls.add(url);
    
    // Check depth limit
    if (depth > config.depth) {
      return;
    }
    
    // Try to navigate to the URL
    const success = await navigateWithRetry(page, url, config.retries);
    if (!success) {
      return;
    }
    
    // Wait for page to stabilize
    await page.waitForTimeout(config.waitTime);
    
    // Extract page title
    const title = await page.title();
    console.log(chalk.green(`Page title: ${title}`));
    
    // Scroll to load lazy content
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
    
    // Extract elements
    const elements = await extractElements(page);
    console.log(chalk.green(`Found ${elements.length} interactive elements on the page`));
    
    // Store results for this page
    results[url] = {
      title: title,
      elements: elements,
      timestamp: new Date().toISOString()
    };
    
    // Extract and follow links if depth allows
    if (depth < config.depth) {
      const domain = extractDomain(url);
      const links = await extractLinks(page, domain);
      console.log(chalk.green(`Found ${links.length} internal links`));
      
      // Store links in results
      results[url].links = links;
      
      // Follow each link
      for (const link of links) {
        if (!visitedUrls.has(link)) {
          console.log(chalk.blue(`Following link: ${link}`));
          try {
            await crawlUrl(page, link, depth + 1);
          } catch (error) {
            console.error(chalk.red(`Error crawling ${link}:`), error);
          }
        }
      }
    }
  }
}

// Run the crawler
crawl().catch(console.error);