import { useAuth } from "../auth/AuthContext";
import { myRegisterNames } from "../utils/userScope";

// Pay Sheet pages: says the server sent only the user's own Daily Register
// department (Users page), matched by BC Initials No. = Matrix employee ID.
export default function RegisterScopeNote() {
  const { user } = useAuth();
  const names = myRegisterNames(user);
  if (!names) return null;
  return <p className="page-subtitle sync-note">Only {names} employees.</p>;
}
