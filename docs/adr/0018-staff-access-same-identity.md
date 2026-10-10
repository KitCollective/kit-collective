# Staff access is User.role on the same Identity

The operator signs in with the same email and password as Expo. Staff access is `User.role = admin` on that User — not a second IdP, not a parallel grant column, and not a separate account table. Expo Collection still works for an admin. This increment is a binary grant; scoped staff roles that cannot see everything come later. The first operator is promoted out of band (`/wizard` or SQL); further grants happen in Admin SPA.

Status: accepted. Superseded in part (KIT-276, First session 1.0): a collector in Expo no longer signs in with a password, only with an **E-mail code** or a social login, so "the same email and password as Expo" no longer holds. The operator still signs in to Admin SPA with email and password, and Staff access is still `User.role = admin` on the same User.
