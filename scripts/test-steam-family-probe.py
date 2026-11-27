"""Offline tests against the actual downloaded upstream implementation."""
import base64
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("probe", Path(__file__).with_name("steam-family-probe.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
ME, OTHER = "76561198000000001", "76561198000000002"
FIXTURE_EXP = int(time.time()) + 600


def token(exp=None):
    claims = json.dumps({"sub": ME, "exp": FIXTURE_EXP if exp is None else exp}).encode()
    return "eyJhbGciOiJub25lIn0." + base64.urlsafe_b64encode(claims).decode().rstrip("=") + ".fixture"


APPS = [
    {"appid": 367520, "name": "Hollow Knight", "owner_steamids": [OTHER], "rt_playtime": 90, "rt_last_played": 1234567890, "app_type": 1},
    {"appid": 2552430, "name": "Kingdom Hearts", "owner_steamids": [OTHER], "rt_playtime": 120, "app_type": 1},
    {"appid": 620, "name": "Never played", "owner_steamids": [ME], "rt_playtime": 0, "rt_time_acquired": 1234567890},
    {"appid": 570, "name": "Unknown activity", "owner_steamids": [OTHER]},
]


class Response(io.BytesIO):
    def __init__(self, value):
        super().__init__(json.dumps({"response": value}).encode())


class FamilyProbeTests(unittest.TestCase):
    def test_actual_upstream_returns_shared_games_and_also_unplayed_games(self):
        module = probe.upstream_module()
        calls = []
        def api(method, params):
            calls.append((method, params))
            return {"family_groupid": "123", "family_group": {"members": []}} if "GetFamilyGroupForUser" in method else {"apps": APPS, "owner_steamid": ME}
        with patch.object(module, "api_get", api), contextlib.redirect_stdout(io.StringIO()):
            result = module.fetch(token(), True, False)
        self.assertEqual(result["count"], 4)
        self.assertEqual(sum(game["source"] == "family" for game in result["games"]), 3)
        self.assertIn("Never played", [game["name"] for game in result["games"]])
        self.assertNotIn("steamid", calls[1][1], "Upstream does not explicitly select the activity account")

    def test_actual_upstream_defaults_missing_playtime_to_zero(self):
        module = probe.upstream_module()
        with patch.object(module, "api_get", side_effect=[{"family_groupid": "123"}, {"apps": APPS}]), contextlib.redirect_stdout(io.StringIO()):
            result = module.fetch(token(), True, False)
        unknown = next(game for game in result["games"] if game["appid"] == 570)
        self.assertEqual(unknown["playtime_minutes"], 0)
        self.assertNotIn("rt_playtime", APPS[3])

    def test_probe_filters_actual_activity_and_removes_family_identifiers(self):
        calls = []
        def opener(request, timeout):
            url = urllib.parse.urlparse(request.full_url)
            params = urllib.parse.parse_qs(url.query)
            self.assertEqual(url.hostname, "api.steampowered.com")
            self.assertEqual(params["steamid"], [ME])
            calls.append(url.path)
            return Response({"family_groupid": "123", "family_group": {"name": "Private name", "members": [{"steamid": OTHER}]}}) if "GetFamilyGroupForUser" in url.path else Response({"apps": APPS, "owner_steamid": ME})
        result = probe.run_probe(token(), opener)
        self.assertEqual(len(calls), 2)
        self.assertEqual(result["counts"]["played_with_evidence"], 2)
        self.assertEqual(result["counts"]["shared_played_with_evidence"], 2)
        self.assertTrue(result["targets"][0]["activity_confirmed"])
        for secret in [ME, OTHER, "Private name", token(), "owner_steamids", "family_groupid"]:
            self.assertNotIn(secret, json.dumps(result))

    def test_wrong_activity_owner_is_rejected(self):
        client = probe.SteamReadOnly(token(), lambda *a, **k: Response({"owner_steamid": OTHER, "apps": APPS}))
        with self.assertRaisesRegex(probe.ProbeError, "IDENTITY_UNCONFIRMED"):
            client.get("IFamilyGroupsService/GetSharedLibraryApps/v1", {"access_token": token()})

    def test_unknown_hours_stay_null_and_acquisition_does_not_count_as_play(self):
        apps = APPS + [{"appid": 2552440, "rt_last_played": 1234567890, "owner_steamids": [OTHER]}]
        result = probe.activity_report(apps, ME)
        self.assertEqual(result["counts"]["played_with_evidence"], 3)
        kh = next(game for game in result["targets"] if game["appid"] == 2552440)
        self.assertIsNone(kh["minutes"])

    def test_invalid_future_negative_and_software_are_not_played(self):
        apps = [{"appid": 1, "rt_playtime": -1}, {"appid": 2, "rt_last_played": 9999999999}, {"appid": 3, "rt_playtime": 50, "app_type": 2}]
        self.assertEqual(probe.activity_report(apps, ME)["counts"]["played_with_evidence"], 0)

    def test_expired_or_malformed_token_never_reaches_network(self):
        for value in [token(1), "malformed", token().replace(".fixture", ".too.many")]:
            with self.assertRaises(probe.ProbeError):
                probe.SteamReadOnly(value, lambda *a, **k: self.fail("Network was accessed"))

    def test_http_error_never_exposes_token_or_provider_body(self):
        def opener(request, timeout):
            raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, io.BytesIO(token().encode()))
        client = probe.SteamReadOnly(token(), opener)
        with self.assertRaisesRegex(probe.ProbeError, "^STEAM_HTTP_403$"):
            client.get("IFamilyGroupsService/GetFamilyGroupForUser/v1", {"access_token": token()})

    def test_redirects_and_other_endpoints_are_refused(self):
        with self.assertRaisesRegex(probe.ProbeError, "REDIRECT_REFUSED"):
            probe.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.test")
        client = probe.SteamReadOnly(token(), lambda *a, **k: self.fail("Unexpected network"))
        with self.assertRaisesRegex(probe.ProbeError, "UNEXPECTED_STEAM_REQUEST"):
            client.get("IFamilyGroupsService/DeleteFamilyGroup/v1", {"access_token": token()})


if __name__ == "__main__":
    unittest.main(verbosity=2)
