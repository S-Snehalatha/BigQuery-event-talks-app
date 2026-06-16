// Application State
let appState = {
    title: 'BigQuery Release Notes',
    updated: '',
    entries: [],
    filteredEntries: [],
    searchQuery: '',
    activeCategory: 'all',
    selectedItem: null, // { date, link, category, text, rawHtml }
    loading: false
};

// DOM Elements
const elements = {
    btnRefresh: document.getElementById('btn-refresh'),
    spinnerIcon: document.getElementById('spinner-icon'),
    lastUpdatedBadge: document.getElementById('last-updated-badge'),
    searchInput: document.getElementById('search-input'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    categoryFilters: document.getElementById('category-filters'),
    skeletonContainer: document.getElementById('skeleton-container'),
    entriesList: document.getElementById('entries-list'),
    noResults: document.getElementById('no-results'),
    
    // Tweet Console Elements
    tweetEmptyState: document.getElementById('tweet-empty-state'),
    tweetComposerState: document.getElementById('tweet-composer-state'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCount: document.getElementById('char-count'),
    progressRingBar: document.getElementById('progress-ring-bar'),
    btnTweetNow: document.getElementById('btn-tweet-now'),
    btnCancelTweet: document.getElementById('btn-cancel-tweet')
};

// Helper: Format Date string
function formatLastUpdated(dateStr) {
    if (!dateStr) return 'Unknown';
    try {
        const date = new Date(dateStr);
        return 'Updated: ' + date.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } catch (e) {
        return 'Updated: ' + dateStr;
    }
}

// Fetch Release Notes
async function fetchReleases(forceRefresh = false) {
    if (appState.loading) return;
    
    appState.loading = true;
    elements.btnRefresh.classList.add('loading');
    elements.skeletonContainer.style.display = 'flex';
    elements.entriesList.style.display = 'none';
    elements.noResults.style.display = 'none';
    
    try {
        const response = await fetch(`/api/releases?refresh=${forceRefresh}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        appState.title = data.title;
        appState.updated = data.updated;
        appState.entries = data.entries || [];
        
        elements.lastUpdatedBadge.textContent = formatLastUpdated(data.updated);
        
        applyFiltersAndSearch();
    } catch (error) {
        console.error('Error fetching release notes:', error);
        elements.lastUpdatedBadge.textContent = 'Error loading feed';
        elements.lastUpdatedBadge.style.borderColor = 'var(--color-issue)';
    } finally {
        appState.loading = false;
        elements.btnRefresh.classList.remove('loading');
        elements.skeletonContainer.style.display = 'none';
        elements.entriesList.style.display = 'block';
    }
}

// Apply Search and Category Filters
function applyFiltersAndSearch() {
    const query = appState.searchQuery.toLowerCase().trim();
    const catFilter = appState.activeCategory;
    
    appState.filteredEntries = appState.entries.map(entry => {
        // Filter updates inside the entry
        const matchedUpdates = entry.updates.filter(update => {
            // Category check
            const matchesCat = (catFilter === 'all') || 
                               (update.category.toLowerCase() === catFilter.toLowerCase());
                               
            // Search text check
            const matchesSearch = !query || 
                                  entry.date.toLowerCase().includes(query) ||
                                  update.category.toLowerCase().includes(query) ||
                                  update.text.toLowerCase().includes(query);
                                  
            return matchesCat && matchesSearch;
        });
        
        return {
            ...entry,
            updates: matchedUpdates
        };
    }).filter(entry => entry.updates.length > 0); // Only keep days that have matching updates
    
    renderEntries();
}

// Category Badge Color helper
function getCategoryColorVar(category) {
    const cat = category.toLowerCase();
    if (cat.includes('feature')) return '--color-feature';
    if (cat.includes('issue')) return '--color-issue';
    if (cat.includes('change')) return '--color-changed';
    if (cat.includes('deprecat')) return '--color-deprecated';
    return '--color-general';
}

// Render Release Notes to DOM
function renderEntries() {
    elements.entriesList.innerHTML = '';
    
    if (appState.filteredEntries.length === 0) {
        elements.noResults.style.display = 'flex';
        return;
    }
    
    elements.noResults.style.display = 'none';
    
    appState.filteredEntries.forEach((entry, entryIndex) => {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'date-group';
        dateGroup.style.animationDelay = `${entryIndex * 0.05}s`;
        
        dateGroup.innerHTML = `
            <div class="date-header">
                <span class="date-title">${entry.date}</span>
                <div class="date-line"></div>
            </div>
            <div class="updates-grid"></div>
        `;
        
        const grid = dateGroup.querySelector('.updates-grid');
        
        entry.updates.forEach((update, updateIndex) => {
            const card = document.createElement('article');
            card.className = 'update-card';
            
            // Set dynamic category accent color border
            const colorVar = getCategoryColorVar(update.category);
            card.style.setProperty('--border-cat-color', `var(${colorVar})`);
            
            // Check if this card is currently selected
            const isSelected = appState.selectedItem && 
                               appState.selectedItem.date === entry.date &&
                               appState.selectedItem.category === update.category &&
                               appState.selectedItem.text === update.text;
                               
            if (isSelected) {
                card.classList.add('selected');
            }
            
            card.innerHTML = `
                <div class="update-card-header">
                    <span class="cat-badge ${update.category.toLowerCase()}">${update.category}</span>
                    <span class="select-indicator">
                        ${isSelected ? 'Selected' : 'Click to Tweet'} 
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </span>
                </div>
                <div class="update-body">${update.body}</div>
            `;
            
            // Click Handler: Select item to Tweet
            card.addEventListener('click', (e) => {
                // Prevent trigger if clicking on a link
                if (e.target.tagName === 'A') return;
                
                selectUpdateItem({
                    date: entry.date,
                    link: entry.link,
                    category: update.category,
                    text: update.text,
                    rawHtml: update.body
                });
            });
            
            grid.appendChild(card);
        });
        
        elements.entriesList.appendChild(dateGroup);
    });
}

// Select an Update Item for Tweeting
function selectUpdateItem(item) {
    // If clicking already selected item, deselect it
    if (appState.selectedItem && 
        appState.selectedItem.date === item.date &&
        appState.selectedItem.category === item.category &&
        appState.selectedItem.text === item.text) {
        deselectItem();
        return;
    }
    
    appState.selectedItem = item;
    
    // Update card selection styles in DOM
    const cards = document.querySelectorAll('.update-card');
    cards.forEach(card => card.classList.remove('selected'));
    
    // Refresh list to draw selection states (re-rendering preserves scroll state and is clean)
    renderEntries();
    
    // Show Tweet Composer State
    elements.tweetEmptyState.style.display = 'none';
    elements.tweetComposerState.style.display = 'block';
    
    // Generate default tweet text
    // Format: BigQuery Update (Date) - [Category]: Text... Read more: Link #BigQuery #GCP
    const tweetText = formatDefaultTweet(item);
    elements.tweetTextarea.value = tweetText;
    
    updateCharacterCount();
}

// Deselect Item / Cancel Tweet
function deselectItem() {
    appState.selectedItem = null;
    renderEntries();
    
    elements.tweetEmptyState.style.display = 'flex';
    elements.tweetComposerState.style.display = 'none';
    elements.tweetTextarea.value = '';
}

// Format Default Tweet (auto truncate text to fit 280)
function formatDefaultTweet(item) {
    const prefix = `BigQuery Update (${item.date}) [${item.category}]: `;
    const suffix = `\n\nDetails: ${item.link}\n#BigQuery #GCP`;
    
    // X allows 280 characters
    // Link count: X counts any URL as 23 characters regardless of length!
    // Let's compute actual available length for text
    const xLinkLength = 23;
    const prefixLen = prefix.length;
    const suffixLen = suffix.length - item.link.length + xLinkLength;
    
    const availableTextSpace = 280 - prefixLen - suffixLen;
    let cleanText = item.text;
    
    if (cleanText.length > availableTextSpace) {
        cleanText = cleanText.substring(0, availableTextSpace - 3) + '...';
    }
    
    return `${prefix}${cleanText}${suffix}`;
}

// Character Count and Progress Ring logic
function updateCharacterCount() {
    const text = elements.tweetTextarea.value;
    
    // Compute character length accounting for X link shortening (every link is 23 chars)
    let charLength = text.length;
    
    // Find URLs in text and adjust length
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);
    if (urls) {
        urls.forEach(url => {
            charLength = charLength - url.length + 23;
        });
    }
    
    elements.charCount.textContent = charLength;
    
    // Update color and progress circle
    const circumference = 2 * Math.PI * 8; // r = 8 -> ~50.26
    const percentage = Math.min(charLength / 280, 1);
    const offset = circumference - (percentage * circumference);
    
    elements.progressRingBar.style.strokeDashoffset = offset;
    
    // Color thresholds
    if (charLength > 280) {
        elements.charCount.className = 'character-counter danger';
        elements.progressRingBar.style.stroke = 'var(--color-issue)';
        elements.btnTweetNow.disabled = true;
        elements.btnTweetNow.style.opacity = '0.5';
        elements.btnTweetNow.style.cursor = 'not-allowed';
    } else if (charLength > 250) {
        elements.charCount.className = 'character-counter warning';
        elements.progressRingBar.style.stroke = 'var(--color-changed)';
        elements.btnTweetNow.disabled = false;
        elements.btnTweetNow.style.opacity = '1';
        elements.btnTweetNow.style.cursor = 'pointer';
    } else {
        elements.charCount.className = 'character-counter';
        elements.progressRingBar.style.stroke = 'var(--color-primary-light)';
        elements.btnTweetNow.disabled = false;
        elements.btnTweetNow.style.opacity = '1';
        elements.btnTweetNow.style.cursor = 'pointer';
    }
}

// Event Listeners
function initEventListeners() {
    // Refresh button
    elements.btnRefresh.addEventListener('click', () => {
        fetchReleases(true);
    });
    
    // Search Box Input
    elements.searchInput.addEventListener('input', (e) => {
        appState.searchQuery = e.target.value;
        elements.btnClearSearch.style.display = appState.searchQuery ? 'block' : 'none';
        applyFiltersAndSearch();
    });
    
    // Clear Search button
    elements.btnClearSearch.addEventListener('click', () => {
        elements.searchInput.value = '';
        appState.searchQuery = '';
        elements.btnClearSearch.style.display = 'none';
        applyFiltersAndSearch();
        elements.searchInput.focus();
    });
    
    // Category Pills
    elements.categoryFilters.addEventListener('click', (e) => {
        const pill = e.target.closest('.filter-pill');
        if (!pill) return;
        
        // Remove active class from all pills
        const pills = elements.categoryFilters.querySelectorAll('.filter-pill');
        pills.forEach(p => p.classList.remove('active'));
        
        // Add active to clicked pill
        pill.classList.add('active');
        
        // Update state and refresh UI
        appState.activeCategory = pill.dataset.category;
        applyFiltersAndSearch();
    });
    
    // Textarea keyup/input
    elements.tweetTextarea.addEventListener('input', updateCharacterCount);
    
    // Cancel Tweet
    elements.btnCancelTweet.addEventListener('click', deselectItem);
    
    // Tweet Now button
    elements.btnTweetNow.addEventListener('click', () => {
        const text = elements.tweetTextarea.value;
        const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(tweetUrl, '_blank');
    });
}

// App Entry Point
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    fetchReleases(false); // Initial load from cache or live if no cache
});
