
const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

// 1. CREATE A BANK ACCOUNT
// POST /api/accounts
router.post('/', authenticateToken, async (req, res) => {
    try {
        const accountNumber =
            '10' + crypto.randomInt(1000000000, 10000000000).toString();

        const [result] = await pool.execute(
            `INSERT INTO accounts
                (customer_id, account_number, balance)
             VALUES (?, ?, 0.00)`,
            [req.customer.id, accountNumber]
        );

        return res.status(201).json({
            success: true,
            message: 'Bank account created successfully.',
            account: {
                id: result.insertId,
                account_number: accountNumber,
                balance: '0.00'
            }
        });
    } catch (error) {
        console.error('Account creation failed:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Unable to create account.'
        });
    }
});


// 2. GET ALL ACCOUNTS FOR THE LOGGED-IN CUSTOMER
// GET /api/accounts
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [accounts] = await pool.execute(
            `SELECT id, account_number, balance, created_at
             FROM accounts
             WHERE customer_id = ?
             ORDER BY id DESC`,
            [req.customer.id]
        );

        return res.status(200).json({
            success: true,
            count: accounts.length,
            accounts
        });
    } catch (error) {
        console.error('Account retrieval failed:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Unable to retrieve accounts.'
        });
    }
});


// 3. GET TRANSACTION HISTORY
// GET /api/accounts/transactions

/* GET /api/accounts/transactions?page=1&limit=10 */
router.get('/transactions', authenticateToken, async (req, res) => {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);

    if (
        !Number.isInteger(page) ||
        !Number.isInteger(limit) ||
        page < 1 ||
        limit < 1 ||
        limit > 100
    ) {
        return res.status(400).json({
            success: false,
            message: 'Page must be positive and limit must be between 1 and 100.'
        });
    }

    const offset = (page - 1) * limit;

    try {
        const [transactions] = await pool.execute(
            `SELECT
                t.id,
                t.from_account_id,
                sender.account_number AS from_account_number,
                t.to_account_id,
                recipient.account_number AS to_account_number,
                t.amount,
                t.status,
                t.created_at
             FROM transactions t
             INNER JOIN accounts sender
                ON t.from_account_id = sender.id
             INNER JOIN accounts recipient
                ON t.to_account_id = recipient.id
             WHERE sender.customer_id = ?
                OR recipient.customer_id = ?
             ORDER BY t.created_at DESC, t.id DESC
             LIMIT ? OFFSET ?`,
            [req.customer.id, req.customer.id, limit, offset]
        );

        return res.status(200).json({
            success: true,
            page,
            limit,
            count: transactions.length,
            transactions
        });
    } catch (error) {
        console.error('Transaction history failed:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Unable to retrieve transaction history.'
        });
    }
});



// 4. GET ACCOUNT SUMMARY
// GET /api/accounts/summary
router.get('/summary', authenticateToken, async (req, res) => {
    try {
        const [accounts] = await pool.execute(
            `SELECT
                COUNT(*) AS total_accounts,
                COALESCE(SUM(balance), 0.00) AS total_balance
             FROM accounts
             WHERE customer_id = ?`,
            [req.customer.id]
        );

        const [transactions] = await pool.execute(
            `SELECT
                t.id,
                t.amount,
                t.status,
                t.created_at,
                sender.account_number AS from_account_number,
                recipient.account_number AS to_account_number
             FROM transactions t
             INNER JOIN accounts sender
                ON t.from_account_id = sender.id
             INNER JOIN accounts recipient
                ON t.to_account_id = recipient.id
             WHERE sender.customer_id = ?
                OR recipient.customer_id = ?
             ORDER BY t.created_at DESC
             LIMIT 5`,
            [req.customer.id, req.customer.id]
        );

        return res.status(200).json({
            success: true,
            summary: {
                total_accounts: accounts[0].total_accounts,
                total_balance: accounts[0].total_balance,
                recent_transactions: transactions
            }
        });
    } catch (error) {
        console.error('Account summary failed:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Unable to retrieve account summary.'
        });
    }
});


// 5. TRANSFER MONEY BETWEEN ACCOUNTS
// POST /api/accounts/transfer
router.post('/transfer', authenticateToken, async (req, res) => {
    const { from_account_id, to_account_id, amount } = req.body;

    if (
        !Number.isSafeInteger(from_account_id) ||
        !Number.isSafeInteger(to_account_id) ||
        from_account_id <= 0 ||
        to_account_id <= 0 ||
        from_account_id === to_account_id ||
        amount === undefined ||
        amount === null ||
        !/^\d+(\.\d{1,2})?$/.test(String(amount)) ||
        !Number.isFinite(Number(amount)) ||
        Number(amount) <= 0
    ) {
        return res.status(400).json({
            success: false,
            message: 'Enter valid account IDs and a positive amount with up to 2 decimal places.'
        });
    }

    const amountInCents = Math.round(Number(amount) * 100);

    if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Invalid transfer amount.'
        });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        // Lock accounts in a consistent order.
        const ids = [from_account_id, to_account_id].sort((a, b) => a - b);

        const [accounts] = await connection.execute(
            `SELECT id, customer_id, balance
             FROM accounts
             WHERE id IN (?, ?)
             ORDER BY id
             FOR UPDATE`,
            ids
        );

        if (accounts.length !== 2) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: 'Sender or recipient account not found.'
            });
        }

        const sender = accounts.find(
            account => account.id === from_account_id
        );

        const recipient = accounts.find(
            account => account.id === to_account_id
        );

        if (Number(sender.customer_id) !== Number(req.customer.id)) {
            await connection.rollback();

            return res.status(403).json({
                success: false,
                message: 'You cannot transfer money from another customer’s account.'
            });
        }

        const balanceInCents = Math.round(Number(sender.balance) * 100);

        if (balanceInCents < amountInCents) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: 'Insufficient balance.'
            });
        }

        await connection.execute(
            `UPDATE accounts
             SET balance = balance - ?
             WHERE id = ?`,
            [amount, from_account_id]
        );

        await connection.execute(
            `UPDATE accounts
             SET balance = balance + ?
             WHERE id = ?`,
            [amount, to_account_id]
        );

        await connection.execute(
            `INSERT INTO transactions
                (from_account_id, to_account_id, amount, status)
             VALUES (?, ?, ?, 'SUCCESS')`,
            [from_account_id, to_account_id, amount]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'Money transferred successfully.',
            transfer: {
                from_account_id,
                to_account_id,
                amount: Number(amount).toFixed(2)
            }
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Rollback failed:', rollbackError.message);
            }
        }

        console.error('Transfer failed:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Transfer failed due to a server error.'
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});


// 6. GET ONE ACCOUNT BY ID
// GET /api/accounts/:id
// Keep this route after /summary and /transactions.
router.get('/:id', authenticateToken, async (req, res) => {
    const accountId = Number(req.params.id);

    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Invalid account ID.'
        });
    }

    try {
        const [accounts] = await pool.execute(
            `SELECT id, account_number, balance, created_at
             FROM accounts
             WHERE id = ? AND customer_id = ?`,
            [accountId, req.customer.id]
        );

        if (accounts.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Account not found.'
            });
        }

        return res.status(200).json({
            success: true,
            account: accounts[0]
        });
    } catch (error) {
        console.error('Get account failed:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Unable to retrieve account.'
        });
    }
});


module.exports = router;
