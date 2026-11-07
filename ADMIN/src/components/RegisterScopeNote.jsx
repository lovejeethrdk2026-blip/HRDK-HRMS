import { useAuth } from "../auth/AuthContext";

// Pay Sheet pages: says the server sent only the user's own Daily Register
// department (Users page), matched by BC Initials No. = Matrix employee ID.
export default function RegisterScopeNote() {
  const { user } = useAuth();
  if (user.role === "admin" || !user.registerDepartment) return null;
  return <p className="page-subtitle sync-note">Only {user.registerDepartment} department employees.</p>;
}
