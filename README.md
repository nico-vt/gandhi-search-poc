# Gandhi Book Search

A React + Vite application that provides a search interface for the Gandhi bookstore catalog stored in Elasticsearch.

## Features

- **Real-time Search**: Search books by title, author, ISBN, or description
- **Debounced Search**: Automatic search as you type with 300ms delay
- **Responsive Design**: Works on desktop and mobile devices
- **Modern UI**: Clean, modern interface with hover effects and animations
- **Book Details**: Display book information including cover images, descriptions, and links

## Setup

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Environment Configuration**
   
   Create a `.env` file in the root directory with your Elasticsearch credentials:
   ```
   VITE_ELASTIC_SEARCH_URL=https://my-elasticsearch-project-b3f71c.es.us-central1.gcp.elastic.cloud:443
   VITE_ELASTIC_SEARCH_API_KEY=your_actual_api_key_here
   ```

   **Important**: Replace `your_actual_api_key_here` with your real Elasticsearch API key.

3. **Run the Development Server**
   ```bash
   pnpm dev
   ```

4. **Open in Browser**
   
   Navigate to `http://localhost:5173` to view the application.

## Usage

1. **Search for Books**: Type in the search field to find books by:
   - Title
   - Author
   - ISBN
   - Description content
   - Tags

2. **View Results**: Books are displayed in a responsive grid with:
   - Book cover image
   - Title and author
   - ISBN and publisher information
   - Language and book type
   - Truncated description
   - Link to view on Gandhi website

3. **Real-time Search**: Results update automatically as you type (with debouncing)

## Technical Details

### Elasticsearch Query
The application uses Elasticsearch's `multi_match` query with the following configuration:
- **Fields**: `title^3`, `author^2`, `description`, `tags`, `isbn`
- **Type**: `best_fields`
- **Fuzziness**: `AUTO` for typo tolerance
- **Size**: 20 results per search

### Environment Variables
- `VITE_ELASTIC_SEARCH_URL`: Your Elasticsearch cluster URL
- `VITE_ELASTIC_SEARCH_API_KEY`: Your Elasticsearch API key

### Book Data Structure
The application expects books in the following Elasticsearch format:
```json
{
  "_source": {
    "title": "Book Title",
    "author": "Author Name",
    "description": "Book description...",
    "image": "https://image-url.jpg",
    "url": "https://gandhi.com.mx/book-url",
    "isbn": "1234567890123",
    "publisher": "Publisher Name",
    "language": "Language",
    "type": "Book Type"
  }
}
```

## Development

### Project Structure
```
src/
├── components/
│   ├── BookSearch.jsx    # Main search component
│   └── BookSearch.css    # Component styles
├── App.jsx              # Main app component
├── App.css              # App-level styles
└── main.jsx             # Entry point
```

### Available Scripts
- `pnpm dev`: Start development server
- `pnpm build`: Build for production
- `pnpm preview`: Preview production build
- `pnpm lint`: Run ESLint

## Troubleshooting

1. **CORS Issues**: Ensure your Elasticsearch cluster allows requests from your domain
2. **API Key Issues**: Verify your API key has the correct permissions for the `search-gandhi` index
3. **No Results**: Check that the Elasticsearch index contains data and the query fields match your data structure

## Security Notes

- API keys are exposed to the client-side in Vite applications
- Consider using a backend proxy for production deployments
- Ensure proper CORS configuration on your Elasticsearch cluster
