const elements = await page.evaluate(() => {
    const keywordSet = new Set();
 
    function generateKeyword(el) {
        const raw = (
            el.getAttribute('aria-label') ||
            el.getAttribute('placeholder') ||
            el.getAttribute('alt') ||
            el.getAttribute('name') ||
            el.getAttribute('id') ||
            el.getAttribute('title') ||
            el.innerText ||
            ''
        ).toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/gi, '');
 
        let keyword = raw || `${el.tagName.toLowerCase()}-${Math.random().toString(36).substr(2, 5)}`;
        let uniqueKeyword = keyword;
        let count = 1;
        while (keywordSet.has(uniqueKeyword)) {
            uniqueKeyword = `${keyword}-${count++}`;
        }
        keywordSet.add(uniqueKeyword);
        return uniqueKeyword;
    }
 
    function getUniqueSelector(el) {
        if (el.id) return `#${el.id}`;
        if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
        if (el.className) return `${el.tagName.toLowerCase()}.${el.className.split(' ').join('.')}`;
        return el.tagName.toLowerCase();
    }
 
    const data = [];
    document.querySelectorAll('*').forEach(el => {
        const keyword = generateKeyword(el);
        el.setAttribute('data-keyword', keyword); // 👈 Annotate live DOM
 
        data.push({
            tag: el.tagName.toLowerCase(),
            type: el.type || null,
            keyword,
            selector: getUniqueSelector(el)
        });
    });
 
    return data;
});