const express = require('express');
const cors = require('cors');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Validate environment variables
const requiredEnvVars = ['GOOGLE_SHEET_ID', 'GOOGLE_CLIENT_EMAIL', 'GOOGLE_PRIVATE_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('CRITICAL: Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please ensure these are set in your .env file or hosting environment (e.g., Render Dashboard).');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Add this middleware after your existing middleware
app.use((req, res, next) => {
     // Allow all connections for development
     res.setHeader( 'Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://me.kis.v2.scr.kaspersky-labs.com; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com; " +
            "img-src 'self' data: https:; " +
            "connect-src 'self' https:; " +
            "frame-ancestors 'none';");
     next();
 });

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Google Sheets configuration
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID; // Spreadsheet ID from environment

// Helper to format private key correctly
function formatPrivateKey(key) {
  if (!key) return undefined;
  // Remove any surrounding quotes that might have been added by environment configuration
  let formattedKey = key.trim();
  if (formattedKey.startsWith('"') && formattedKey.endsWith('"')) {
    formattedKey = formattedKey.substring(1, formattedKey.length - 1);
  }
  // Replace literal \n with actual newlines
  return formattedKey.replace(/\\n/g, '\n');
}

// Authenticate using service account
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY),
  },
  scopes: SCOPES,
});

const sheets = google.sheets({ version: 'v4', auth });

// Health check endpoint to verify Google Sheets connectivity
app.get('/api/health', async (req, res) => {
  try {
    if (missingEnvVars.length > 0) {
      return res.status(500).json({ 
        status: 'error', 
        message: 'Missing environment variables', 
        missing: missingEnvVars 
      });
    }

    // Try to get spreadsheet metadata to verify connection
    await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    
    res.json({ 
      status: 'ok', 
      message: 'Connected to Google Sheets successfully',
      spreadsheetId: SPREADSHEET_ID 
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to connect to Google Sheets', 
      details: error.message,
      code: error.code
    });
  }
});

// Helper function to get sheet ID by name
async function getSheetId(sheetName) {
  const response = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }
  return sheet.properties.sheetId;
}

// Routes

// Get all items from "item list" sheet
app.get('/api/items', async (req, res) => {
  try {
    const range = 'item list!A:C'; // Assuming A=Code, B=Name, C=Unit
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(200).json([]);
    }
    
    const items = rows.map(row => ({
      code: row[0],
      name: row[1],
      unit: row[2]
    }));
    
    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items', details: error.message });
  }
});

// Search items by name
app.get('/api/items/search/:query', async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const range = 'Inventory stock!A:E'; // Updated to use the new sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(200).json([]);
    }

    const filteredItems = rows
      .filter(row => row[1] && row[1].toLowerCase().includes(query)) // Filter by name in column B
      .map(row => ({
        code: row[0],           // Column A: Item Code
        name: row[1],           // Column B: Item Name
        mainStore: row[2] ? parseInt(row[2]) : 0,  // Column C: Main Store Quantity
        subStore: row[3] ? parseInt(row[3]) : 0,   // Column D: Sub Store Quantity
        unit: row[4]            // Column E: Unit
      }));

    res.json(filteredItems);
  } catch (error) {
    console.error('Error searching items:', error);
    res.status(500).json({ error: 'Failed to search items', details: error.message });
  }
});


// Add new item to "item list" sheet
app.post('/api/items', async (req, res) => {
  try {
    const { code, name, unit } = req.body;
    
    if (!code || !name || !unit) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const range = 'item list!A:C';
    const values = [[code, name, unit]];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'RAW',
      resource: {
        values: values
      }
    });
    
    res.status(201).json({ message: 'Item added successfully' });
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// Get all purchases from "daily in" sheet
app.get('/api/purchases', async (req, res) => {
  try {
    const range = 'daily in!A2:P'; // Start from row 2 to skip header, includes payment method columns K, L, M, N, O, P
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(200).json([]);
    }

    const purchases = rows.map(row => {
      // Collect payment methods from columns K, L, M, N, O, P (amount, type pairs)
      const paymentMethods = [];
      for (let i = 0; i < 3; i++) {
        const amountIndex = 10 + (i * 2);
        const typeIndex = 11 + (i * 2);
        const amount = row[amountIndex];
        const type = row[typeIndex];
        if (amount && type) {
          paymentMethods.push(`${amount} by ${type}`);
        }
      }

      return {
        transactionId: row[0],          // Column A: Transaction ID
        purchaseDate: row[1],           // Column B: Purchase Date
        supplier: row[2],               // Column C: Supplier
        itemCode: row[3],              // Column D: Item Code
        itemName: row[4],               // Column E: Item Name
        totalPrice: parseFloat(row[5]) || 0, // Column F: Total Price
        packageScheme: {                // Columns G, H, I: Package Scheme
          unitsPerCard: parseInt(row[6]) || 0,
          cardsPerBox: parseInt(row[7]) || 0,
          numberOfBoxes: parseInt(row[8]) || 0
        },
        expiryDate: row[9],            // Column J: Expiry Date
        paymentMethods: paymentMethods // Columns K, L, M, N, O, P: Payment Methods (combined back to "amount by type" format)
      };
    });
    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases', details: error.message });
  }
});

// Add purchase to "daily in" sheet
app.post('/api/purchases', async (req, res) => {
  try {
    const { transactionId, purchaseDate, supplier, itemCode, itemName, totalPrice, packageScheme, expiryDate, paymentMethods } = req.body;

    if (!transactionId || !purchaseDate || !supplier || !itemCode || !itemName || !totalPrice || !packageScheme || !expiryDate || !paymentMethods) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Handle payment methods - parse "amount by method" format and distribute across columns K, L, M, N, O, P
    const paymentMethodsArray = paymentMethods || [];
    const paymentData = [];
    for (let i = 0; i < 3; i++) {
      if (paymentMethodsArray[i]) {
        const match = paymentMethodsArray[i].match(/^([\d.]+)\s+by\s+(.+)$/);
        if (match) {
          paymentData.push(match[1]); // amount
          paymentData.push(match[2]); // type
        } else {
          paymentData.push(''); // amount
          paymentData.push(''); // type
        }
      } else {
        paymentData.push(''); // amount
        paymentData.push(''); // type
      }
    }

    const range = 'daily in!A:P'; // A=Transaction ID, B=Purchase Date, C=Supplier, D=Item Code, E=Item Name, F=Total Price, G=Units per Card, H=Cards per Box, I=Number of Boxes, J=Expiry Date, K=Payment1 Amount, L=Payment1 Type, M=Payment2 Amount, N=Payment2 Type, O=Payment3 Amount, P=Payment3 Type

    const values = [[
      transactionId,
      purchaseDate,
      supplier,
      itemCode,
      itemName,
      totalPrice,
      packageScheme.unitsPerCard || '',
      packageScheme.cardsPerBox || '',
      packageScheme.numberOfBoxes || '',
      expiryDate,
      ...paymentData
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'RAW',
      resource: {
        values: values
      }
    });

    res.status(201).json({ message: 'Purchase added successfully' });
  } catch (error) {
    console.error('Error adding purchase:', error);
    res.status(500).json({ error: 'Failed to add purchase' });
  }
});

// Delete purchase by transactionId
app.delete('/api/purchases/:transactionId', async (req, res) => {
  try {
    const transactionId = req.params.transactionId;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    console.log(`Attempting to delete purchase with transactionId: ${transactionId}`);

    // Fetch all purchases to find the row with matching transactionId
    const range = 'daily in!A2:J';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('No purchases found in sheet');
      return res.status(404).json({ error: 'Purchase not found' });
    }

    console.log(`Found ${rows.length} purchases in sheet`);

    // Find the row index (1-based, accounting for header)
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === transactionId) { // Column A is transactionId
        rowIndex = i + 2; // +2 because rows start at 2 and we skip header
        console.log(`Found transactionId ${transactionId} at row ${rowIndex}`);
        break;
      }
    }

    if (rowIndex === -1) {
      console.log(`TransactionId ${transactionId} not found in sheet`);
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Delete the row using batchUpdate to remove the entire row
    console.log(`Deleting row ${rowIndex} from sheet`);
    const sheetId = await getSheetId('daily in');
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1, // Convert to 0-based index
                endIndex: rowIndex // Delete only this row
              }
            }
          }
        ]
      }
    });

    console.log(`Successfully deleted purchase with transactionId: ${transactionId}`);
    res.json({ message: 'Purchase deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to delete purchase', details: error.message });
  }
});

// Delete purchase by itemCode (used as ID) - kept for backward compatibility
app.delete('/api/purchases/:itemCode', async (req, res) => {
  try {
    const itemCode = req.params.itemCode;

    if (!itemCode) {
      return res.status(400).json({ error: 'Item code is required' });
    }

    // Fetch all purchases to find the row with matching itemCode
    const range = 'daily in!A2:H';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Find the row index (1-based, accounting for header)
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][1] === itemCode) { // Column B is itemCode
        rowIndex = i + 2; // +2 because rows start at 2 and we skip header
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Delete the row
    await sheets.spreadsheets.values.delete({
      spreadsheetId: SPREADSHEET_ID,
      range: `daily in!A${rowIndex}:H${rowIndex}`,
    });

    res.json({ message: 'Purchase deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase:', error);
    res.status(500).json({ error: 'Failed to delete purchase' });
  }
});

// Update purchase by transactionId
app.put('/api/purchases/:transactionId', async (req, res) => {
  try {
    const transactionId = req.params.transactionId;
    const { transactionId: bodyTransactionId, purchaseDate, supplier, itemCode, itemName, totalPrice, packageScheme, expiryDate, paymentMethods } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    // Fetch all purchases to find the row with matching transactionId
    const range = 'daily in!A2:P';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Find the row index (1-based, accounting for header)
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === transactionId) { // Column A is transactionId
        rowIndex = i + 2; // +2 because rows start at 2 and we skip header
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Handle payment methods - parse "amount by method" format and distribute across columns K, L, M, N, O, P
    const paymentMethodsArray = paymentMethods || [];
    const paymentData = [];
    for (let i = 0; i < 3; i++) {
      if (paymentMethodsArray[i]) {
        const match = paymentMethodsArray[i].match(/^([\d.]+)\s+by\s+(.+)$/);
        if (match) {
          paymentData.push(match[1]); // amount
          paymentData.push(match[2]); // type
        } else {
          paymentData.push(rows[rowIndex - 2][10 + (i * 2)] || ''); // existing amount
          paymentData.push(rows[rowIndex - 2][11 + (i * 2)] || ''); // existing type
        }
      } else {
        paymentData.push(rows[rowIndex - 2][10 + (i * 2)] || ''); // existing amount
        paymentData.push(rows[rowIndex - 2][11 + (i * 2)] || ''); // existing type
      }
    }

    // Update the row with new values
    const updateValues = [[
      transactionId,                                    // Column A: Transaction ID (unchanged)
      purchaseDate || rows[rowIndex - 2][1],           // Column B: Purchase Date
      supplier || rows[rowIndex - 2][2],               // Column C: Supplier
      itemCode || rows[rowIndex - 2][3],               // Column D: Item Code
      itemName || rows[rowIndex - 2][4],               // Column E: Item Name
      totalPrice !== undefined ? totalPrice : rows[rowIndex - 2][5],  // Column F: Total Price
      packageScheme?.unitsPerCard || rows[rowIndex - 2][6] || '',     // Column G: Units per Card
      packageScheme?.cardsPerBox || rows[rowIndex - 2][7] || '',      // Column H: Cards per Box
      packageScheme?.numberOfBoxes || rows[rowIndex - 2][8] || '',    // Column I: Number of Boxes
      expiryDate || rows[rowIndex - 2][9],             // Column J: Expiry Date
      ...paymentData                                    // Columns K, L, M, N, O, P: Payment Methods (amount, type pairs)
    ]];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `daily in!A${rowIndex}:P${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: updateValues
      }
    });

    res.json({ message: 'Purchase updated successfully' });
  } catch (error) {
    console.error('Error updating purchase:', error);
    res.status(500).json({ error: 'Failed to update purchase' });
  }
});

// Update purchase by itemCode (used as ID) - kept for backward compatibility
app.put('/api/purchases/:itemCode', async (req, res) => {
  try {
    const itemCode = req.params.itemCode;
    const { itemName, date, purchaseDate, quantity, totalPrice, packageScheme, expiryDate } = req.body;

    if (!itemCode) {
      return res.status(400).json({ error: 'Item code is required' });
    }

    // Fetch all purchases to find the row with matching itemCode
    const range = 'daily in!A2:H';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Find the row index (1-based, accounting for header)
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][1] === itemCode) { // Column B is itemCode
        rowIndex = i + 2; // +2 because rows start at 2 and we skip header
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Update the row with new values
    const updateValues = [[
      purchaseDate || date || rows[rowIndex - 2][0],  // Column A: Date
      itemCode,                                        // Column B: Code (unchanged)
      itemName || rows[rowIndex - 2][2],               // Column C: Name
      totalPrice !== undefined ? totalPrice : rows[rowIndex - 2][3],  // Column D: Total Price
      packageScheme?.unitsPerCard || rows[rowIndex - 2][4] || '',     // Column E: Units per Card
      packageScheme?.cardsPerBox || rows[rowIndex - 2][5] || '',      // Column F: Cards per Box
      packageScheme?.numberOfBoxes || rows[rowIndex - 2][6] || '',    // Column G: Number of Boxes
      expiryDate || rows[rowIndex - 2][7]              // Column H: Expiry Date
    ]];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `daily in!A${rowIndex}:H${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: updateValues
      }
    });

    res.json({ message: 'Purchase updated successfully' });
  } catch (error) {
    console.error('Error updating purchase:', error);
    res.status(500).json({ error: 'Failed to update purchase' });
  }
});

// Add stock to inventory
app.post('/api/stock', async (req, res) => {
  try {
    const { itemCode, itemName, quantity, storeLocation, date } = req.body;
    
    if (!itemCode || !itemName || !quantity || !storeLocation || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const range = 'Inventory stock!A:E'; // Assuming A=Date, B=Code, C=Name, D=Main Store, E=Sub Store
    
    // Determine which column to update based on store location
    let mainStoreQty = storeLocation === 'main' ? quantity : 0;
    let subStoreQty = storeLocation === 'sub' ? quantity : 0;
    
    const values = [[date, itemCode, itemName, mainStoreQty, subStoreQty]];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'RAW',
      resource: {
        values: values
      }
    });
    
    res.status(201).json({ message: 'Stock added successfully' });
  } catch (error) {
    console.error('Error adding stock:', error);
    res.status(500).json({ error: 'Failed to add stock' });
  }
});

// Get all transfers from "Transfer" sheet
app.get('/api/transfers', async (req, res) => {
  try {
    const range = 'Transfer!A1:G'; // Read from A1 to see headers and data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) { // Only headers or empty
      return res.status(200).json([]);
    }

    // Log headers for debugging
    console.log('Transfer Sheet Headers:', rows[0]);

    // Skip header row
    const dataRows = rows.slice(1);

    const transfers = dataRows.map(row => {
      // Clean transactionId (remove leading quote if present)
      let tid = row[0] || '';
      if (tid.startsWith("'")) tid = tid.substring(1);

      return {
        transactionId: tid,         // Column A: ID
        date: row[1],               // Column B: Date
        itemCode: row[2],           // Column C: Code
        itemName: row[3],           // Column D: Name
        quantity: row[4],           // Column E: Quantity
        direction: row[5],          // Column F: Direction
        reason: row[6] || ''        // Column G: Reason
      };
    });

    res.json(transfers);
  } catch (error) {
    console.error('Error fetching transfers:', error);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

// Transfer stock between stores
app.post('/api/transfers', async (req, res) => {
  try {
    const { transactionId, id, itemCode, itemName, quantity, direction, date, reason } = req.body;
    
    // Ensure we have a transactionId, fallback to id, or generate one if both missing
    // Prefix with ' to force Google Sheets to treat it as text in Column A
    const finalTransactionId = `'${String(transactionId || id || `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`)}`;

    console.log('Recording transfer to Google Sheets (Values for A-G):', [
      finalTransactionId, date, itemCode, itemName, quantity, direction, reason || ''
    ]);

    if (!itemCode || !itemName || !quantity || !direction || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const range = 'Transfer!A:G'; 

    const values = [[finalTransactionId, date, itemCode, itemName, quantity, direction, reason || '']];

    console.log(values)

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: values
      }
    });

    res.status(201).json({ message: 'Transfer recorded successfully', transactionId: finalTransactionId.substring(1) });
  } catch (error) {
    console.error('Error recording transfer:', error);
    res.status(500).json({ error: 'Failed to record transfer' });
  }
});

// Delete transfer by transactionId
app.delete('/api/transfers/:id', async (req, res) => {
  try {
    const transactionId = req.params.id;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    // Fetch all transfers to find the row with matching transactionId
    const range = 'Transfer!A2:G';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    // Find the row index (1-based, accounting for header)
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === transactionId) { // Column A is transactionId
        rowIndex = i + 2; // +2 because rows start at 2 and we skip header
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    // Delete the entire row using batchUpdate
    const sheetId = await getSheetId('Transfer');
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      }
    });

    res.json({ message: 'Transfer deleted successfully' });
  } catch (error) {
    console.error('Error deleting transfer:', error);
    res.status(500).json({ error: 'Failed to delete transfer' });
  }
});

// Update transfer by transactionId
app.put('/api/transfers/:id', async (req, res) => {
  try {
    const transactionId = req.params.id;
    const { itemName, date, quantity, direction, reason, itemCode } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    // Fetch all transfers to find the row with matching transactionId
    const range = 'Transfer!A2:G';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    // Find the row index (1-based, accounting for header)
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === transactionId) { // Column A is transactionId
        rowIndex = i + 2; // +2 because rows start at 2 and we skip header
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    // Update the row with new values
    const updateValues = [[
      transactionId,                                  // Column A: ID
      date || rows[rowIndex - 2][1],                 // Column B: Date
      itemCode || rows[rowIndex - 2][2],              // Column C: Code
      itemName || rows[rowIndex - 2][3],              // Column D: Name
      quantity !== undefined ? quantity : rows[rowIndex - 2][4],  // Column E: Quantity
      direction || rows[rowIndex - 2][5],             // Column F: Direction
      reason !== undefined ? reason : rows[rowIndex - 2][6]       // Column G: Reason
    ]];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Transfer!A${rowIndex}:G${rowIndex}`,
      valueInputOption: 'RAW',
      resource: {
        values: updateValues
      }
    });

    res.json({ message: 'Transfer updated successfully' });
  } catch (error) {
    console.error('Error updating transfer:', error);
    res.status(500).json({ error: 'Failed to update transfer' });
  }
});

// Add expiry date
app.post('/api/expiries', async (req, res) => {
  try {
    const { itemCode, itemName, expiryDate } = req.body;
    
    if (!itemCode || !itemName || !expiryDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const range = 'Expired Date!A:C'; // Assuming A=Code, B=Name, C=Expiry Date
    
    const values = [[itemCode, itemName, expiryDate]];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'RAW',
      resource: {
        values: values
      }
    });
    
    res.status(201).json({ message: 'Expiry date added successfully' });
  } catch (error) {
    console.error('Error adding expiry date:', error);
    res.status(500).json({ error: 'Failed to add expiry date' });
  }
});

// Get inventory stock
app.get('/api/stock', async (req, res) => {
  try {
    const range = 'Inventory stock!A:E';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(200).json([]);
    }

    const stock = rows.map(row => ({
      code: row[0],           // Column A: Item Code
      name: row[1],           // Column B: Item Name
      mainStore: row[2] ? parseInt(row[2]) : 0,  // Column C: Main Store Quantity
      subStore: row[3] ? parseInt(row[3]) : 0,   // Column D: Sub Store Quantity
      unit: row[4]            // Column E: Unit
    }));

    res.json(stock);
  } catch (error) {
    console.error('Error fetching stock:', error);
    console.error('Spreadsheet ID:', SPREADSHEET_ID);
    console.error('Google auth error:', error.message);
    res.status(500).json({ error: 'Failed to fetch stock', details: error.message });
  }
});

// Get low stock items from "Low stock" sheet
app.get('/api/lowstock', async (req, res) => {
  try {
    const range = 'Low stock!A2:D'; // Start from row 2 to skip header, A=Medicine name, B=Current stock, D=Items sold within last 30 days
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(200).json([]);
    }

    const lowStockItems = rows.map(row => ({
      medicineName: row[0],                    // Column A: Medicine name
      currentStock: parseInt(row[1]) || 0,     // Column B: Current stock
      soldLast30Days: parseInt(row[3]) || 0    // Column D: Items sold within last 30 days
    })).filter(item => item.medicineName && item.medicineName.trim() !== ''); // Filter out empty rows

    res.json(lowStockItems);
  } catch (error) {
    console.error('Error fetching low stock data:', error);
    console.error('Spreadsheet ID:', SPREADSHEET_ID);
    console.error('Google auth error:', error.message);
    res.status(500).json({ error: 'Failed to fetch low stock data', details: error.message });
  }
});

// Get expired date items from "Exp list" sheet
app.get('/api/expireddate', async (req, res) => {
  try {
    const range = 'Exp list!A2:C'; // Start from row 2 to skip header, A=Medicine name, B=Expired date, C=Current stock
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(200).json([]);
    }

    const expiredDateItems = rows.map(row => ({
      medicineName: row[0],                    // Column A: Medicine name
      expiredDate: row[1],                      // Column B: Expired date
      currentStock: parseInt(row[2]) || 0      // Column C: Current stock
    })).filter(item => item.medicineName && item.medicineName.trim() !== ''); // Filter out empty rows

    res.json(expiredDateItems);
  } catch (error) {
    console.error('Error fetching expired date data:', error);
    console.error('Spreadsheet ID:', SPREADSHEET_ID);
    console.error('Google auth error:', error.message);
    res.status(500).json({ error: 'Failed to fetch expired date data', details: error.message });
  }
});


// Catch-all route to serve index.html for any non-API routes
app.get('*', (req, res) => {
  console.log(req.path)
  if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(__dirname, '../frontend/index.html'));
     } else {
      res.status(404).json({ error: 'Route not found' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
    console.log(`Access from other devices: http://<your-local-ip>:${PORT}`);
});