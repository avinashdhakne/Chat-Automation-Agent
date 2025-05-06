/**
 * Element Analyzer Utility
 * 
 * This module provides helper functions for analyzing and classifying web elements
 * to provide better semantic understanding of a webpage's interactive components.
 */

/**
 * Analyzes an element to determine its semantic purpose
 * @param {Object} element - Element data object extracted from the page 
 * @returns {Object} Analysis results with type classifications
 */
function analyzeElement(element) {
  const result = {
    elementType: classifyElementType(element),
    interactionType: determineInteractionType(element),
    semanticPurpose: determinePurpose(element),
    importance: calculateImportance(element),
    safety: assessSafety(element)
  };

  return result;
}

/**
 * Classifies the element's UI component type
 * @param {Object} element - Element data
 * @returns {String} Element classification
 */
function classifyElementType(element) {
  const { tagName, classes, type, keyword, text } = element;
  
  // Check buttons
  if (tagName === 'button' || type === 'submit' || type === 'button' || 
      classes.includes('btn') || classes.includes('button')) {
    if (type === 'submit' || text.match(/submit|save|ok|apply/i)) {
      return 'submit-button';
    }
    if (text.match(/cancel|back|return/i)) {
      return 'cancel-button';
    }
    return 'button';
  }
  
  // Check inputs
  if (tagName === 'input') {
    if (type === 'text' || type === 'email' || type === 'password' || 
        type === 'search' || type === 'tel' || type === 'url' || type === 'number') {
      return 'text-input';
    }
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio-button';
    if (type === 'file') return 'file-upload';
    if (type === 'date' || type === 'datetime-local') return 'date-picker';
    return 'input-other';
  }
  
  // Check links
  if (tagName === 'a') {
    if (element.href && element.href.match(/^(mailto:|tel:)/)) {
      return 'contact-link';
    }
    return 'link';
  }
  
  // Check form elements
  if (tagName === 'select') return 'dropdown';
  if (tagName === 'textarea') return 'text-area';
  
  // Check special roles
  if (element.role === 'tab') return 'tab';
  if (element.role === 'menuitem') return 'menu-item';
  if (element.role === 'checkbox') return 'checkbox';
  if (element.role === 'button') return 'button';
  if (element.role === 'link') return 'link';
  
  // Check common class patterns
  if (classes.match(/tab|nav-item/)) return 'tab';
  if (classes.match(/dropdown|select/)) return 'dropdown';
  if (classes.match(/menu-item/)) return 'menu-item';
  if (classes.match(/modal-close|close|dismiss/)) return 'close-button';
  
  // Default to generic interactive element
  return 'generic-interactive';
}

/**
 * Determines the type of interaction possible with this element
 * @param {Object} element - Element data
 * @returns {String} Interaction type
 */
function determineInteractionType(element) {
  const { tagName, type, classes } = element;
  
  if (tagName === 'a' || classes.includes('link')) return 'navigation';
  
  if (tagName === 'button' || type === 'button' || type === 'submit' || 
      classes.match(/btn|button/)) {
    return 'click';
  }
  
  if (tagName === 'input') {
    if (type === 'text' || type === 'email' || type === 'password' || 
        type === 'search' || type === 'tel' || type === 'url') {
      return 'text-entry';
    }
    
    if (type === 'checkbox' || type === 'radio') return 'toggle';
    if (type === 'file') return 'file-selection';
    if (type === 'range') return 'slider';
    if (type === 'date' || type === 'time' || type === 'datetime-local') return 'date-selection';
    if (type === 'color') return 'color-selection';
  }
  
  if (tagName === 'select') return 'selection';
  if (tagName === 'textarea') return 'text-entry';
  
  if (classes.match(/toggle|switch|checkbox/)) return 'toggle';
  if (classes.match(/slider|range/)) return 'slider';
  if (classes.match(/accordion|collapse/)) return 'expand-collapse';
  if (classes.match(/tab/)) return 'tab-selection';
  
  return 'click';
}

/**
 * Determines the likely semantic purpose of the element
 * @param {Object} element - Element data
 * @returns {String} Purpose classification
 */
function determinePurpose(element) {
  const { keyword, text, id, classes, tagName, type } = element;
  const content = [keyword, text, id, classes].join(' ').toLowerCase();
  
  // Authentication related
  if (content.match(/login|log in|signin|sign in|signup|register/)) {
    return 'authentication';
  }
  
  // Navigation related
  if (content.match(/home|menu|navbar|nav|navigation|back|next|previous|sitemap/)) {
    return 'navigation';
  }
  
  // Search related
  if (content.match(/search|find|filter|query/)) {
    return 'search';
  }
  
  // Form submission related
  if ((tagName === 'button' || type === 'submit') && 
      content.match(/submit|save|send|apply|ok|continue|confirm/)) {
    return 'form-submission';
  }
  
  // Cancel/close actions
  if (content.match(/cancel|close|dismiss|abort|back/)) {
    return 'cancellation';
  }
  
  // Content manipulation
  if (content.match(/edit|update|modify|change|create|new|add|remove|delete|clear/)) {
    return 'content-manipulation';
  }
  
  // Media controls
  if (content.match(/play|pause|stop|volume|mute|skip|next|previous|rewind|forward/)) {
    return 'media-control';
  }
  
  // Social interactions
  if (content.match(/share|like|follow|comment|post|tweet|subscribe/)) {
    return 'social-interaction';
  }
  
  // Selection elements
  if (tagName === 'select' || type === 'checkbox' || type === 'radio' || 
      content.match(/select|choose|option|preference|setting/)) {
    return 'selection';
  }
  
  // Default to "interaction"
  return 'general-interaction';
}

/**
 * Calculates the importance level of an element based on various factors
 * @param {Object} element - Element data
 * @returns {Number} Importance score from 0-10
 */
function calculateImportance(element) {
  let score = 5; // Start with medium importance
  const { keyword, text, id, classes, position, tagName, type } = element;
  const content = [keyword, text, id, classes].join(' ').toLowerCase();

  // Increase score for primary actions
  if (content.match(/primary|main|important|submit|confirm|save|create|add|login|signup|register/)) {
    score += 2;
  }
  
  // Adjust score based on element size
  if (element.position.width > 200 || element.position.height > 50) {
    score += 1;
  }
  
  // Position near the center or top of page may indicate importance
  if (position.centerY < 500) {
    score += 1;
  }
  
  // Reduce score for secondary actions
  if (content.match(/cancel|back|close|secondary/)) {
    score -= 1;
  }
  
  // Adjust for element type
  if (tagName === 'button' || type === 'submit') {
    score += 1;
  }
  
  // Clamp score to 0-10
  return Math.max(0, Math.min(10, score));
}

/**
 * Assesses whether an element is safe to interact with
 * @param {Object} element - Element data
 * @returns {Object} Safety assessment
 */
function assessSafety(element) {
  const { keyword, text, id, classes, href } = element;
  const content = [keyword, text, id, classes].join(' ').toLowerCase();
  
  const dangerous = content.match(/delete|remove|clear|reset|logout|log out|sign out|unsubscribe/i) !== null;
  const external = href && !href.startsWith('/') && !href.startsWith('#') && !href.startsWith('javascript:');
  
  return {
    isDangerous: dangerous,
    isExternal: external,
    safeToClick: !dangerous && !external
  };
}

/**
 * Categorizes a set of elements by their function
 * @param {Array} elements - Array of element objects
 * @returns {Object} Elements grouped by category
 */
function categorizeElements(elements) {
  const categories = {
    navigation: [],
    forms: [],
    buttons: [],
    contentControls: [],
    mediaControls: [],
    userInteraction: [],
    other: []
  };
  
  elements.forEach(element => {
    const analysis = analyzeElement(element);
    element.analysis = analysis;
    
    // Categorize based on analysis
    const purpose = analysis.semanticPurpose;
    
    if (purpose === 'navigation') {
      categories.navigation.push(element);
    } else if (purpose === 'form-submission' || purpose === 'authentication') {
      categories.forms.push(element);
    } else if (analysis.elementType.includes('button')) {
      categories.buttons.push(element);
    } else if (purpose === 'content-manipulation' || purpose === 'selection') {
      categories.contentControls.push(element);
    } else if (purpose === 'media-control') {
      categories.mediaControls.push(element);
    } else if (purpose === 'social-interaction') {
      categories.userInteraction.push(element);
    } else {
      categories.other.push(element);
    }
  });
  
  return categories;
}

module.exports = {
  analyzeElement,
  categorizeElements,
  classifyElementType,
  determineInteractionType,
  determinePurpose,
  calculateImportance,
  assessSafety
};