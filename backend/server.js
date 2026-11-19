const express = require("express");
const mongoose = require("mongoose");
const morgan = require("morgan");
const winston = require("winston");
const cors = require("cors");
require("dotenv").config();

const app = express(); /*is the application using express js*/

//Middlewares - these must appear in the middle way

app.use(cors());
app.use(express.json());
app.use(express.static("public")); //static here means images, files, and js files. then public means a file path - (a file to be named 'public'). this line of code now tell the server to serve request with the directory, public with those static items.

/*For the mongodb connection*/
mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/student-management",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("MongoDB connection error:", err));

/*Define the logger*/
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
});

/*Longin middleware*/

app.use(
  morgan(":method :url :status :response-time ms - :res[content-length]"),
);

/*Custom API Logger Middleware*/

const apiLogger = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      params: req.params,
      query: req.query,
      body: req.method !== "GET" ? req.body : undefined,
    });
  });
  next();
};

// Erro Handling MiddleWare
app.use((err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    params: req.params,
    query: req.query,
    body: req.method !== "GET" ? req.body : undefined,
  });
});

/*Schema for student data*/

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    course: {
      type: String,
      required: true,
    },
    enrollmentDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true },
);

const student = mongoose.model("student", studentSchema);

const courseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true },
);

const Course = mongoose.model("Course", courseSchema);

/*API Rountes for courses*/

app.get("/api/courses", async (req, res) => {
  try {
    const courses = await Course.find().sort({ name: 1 });
    logger.info(`Retrieved ${courses.length} courses successfully`);
    res.json(courses);
  } catch (error) {
    logger.error("Error fetching courses:", error);
    res.status(500).json({ message: "Failed to fetch courses" });
  }
});

app.post("/api/courses", async (req, res) => {
  try {
    const course = new Course(req.body);
    const savedCourse = await course.save();
    logger.info("New Course Created", {
      courseId: savedCourse._id,
      name: savedCourse.name,
    });
    res.status(201).json(savedCourse);
  } catch (error) {
    logger.error("Error creating Course:", error);
    res.status(400).json({ message: "Failed to create course" });
  }
});

app.put("/api/courses/:id", async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!course) {
      logger.warn("Course not found for update", { courseId: req.params.id });
      return res.status(404).json({ message: "Course not found" });
    }
    logger.info("Course updated successfully", {
      courseId: course._id,
      name: course.name,
    });
    res.json(course);
  } catch (error) {
    logger.error("Error updating course:", error);
    res.status(400).json({ message: "Error updating course" });
  }
}); // It is used when editing is request is clicked

// deleting api

app.delete("/api/courses/:id", async (req, res) => {
  try {
    const enrolledStudents = await Student.countDocuments({
      course: req.params.id,
    });
    if (enrolledStudents > 0) {
      logger.warn("Attempted to delete course with enrolled students", {
        courseId: req.params.id,
        enrolledStudents,
      });
      return res
        .status(409)
        .json({ message: "Cannot delete course with enrolled students" });
    }

    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) {
      logger.warn("Course not found for deletion", {
        courseId: req.params.id,
      });
      return res.status(404).json({ message: "Course not found" });
    }

    logger.info("Course deleted successfully", {
      courseId: course._id,
      name: course.name,
    });
    res.json({ message: "Course deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting course: ${error.message}`, {
      stack: error.stack,
    });
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid course ID" });
    }
    res.status(500).json({ message: "Failed to delete selected course" });
  }
});

// To get a single course by Id, instead of all the courses

app.get("/api/courses/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).lean();
    if (!course) {
      logger.warn("Course not found", { courseId: req.params.id });
      return res.status(404).json({ message: "Course not found" });
    }
    res.json(course);
  } catch (error) {
    logger.error(`Error fetching course: ${error.message}`, {
      stack: error.stack,
    });
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid course ID" });
    }
    res.status(500).json({ message: "Failed to fetch course" });
  }
});

// Student Routs
app.get("/api/students", async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    logger.info(`Retrieved ${students.length} students successfully`);
    res.json(students);
  } catch (error) {
    logger.error("Error fetching students:", error);
    res.status(500).json({ message: "Error Fetching students" });
  }
});

app.post("/api/students", async (req, res) => {
  try {
    const student = new Student(req.body);
    const savedStudent = await student.save();
    logger.info("New student created", {
      studentId: savedStudent._id,
      name: savedStudent.name,
      course: savedStudent.course,
    });
    res.status(201).json(savedStudent);
  } catch (error) {
    logger.error("Error creating student:", error);
    res.status(400).json({ message: "Error creating student" });
  }
});

app.put("/api/students/:id", async (req, res) => {
  try {
    const { name, email, course } = req.body;

    if (course) {
      const courseExists = await Course.exists({ _id: course });
      if (!courseExists) {
        return res.status(400).json({ message: "Course does not exist" });
      }
    }

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { name, email, course },
      { new: true, runValidators: true },
    );

    if (!student) {
      logger.warn("Student not found for update", {
        studentId: req.params.id,
      });
      return res.status(404).json({ message: "Student not found" });
    }

    logger.info("Student updated successfully", {
      studentId: student._id,
      name: student.name,
      course: student.course,
    });
    res.json(student);
  } catch (error) {
    logger.error(`Error updating student: ${error.message}`, {
      stack: error.stack,
    });
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid student data" });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: "Student already exists" });
    }
    res.status(500).json({ message: "Failed to update student" });
  }
});

app.delete("/api/students/:id", async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) {
      logger.warn("Student not found for deletion", {
        studentId: req.params.id,
      });
      return res.status(404).json({ message: "Student not found" });
    }

    logger.info("Student deleted successfully", {
      studentId: student._id,
      name: student.name,
      course: student.course,
    });
    res.json({ message: "Student deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting student: ${error.message}`, {
      stack: error.stack,
    });
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid student ID" });
    }
    res.status(500).json({ message: "Failed to delete student" });
  }
});

// Search for student

app.get("/api/students/search", async (req, res) => {
  try {
    const searchTerm = req.query.q;
    if (typeof searchTerm !== "string" || searchTerm.trim() === "") {
      return res.status(400).json({ message: "Search term is required" });
    }

    const safeTerm = searchTerm.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    logger.info("Student search initiated", { searchTerm });

    const students = await Student.find({
      $or: [
        { name: { $regex: safeTerm, $options: "i" } },
        { email: { $regex: safeTerm, $options: "i" } },
      ],
    })
      .limit(50)
      .lean();

    logger.info("Student search completed", {
      searchTerm,
      resultsCount: students.length,
    });
    res.json(students);
  } catch (error) {
    logger.error(`Error searching students: ${error.message}`, {
      stack: error.stack,
    });
    res.status(500).json({ message: "Failed to search students" });
  }
});

// Dashboard Stats
app.get("/api/dashboard/stats", async (req, res) => {
  try {
    const stats = await getDashboardStats();
    logger.info("Dashboard Statistics retrieved successfully:", stats);
    res.json(stats);
  } catch (error) {
    logger.error("Error fetching dashboard stats:", error);
    res.status(500).json({ message: "Error displaying dashboard" });
  }
});

// helper function for dashboard stats
async function getDashboardStats() {
  const totalStudents = await Student.countDocuments();
  const activeStudents = await Student.countDocuments({ status: "active" });
  const totalCourse = await Course.countDocuments();
  const activeCourses = await Course.countDocuments({ status: "active" });
  const graduates = await Student.countDocuments({ status: "inactive" });
  const courseCounts = await Student.aggregate([
    { $group: { _id: "$course", count: { $sum: 1 } } },
  ]);

  return {
    totalStudents,
    activeStudents,
    totalCourse,
    activeCourses,
    graduates,
    courseCounts,
    successRate:
      totalStudents > 0 ? Math.round((graduates / totalStudents) * 100) : 0,
  };
}

// Basic Health Check endpoint

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "Up",
    timestamp: new Date(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Detailed health check endpoint with MongoDB connection status

app.get("/health/detailed", async (req, res) => {
  try {
    const dbConnected = mongoose.connection.readyState === 1;

    const systemInfo = {
      memory: {
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        unit: "MB",
      },
      uptime: {
        seconds: Math.round(process.uptime()),
        formatted: formatUptime(process.uptime()),
      },
      nodeVersion: process.version,
      platform: process.platform,
    };

    const healthCheck = {
      status: dbConnected ? "Up" : "Degraded",
      timestamp: new Date(),
      database: {
        status: dbConnected ? "Connected" : "Disconnected",
        name: "MongoDB",
        host: mongoose.connection.host,
      },
      system: systemInfo,
    };

    res.status(dbConnected ? 200 : 503).json(healthCheck);
  } catch (error) {
    logger.error(`Health check failed: ${error.message}`, {
      stack: error.stack,
    });
    res.status(503).json({
      status: "Down",
      timestamp: new Date(),
      error: "Server is down",
    });
  }
});

// Get single student by ID
app.get("/api/students/:id", async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: "student not found" });
    }
    res.json(student);
  } catch (error) {
    logger.error("Error fetching student:", error);
    res.status(404).json({ message: "Student does not exit" });
  }
});
