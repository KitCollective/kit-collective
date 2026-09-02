# Comp Entitlement is not Staff access

Staff may grant a collector Entitlement with source `comp` and an expires date from Admin. That is a Billing write, not `User.role`. An admin can still lack Entitlement; a collector can be paid without Staff access. Do not treat `role=admin` as the paid Expo plan, and do not require sandbox IAP for every demo or support account.

Status: accepted.
