r"""Read-only experiment for the public steam-family-library implementation.

No VOID database writes, environment files, saved tokens or account changes.
Usage: tmp\steam-family-proof\python\python.exe scripts\steam-family-probe.py
"""
import base64
import contextlib
import getpass
import hashlib
import importlib.util
import io
import json
import sys
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "tmp/steam-family-proof/steam_family_library.py"
UPSTREAM_SHA = "4fe68fe7731fa9a27ab181a1286e5ef6d8c05b08540c75607cdd8be100af5a9c"
METHODS = {"IFamilyGroupsService/GetFamilyGroupForUser/v1", "IFamilyGroupsService/GetSharedLibraryApps/v1"}
TARGETS = {367520: "Hollow Knight", 2552430: "Kingdom Hearts 1.5+2.5", 2552440: "Kingdom Hearts 2.8", 2552450: "Kingdom Hearts III"}


class ProbeError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ProbeError("STEAM_REDIRECT_REFUSED")


def upstream_module():
    if not UPSTREAM.exists() or hashlib.sha256(UPSTREAM.read_bytes()).hexdigest() != UPSTREAM_SHA:
        raise ProbeError("UPSTREAM_SOURCE_MISSING_OR_CHANGED")
    spec = importlib.util.spec_from_file_location("steam_family_library_audited", UPSTREAM)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def token_identity(token):
    try:
        parts = token.split(".")
        if len(parts) != 3 or len(token) > 16384:
            raise ValueError()
        claims = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
        identity = claims["sub"]
        if not isinstance(identity, str) or len(identity) != 17 or not identity.isascii() or not identity.isdigit():
            raise ValueError()
        if type(claims.get("exp")) is not int or claims["exp"] <= time.time():
            raise ProbeError("STEAM_TOKEN_EXPIRED")
        return identity
    except ProbeError:
        raise
    except Exception:
        raise ProbeError("STEAM_TOKEN_INVALID") from None


class SteamReadOnly:
    def __init__(self, token, opener=None):
        self.token = token
        self.identity = token_identity(token)
        self.opener = opener or urllib.request.build_opener(NoRedirect()).open
        self.apps = None

    def get(self, method, params):
        if method not in METHODS or params.get("access_token") != self.token:
            raise ProbeError("UNEXPECTED_STEAM_REQUEST")
        params = dict(params)
        # Pin the activity view to the authenticated person, never a family owner.
        params["steamid"] = self.identity
        url = "https://api.steampowered.com/" + method + "/?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, headers={"User-Agent": "VOID-Steam-Family-Probe/1.0", "Cache-Control": "no-store"})
        try:
            with self.opener(request, timeout=20) as response:
                body = response.read(16 * 1024 * 1024 + 1)
                if len(body) > 16 * 1024 * 1024:
                    raise ProbeError("STEAM_RESPONSE_TOO_LARGE")
                payload = json.loads(body).get("response")
        except urllib.error.HTTPError as error:
            # Never print a provider body, exception URL or the credential.
            raise ProbeError("STEAM_HTTP_" + str(error.code)) from None
        except ProbeError:
            raise
        except Exception:
            raise ProbeError("STEAM_UNAVAILABLE_OR_INVALID_RESPONSE") from None
        if not isinstance(payload, dict):
            raise ProbeError("STEAM_INVALID_RESPONSE")
        if method.endswith("GetFamilyGroupForUser/v1"):
            if payload.get("is_not_member_of_any_group") or not str(payload.get("family_groupid", "")).isdigit():
                raise ProbeError("STEAM_FAMILY_NOT_FOUND")
        else:
            if str(payload.get("owner_steamid")) != self.identity:
                raise ProbeError("STEAM_ACTIVITY_IDENTITY_UNCONFIRMED")
            if not isinstance(payload.get("apps"), list):
                raise ProbeError("STEAM_LIBRARY_INCOMPLETE")
            self.apps = payload["apps"]
        return payload


def activity_report(apps, identity, now=None):
    now = time.time() if now is None else now
    listed, played = {}, {}
    for app in apps:
        appid = app.get("appid")
        if type(appid) is not int or not 0 < appid <= 4294967295 or app.get("app_type", 1) != 1:
            continue
        listed[appid] = app
        minutes, last = app.get("rt_playtime"), app.get("rt_last_played")
        minutes = minutes if type(minutes) is int and 0 <= minutes <= 2147483647 else None
        last = last if type(last) is int and 0 < last <= now else None
        if not (minutes is not None and minutes > 0) and last is None:
            continue
        played[appid] = {"appid": appid, "minutes": minutes, "last_played_unix": last,
                         "shared": identity not in [str(owner) for owner in app.get("owner_steamids", [])]}
    return {"status": "ok", "source_sha256": UPSTREAM_SHA,
            "counts": {"listed_games": len(listed), "played_with_evidence": len(played),
                       "shared_played_with_evidence": sum(game["shared"] for game in played.values()),
                       "without_activity_evidence": len(listed) - len(played)},
            "targets": [{"appid": appid, "title": title, "listed": appid in listed,
                         "activity_confirmed": appid in played, **played.get(appid, {})} for appid, title in TARGETS.items()]}


def run_probe(token, opener=None):
    upstream = upstream_module()
    client = SteamReadOnly(token, opener)
    # Execute the actual upstream fetch function with guarded HTTP and no output
    # of family names/member IDs. Its CLI/export functions are never called.
    with patch.object(upstream, "api_get", client.get), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        try:
            upstream.fetch(token, True, False)
        except SystemExit:
            raise ProbeError("UPSTREAM_REFUSED_RESPONSE") from None
    return activity_report(client.apps, client.identity)


def main():
    print("Teste local Steam Families - somente leitura. Nao altera sua conta ou o VOID.")
    print("1. No navegador conectado a Steam, abra:")
    print("   https://store.steampowered.com/pointssummary/ajaxgetasyncconfig")
    print("2. Copie apenas o valor de webapi_token. Nao cole no chat.")
    print("3. Cole abaixo. A entrada fica oculta e nao vai para arquivo ou historico.")
    if not sys.stdin.isatty():
        raise ProbeError("INTERACTIVE_TERMINAL_REQUIRED")
    token = getpass.getpass("Token Steam (oculto): ").strip().strip('"')
    try:
        report = run_probe(token)
    except ProbeError as error:
        report = {"status": "error", "code": str(error)}
    finally:
        token = None
    destination = ROOT / "tmp/steam-family-proof/result.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("Resultado sem token, SteamID ou membros da familia: " + str(destination))


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("Teste cancelado. Nenhuma conta foi alterada.")
    except ProbeError as error:
        print("Teste indisponivel: " + str(error))
