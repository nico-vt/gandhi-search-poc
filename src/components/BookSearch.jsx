import { useState, useEffect } from 'react';
import axios from 'axios';
import './BookSearch.css';

const BookSearch = () => {
  const [query, setQuery] = useState('');
  const [quickResults, setQuickResults] = useState([]);
  const [fullResults, setFullResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showFullResults, setShowFullResults] = useState(false);
  const [searchMode, setSearchMode] = useState('general'); // 'general' or 'author'
  const [hideAuthorBadge, setHideAuthorBadge] = useState(false);
  const [prices, setPrices] = useState({});
  const [sellingPrices, setSellingPrices] = useState({});
  const [pricesSuggestions, setPricesSuggestions] = useState({});
  const [sellingPricesSuggestions, setSellingPricesSuggestions] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const searchBooks = async (searchQuery, isQuickSearch = false, mode = searchMode) => {
    if (!searchQuery.trim()) {
      if (isQuickSearch) {
        setQuickResults([]);
      } else {
        setFullResults([]);
      }
      return;
    }

    if (isQuickSearch) {
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError('');

    // Define field boosting based on search mode
    const fields = mode === 'author'
      ? ['author^4', 'title^2', 'description', 'tags', 'isbn']
      : ['title^3', 'author^2', 'description', 'tags', 'isbn'];

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_ELASTIC_SEARCH_URL}/search-gandhi/_search`,
        {
          query: {
            multi_match: {
              query: searchQuery,
              fields: fields,
              type: 'best_fields',
              fuzziness: 'AUTO'
            }
          },
          size: isQuickSearch ? 5 : 20,
          _source: ['title', 'author', 'description', 'image', 'url', 'isbn', 'publisher', 'language', 'type', 'releaseDate', 'skuId']
        },
        {
          headers: {
            'Authorization': `ApiKey ${import.meta.env.VITE_ELASTIC_SEARCH_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const results = response.data.hits.hits.map(hit => hit._source);

      if (isQuickSearch) {
        setQuickResults(results);
      } else {
        setFullResults(results);
        setShowFullResults(true);
        // Fetch prices for full results
        fetchPrices(results, false);
        // Fetch suggestions for the search query, excluding already found results
        fetchSuggestions(searchQuery, results);
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Error searching books. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    searchBooks(query, false);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;

    if (searchMode === 'author') {
      // In author mode, update the query and search
      setQuery(value);
      setShowFullResults(false);

      // Debounce quick search
      clearTimeout(window.searchTimeout);
      window.searchTimeout = setTimeout(() => {
        searchBooks(value, true, 'author');
      }, 300);
    } else {
      // In general mode, normal behavior
      setQuery(value);
      setShowFullResults(false);
      setHideAuthorBadge(false); // Show author badge again when typing

      // Reset search mode to general when typing
      setSearchMode('general');

      // Debounce quick search
      clearTimeout(window.searchTimeout);
      window.searchTimeout = setTimeout(() => {
        searchBooks(value, true, 'general');
      }, 300);
    }
  };

  const fetchSuggestions = async (searchQuery, excludeSkus = []) => {
    if (!searchQuery.trim()) return;

    setSuggestionsLoading(true);
    try {
      // Extract SKU IDs from the main search results to exclude from suggestions
      const skuIdsToExclude = excludeSkus
        .filter(item => item && (item.url || item.isbn)) // Ensure item has required properties
        .map(item => {
          const urlMatch = item.url?.match(/\/p\/(\d+)/);
          return urlMatch ? urlMatch[1] : item.isbn;
        })
        .filter(skuId => skuId && skuId.trim() !== ''); // Filter out empty SKU IDs

      console.log('Excluding SKUs from suggestions:', skuIdsToExclude);

      // First, get the suggestion query from the agentic server with exclusion list
      let suggestionUrl = `https://agentic-server-44kj7.ondigitalocean.app/api/gandhi/book-suggestion-query?q=${encodeURIComponent(searchQuery)}`;

      // Only add exclude parameter if we have SKUs to exclude and they're not empty
      if (skuIdsToExclude.length > 0 && skuIdsToExclude.some(sku => sku && sku.trim() !== '')) {
        suggestionUrl += `&exclude=${skuIdsToExclude.join(',')}`;
      }

      const suggestionResponse = await axios.get(suggestionUrl);

      if (!suggestionResponse.data || !suggestionResponse.data.query) {
        console.warn('Invalid response from agentic server, falling back to basic search');
        // Fallback to basic search without exclusions
        const fallbackResponse = await axios.post(
          `${import.meta.env.VITE_ELASTIC_SEARCH_URL}/search-gandhi/_search`,
          {
            query: {
              multi_match: {
                query: searchQuery,
                fields: ['title^2', 'author^2', 'description', 'tags'],
                type: 'best_fields',
                fuzziness: 'AUTO'
              }
            },
            size: 8,
            _source: ['title', 'author', 'description', 'image', 'url', 'isbn']
          },
          {
            headers: {
              'Authorization': `ApiKey ${import.meta.env.VITE_ELASTIC_SEARCH_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const fallbackResults = fallbackResponse.data.hits.hits.map(hit => hit._source);

        // Apply frontend filtering as fallback
        let finalFallbackResults = fallbackResults;
        if (skuIdsToExclude.length > 0) {
          finalFallbackResults = fallbackResults.filter(book => {
            const bookSkuId = book.url?.match(/\/p\/(\d+)/)?.[1] || book.isbn;
            return !skuIdsToExclude.includes(bookSkuId);
          });
        }

        // Remove duplicate titles from fallback results as well
        const uniqueTitles = new Set();
        const duplicateFallbackTitles = [];
        const deduplicatedFallbackResults = finalFallbackResults.filter(book => {
          if (!book.title) return false;

          // Normalize title for comparison using helper function
          const normalizedTitle = normalizeTitle(book.title);

          if (uniqueTitles.has(normalizedTitle)) {
            duplicateFallbackTitles.push(book.title);
            return false; // Skip duplicate title
          }

          uniqueTitles.add(normalizedTitle);
          return true;
        });

        if (duplicateFallbackTitles.length > 0) {
          console.log(`Duplicate titles in fallback results:`, duplicateFallbackTitles);
        }
        console.log(`Fallback results deduplicated: ${fallbackResults.length} -> ${deduplicatedFallbackResults.length}`);
        setSuggestions(deduplicatedFallbackResults);
        return;
      }

      const suggestionQuery = suggestionResponse.data;
      console.log('Suggestion query from agentic server:', suggestionQuery);

      // Then execute the suggestion query against Elasticsearch
      const esResponse = await axios.post(
        `${import.meta.env.VITE_ELASTIC_SEARCH_URL}/search-gandhi/_search`,
        suggestionQuery.query,
        {
          headers: {
            'Authorization': `ApiKey ${import.meta.env.VITE_ELASTIC_SEARCH_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const suggestionResults = esResponse.data.hits.hits.map(hit => hit._source);

      // If we have SKUs to exclude and the agentic server didn't handle it, 
      // filter out duplicates on the frontend as a fallback
      let finalResults = suggestionResults;

      if (skuIdsToExclude.length > 0) {
        finalResults = suggestionResults.filter(book => {
          const bookSkuId = book.url?.match(/\/p\/(\d+)/)?.[1] || book.isbn;
          return !skuIdsToExclude.includes(bookSkuId);
        });

        console.log(`Filtered suggestions by SKU: ${suggestionResults.length} -> ${finalResults.length} (excluded ${suggestionResults.length - finalResults.length} duplicates)`);
      }

      // Remove duplicate titles to ensure variety in suggestions
      const uniqueTitles = new Set();
      const duplicateTitles = [];
      const deduplicatedResults = finalResults.filter(book => {
        if (!book.title) return false;

        // Normalize title for comparison using helper function
        const normalizedTitle = normalizeTitle(book.title);

        if (uniqueTitles.has(normalizedTitle)) {
          duplicateTitles.push(book.title);
          return false; // Skip duplicate title
        }

        uniqueTitles.add(normalizedTitle);
        return true;
      });

      if (duplicateTitles.length > 0) {
        console.log(`Duplicate titles found and excluded:`, duplicateTitles);
      }
      console.log(`Deduplicated by title: ${finalResults.length} -> ${deduplicatedResults.length} (excluded ${finalResults.length - deduplicatedResults.length} duplicate titles)`);

      setSuggestions(deduplicatedResults);

      // Fetch prices for suggestions
      fetchPrices(suggestionResults, true);
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const fetchPrices = async (items, isSuggestions = false) => {
    if (!items || items.length === 0) return;

    try {
      // Extract SKU IDs from items (assuming they're in the URL or we can extract them)
      const skuIds = items.map(item => {
        // Extract SKU ID from URL if available, or use ISBN as fallback
        const urlMatch = item.url?.match(/\/p\/(\d+)/);
        return urlMatch ? urlMatch[1] : item.skuId;
      }).filter(Boolean);

      if (skuIds.length === 0) return;
      //`${import.meta.env.VITE_VTEX_API_URL}/api/catalog_system/pub/products/search?_from=1&_to=10&O=OrderByPriceASC&fq=skuId:(${skuIds.join(' OR ')})`,

      const params = new URLSearchParams({});
      skuIds.forEach(id => params.append('fq', `skuId:${id}`));
      const response = await axios.get(
        `${import.meta.env.VITE_SERVER_API_URL}/gandhi/prices?ids=${skuIds.join(',')}`,
        {
          headers: {
            'X-VTEX-API-AppKey': import.meta.env.VITE_VTEX_API_KEY,
            'X-VTEX-API-AppToken': import.meta.env.VITE_VTEX_API_TOKEN,
            'Content-Type': 'application/json'
          },
          maxRedirects: 0,
          validateStatus: s => s < 400 || s === 302,
        }
      );

      // Create a map of SKU ID to price
      const priceMap = {};
      const sellingPriceMap = {};
      const prices = response.data?.prices || {};

      Object.entries(prices).forEach(([sku, item]) => {
        // console.log('sku', sku, 'item', item);
        if (item.listPrice !== undefined) {
          priceMap[sku] = item.listPrice;
        }
        if (item.sellingPrice !== undefined) {
          sellingPriceMap[sku] = item.sellingPrice;
        }
      });

      if (isSuggestions) {
        setPricesSuggestions(priceMap);
        setSellingPricesSuggestions(sellingPriceMap);
      } else {
        setPrices(priceMap);
        setSellingPrices(sellingPriceMap);
      }
    } catch (err) {
      console.error('Error fetching prices:', err);
    }
  };

  const handleQuickResultClick = (book) => {
    if (book.url) {
      window.open(book.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleAuthorSearchClick = () => {
    setSearchMode('author');
    setHideAuthorBadge(true);
    // Perform author-focused search immediately
    searchBooks(query, true, 'author');
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchBooks(query, false, searchMode);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      if (searchMode === 'author' && e.target.value === '') {
        // Remove author pill when backspace/delete is pressed on empty input in author mode
        e.preventDefault();
        setSearchMode('general');
        setHideAuthorBadge(false);
        // Perform general search with the current query
        searchBooks(query, true, 'general');
      } else if (e.key === 'Backspace' && query.length === 0 && searchMode === 'general') {
        // Reset search intent when backspace is pressed on empty input in general mode
        setSearchMode('general');
        setQuickResults([]);
        setShowFullResults(false);
        setHideAuthorBadge(false);
      }
    }
  };

  const stripHtml = (html) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const truncateText = (text, maxLength = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Helper function to normalize titles for deduplication
  const normalizeTitle = (title) => {
    if (!title) return '';

    return title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s]/g, '') // Remove punctuation and special characters
      .replace(/\b(edition|volume|vol|part|book|tome|libro|tomo|parte)\b/g, '') // Remove common book terms in multiple languages
      .replace(/\b\d{4}\b/g, '') // Remove years
      .replace(/\b\d+(st|nd|rd|th)\b/g, '') // Remove ordinal numbers
      .trim();
  };

  // Carousel navigation functions
  const getMaxSlides = () => {
    // Calculate slides based on screen width and items per slide
    const isMobile = window.innerWidth <= 768;
    const isSmallMobile = window.innerWidth <= 480;

    if (isSmallMobile) return Math.ceil(suggestions.length / 1) - 1;
    if (isMobile) return Math.ceil(suggestions.length / 2) - 1;
    return Math.ceil(suggestions.length / 4) - 1;
  };

  const nextSlide = () => {
    const maxSlides = getMaxSlides();
    setCurrentSlide(prev => prev < maxSlides ? prev + 1 : 0);
  };

  const prevSlide = () => {
    const maxSlides = getMaxSlides();
    setCurrentSlide(prev => prev > 0 ? prev - 1 : maxSlides);
  };

  const goToSlide = (slideIndex) => {
    setCurrentSlide(slideIndex);
  };

  // Reset carousel when suggestions change
  useEffect(() => {
    setCurrentSlide(0);
  }, [suggestions]);

  return (
    <div className="book-search">
      <div className="search-header">
        <h1>Gandhi Buscador POC</h1>
        <p>Busca a través del catálogo de Gandhi</p>
      </div>

      <form onSubmit={handleSearch} className="search-form">
        <div className="search-input-container">
          <div className={`search-input-wrapper ${searchMode === 'author' ? 'author-mode' : ''}`}>
            <div className="search-input-content">
              {searchMode === 'author' && (
                <div className="search-pill author-pill">
                  <span className="pill-label">Autor:</span>
                  <span className="pill-value">{query}</span>
                  <button
                    className="pill-remove-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSearchMode('general');
                      setHideAuthorBadge(false);
                      searchBooks(query, true, 'general');
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
              <input
                type="text"
                value={searchMode === 'author' ? '' : query}
                disabled={searchMode === 'author' ? true : false}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder={searchMode === 'author' ? '' : "Buscar por título, autor, ISBN, o descripción..."}
                className={`search-input ${searchMode === 'author' ? 'with-pill' : ''}`}
              />
            </div>
          </div>
          <button type="submit" className={`search-button ${searchMode === 'author' ? 'author-mode' : ''}`} disabled={loading}>
            {loading ? 'Buscando...' : searchMode === 'author' ? 'Buscar' : 'Buscar'}
          </button>

          {/* Quick results dropdown */}
          {quickResults.length > 0 && !showFullResults && (
            <div className="quick-results">
              {/* Author search badge */}
              {!hideAuthorBadge && (
                <div className="author-search-badge" onClick={handleAuthorSearchClick}>
                  Buscar por autor: "{query}"
                </div>
              )}

              {quickResults.map((book, index) => (
                <div
                  key={book.skuId || index}
                  className="quick-result-item"
                  onClick={() => handleQuickResultClick(book)}
                >
                  <div className="quick-result-data">
                    <div className="quick-result-title">{book.title} </div>
                    <small className="quick-result-lang">{book.language} - </small>
                    <small className="quick-result-type">{book.type}</small>
                    <div className="quick-result-author">por {book.author}</div>
                  </div>
                  <div className="quick-result-image">
                    <img width={55} height={55} src={book.image} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>

      {/* Full results section */}
      {showFullResults && (
        <div className="full-results">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {loading && (
            <div className="loading">
              <div className="spinner"></div>
              <p>Buscando...</p>
            </div>
          )}

          {fullResults.length > 0 && (
            <div className="results-info">
              <p>Encontrados {fullResults.length} resultados</p>
            </div>
          )}

          <div className="books-grid">
            {fullResults.map((book, index) => (
              <div key={book.skuId || index} className="book-card">
                <div className="book-image">
                  {book.image ? (
                    <img src={book.image.replace('-55-55', '-300-300')} alt={book.title} />
                  ) : (
                    <div className="no-image">Sin imágen</div>
                  )}
                </div>
                <div className="book-info">
                  <h3 className="book-title">{book.title}</h3>
                  <p className="book-author">Autor: {book.author}</p>
                  {book.publisher && (
                    <p className="book-publisher">Publicado por: {book.publisher}</p>
                  )}
                  {book.language && (
                    <p className="book-language">Lenguaje: {book.language}</p>
                  )}
                  {book.type && (
                    <p className="book-type">Tipo: {book.type}</p>
                  )}
                  {book.description && (
                    <p className="book-description">
                      {truncateText(stripHtml(book.description.substring(book.description.indexOf('_') + 1)))}
                    </p>
                  )}
                  {book.isbn && (
                    <p className="book-isbn">ISBN: {book.isbn}</p>
                  )}
                  {/* Price display */}
                  {(() => {
                    const skuId = book.skuId || book.url?.match(/\/p\/(\d+)/)?.[1] || book.isbn;
                    const listPrice = prices[skuId];
                    const sellingPrice = sellingPrices[skuId];

                    if (!listPrice) return null;

                    if (listPrice !== sellingPrice) {
                      return (
                        <div className="book-price-container">
                          <span className="book-price-original">${listPrice.toFixed(2)}</span>
                          <span className="book-price-selling">${sellingPrice.toFixed(2)}</span>
                        </div>
                      );
                    } else {
                      return (
                        <p className="book-price">${listPrice.toFixed(2)}</p>
                      );
                    }
                  })()}
                  {book.url && (
                    <a
                      href={book.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="book-link"
                    >
                      Ver en Gandhi
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {fullResults.length === 0 && !loading && query && !error && (
            <div className="no-results">
              <p>No books found for "{query}". Try a different search term.</p>
            </div>
          )}
        </div>
      )}

      {/* You may also like suggestions */}
      {(suggestions.length > 0 || suggestionsLoading) && (
        <div className="suggestions-section">
          <h2 className="suggestions-title">También te puede interesar</h2>
          {suggestionsLoading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Cargando sugerencias...</p>
            </div>
          ) : (
            <div className="suggestions-carousel">
              <button
                className="carousel-button carousel-prev"
                onClick={prevSlide}
                aria-label="Previous suggestions"
              >
                ‹
              </button>

              <div className="suggestions-container">
                <div
                  className="suggestions-track"
                  style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                >
                  {suggestions.map((book, index) => (
                    <div key={book.skuId || index} className="suggestion-card">
                      <div className="suggestion-image">
                        {book.image ? (
                          <img src={book.image.replace('-55-55', '-200-200')} alt={book.title} />
                        ) : (
                          <div className="no-image">Sin imágen</div>
                        )}
                      </div>
                      <div className="suggestion-info">
                        <h4 className="suggestion-title">{book.title}</h4>
                        <p className="suggestion-author">{book.author}</p>
                        {/* Price display for suggestions */}
                        {(() => {
                          const skuId = book.skuId || book.url?.match(/\/p\/(\d+)/)?.[1] || book.isbn;
                          const listPrice = pricesSuggestions[skuId];
                          const sellingPrice = sellingPricesSuggestions[skuId];

                          if (!listPrice) return null;

                          if (listPrice !== sellingPrice) {
                            return (
                              <div className="book-price-container">
                                <span className="book-price-original">${listPrice.toFixed(2)}</span>
                                <span className="book-price-selling">${sellingPrice.toFixed(2)}</span>
                              </div>
                            );
                          } else {
                            return (
                              <p className="book-price">${listPrice.toFixed(2)}</p>
                            );
                          }
                        })()}
                        {book.url && (
                          <a
                            href={book.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="suggestion-link"
                          >
                            Ver en Gandhi
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                className="carousel-button carousel-next"
                onClick={nextSlide}
                aria-label="Next suggestions"
              >
                ›
              </button>

              {/* Carousel indicators */}
              <div className="carousel-indicators">
                {Array.from({ length: getMaxSlides() + 1 }, (_, index) => (
                  <button
                    key={index}
                    className={`carousel-indicator ${index === currentSlide ? 'active' : ''}`}
                    onClick={() => goToSlide(index)}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BookSearch; 