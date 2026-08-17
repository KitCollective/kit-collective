# Development Postgres lives on the CX33

Staging and production Nest stacks run on the one Hetzner CX33. Development Nest still runs in Cursor / cloud-agent VMs, not as a third app on the box.

The `development` Postgres is the exception: it is a separate volume on that same CX33 so cloud agents and local Cursor share one database. A laptop-only Postgres is invisible to those VMs. Cap memory and disk so a seed run cannot starve production. Redis for development stays with the agent VM until that lane actually runs BullMQ. Photos stay on R2, not on the VPS disk.

Status: accepted
