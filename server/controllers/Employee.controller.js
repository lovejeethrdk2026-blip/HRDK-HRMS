const bcrypt = require("bcryptjs");
const EmpDetails = require("../models/EmpDetails");

async function loginEmployee(req, res) {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
      return res.status(400).json({ message: "employeeId and password are required" });
    }

    const emp = await EmpDetails.findOne({ username: String(employeeId) });

    if (!emp || !(await bcrypt.compare(String(password), emp.passwordHash))) {
      return res.status(401).json({ message: "Invalid employee ID or password" });
    }

    res.json({ employeeId: emp.employeeId, name: emp.name });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { loginEmployee };
