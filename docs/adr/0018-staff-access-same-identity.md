# Staff access is User.role on the same Identity

The operator signs in with the same email and password as Expo. Staff access is `User.role = admin` on that User — not a second IdP, not a parallel grant column, and not a separate account table. Expo Collection still works for an admin. This increment is a binary grant; scoped staff roles that cannot see everything come later. The first operator is promoted out of band (`/wizard` or SQL); further grants happen in Admin SPA.

Status: accepted.
