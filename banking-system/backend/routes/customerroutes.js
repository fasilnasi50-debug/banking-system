
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/register', async (req, res) => {
    try {
        const { full_name, email, password } = req.body;

        if (!full_name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters'
            });
        }

        const [existing] = await db.query(
            'SELECT id FROM customers WHERE email = ?',
            [email]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `
            INSERT INTO customers
            (full_name, email, password_hash)
            VALUES (?, ?, ?)
        `;

        const [result] = await db.query(sql, [
            full_name,
            email,
            hashedPassword
        ]);

        res.status(201).json({
            success: true,
            message: 'Customer registered successfully',
            customerId: result.insertId
        });

    } catch (error) {
        console.log('Registration Error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Registration failed'
        });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const [results] = await db.query(
            'SELECT id, full_name, email, password_hash FROM customers WHERE email = ?',
            [email]
        );

        if (results.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const customer = results[0];

        const isMatch = await bcrypt.compare(
            password,
            customer.password_hash
        );

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const token = jwt.sign(
            {
                id: customer.id,
                email: customer.email
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '1h',
                issuer: 'banking-system'
            }
        );

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token: token,
            customer: {
                id: customer.id,
                full_name: customer.full_name,
                email: customer.email
            }
        });

    } catch (error) {
        console.log('Login Error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const [results] = await db.query(
            'SELECT id, full_name, email, created_at FROM customers WHERE id = ?',
            [req.customer.id]
        );

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        res.status(200).json({
            success: true,
            customer: results[0]
        });

    } catch (error) {
        console.log('Profile Error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Failed to get customer profile'
        });
    }
});

module.exports = router;
