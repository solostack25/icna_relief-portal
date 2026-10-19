// Suggests where a QuickBooks class's expenses belong, for classes finance
// hasn't mapped yet. Class names are full paths from the P&L by Class report
// ("DALLAS REGION:GLOBAL REFUGE(DA):MG GRANT(DA)"). Names drift month to
// month ("ALEXANDERIA-VA", "TENNASSEE", "PIR(AUSITN)"), so matching is by
// keywords, and every suggestion can be changed on Admin → Expenses → Mapping.

export type ClassTarget = {
  target: "office" | "grant" | "central" | "ignore" | "review";
  office_name?: string | null;
  department?: string | null;
  subhead?: string | null;
  also_office?: boolean;
  reason: string;
};

// Region / state class keyword → portal office.
const REGION_OFFICES: [RegExp, string][] = [
  [/\bHOUSTON\b/, "Houston Office"],
  [/\bDALLAS\b|FORT WORTH/, "Dallas Office"],
  [/\bAUSTIN\b|\bAUSITN\b/, "Austin Office"],
  [/\bILLINOIS\b|\bCHICAGO\b/, "Chicago Office"],
  [/\bMICHIGAN\b|\bDETROIT\b/, "Detroit Office"],
  [/\bNEW ?YORK\b/, "New York Office"],
  [/\bMARYLAND\b|\bBALTIMORE\b/, "Baltimore Office"],
  [/\bMASSACH?US+ET+S\b|\bBOSTON\b/, "Boston Office"],
  [/\bMISSOURI\b|ST\.? LOUIS/, "St. Louis Office"],
  [/\bGEORGIA\b|\bATLANTA\b/, "Atlanta Office"],
  [/\bARIZONA\b|\bPHOENIX\b/, "Phoenix Office"],
  [/\bWASHINGTON\b|\bSEATTLE\b/, "Seattle Office"],
  [/\bPENNSYLVANIA\b|PHILADELPHIA/, "Philadelphia Office"],
  [/\bOKLAHOMA\b/, "Oklahoma City Office"],
  [/NORTH CAROLINA|\bDURHAM\b/, "Durham Office"],
  [/\bINDIANA\b|INDIANAPOLIS/, "Indianapolis Office"],
  [/\bMINNESOTA\b|MINNEAPOLIS/, "Minneapolis Office"],
  [/\bTEN+[AE]S+E+\b|\bMEMPHIS\b/, "Memphis Office"],
  [/^LA REGION|LOUISIANA|NEW ORLEANS/, "New Orleans Office"],
  [/\bIOWA\b|CEDAR RAPIDS/, "Cedar Rapids Office"],
  [/\bCOLORADO\b|\bDENVER\b/, "Denver Office"],
  [/NEW JERSEY|\bNJ\b/, "New Jersey Office"],
  [/SOUTH CAROLINA|CHARLESTON/, "Charleston Office"],
  [/\bWISCONSIN\b/, "Wisconsin-Statewide"],
  [/\bOHIO\b/, "Ohio-Statewide"],
  [/\bKENTUCKY\b/, "Kentucky - Statewide"],
  [/\bNEBRASKA\b/, "Nebraska-Statewide"],
  [/\bMIS+IS+IP+I\b|^MISSS$/, "Mississippi-Statewide"],
  [/KANSAS CITY/, "Kansas City Office"],
];

// Classes inside a region class (city level), checked before the region.
const CITY_OFFICES: [RegExp, string][] = [
  [/ORLANDO/, "Orlando Office"],
  [/SOUTH FLORIDA|\bMIAMI\b/, "Miami Office"],
  [/\bTAMPA\b/, "Tampa Office"],
  [/SACRAMENTO|\(SAC\)/, "Sacramento Office"],
  [/SAN DIEGO/, "San Diego Office"],
  [/SAN JOSE|BAY AREA/, "Bay Area Office"],
  [/ALEXAND[EA]?RIA/, "Alexandria Office"],
  [/RICHMOND/, "Richmond Office"],
];

// Grant / restricted-program sub-classes.
const GRANT = /GLOBAL REFUGE|\bTXOR\b|\bMG\b|MG GRANT|\bARHP\b|R&P|\bPIR\b|PIR\(|ICM\/HS|ASA-SAS|DHS|INSPIRE|SECU?A?RITY GRANT|NSGP|LAPTOP AND ISP/;

const CENTRAL: [RegExp, string, string][] = [
  [/^ADMINISTRATION:ADMIN$/, "ADMIN", "ADMIN"],
  [/^ADMINISTRATION:FINANCE$/, "FINANCE", "FINANCE"],
  [/^ADMINISTRATION:G ?& ?A/, "ADMIN", "G & A MANAGEMENT"],
  [/^ADMINISTRATION:HR/, "ADMIN", "HR & LEGAL"],
  [/^ADMINISTRATION/, "ADMIN", "ADMIN OTHER"],
  [/^FUND RAISING EXP:IT/, "IT & MARKETING", "IT-FUNDRAISING"],
  [/^FUND RAISING EXP:MARKETING/, "IT & MARKETING", "MARKETING FUNDRAISING"],
  [/^FUND RAISING EXP/, "OUTREACH", "FUNDRAISING OTHER"],
  [/^GRANT MANAGEMENT/, "GRANTS", "GRANT MANAGEMENT DEPARTMENT"],
  [/^(PROGRAM|CENTRAL PROGRAMS)\b/, "PROGRAMS", "PROGRAMS CENTRAL-COST"],
  [/^MISC REGION/, "REGIONS - CENTRAL", "REGIONAL - MISCELLANEOUS"],
];

export function suggestClass(path: string): ClassTarget {
  const P = path.toUpperCase().trim();
  for (const [re, department, subhead] of CENTRAL) {
    if (re.test(P)) return { target: "central", department, subhead, reason: "Central department class" };
  }
  if (/^UNCLASSIFIED$/.test(P)) return { target: "review", reason: "Unclassified — split by hand (payroll by home department, COBRA to central)" };

  const parts = P.split(":");
  const leaf = parts[parts.length - 1];
  const isGrant = parts.slice(1).some((x) => GRANT.test(x));
  let office: string | undefined;
  for (const [re, name] of CITY_OFFICES) if (parts.slice(1).some((x) => re.test(x))) office = name;
  if (!office) for (const [re, name] of REGION_OFFICES) if (re.test(parts[0])) office = name;
  if (!office) for (const [re, name] of [...CITY_OFFICES, ...REGION_OFFICES]) if (re.test(P)) office = name;

  // A region's leftover "- Other" bucket for multi-office regions isn't
  // tied to one office.
  if (/^(FLORIDA|CALIFORNIA|VIRGINIA) REGION - OTHER$/.test(leaf) || /ORANGE COUNTY/.test(P) && !isGrant) {
    return { target: "review", reason: "Shared by several offices in the region — pick one" };
  }
  if (!office) return { target: "review", reason: "No office recognised in the class name" };
  if (isGrant) return { target: "grant", office_name: office, also_office: true, reason: "Grant sub-class — counts in the office and its grant row" };
  return { target: "office", office_name: office, reason: "Region class" };
}
