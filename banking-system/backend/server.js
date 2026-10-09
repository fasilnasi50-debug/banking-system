const express = require('express');
require('dotenv').config();

const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;
const customerRoutes = require('./routes/customerRoutes');


app.use(express.json());

const accountRoutes = require('./routes/accountRoutes');

app.use('/api/customers', customerRoutes);
app.use('/api/accounts', accountRoutes);


app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');

        return res.status(200).json({
            success: true,
            message: 'Banking API is running!',
            database: 'connected'
        });
    } catch (error) {
        console.error('Health check failed:', error.message);

        return res.status(503).json({
            success: false,
            message: 'API is running, but the database is unavailable.',
            database: 'disconnected'
        });
    }
});


async function startServer() {
    try {
        const connection = await pool.getConnection();

        await connection.ping();
        connection.release();

        console.log('MySQL connected successfully!');

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
  } catch (error) {
    console.error('MySQL connection failed!');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    process.exit(1);
}
};


/* Handle unknown API routes */
app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

/* Global error handler */
app.use((err, req, res, next) => {
    console.error('Unexpected server error:', err.message);

    if (res.headersSent) {
        return next(err);
    }

    return res.status(500).json({
        success: false,
        message: 'An unexpected server error occurred.'
    });
});


startServer();
