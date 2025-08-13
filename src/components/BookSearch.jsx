import { useState } from 'react';
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
      : ['title^2', 'author^2', 'description', 'tags', 'isbn'];

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
          _source: ['title', 'author', 'description', 'image', 'url', 'isbn', 'publisher', 'language', 'type', 'releaseDate']
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
              <p>Found {fullResults.length} book{fullResults.length !== 1 ? 's' : ''}</p>
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
                  {book.isbn && (
                    <p className="book-isbn">ISBN: {book.isbn}</p>
                  )}
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
                      {truncateText(stripHtml(book.description))}
                    </p>
                  )}
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
    </div>
  );
};

export default BookSearch; 