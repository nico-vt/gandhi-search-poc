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

  const searchBooks = async (searchQuery, isQuickSearch = false) => {
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

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_ELASTIC_SEARCH_URL}/search-gandhi/_search`,
        {
          query: {
            multi_match: {
              query: searchQuery,
              fields: ['title^3', 'author^2', 'description', 'tags', 'isbn'],
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
    setQuery(value);
    setShowFullResults(false);

    // Debounce quick search
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      searchBooks(value, true);
    }, 300);
  };

  const handleQuickResultClick = (book) => {
    setQuery(book.title);
    setQuickResults([]);
    searchBooks(book.title, false);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchBooks(query, false);
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
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Buscar por título, autor, ISBN, o descripción..."
            className="search-input"
          />
          <button type="submit" className="search-button" disabled={loading}>
            {loading ? 'Buscando...' : 'Buscar'}
          </button>

          {/* Quick results dropdown */}
          {quickResults.length > 0 && !showFullResults && (
            <div className="quick-results">
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