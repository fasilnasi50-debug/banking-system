
import express from "express";
import studentRoutes from "./routes/students.js";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Student API is running!"
    });
});

app.use("/students", studentRoutes);

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
