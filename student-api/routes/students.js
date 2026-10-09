
import express from "express";
import db from "../db.js";

const router = express.Router();

// GET: Get all students
router.get("/", (req, res) => {
    db.query("SELECT * FROM students", (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(results);
    });
});

// GET: Get one student
router.get("/:id", (req, res) => {
    db.query(
        "SELECT * FROM students WHERE id = ?",
        [req.params.id],
        (err, results) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            if (results.length === 0) {
                return res.status(404).json({
                    message: "Student not found"
                });
            }

            res.json(results[0]);
        }
    );
});

// POST: Add a student
router.post("/", (req, res) => {
    const { name, age, course } = req.body;

    if (
        typeof name !== "string" ||
        !name.trim() ||
        !Number.isInteger(Number(age)) ||
        Number(age) < 1 ||
        typeof course !== "string" ||
        !course.trim()
    ) {
        return res.status(400).json({
            message: "Provide a valid name, age, and course"
        });
    }

    const sql =
        "INSERT INTO students (name, age, course) VALUES (?, ?, ?)";

    db.query(sql, [name.trim(), Number(age), course.trim()], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.status(201).json({
            message: "Student added successfully",
            id: result.insertId
        });
    });
});

// PUT: Update a student
router.put("/:id", (req, res) => {
    const { name, age, course } = req.body;

    if (
        typeof name !== "string" ||
        !name.trim() ||
        !Number.isInteger(Number(age)) ||
        Number(age) < 1 ||
        typeof course !== "string" ||
        !course.trim()
    ) {
        return res.status(400).json({
            message: "Provide a valid name, age, and course"
        });
    }

    const sql =
        "UPDATE students SET name = ?, age = ?, course = ? WHERE id = ?";

    db.query(
        sql,
        [name.trim(), Number(age), course.trim(), req.params.id],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: "Student not found or no changes made"
                });
            }

            res.json({ message: "Student updated successfully" });
        }
    );
});

// DELETE: Delete a student
router.delete("/:id", (req, res) => {
    db.query(
        "DELETE FROM students WHERE id = ?",
        [req.params.id],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: "Student not found"
                });
            }

            res.json({ message: "Student deleted successfully" });
        }
    );
});

export default router;
