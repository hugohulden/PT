from garmin_sync import (
    activity_from_garmin,
    daily_from_garmin,
    payload_id,
    prediction_from_garmin,
    sets_from_garmin,
    weigh_ins_from_garmin,
)


def test_activity():
    a = activity_from_garmin(
        {"activityId": 1, "activityName": "Löpning", "startTimeLocal": "2026-11-22 09:15:00", "activityType": {"typeKey": "running"}, "distance": 15000.0, "duration": 7185.3, "averageHR": 161.0, "maxHR": 177.0}
    )
    assert a == {"garmin_id": 1, "type": "running", "name": "Löpning", "start": "2026-11-22T09:15:00", "distance_km": 15.0, "duration_s": 7185, "avg_hr": 161, "max_hr": 177}


def test_strength_sets_grams():
    s = sets_from_garmin(
        {"exerciseSets": [
            {"setType": "ACTIVE", "repetitionCount": 10, "weight": 40000.0, "exercises": [{"category": "SQUAT", "name": "BARBELL_BACK_SQUAT"}]},
            {"setType": "REST"},
        ]}
    )
    assert s == [{"exercise": "SQUAT/BARBELL_BACK_SQUAT", "reps": 10, "weight_kg": 40.0}]


def test_daily():
    d = daily_from_garmin(
        "2026-11-25",
        {"totalSteps": 15100, "restingHeartRate": 50, "moderateIntensityMinutes": 20, "vigorousIntensityMinutes": 10},
        {"dailySleepDTO": {"sleepTimeSeconds": 29880, "sleepScores": {"overall": {"value": 84}}}},
        {"hrvSummary": {"lastNightAvg": 82, "status": "BALANCED"}},
    )
    assert d == {"date": "2026-11-25", "steps": 15100, "resting_hr": 50, "intensity_min": 40, "sleep_h": 8.3, "sleep_score": 84, "hrv": 82, "hrv_status": "BALANCED"}
    assert daily_from_garmin("2026-11-25", None, None, None) is None


def test_weigh_and_prediction():
    w = weigh_ins_from_garmin({"dailyWeightSummaries": [{"summaryDate": "2026-11-25", "allWeightMetrics": [{"weight": 60200.0}]}]})
    assert w == [{"date": "2026-11-25", "kg": 60.2}]
    p = prediction_from_garmin({"time5K": 1561, "time10K": 3378, "timeHalfMarathon": 7767}, "2026-11-25")
    assert p == {"date": "2026-11-25", "k5_s": 1561, "k10_s": 3378, "half_s": 7767}


def test_payload_id_stable():
    assert payload_id({"a": 1, "b": 2}) == payload_id({"b": 2, "a": 1})
