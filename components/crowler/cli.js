#!/usr/bin/env node

/**
 * CLI for Web Crawler
 * 
 * This script provides a command-line interface for running the web crawler
 * with various options and configurations.
 */

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const readline = require('readline');

// CLI configuration
const program = new Command();
program
  .version('1.0.0')
  .description('Interactive CLI for the Puppeteer Web Crawler')
  .option('-i, --interactive', 'Run in interactive mode')
  .option('-u, --url <url>', 'Base URL to start crawling from')
  .option('-o, --output <path>', 'Output directory for the crawl results', './output')
  .option('-d, --depth <number>', 'Maximum crawl depth', '3')
  .option('-t, --timeout <ms>', 'Page load timeout in milliseconds', '30000')
  .option('-w, --wait <ms>', 'Wait time after actions in milliseconds', '1000')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .option('--debug', 'Enable debug mode with more verbose logging')
  .option('--element-analysis', 'Enable detailed element analysis')
  .parse(process.argv);

const options = program.opts();

// If no URL is provided and not in interactive mode, show help
if (!options.url && !options.interactive) {
  program.help();
}

/**
 * Creates a readline interface for interactive mode
 * @returns {readline.Interface} Readline interface
 */
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Runs the interactive CLI
 */
async function runInteractive() {
  console.log(chalk.blue('=== Web Crawler Interactive Mode ==='));
  
  const rl = createPrompt();
  const config = {
    url: '',
    output: options.output || './output',
    depth: options.depth || 3,
    timeout: options.timeout || 30000,
    wait: options.wait || 1000,
    headless: options.headless === 'true',
    debug: options.debug || false,
    elementAnalysis: options.elementAnalysis || false
  };
  
  // Get URL
  config.url = await new Promise(resolve => {
    rl.question(chalk.green('Enter the base URL to crawl: '), answer => {
      return resolve(answer);
    });
  });
  
  if (!config.url) {
    console.log(chalk.red('Error: URL is required'));
    rl.close();
    return;
  }
  
  // Get depth
  const depthStr = await new Promise(resolve => {
    rl.question(chalk.green(`Enter maximum crawl depth [${config.depth}]: `), answer => {
      return resolve(answer || config.depth);
    });
  });
  config.depth = parseInt(depthStr, 10);
  
  // Get timeout
  const timeoutStr = await new Promise(resolve => {
    rl.question(chalk.green(`Enter page load timeout in ms [${config.timeout}]: `), answer => {
      return resolve(answer || config.timeout);
    });
  });
  config.timeout = parseInt(timeoutStr, 10);
  
  // Get headless mode
  const headlessStr = await new Promise(resolve => {
    rl.question(chalk.green(`Run in headless mode? (true/false) [${config.headless}]: `), answer => {
      if (answer === '') return resolve(config.headless);
      return resolve(answer.toLowerCase() === 'true');
    });
  });
  config.headless = headlessStr === 'true' || headlessStr === true;
  
  // Get element analysis
  const analysisStr = await new Promise(resolve => {
    rl.question(chalk.green(`Enable detailed element analysis? (true/false) [${config.elementAnalysis}]: `), answer => {
      if (answer === '') return resolve(config.elementAnalysis);
      return resolve(answer.toLowerCase() === 'true');
    });
  });
  config.elementAnalysis = analysisStr === 'true' || analysisStr === true;
  
  // Get output path
  config.output = await new Promise(resolve => {
    rl.question(chalk.green(`Enter output directory [${config.output}]: `), answer => {
      return resolve(answer || config.output);
    });
  });
  
  // Close readline interface
  rl.close();
  
  // Show configuration and confirm
  console.log('\n' + chalk.blue('Crawler Configuration:'));
  console.log(chalk.yellow(`URL: ${config.url}`));
  console.log(chalk.yellow(`Depth: ${config.depth}`));
  console.log(chalk.yellow(`Timeout: ${config.timeout}ms`));
  console.log(chalk.yellow(`Headless: ${config.headless}`));
  console.log(chalk.yellow(`Element Analysis: ${config.elementAnalysis}`));
  console.log(chalk.yellow(`Output: ${config.output}`));
  
  console.log('\n' + chalk.green('Starting crawler...'));
  
  // Run the crawler
  runCrawler(config);
}

/**
 * Runs the crawler with the provided configuration
 * @param {Object} config - Crawler configuration
 */
function runCrawler(config) {
  const crawlerPath = path.join(__dirname, 'crawler.js');
  
  // Ensure the crawler file exists
  if (!fs.existsSync(crawlerPath)) {
    console.error(chalk.red(`Error: Crawler file not found at ${crawlerPath}`));
    return;
  }
  
  // Prepare arguments for the crawler
  const args = [
    crawlerPath,
    '--url', config.url,
    '--output', path.join(config.output, 'site_elements.json'),
    '--depth', config.depth.toString(),
    '--timeout', config.timeout.toString(),
    '--wait', config.wait.toString(),
    '--headless', config.headless.toString(),
    '--click-log', path.join(config.output, 'click_log.json')
  ];
  
  if (config.debug) {
    args.push('--debug');
  }
  
  if (config.elementAnalysis) {
    args.push('--element-analysis');
  }
  
  // Ensure output directory exists
  fs.ensureDirSync(config.output);
  
  // Spawn the crawler process
  const crawler = spawn('node', args, { stdio: 'inherit' });
  
  crawler.on('error', (error) => {
    console.error(chalk.red('Failed to start crawler:'), error);
  });
  
  crawler.on('close', (code) => {
    if (code !== 0) {
      console.log(chalk.red(`Crawler process exited with code ${code}`));
    }
  });
}

// Check if we should run in interactive mode
if (options.interactive) {
  runInteractive();
} else {
  // Run with command line options
  runCrawler({
    url: options.url,
    output: options.output || './output',
    depth: parseInt(options.depth, 10),
    timeout: parseInt(options.timeout, 10),
    wait: parseInt(options.wait, 10),
    headless: options.headless === 'true',
    debug: options.debug || false,
    elementAnalysis: options.elementAnalysis || false
  });
}