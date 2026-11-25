"""Engångsinloggning till Garmin (hanterar MFA).

Kör på en dator tillsammans med Nellie:

    pip install -r sync/requirements.txt
    python sync/garmin_login.py

Lösenordet sparas aldrig. Skriptet sparar bara inloggnings-tokens:
- Om SUPABASE_URL, SUPABASE_SERVICE_KEY och NELLIE_USER_ID är satta i miljön
  laddas de upp direkt till Supabase (tabellen garmin_tokens). Rekommenderat.
- Annars skrivs de till filen garmin_tokens.json, som du klistrar in som
  GitHub-hemligheten GARMIN_TOKENS och sedan RADERAR.
"""

import getpass
import json
import os
from datetime import datetime, timezone

from garminconnect import Garmin


def main() -> None:
    email = input("Garmin-e-post: ").strip()
    password = getpass.getpass("Garmin-lösenord (visas inte): ")
    garmin = Garmin(email, password, prompt_mfa=lambda: input("Kod från Garmin (MFA): ").strip())
    garmin.login()
    tokens = garmin.client.dumps()
    name = garmin.get_full_name() if hasattr(garmin, "get_full_name") else "okänd"
    print(f"Inloggad som {name} ✔")

    url, key, user = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"), os.getenv("NELLIE_USER_ID")
    if url and key and user:
        import requests

        r = requests.post(
            url.rstrip("/") + "/rest/v1/garmin_tokens",
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"},
            data=json.dumps({"user_id": user, "tokens": tokens, "updated_at": datetime.now(timezone.utc).isoformat()}),
            timeout=30,
        )
        r.raise_for_status()
        print("Tokens sparade i Supabase. Klart! Synken börjar inom en timme (eller tryck Synka nu i appen).")
    else:
        with open("garmin_tokens.json", "w") as f:
            f.write(tokens)
        os.chmod("garmin_tokens.json", 0o600)
        print("Tokens sparade i garmin_tokens.json. Lägg innehållet som GitHub-hemligheten GARMIN_TOKENS och radera sedan filen.")


if __name__ == "__main__":
    main()
