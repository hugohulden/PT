"""Garmin → Supabase-synk för Nellies träningsapp.

Körs av GitHub Actions (se .github/workflows/garmin-sync.yml) varje timme,
eller när hon trycker "Synka nu" i appen.

Hämtar aktiviteter, steg, sömn, vilopuls, HRV, invägningar och loppprognos
från Garmin Connect med det inofficiella biblioteket python-garminconnect,
gör om dem till appens importformat (nellie-traning/v1) och lägger dem i
Supabase-tabellen garmin_payloads. Appen hämtar och matchar dem själv.

Integritet: skriptet skriver ALDRIG ut hälsodata i loggen, bara antal.

Miljövariabler (GitHub-hemligheter):
  SUPABASE_URL, SUPABASE_SERVICE_KEY, NELLIE_USER_ID
  GARMIN_TOKENS (valfri, bara första gången – sedan sparas tokens i Supabase)
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from datetime import date, datetime, timedelta
from typing import Any, Callable
from zoneinfo import ZoneInfo

import requests

FORMAT = "nellie-traning/v1"
HISTORY_START = date(2026, 10, 19)  # V1
TZ = ZoneInfo("Europe/Stockholm")

# ---------------------------------------------------------------------------
# Rena omvandlingsfunktioner (testas i test_transform.py)


def _num(v: Any) -> float | None:
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def activity_from_garmin(a: dict[str, Any], sets: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    start = str(a.get("startTimeLocal") or a.get("startTimeGMT") or "").replace(" ", "T")
    dist = _num(a.get("distance"))
    out: dict[str, Any] = {
        "garmin_id": a.get("activityId"),
        "type": (a.get("activityType") or {}).get("typeKey") or "other",
        "name": a.get("activityName"),
        "start": start,
        "distance_km": round(dist / 1000, 2) if dist else None,
        "duration_s": round(_num(a.get("duration")) or 0) or None,
        "avg_hr": round(_num(a.get("averageHR")) or 0) or None,
        "max_hr": round(_num(a.get("maxHR")) or 0) or None,
    }
    if sets:
        out["sets"] = sets
    return {k: v for k, v in out.items() if v is not None}


def sets_from_garmin(resp: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Styrkeset från get_activity_exercise_sets. Garmin anger vikt i gram."""
    out = []
    for s in (resp or {}).get("exerciseSets") or []:
        if s.get("setType") != "ACTIVE":
            continue
        ex = (s.get("exercises") or [{}])[0]
        name = ex.get("name") or ex.get("category") or "UNKNOWN"
        w = _num(s.get("weight"))
        row: dict[str, Any] = {"exercise": f"{ex.get('category', '')}/{name}".strip("/"), "reps": s.get("repetitionCount")}
        if w:
            row["weight_kg"] = round(w / 1000, 2) if w > 500 else round(w, 2)
        out.append({k: v for k, v in row.items() if v is not None})
    return out


def daily_from_garmin(d: str, stats: dict | None, sleep: dict | None, hrv: dict | None) -> dict[str, Any] | None:
    row: dict[str, Any] = {"date": d}
    stats = stats or {}
    if stats.get("totalSteps") is not None:
        row["steps"] = int(stats["totalSteps"])
    if stats.get("restingHeartRate"):
        row["resting_hr"] = int(stats["restingHeartRate"])
    mod, vig = stats.get("moderateIntensityMinutes"), stats.get("vigorousIntensityMinutes")
    if mod is not None or vig is not None:
        row["intensity_min"] = int((mod or 0) + 2 * (vig or 0))
    dto = (sleep or {}).get("dailySleepDTO") or {}
    if dto.get("sleepTimeSeconds"):
        row["sleep_h"] = round(dto["sleepTimeSeconds"] / 3600, 2)
    score = ((dto.get("sleepScores") or {}).get("overall") or {}).get("value")
    if score is not None:
        row["sleep_score"] = int(score)
    summary = (hrv or {}).get("hrvSummary") or {}
    if summary.get("lastNightAvg"):
        row["hrv"] = int(summary["lastNightAvg"])
    if summary.get("status"):
        row["hrv_status"] = str(summary["status"]).upper()
    return row if len(row) > 1 else None


def weigh_ins_from_garmin(resp: dict | None) -> list[dict[str, Any]]:
    out = []
    for day in (resp or {}).get("dailyWeightSummaries") or []:
        for m in day.get("allWeightMetrics") or []:
            w = _num(m.get("weight"))
            if w:
                d = m.get("calendarDate") or day.get("summaryDate")
                out.append({"date": str(d)[:10], "kg": round(w / 1000 if w > 500 else w, 1)})
    return out


def prediction_from_garmin(resp: Any, today: str) -> dict[str, Any] | None:
    r = resp[0] if isinstance(resp, list) and resp else resp
    if not isinstance(r, dict):
        return None
    row = {"date": today, "k5_s": r.get("time5K"), "k10_s": r.get("time10K"), "half_s": r.get("timeHalfMarathon")}
    return row if any(row[k] for k in ("k5_s", "k10_s", "half_s")) else None


def payload_id(payload: dict[str, Any]) -> str:
    return "g-" + hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:32]


# ---------------------------------------------------------------------------
# Hämtning


def safe(fn: Callable[[], Any], what: str, errors: list[str]) -> Any:
    for attempt in range(3):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 – inofficiellt API, allt kan hända
            if attempt == 2:
                errors.append(f"{what}: {type(e).__name__}")
                return None
            time.sleep(2 * (attempt + 1))
    return None


def fetch(garmin: Any, start: date, end: date) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    s, e = start.isoformat(), end.isoformat()
    acts = safe(lambda: garmin.get_activities_by_date(s, e), "aktiviteter", errors) or []
    activities = []
    for a in acts:
        sets = None
        if (a.get("activityType") or {}).get("typeKey") == "strength_training":
            sets = sets_from_garmin(safe(lambda: garmin.get_activity_exercise_sets(a["activityId"]), "styrkeset", errors))
        activities.append(activity_from_garmin(a, sets))

    daily = []
    d = start
    while d <= end:
        ds = d.isoformat()
        row = daily_from_garmin(
            ds,
            safe(lambda: garmin.get_stats(ds), "steg", errors),
            safe(lambda: garmin.get_sleep_data(ds), "sömn", errors),
            safe(lambda: garmin.get_hrv_data(ds), "hrv", errors),
        )
        if row:
            daily.append(row)
        d += timedelta(days=1)

    weigh = weigh_ins_from_garmin(safe(lambda: garmin.get_weigh_ins(s, e), "vikt", errors))
    pred = prediction_from_garmin(safe(lambda: garmin.get_race_predictions(), "prognos", errors), e)

    payload = {"format": FORMAT, "source": "garmin-sync", "activities": activities, "daily": daily, "weigh_ins": weigh}
    if pred:
        payload["race_predictions"] = [pred]
    return payload, errors


# ---------------------------------------------------------------------------
# Supabase (PostgREST med service-nyckel – finns bara som GitHub-hemlighet)


class Supa:
    def __init__(self, url: str, key: str, user_id: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.user = user_id
        self.h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def get(self, table: str) -> dict | None:
        r = requests.get(f"{self.base}/{table}", headers=self.h, params={"user_id": f"eq.{self.user}", "select": "*"}, timeout=30)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def upsert(self, table: str, row: dict, ignore_duplicates: bool = False) -> None:
        pref = "resolution=ignore-duplicates" if ignore_duplicates else "resolution=merge-duplicates"
        r = requests.post(f"{self.base}/{table}", headers={**self.h, "Prefer": pref}, data=json.dumps(row), timeout=60)
        r.raise_for_status()


def main() -> int:
    url, key, user = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"), os.getenv("NELLIE_USER_ID")
    if not (url and key and user):
        print("Synken är inte konfigurerad än (SUPABASE_URL, SUPABASE_SERVICE_KEY, NELLIE_USER_ID saknas). Hoppar över.")
        return 0
    supa = Supa(url, key, user)
    now = datetime.now(TZ)
    status = {"user_id": user, "last_run": now.isoformat()}

    stored = supa.get("garmin_tokens")
    tokens = (stored or {}).get("tokens") or os.getenv("GARMIN_TOKENS")
    if not tokens:
        supa.upsert("sync_status", {**status, "ok": False, "message": "Garmin-inloggning saknas. Kör sync/garmin_login.py."})
        print("Inga Garmin-tokens. Kör sync/garmin_login.py en gång.")
        return 0

    from garminconnect import Garmin  # importeras sent så att testerna inte behöver biblioteket

    garmin = Garmin()
    try:
        garmin.login(tokenstore=tokens)
    except Exception as e:  # noqa: BLE001
        supa.upsert("sync_status", {**status, "ok": False, "message": f"Garmin-inloggningen gick ut ({type(e).__name__}). Kör garmin_login.py igen."})
        print(f"Inloggning misslyckades: {type(e).__name__}")
        return 1
    # Spara uppdaterade tokens så att de aldrig hinner gå ut
    supa.upsert("garmin_tokens", {"user_id": user, "tokens": garmin.client.dumps(), "updated_at": now.isoformat()})

    st = supa.get("sync_status") or {}
    until = now.date()
    if st.get("synced_until"):
        start = max(HISTORY_START, date.fromisoformat(st["synced_until"]) - timedelta(days=3))
    else:
        start = HISTORY_START
    # Stora hämtningar delas i bitar om 14 dagar
    total = {"activities": 0, "daily": 0, "weigh_ins": 0}
    all_errors: list[str] = []
    chunk_start = start
    while chunk_start <= until:
        chunk_end = min(until, chunk_start + timedelta(days=13))
        payload, errors = fetch(garmin, chunk_start, chunk_end)
        all_errors += errors
        if payload["activities"] or payload["daily"] or payload["weigh_ins"]:
            supa.upsert(
                "garmin_payloads",
                {"id": payload_id(payload), "user_id": user, "payload": payload, "created_at": datetime.now(TZ).isoformat()},
                ignore_duplicates=True,
            )
        for k in total:
            total[k] += len(payload.get(k) or [])
        chunk_start = chunk_end + timedelta(days=1)

    ok = not all_errors
    msg = f"{total['activities']} aktiviteter, {total['daily']} dagar, {total['weigh_ins']} invägningar ({start}–{until})"
    if all_errors:
        msg += f". Vissa delar misslyckades: {', '.join(sorted(set(all_errors)))[:300]}"
    supa.upsert("sync_status", {**status, "ok": ok, "message": msg, "last_success": now.isoformat(), "synced_until": until.isoformat()})
    print(msg)  # bara antal, ingen hälsodata
    return 0


if __name__ == "__main__":
    sys.exit(main())
