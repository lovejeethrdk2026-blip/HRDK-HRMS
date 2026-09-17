const express = require("express");
const {
  listAdmins,
  createAdmin,
  updateAdmin,
  resetAdminPassword
} = require("../controllers/AdminUser.controller");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = express.Router();

router.use(requireAdmin);

router.get("/", listAdmins);
router.post("/", createAdmin);
router.patch("/:id", updateAdmin);
router.post("/:id/password", resetAdminPassword);

module.exports = router;
