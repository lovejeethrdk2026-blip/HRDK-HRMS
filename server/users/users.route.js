import express from "express";
import {
  register,
  setupAdmin,
  listUsers,
  login,
  logout,
  logoutAll,
  changePassword,
  resetPassword,
  deleteUser,
  updateUser,
  getMe
} from "./users.controller.js";
import { isLoggedIn, authorize } from "../middleware/auth.js";

const router = express.Router();

// first admin only, from Postman (works once, while there are no users)
router.post("/setup", setupAdmin);

// only a logged-in admin can see and add users
router.get("/", isLoggedIn, authorize("admin"), listUsers);
router.post("/register", isLoggedIn, authorize("admin"), register);

router.post("/login", login);
router.post("/logout", logout);
router.post("/logout-all", isLoggedIn, logoutAll);

// any logged-in user changes their own password
router.put("/change-password", isLoggedIn, changePassword);

// admin sets a new password for a user who forgot theirs
router.put("/:id/reset-password", isLoggedIn, authorize("admin"), resetPassword);

// admin edits a user's username, role and departments
router.put("/:id", isLoggedIn, authorize("admin"), updateUser);

// admin removes a user's login (not their own, not the last admin)
router.delete("/:id", isLoggedIn, authorize("admin"), deleteUser);

// any logged-in user
router.get("/me", isLoggedIn, getMe);

export default router;
