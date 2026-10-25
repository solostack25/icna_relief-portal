import { getGraphToken } from "@/lib/msgraph";
import { gGet, gGetAll } from "@/lib/devices/graph";

// When Entra answers "Insufficient privileges" to a user update, work out why:
// the app token's actual roles, plus anything on the target that blocks app writes.
export async function diagnoseUserWrite(userId: string): Promise<string[]> {
  const notes: string[] = [];

  try {
    const token = await getGraphToken();
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const roles: string[] = payload.roles ?? [];
    const canWrite = roles.some((r) => ["User.ReadWrite.All", "Directory.ReadWrite.All"].includes(r));
    notes.push(`App token roles: ${roles.length ? roles.sort().join(", ") : "none"}.`);
    if (!canWrite)
      notes.push(
        "The token has no User.ReadWrite.All. It's probably added as a Delegated permission instead of Application, or admin consent isn't granted. Add it under Application permissions and grant consent."
      );
  } catch {
    notes.push("Couldn't read the app token's roles.");
  }

  try {
    const u = await gGet(`/v1.0/users/${userId}?$select=onPremisesSyncEnabled,userType`);
    if (u?.onPremisesSyncEnabled) notes.push("This user syncs from on-premises AD. Change Office Location in on-prem AD instead.");
  } catch {}

  try {
    const groups = await gGetAll<any>(`/v1.0/users/${userId}/memberOf?$select=id,displayName,isAssignableToRole,isMemberManagementRestricted`);
    for (const g of groups) {
      const t = g["@odata.type"];
      if (t === "#microsoft.graph.directoryRole") notes.push(`User holds the admin role "${g.displayName}". Apps can't edit admins without a matching Entra role.`);
      if (t === "#microsoft.graph.administrativeUnit" && g.isMemberManagementRestricted)
        notes.push(`User is in the restricted administrative unit "${g.displayName}". Only admins scoped to it can edit them.`);
      if (t === "#microsoft.graph.group" && g.isAssignableToRole) notes.push(`User is in the role-assignable group "${g.displayName}", which protects its members like admins.`);
    }
  } catch {
    notes.push("Couldn't check role / administrative unit membership (needs Directory.Read.All).");
  }

  return notes;
}
