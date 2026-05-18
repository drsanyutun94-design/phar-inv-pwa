# Pharma Inventory Manager

A Progressive Web App (PWA) for managing pharmacy inventory with Google Sheets backend.

## Features

- Mobile-friendly interface with bottom navigation
- Search medicines by name
- Register new items
- Record daily purchases with packaging schemes
- Manage inventory stock in main and sub stores
- Transfer stock between stores
- Track expiry dates
- Offline functionality with automatic sync when online

## Prerequisites

- Node.js (v14 or higher)
- Google Cloud Service Account with Google Sheets API access

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd pharma-inventory-manager
```

### 2. Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

### 3. Google Sheets Configuration

1. Create a Google Spreadsheet with the following sheets:
   - `item list` (columns: A=Item Code, B=Item Name, C=Unit)
   - `daily in` (columns: A=Transaction ID, B=Purchase Date, C=Supplier, D=Item Code, E=Item Name, F=Total Price, G=Units per Card, H=Cards per Box, I=Number of Boxes, J=Expiry Date, K=Payment1 Amount, L=Payment1 Type, M=Payment2 Amount, N=Payment2 Type, O=Payment3 Amount, P=Payment3 Type)
   - `Inventory stock` (columns: A=Item Code, B=Item Name, C=Main Store Quantity, D=Sub Store Quantity, E=Unit)
   - `Transfer` (columns: A=Date, B=Item Code, C=Item Name, D=Quantity, E=Direction)
   - `Expired Date` (columns: A=Item Code, B=Item Name, C=Expiry Date) - Used for adding expiries
   - `Exp list` (columns: A=Medicine name, B=Expired date, C=Current stock) - Used for dashboard summary
   - `Low stock` (columns: A=Medicine name, B=Current stock, C=(Empty), D=Items sold within last 30 days)

2. Create a Google Cloud Project and enable the Google Sheets API

3. Create a Service Account and download the JSON credentials

4. Share your Google Spreadsheet with the service account email address

5. Copy the Spreadsheet ID from the URL (the long string between `/d/` and `/edit`)

### 4. Environment Variables

Create a `.env` file in the `backend` directory:

```env
# Google Sheets API Configuration
GOOGLE_SHEET_ID=your_google_spreadsheet_id_here
GOOGLE_CLIENT_EMAIL=your_service_account_email_here
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----\n"

# Server Configuration
PORT=3000
```

### 5. Run the Application

Start the backend server:

```bash
npm start
```

Or for development with auto-restart:

```bash
npm run dev
```

### 6. Frontend Setup

The frontend is served statically. You can use any static file server or deploy it to a CDN.

For local development, you can use a simple HTTP server:

```bash
# From the frontend directory
npx http-server
```

Make sure to configure your frontend to point to your backend API endpoint.

## Architecture

- **Frontend**: HTML, CSS, JavaScript (mobile-first design with PWA features)
- **Backend**: Node.js with Express.js
- **Data Storage**: Google Sheets API
- **Authentication**: Service Account (no user login required)

## Security

- Service Account credentials are kept in environment variables
- No client-side exposure of credentials
- API endpoints protected by server-side validation

## Offline Functionality

The PWA supports offline usage:
- Caches static assets for offline access
- Queues API requests when offline
- Automatically syncs when connection is restored

## Deployment

1. Deploy the backend to a cloud platform (Heroku, AWS, Google Cloud, etc.)
2. Serve the frontend files statically (GitHub Pages, Netlify, Vercel, etc.)
3. Update the frontend to point to your deployed backend API

## API Endpoints

- `GET /api/items` - Get all items
- `GET /api/items/search/:query` - Search items by name
- `POST /api/items` - Register new item
- `POST /api/purchases` - Add purchase record
- `POST /api/stock` - Add stock to inventory
- `POST /api/transfers` - Record stock transfer
- `POST /api/expiries` - Add expiry date
- `GET /api/stock` - Get inventory stock