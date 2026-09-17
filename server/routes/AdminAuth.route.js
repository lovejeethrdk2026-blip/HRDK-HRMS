const express = require("express");
const { login, refresh, logout, me } = require("../controllers/AdminAuth.controller");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = express.Router();

router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", requireAdmin, me);

module.exports = router;
