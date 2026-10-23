// Client-safe: Entra authentication method ids -> labels.
export const METHOD_LABELS: Record<string, string> = {
  microsoftAuthenticatorPush: "Authenticator app",
  microsoftAuthenticatorPasswordless: "Authenticator (passwordless)",
  softwareOneTimePasscode: "Code app (TOTP)",
  hardwareOneTimePasscode: "Hardware token",
  mobilePhone: "Text / call",
  alternateMobilePhone: "Alt phone",
  officePhone: "Office phone",
  email: "Email (reset only)",
  fido2SecurityKey: "Security key",
  windowsHelloForBusiness: "Windows Hello",
  passKeyDeviceBound: "Passkey",
  passKeyDeviceBoundAuthenticator: "Passkey (Authenticator)",
  temporaryAccessPass: "Temp access pass",
  securityQuestion: "Security questions",
  macOsSecureEnclaveKey: "Mac Secure Enclave",
};
