const express = require("express");
const { loginEmployee } = require("../controllers/Employee.controller");

const router = express.Router();

router.post("/login", loginEmployee);

module.exports = router;
