#!/usr/bin/env node

/**
 * Simple Web Crawler using Puppeteer Core
 * 
 * This simplified crawler uses puppeteer-core and works with system-installed
 * Chrome or Edge browsers without needing to download a separate Chrome binary.
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

// URL to crawl (you can change this)
const baseUrl = process.argv[2] || 'https://znlwedirrbbx02.na.wkglobal.com:8681/reporting-webapp/';
const outputPath = path.resolve('./output/site_elements.json');

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
  // Other platforms (macOS, Linux)
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

// Main crawler function
async function crawl() {
  let browser = null;
  
  try {
    console.log(chalk.blue('Starting simplified web crawler'));
    console.log(chalk.blue(`URL to crawl: ${baseUrl}`));
    
    // Find Chrome executable
    const executablePath = await findChromeExecutable();
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: "new",
      executablePath,
      defaultViewport: { width: 1366, height: 768 },
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--ignore-certificate-errors'
      ]
    });
    
    console.log(chalk.green('Browser launched successfully!'));
    
    // Create a new page
    const page = await browser.newPage();
    
    // Navigate to the URL
    console.log(chalk.blue(`Navigating to ${baseUrl}`));
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Get page title
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
    const elements = await page.evaluate(() => {
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
    
    console.log(chalk.green(`Found ${elements.length} interactive elements on the page`));
    
    // Extract links
    const links = await page.evaluate((baseDomain) => {
      const isInternalLink = (href) => {
        try {
          if (href.startsWith('/')) return true;
          const url = new URL(href);
          return url.hostname === baseDomain;
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
    }, extractDomain(baseUrl));
    
    console.log(chalk.green(`Found ${links.length} internal links`));
    
    // Prepare results
    const results = {
      url: baseUrl,
      title: title,
      elements: elements,
      links: links,
      timestamp: new Date().toISOString()
    };
    
    // Save results
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeJson(outputPath, results, { spaces: 2 });
    console.log(chalk.green(`Results saved to ${outputPath}`));
    
  } catch (error) {
    console.error(chalk.red('Error:'), error);
  } finally {
    if (browser) {
      await browser.close();
      console.log(chalk.blue('Browser closed'));
    }
  }
}

// Run the crawler
crawl().catch(console.error);