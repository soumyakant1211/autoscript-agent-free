import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

/**
 * Roles, most → least privileged:
 *  admin       full control: manage users & roles, unlimited generations
 *  demo_admin  read-only admin panel (for showcasing), cannot change anything
 *  member      higher monthly quota + saved history
 *  guest       signed-in default, small monthly quota, no history
 *  (anonymous) not a role: a guest who hasn't signed in (isAnonymous = true)
 */
const statement = { ...defaultStatements } as const;
export const ac = createAccessControl(statement);

export const admin = ac.newRole({ ...adminAc.statements });
export const demo_admin = ac.newRole({ user: ["list"] });
export const member = ac.newRole({});
export const guest = ac.newRole({});

export const roles = { admin, demo_admin, member, guest };
export type Role = keyof typeof roles;
export const ROLE_ORDER: Role[] = ["admin", "demo_admin", "member", "guest"];
