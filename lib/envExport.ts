// Which portal settings can be exported as .env lines, grouped the way
// Admin > Connectors shows them. Generated from app/admin/connectors/page.tsx;
// any other key saved in integration_settings shows up under "Other".
export type EnvExportField = { key: string; label: string };
export type EnvExportGroup = { title: string; fields: EnvExportField[] };

export const ENV_EXPORT_GROUPS: EnvExportGroup[] = [
  {
    "title": "Stock Photos & Dropbox",
    "fields": [
      {
        "key": "pexels_api_key",
        "label": "Pexels API Key"
      },
      {
        "key": "dropbox_app_key",
        "label": "Dropbox App Key"
      },
      {
        "key": "dropbox_app_secret",
        "label": "Dropbox App Secret"
      },
      {
        "key": "dropbox_refresh_token",
        "label": "Dropbox Refresh Token"
      }
    ]
  },
  {
    "title": "AI Assist (Copilot Studio)",
    "fields": [
      {
        "key": "copilot_studio_endpoint_url",
        "label": "Flow URL"
      },
      {
        "key": "copilot_studio_api_key",
        "label": "API Key / Shared Secret (optional)"
      }
    ]
  },
  {
    "title": "Portal Assistant (Azure OpenAI)",
    "fields": [
      {
        "key": "azure_openai_endpoint",
        "label": "Endpoint"
      },
      {
        "key": "azure_openai_deployment",
        "label": "Chat Deployment Name"
      },
      {
        "key": "azure_openai_image_deployment",
        "label": "Image Deployment Name (optional)"
      },
      {
        "key": "azure_openai_api_version",
        "label": "API Version (optional)"
      },
      {
        "key": "azure_openai_vision_deployment",
        "label": "Vision Deployment (optional)"
      },
      {
        "key": "azure_openai_image_draft_deployment",
        "label": "Draft Image Deployment (optional \u2014 cheaper model for quick options)"
      },
      {
        "key": "azure_openai_image_endpoint",
        "label": "Image Endpoint (optional \u2014 only if images live on a different resource)"
      },
      {
        "key": "azure_openai_image_api_version",
        "label": "Image API Version (optional)"
      },
      {
        "key": "azure_openai_whisper_deployment",
        "label": "Whisper Deployment Name (optional)"
      }
    ]
  },
  {
    "title": "Call Recording Webhook (3CX \u2192 Portal)",
    "fields": [
      {
        "key": "threecx_recording_webhook_secret",
        "label": "Webhook Shared Secret"
      }
    ]
  },
  {
    "title": "Copilot Agent Actions",
    "fields": [
      {
        "key": "copilot_api_key",
        "label": "Copilot Actions API Key"
      }
    ]
  },
  {
    "title": "Email (Resend)",
    "fields": [
      {
        "key": "resend_api_key",
        "label": "API Key"
      },
      {
        "key": "resend_from_email",
        "label": "From Address"
      }
    ]
  },
  {
    "title": "Salesforce",
    "fields": [
      {
        "key": "salesforce_client_id",
        "label": "Consumer Key"
      },
      {
        "key": "salesforce_client_secret",
        "label": "Consumer Secret"
      },
      {
        "key": "salesforce_username",
        "label": "Integration User Username"
      },
      {
        "key": "salesforce_password_token",
        "label": "Password + Security Token"
      },
      {
        "key": "salesforce_instance_url",
        "label": "Instance URL"
      }
    ]
  },
  {
    "title": "QuickBooks Online",
    "fields": [
      {
        "key": "qbo_client_id",
        "label": "Client ID"
      },
      {
        "key": "qbo_client_secret",
        "label": "Client secret"
      },
      {
        "key": "qbo_environment",
        "label": "Environment (production or sandbox)"
      }
    ]
  },
  {
    "title": "Amazon Business",
    "fields": [
      {
        "key": "amazon_business_application_id",
        "label": "Application ID"
      },
      {
        "key": "amazon_business_client_id",
        "label": "LWA Client ID"
      },
      {
        "key": "amazon_business_client_secret",
        "label": "LWA Client secret"
      },
      {
        "key": "amazon_business_auto_finance_unmatched",
        "label": "Send Pay by Invoice purchases that don't match a ticket straight to Finance? (true / false)"
      }
    ]
  },
  {
    "title": "ADP Workforce Now (time off & timesheets)",
    "fields": [
      {
        "key": "adp_client_id",
        "label": "Client ID"
      },
      {
        "key": "adp_client_secret",
        "label": "Client Secret"
      },
      {
        "key": "adp_ssl_cert_b64",
        "label": "TLS Certificate (base64)"
      },
      {
        "key": "adp_ssl_key_b64",
        "label": "TLS Private Key (base64)"
      },
      {
        "key": "time_off_fallback_approver_email",
        "label": "Fallback time off approver (email)"
      }
    ]
  },
  {
    "title": "QuickBooks Desktop (Web Connector)",
    "fields": [
      {
        "key": "qbwc_username",
        "label": "Web Connector username"
      },
      {
        "key": "qbwc_password",
        "label": "Web Connector password"
      }
    ]
  },
  {
    "title": "Power BI (temporary)",
    "fields": [
      {
        "key": "powerbi_tenant_id",
        "label": "Directory (tenant) ID"
      },
      {
        "key": "powerbi_client_id",
        "label": "Application (client) ID"
      },
      {
        "key": "powerbi_client_secret",
        "label": "Client secret"
      },
      {
        "key": "powerbi_workspace_id",
        "label": "Workspace ID"
      }
    ]
  },
  {
    "title": "Microsoft Sign-in (assistant lookups as the employee)",
    "fields": [
      {
        "key": "azure_sso_tenant_id",
        "label": "Directory (tenant) ID (optional)"
      },
      {
        "key": "azure_sso_client_id",
        "label": "SSO Application (client) ID (optional)"
      },
      {
        "key": "azure_sso_client_secret",
        "label": "SSO Client secret (optional)"
      }
    ]
  },
  {
    "title": "Brand Assets",
    "fields": [
      {
        "key": "brand_logo_url",
        "label": "Logo Image URL"
      }
    ]
  },
  {
    "title": "Donations (CharityStack)",
    "fields": [
      {
        "key": "charitystack_api_key",
        "label": "API Key"
      },
      {
        "key": "charitystack_webhook_secret",
        "label": "Webhook Signing Secret"
      }
    ]
  },
  {
    "title": "WordPress Site",
    "fields": [
      {
        "key": "wp_site_url",
        "label": "Site URL"
      },
      {
        "key": "wp_username",
        "label": "WordPress Username"
      },
      {
        "key": "wp_app_password",
        "label": "Application Password"
      }
    ]
  },
  {
    "title": "Calling & Texting (3CX / Skyetel)",
    "fields": [
      {
        "key": "skyetel_api_key",
        "label": "Skyetel API Key"
      },
      {
        "key": "skyetel_api_secret",
        "label": "Skyetel API Secret"
      },
      {
        "key": "skyetel_sms_number",
        "label": "Skyetel SMS-Enabled Number"
      },
      {
        "key": "threecx_api_url",
        "label": "3CX API Base URL"
      },
      {
        "key": "threecx_client_id",
        "label": "3CX API Client ID"
      },
      {
        "key": "threecx_client_secret",
        "label": "3CX API Client Secret"
      },
      {
        "key": "threecx_webclient_url",
        "label": "3CX Web Client URL (optional)"
      }
    ]
  },
  {
    "title": "Square (Event / Pantry Payments)",
    "fields": [
      {
        "key": "square_access_token",
        "label": "Access Token"
      }
    ]
  },
  {
    "title": "IRFAS \u2014 Finance Notification",
    "fields": [
      {
        "key": "zakat_finance_emails",
        "label": "Finance Email(s)"
      }
    ]
  },
  {
    "title": "Background Removal (remove.bg)",
    "fields": [
      {
        "key": "removebg_api_key",
        "label": "API Key"
      }
    ]
  },
  {
    "title": "Social Media \u2014 YouTube",
    "fields": [
      {
        "key": "youtube_api_key",
        "label": "API Key"
      },
      {
        "key": "youtube_channel_id",
        "label": "Channel ID"
      }
    ]
  },
  {
    "title": "Social Media \u2014 Facebook & Instagram",
    "fields": [
      {
        "key": "facebook_page_id",
        "label": "Facebook Page ID"
      },
      {
        "key": "facebook_page_access_token",
        "label": "Page Access Token"
      },
      {
        "key": "instagram_business_account_id",
        "label": "Instagram Business Account ID"
      }
    ]
  },
  {
    "title": "Finance Tickets \u2014 CEO Routing",
    "fields": [
      {
        "key": "finance_ceo_email",
        "label": "CEO Email"
      }
    ]
  }
];

// Env var names the code already falls back to when they differ from the
// key upper-cased (see the getIntegrationSetting(...) call sites).
const ENV_NAME_OVERRIDES: Record<string, string> = {
  powerbi_tenant_id: "PBI_TENANT_ID",
  powerbi_client_id: "PBI_CLIENT_ID",
  powerbi_client_secret: "PBI_CLIENT_SECRET",
  powerbi_workspace_id: "PBI_WORKSPACE_ID",
  powerbi_reports_dataset_id: "PBI_REPORTS_DATASET_ID",
  resend_from_email: "EMAIL_FROM",
};

export function envNameFor(key: string): string {
  return ENV_NAME_OVERRIDES[key] ?? key.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

// Saved in integration_settings but not credentials — never offered.
export const ENV_EXPORT_EXCLUDED = new Set([
  "volunteer_waiver_text",
  "volunteer_waiver_version",
  "grant_management_api_key_hash",
  "grant_management_api_key_created",
  "qbo_connected_at",
  "qbo_company_name",
]);

// One-click selections for apps that need a known set of keys.
export const ENV_EXPORT_PRESETS: { label: string; description: string; keys: string[] }[] = [
  {
    label: "Scan Receipts — standalone InKind app",
    description: "Azure OpenAI settings for icnarelief-donation-intake's receipt reader.",
    keys: ["azure_openai_endpoint", "azure_openai_api_key", "azure_openai_deployment", "azure_openai_api_version"],
  },
];

// One .env line, quoted so dotenv / Next.js / Vercel's paste-import read
// the value back exactly: double quotes (newlines become \n, which dotenv
// expands), or single quotes when the value itself contains a double quote.
export function envLine(name: string, value: string): string {
  if (value.includes('"') && !value.includes("'") && !/[\r\n]/.test(value)) return `${name}='${value}'`;
  return `${name}="${value.replace(/\r?\n/g, "\\n").replace(/"/g, '\\"')}"`;
}
