// Site Crawler Popup Script

// When the popup HTML is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Get references to buttons
  const crawlCurrentPageBtn = document.getElementById('crawl-current-page');
  const openCrawlerBtn = document.getElementById('open-crawler');

  // Handle "Start Crawling Current Page" button
  crawlCurrentPageBtn.addEventListener('click', function() {
    // Get the active tab's URL
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs[0]) {
        const currentTabUrl = tabs[0].url;
        
        // Store the URL to use in the crawler page
        chrome.storage.local.set({
          'crawler_start_url': currentTabUrl,
          'crawler_auto_start': true
        }, function() {
          // Open the crawler options page with the URL pre-populated
          chrome.runtime.openOptionsPage();
        });
      } else {
        alert('Could not determine the current page URL.');
      }
    });
  });

  // Handle "Open Crawler Settings" button
  openCrawlerBtn.addEventListener('click', function() {
    // Just open the crawler page without auto-start
    chrome.storage.local.set({
      'crawler_auto_start': false
    }, function() {
      chrome.runtime.openOptionsPage();
    });
  });
});