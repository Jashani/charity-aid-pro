"""
Fetch recent emails from a personal Outlook.com account using Microsoft Graph API
with OAuth2 device-code flow.
 
SETUP (one-time, in a browser):
  1. Go to https://entra.microsoft.com and sign in.
  2. Applications -> App registrations -> New registration.
       Name: anything
       Supported account types: "Accounts in any organizational directory
                                 and personal Microsoft accounts"
       Redirect URI: leave blank
       -> Register
  3. Copy the "Application (client) ID" from the Overview page -> paste below.
  4. Authentication -> scroll down -> "Allow public client flows" = Yes -> Save.
  5. API permissions -> Add a permission -> Microsoft Graph ->
       Delegated permissions -> check "Mail.Read" -> Add permissions.
 
INSTALL:
  pip install msal requests
 
FIRST RUN:
  The script prints a code and a URL. Open the URL in a browser, paste the
  code, sign in with your Outlook account. Done. The token is cached in
  ./token_cache.bin, so subsequent runs are silent.
"""
 
import json
import os
import sys
import msal
import requests
 
# --- EDIT THIS ---
CLIENT_ID = "9242462a-6cbe-43fe-9baf-54967057b1f1"
# -----------------
 
AUTHORITY    = "https://login.microsoftonline.com/consumers"  # personal MS accounts
SCOPES       = ["Mail.Read"]
CACHE_FILE   = "token_cache.bin"
GRAPH_URL    = "https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages"
NUM_EMAILS   = 5
 
 
def load_cache():
    cache = msal.SerializableTokenCache()
    if os.path.exists(CACHE_FILE):
        cache.deserialize(open(CACHE_FILE, "r").read())
    return cache
 
 
def save_cache(cache):
    if cache.has_state_changed:
        with open(CACHE_FILE, "w") as f:
            f.write(cache.serialize())
 
 
def get_token():
    cache = load_cache()
    app = msal.PublicClientApplication(
        CLIENT_ID, authority=AUTHORITY, token_cache=cache
    )
 
    # Try silent first (use cached refresh token)
    accounts = app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(SCOPES, account=accounts[0])
        if result and "access_token" in result:
            save_cache(cache)
            return result["access_token"]
 
    # Otherwise do interactive device code flow
    flow = app.initiate_device_flow(scopes=SCOPES)
    if "user_code" not in flow:
        print("Failed to start device flow:", json.dumps(flow, indent=2))
        sys.exit(1)
 
    print(flow["message"])  # tells user to go to URL and enter code
    sys.stdout.flush()
 
    result = app.acquire_token_by_device_flow(flow)  # blocks until user signs in
    if "access_token" not in result:
        print("Auth failed:", result.get("error_description"))
        sys.exit(1)
 
    save_cache(cache)
    return result["access_token"]
 
 
def fetch_emails(token):
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "$top": NUM_EMAILS,
        "$orderby": "receivedDateTime desc",
        "$select": "subject,from,receivedDateTime,bodyPreview",
    }
    r = requests.get(GRAPH_URL, headers=headers, params=params)
    r.raise_for_status()
    return r.json().get("value", [])
 
 
def main():
    token = get_token()
    emails = fetch_emails(token)
 
    for m in emails:
        sender = m.get("from", {}).get("emailAddress", {})
        name   = sender.get("name", "")
        addr   = sender.get("address", "")
        print("=" * 60)
        print(f"From:    {name} <{addr}>")
        print(f"Date:    {m.get('receivedDateTime', '')}")
        print(f"Subject: {m.get('subject', '')}")
        print("-" * 60)
        print(m.get("bodyPreview", ""))
        print()
 
 
if __name__ == "__main__":
    main()
 