# One Linear project per git repo

KitCollective, the Apify stamdata repo, and the Football Kit Archive stamdata repo are three git repositories with unknown ongoing maintenance. We track them as **three Linear projects**, not one project with three milestones.

Factory default is one Linear project per product effort. We split anyway: seed work is not a vertical slice of the Expo/Nest app, promotion to staging is not shared, and we do not yet know how large each seed pipeline stays. `/to-spec` creates three projects. Tickets never land seed fetch code in the product monorepo.

Status: superseded by ADR-0003 (seed lives in the product git repo). Linear-project count is unsettled until grilled again.
