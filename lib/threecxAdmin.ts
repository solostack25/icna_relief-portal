import { callControl, xapi } from "@/lib/threecx";

// Server-only. 3CX V20 admin operations for Admin > Phones, on the
// Configuration API (XAPI, OData at /xapi/v1) plus the Call Control API.
// Field names follow 3CX's own swagger (github.com/3cx/xapi-tutorial).
//
// Not possible through any 3CX API (so not offered in the portal):
// listen / whisper / barge-in, per-queue agent login, a live "callers
// waiting" endpoint. Setting someone's status (CurrentProfileName) is
// attempted but 3CX staff have said V20 may reject it.

type OData<T> = { value: T[]; "@odata.count"?: number };
const list = <T>(r: OData<T> | T[] | undefined): T[] => (Array.isArray(r) ? r : r?.value ?? []);
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

// ---------- Types ----------

export type PbxDestination = {
  To?: string; // VoiceMail, Extension, Queue, RingGroup, IVR, External, ...
  Number?: string;
  External?: string;
  Name?: string;
  Type?: string;
};

export type SystemStatus = {
  Version?: string;
  FQDN?: string;
  CallsActive?: number;
  MaxSimCalls?: number;
  ExtensionsRegistered?: number;
  ExtensionsTotal?: number;
  TrunksRegistered?: number;
  TrunksTotal?: number;
  HasNotRunningServices?: boolean;
  LicenseActive?: boolean;
  ProductCode?: string;
  ExpirationDate?: string;
  MaintenanceExpiresAt?: string;
  DiskUsage?: number;
  RecordingQuotaReached?: boolean;
  LastBackupDateTime?: string;
};

export type Trunk = {
  Id: number;
  Number?: string;
  Name?: string;
  IsOnline?: boolean;
  DidNumbers?: string[];
  SimultaneousCalls?: number;
  ConfigurationIssue?: string;
  Gateway?: { Name?: string; Host?: string };
};

export type ActiveCall = { Id: number; Caller: string; Callee: string; Status: string; EstablishedAt: string; LastChangeStatus?: string; ServerNow?: string };

export type CcParticipant = {
  id: number;
  status?: string;
  dn?: string;
  party_caller_name?: string;
  party_dn?: string;
  party_caller_id?: string;
  party_did?: string;
  callid?: number;
};

export type PbxUser = {
  Id: number;
  Number: string;
  FirstName?: string;
  LastName?: string;
  DisplayName?: string;
  EmailAddress?: string;
  Mobile?: string;
  OutboundCallerID?: string;
  Enabled?: boolean;
  IsRegistered?: boolean;
  CurrentProfileName?: string;
  QueueStatus?: string;
  VMEnabled?: boolean;
  RecordCalls?: boolean;
  Phones?: { Id: number; Name?: string; Interface?: string; MacAddress?: string; TemplateName?: string }[];
  ForwardingProfiles?: ForwardingProfile[];
};

export type ForwardingProfile = {
  Id: number;
  Name: string;
  CustomName?: string;
  NoAnswerTimeout?: number;
  RingMyMobile?: boolean;
  AvailableRoute?: {
    NoAnswerExternal?: PbxDestination;
    NoAnswerInternal?: PbxDestination;
    NoAnswerAllCalls?: boolean;
    BusyExternal?: PbxDestination;
    BusyInternal?: PbxDestination;
    BusyAllCalls?: boolean;
    NotRegisteredExternal?: PbxDestination;
    NotRegisteredInternal?: PbxDestination;
    NotRegisteredAllCalls?: boolean;
  };
  AwayRoute?: { External?: PbxDestination; Internal?: PbxDestination; AllHoursExternal?: boolean; AllHoursInternal?: boolean };
};

export type Member = { Id?: number; Name?: string; Number: string; SkillGroup?: string };

export type Queue = {
  Id: number;
  Number: string;
  Name: string;
  PollingStrategy?: string;
  RingTimeout?: number;
  MasterTimeout?: number;
  MaxCallersInQueue?: number;
  WrapUpTime?: number;
  SLATime?: number;
  ForwardNoAnswer?: PbxDestination;
  AnnounceQueuePosition?: boolean;
  Recording?: string;
  Agents?: Member[];
};

export type RingGroup = {
  Id: number;
  Number: string;
  Name: string;
  RingStrategy?: string; // Hunt, RingAll, Paging
  RingTime?: number;
  ForwardNoAnswer?: PbxDestination;
  Members?: Member[];
};

export type ReceptionistForward = { Id?: number; Input: string; ForwardType: string; ForwardDN?: string; PeerType?: string; CustomData?: string };

export type Receptionist = {
  Id: number;
  Number: string;
  Name: string;
  IVRType?: string;
  PromptFilename?: string;
  Timeout?: number;
  TimeoutForwardDN?: string;
  TimeoutForwardType?: string;
  InvalidKeyForwardDN?: string;
  TransferEnable?: boolean;
  Forwards?: ReceptionistForward[];
};

export type Period = { DayOfWeek: string; Start: string; Stop: string };
export type Schedule = { Type?: string; IgnoreHolidays?: boolean; Periods?: Period[] };
export type OfficeHours = { Hours?: Schedule; BreakTime?: Schedule; TimeZoneId?: string };

export type Holiday = {
  Id: number;
  Name: string;
  Day: number;
  Month: number;
  Year: number;
  DayEnd?: number;
  MonthEnd?: number;
  YearEnd?: number;
  IsRecurrent?: boolean;
};

export type CallLogRow = {
  CallId: number;
  SegmentId?: number;
  StartTime: string;
  Direction?: string;
  CallType?: string;
  Status?: string;
  Reason?: string;
  Answered?: boolean;
  RingingDuration?: string;
  TalkingDuration?: string;
  SourceDn?: string;
  SourceCallerId?: string;
  SourceDisplayName?: string;
  DestinationDn?: string;
  DestinationCallerId?: string;
  DestinationDisplayName?: string;
  ActionDnDisplayName?: string;
  actionDnDn?: string;
  SrcRecId?: number;
  DstRecId?: number;
  RecordingUrl?: string;
  Recordings?: { Id?: number; RecordingUrl?: string }[];
  Transcription?: string;
  Summary?: string;
  SentimentScore?: number;
  CallCost?: number;
  Indent?: number;
};

// ---------- System ----------

export async function getSystemStatus() {
  return xapi<SystemStatus>("/SystemStatus");
}

export async function listTrunks() {
  const r = await xapi<OData<Trunk>>("/Trunks?$select=Id,Number,IsOnline,DidNumbers,SimultaneousCalls,ConfigurationIssue&$expand=Gateway($select=Name,Host)");
  return list(r);
}

// ---------- Live ----------

export async function listActiveCalls() {
  return list(await xapi<OData<ActiveCall>>("/ActiveCalls?$orderby=EstablishedAt"));
}

export async function dropActiveCall(id: number) {
  return xapi(`/ActiveCalls(${Number(id)})/Pbx.DropCall`, { method: "POST" });
}

/** Participants on the extensions the API client is allowed to monitor. */
export async function callControlParticipants(): Promise<CcParticipant[]> {
  const snap = await callControl<unknown>("/callcontrol");
  const out: CcParticipant[] = [];
  const dns = Array.isArray(snap) ? snap : [];
  for (const d of dns as { dn?: string; participants?: CcParticipant[] }[]) {
    for (const p of d.participants ?? []) out.push({ ...p, dn: p.dn ?? d.dn });
  }
  return out;
}

/** Connected call: transferto. Ringing call: divert. */
export async function transferParticipant(dn: string, participantId: number, destination: string, ringing = false) {
  return callControl(`/callcontrol/${encodeURIComponent(dn)}/participants/${Number(participantId)}/${ringing ? "divert" : "transferto"}`, {
    method: "POST",
    body: { destination, reason: "portal" },
  });
}

export async function dropParticipant(dn: string, participantId: number) {
  return callControl(`/callcontrol/${encodeURIComponent(dn)}/participants/${Number(participantId)}/drop`, { method: "POST", body: {} });
}

// ---------- Users / extensions ----------

const USER_SELECT =
  "Id,Number,FirstName,LastName,DisplayName,EmailAddress,Mobile,OutboundCallerID,Enabled,IsRegistered,CurrentProfileName,QueueStatus,VMEnabled,RecordCalls";

export async function listUsers() {
  const r = await xapi<OData<PbxUser>>(
    `/Users?$select=${USER_SELECT}&$expand=Phones($select=Id,Name,Interface,MacAddress,TemplateName),ForwardingProfiles&$orderby=Number&$top=2000`
  );
  return list(r);
}

/** Light list for the live view (polled): no phones/profiles. */
export async function listUsersLite() {
  return list(await xapi<OData<PbxUser>>("/Users?$select=Id,Number,FirstName,LastName,QueueStatus,CurrentProfileName,IsRegistered&$orderby=Number&$top=2000"));
}

export async function getUser(id: number) {
  return xapi<PbxUser>(`/Users(${Number(id)})?$select=${USER_SELECT}&$expand=ForwardingProfiles`);
}

export async function updateUser(id: number, patch: Partial<PbxUser> & Record<string, unknown>) {
  return xapi(`/Users(${Number(id)})`, { method: "PATCH", body: patch });
}

export async function createUser(u: { FirstName: string; LastName: string; EmailAddress: string; Number?: string; Mobile?: string }) {
  let number = u.Number;
  if (!number) {
    const r = await xapi<{ Number?: string; value?: string }>("/Users/Pbx.GetFirstAvailableExtensionNumber()");
    number = r?.Number ?? r?.value;
  }
  return xapi<PbxUser>("/Users", { method: "POST", body: { ...u, Number: number } });
}

export async function sendWelcomeEmail(id: number) {
  return xapi(`/Users(${Number(id)})/Pbx.SendWelcomeEmail`, { method: "POST" });
}

/** Global queue login/out (3CX has no per-queue login in the API). */
export async function setQueueStatus(id: number, loggedIn: boolean) {
  return updateUser(id, { QueueStatus: loggedIn ? "LoggedIn" : "LoggedOut" });
}

export async function listDids() {
  const r = await xapi<OData<{ Number: string; TrunkId?: number; RoutingRule?: { Name?: string; OfficeHoursDestination?: PbxDestination } }>>("/DidNumbers");
  return list(r);
}

// ---------- Queues / ring groups / menus ----------

export async function listQueues() {
  return list(
    await xapi<OData<Queue>>(
      "/Queues?$select=Id,Number,Name,PollingStrategy,RingTimeout,MasterTimeout,MaxCallersInQueue,WrapUpTime,SLATime,ForwardNoAnswer,AnnounceQueuePosition,Recording&$expand=Agents&$orderby=Number"
    )
  );
}

export async function updateQueue(id: number, patch: Partial<Queue>) {
  return xapi(`/Queues(${Number(id)})`, { method: "PATCH", body: patch });
}

export async function listRingGroups() {
  return list(await xapi<OData<RingGroup>>("/RingGroups?$select=Id,Number,Name,RingStrategy,RingTime,ForwardNoAnswer&$expand=Members&$orderby=Number"));
}

export async function updateRingGroup(id: number, patch: Partial<RingGroup>) {
  return xapi(`/RingGroups(${Number(id)})`, { method: "PATCH", body: patch });
}

export async function listReceptionists() {
  return list(
    await xapi<OData<Receptionist>>(
      "/Receptionists?$select=Id,Number,Name,IVRType,PromptFilename,Timeout,TimeoutForwardDN,TimeoutForwardType,InvalidKeyForwardDN,TransferEnable&$expand=Forwards&$orderby=Number"
    )
  );
}

export async function updateReceptionist(id: number, patch: Partial<Receptionist>) {
  return xapi(`/Receptionists(${Number(id)})`, { method: "PATCH", body: patch });
}

export async function getOfficeHours() {
  return xapi<OfficeHours>("/OfficeHours?$select=Hours,BreakTime,TimeZoneId");
}

export async function updateOfficeHours(patch: Partial<OfficeHours>) {
  return xapi("/OfficeHours", { method: "PATCH", body: patch });
}

export async function listHolidays() {
  return list(await xapi<OData<Holiday>>("/Holidays?$orderby=Month,Day"));
}

export async function createHoliday(h: { Name: string; Day: number; Month: number; Year: number; DayEnd?: number; MonthEnd?: number; YearEnd?: number; IsRecurrent?: boolean }) {
  return xapi<Holiday>("/Holidays", {
    method: "POST",
    body: { DayEnd: h.Day, MonthEnd: h.Month, YearEnd: h.Year, IsRecurrent: false, ...h },
  });
}

export async function deleteHoliday(id: number) {
  return xapi(`/Holidays(${Number(id)})`, { method: "DELETE" });
}

// ---------- Call history / recordings ----------

/**
 * 3CX's call log report. Every parameter is required (a missing one is a
 * 404). Type filters of 0 mean "all"; filtering by extension/number is
 * done with the search text over the returned page.
 */
export async function getCallLog(fromIso: string, toIso: string, top = 200, skip = 0) {
  const fn =
    `/ReportCallLogData/Pbx.GetCallLogData(periodFrom=${fromIso},periodTo=${toIso},sourceType=0,sourceFilter='',destinationType=0,destinationFilter='',` +
    `callsType=0,callTimeFilterType=0,callTimeFilterFrom='0:00:0',callTimeFilterTo='0:00:0',hidePcalls=true)`;
  const r = await xapi<OData<CallLogRow>>(`${fn}?$top=${top}&$skip=${skip}&$orderby=StartTime desc&$count=true`);
  return { rows: list(r), total: (r as OData<CallLogRow>)?.["@odata.count"] ?? null };
}

export function recordingDownloadPath(recId: number) {
  return `/Recordings/Pbx.DownloadRecording(recId=${Number(recId)})`;
}

export { q as odataString };
