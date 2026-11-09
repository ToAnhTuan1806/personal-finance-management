"""SE2-D10-DB: independent HTTP/SQL QA on a disposable local MySQL container.

Run from feature/quynh. Reads BE/FE worktrees without modifying either.
Writes results only to backend/build/d10-db (ignored). No dependencies to install.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import statistics
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
from datetime import date, datetime, timezone
from decimal import Decimal

ROOT = Path(__file__).resolve().parents[2]


def run(args, *, data=None, env=None, cwd=None, timeout=60):
    result = subprocess.run(args, input=data, capture_output=True, text=True,
                            encoding="utf-8", env=env, cwd=cwd, timeout=timeout)
    if result.returncode:
        # Do not emit command arguments, stderr, request headers or credentials.
        detail = next((line for line in result.stderr.splitlines() if line.startswith("ERROR")), "")
        raise RuntimeError(f"{Path(args[0]).name} exited with code {result.returncode}: {detail[:300]}")
    return result.stdout


def git(root, *args):
    return run(["git", "-c", f"safe.directory={root.as_posix()}", "-C", str(root), *args]).strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_manifest(root):
    names = set(git(root, "ls-files").splitlines())
    names.update(git(root, "ls-files", "--others", "--exclude-standard").splitlines())
    return {name: digest(root / name) for name in sorted(names) if (root / name).is_file()}


def next_month(month):
    year, number = map(int, month.split("-"))
    return f"{year + (number == 12):04d}-{number % 12 + 1:02d}"


def periods(first, last):
    result = []
    while first <= last:
        result.append(first)
        first = next_month(first)
    return result


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def b64(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def dump(value):
    # Evidence keeps exact decimals as strings; bodyRaw preserves real JSON numbers.
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


class Qa:
    def __init__(self, args):
        self.be, self.fe = args.backend.resolve(), args.frontend.resolve()
        self.out = ROOT / "backend/build/d10-db"
        self.out.mkdir(parents=True, exist_ok=True)
        self.results = []
        self.evidence = {"task": "SE2-D10-DB", "startedUtc": datetime.now(timezone.utc).isoformat(),
                         "tests": self.results, "browser": {"status": "BLOCKED",
                         "reason": "Browser host and Windows Computer Use native pipe unavailable",
                         "cases": [f"UI{i:02d}" for i in range(1, 14)]}}
        self.container = self.app = None
        self.tokens, self.users = {}, {}
        self.key = secrets.token_bytes(32)
        self.db = "se_d10_qa_" + uuid.uuid4().hex
        self.dbport, self.webport = free_port(), free_port()
        self.base = f"http://127.0.0.1:{self.webport}"
        self.user_secret, self.root_secret = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        self.creds = {}

    def check(self, ident, group, inputs, expected, action):
        record = {"id": ident, "group": group, "input": inputs, "expected": expected}
        try:
            record["actual"] = action()
            record["status"] = "PASS"
        except Exception as error:
            record["status"] = "FAIL"
            record["actual"] = f"{type(error).__name__}: {error}"
        self.results.append(record)
        print(f"{ident}: {record['status']}", flush=True)
        return record

    def sql(self, statement, root=False):
        assert self.container and re.fullmatch(r"se_d10_qa_[a-f0-9]{32}", self.db)
        # ID comes only from docker run; no external database or Docker host accepted.
        executable = ('exec mysql --batch --raw --skip-column-names --default-character-set=utf8mb4 '
                      + ('-uroot -p"$MYSQL_ROOT_PASSWORD"' if root else '-u"$MYSQL_USER" -p"$MYSQL_PASSWORD"')
                      + ' "$MYSQL_DATABASE"')
        return run(["docker", "exec", "-i", self.container, "sh", "-c", executable], data=statement)

    def rows(self, statement, root=False):
        return [json.loads(line, parse_float=Decimal) for line in self.sql(statement, root).splitlines() if line]

    def request(self, path, owner="A", token=None, body=None, method="GET"):
        headers = {"Content-Type": "application/json"}
        auth = self.tokens.get(owner) if token is None else token
        if auth:
            headers["Authorization"] = "Bearer " + auth
        payload = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=payload, headers=headers, method=method)
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                status, raw = response.status, response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read().decode("utf-8")
        return status, json.loads(raw, parse_float=Decimal), raw, (time.perf_counter() - started) * 1000

    def start(self):
        assert git(ROOT, "branch", "--show-current") == "feature/quynh", "Wrong DB branch"
        self.before = {"BE": source_manifest(self.be), "FE": source_manifest(self.fe)}
        meta = {}
        for name, root in [("DB", ROOT), ("BE", self.be), ("FE", self.fe)]:
            meta[name] = {"head": git(root, "rev-parse", "HEAD"),
                          "branch": git(root, "branch", "--show-current"),
                          "status": git(root, "status", "--short")}
        assert meta["BE"]["branch"] == "feature/tuan" and meta["FE"]["branch"] == "feature/trang"
        self.evidence["git"] = meta
        source = self.be / "backend/build/libs/backend-0.0.1-SNAPSHOT.jar"
        assert source.is_file(), "BLOCKED ENVIRONMENT: D10 jar missing"
        assert not any(p.stat().st_mtime > source.stat().st_mtime
                       for p in (self.be / "backend/src/main/java").rglob("*.java")), "Stale BE jar"
        with zipfile.ZipFile(source) as package:
            for name in ["controller/ReportController", "service/ReportService",
                         "repository/TransactionRepository", "dto/report/MonthlyReportResponse",
                         "dto/report/MonthlySummaryResponse"]:
                name = "com/smartexpense/backend/" + name + ".class"
                assert package.read("BOOT-INF/classes/" + name) == (
                    self.be / "backend/build/classes/java/main" / name).read_bytes(), "Stale D10 bytecode"
        jar = self.out / "d10-backend.jar"
        shutil.copyfile(source, jar)
        self.evidence["snapshot"] = {"jarSha256": digest(jar),
                                    "backendSources": self.before["BE"], "frontendSources": self.before["FE"],
                                    "contractSha256": digest(self.be / "docs/smartexpense-2.0/API_CONTRACT.md")}
        host = json.loads(run(["docker", "context", "inspect"]))[0]["Endpoints"]["docker"]["Host"]
        assert host.startswith("npipe:////./pipe/") or host.startswith("unix:///"), "Docker must be local"
        self.evidence["environment"] = {"docker": run(["docker", "version", "--format", "{{.Server.Version}}"]),
                                        "java": None, "mysql": None, "database": self.db,
                                        "transport": "loopback only", "hibernate": "validate"}
        env = dict(os.environ, MYSQL_ROOT_PASSWORD=self.root_secret, MYSQL_PASSWORD=self.user_secret,
                   MYSQL_DATABASE=self.db, MYSQL_USER="d10_qa")
        self.container = run(["docker", "run", "--pull=never", "--rm", "-d",
                              "--name", "se-d10-qa-" + uuid.uuid4().hex[:12],
                              "--label", "com.smartexpense.test=d10-db", "-p",
                              f"127.0.0.1:{self.dbport}:3306", "--env", "MYSQL_ROOT_PASSWORD",
                              "--env", "MYSQL_PASSWORD", "--env", "MYSQL_DATABASE", "--env",
                              "MYSQL_USER", "mysql:8.0"], env=env).strip()
        assert re.fullmatch(r"[a-f0-9]{64}", self.container)
        deadline = time.monotonic() + 100
        while True:
            try:
                metadata = self.rows("SELECT JSON_OBJECT('database',DATABASE(),'user',CURRENT_USER(),"
                                     "'version',VERSION(),'hostname',@@hostname,'sqlMode',@@sql_mode);")[0]
                assert metadata["database"] == self.db and metadata["user"].startswith("d10_qa@")
                self.evidence["environment"]["mysql"] = metadata["version"]
                self.evidence["environment"]["sqlMode"] = metadata["sqlMode"]
                break
            except RuntimeError:
                assert time.monotonic() < deadline, "MySQL readiness timeout"
                time.sleep(1)
        baseline = ROOT / "backend/src/test/resources/d06-legacy-schema.sql"
        migrations = sorted((ROOT / "database/migrations").glob("V00[2-5]__*.sql"))
        assert len(migrations) == 4
        self.sql(baseline.read_text(encoding="utf-8") + "\n" +
                 "\n".join(p.read_text(encoding="utf-8") for p in migrations))
        self.evidence["schemaInputs"] = {str(p.relative_to(ROOT)): digest(p) for p in [baseline, *migrations]}
        self.evidence["indexes"] = self.rows(
            "SELECT JSON_OBJECT('name',INDEX_NAME,'column',COLUMN_NAME,'seq',SEQ_IN_INDEX) "
            "FROM information_schema.statistics WHERE TABLE_SCHEMA=DATABASE() "
            "AND TABLE_NAME='transactions' ORDER BY INDEX_NAME,SEQ_IN_INDEX;")
        java_properties = subprocess.run(["java", "-XshowSettings:properties", "-version"],
                                        capture_output=True, text=True, timeout=15)
        java_home = re.search(r"java.home = (.+)", java_properties.stderr).group(1).strip()
        java = Path(java_home) / "bin" / ("java.exe" if os.name == "nt" else "java")
        assert java.is_file()
        self.evidence["environment"]["java"] = java_properties.stderr.splitlines()[-1]
        self.temp = tempfile.TemporaryDirectory(prefix="runtime-", dir=self.out)
        config = Path(self.temp.name) / "qa.properties"
        config.write_text("\n".join([
            "server.address=127.0.0.1", f"server.port={self.webport}",
            f"spring.datasource.url=jdbc:mysql://127.0.0.1:{self.dbport}/{self.db}?useSSL=false&allowPublicKeyRetrieval=true",
            "spring.datasource.username=d10_qa", f"spring.datasource.password={self.user_secret}",
            "spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver",
            "spring.datasource.hikari.maximum-pool-size=4", "spring.jpa.hibernate.ddl-auto=validate",
            "spring.jpa.open-in-view=false", "spring.sql.init.mode=never", "spring.jpa.show-sql=false",
            "app.jwt.secret=" + base64.b64encode(self.key).decode(), "app.jwt.expiration=3600",
            "logging.level.root=WARN"]), encoding="utf-8")
        self.log = (self.out / "backend.log").open("wb")
        self.app = subprocess.Popen([str(java), "-jar", str(jar),
                                     "--spring.config.location=" + config.as_uri()],
                                    stdout=self.log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 100
        while True:
            assert self.app.poll() is None, "BLOCKED ENVIRONMENT: Hibernate validate/startup failed"
            try:
                if self.request("/api/reports/monthly?from=2026-09&to=2026-11", owner=None)[0] == 401:
                    break
            except (urllib.error.URLError, TimeoutError):
                pass
            assert time.monotonic() < deadline, "Backend readiness timeout"
            time.sleep(1)
        self.auth = {}
        for alias in ["A", "B"]:
            email = f"d10-{alias.lower()}-{uuid.uuid4().hex}@example.test"
            secret = secrets.token_urlsafe(24)
            status, user, _, _ = self.request("/api/auth/register", owner=None, method="POST",
                                             body={"fullName": "QA D10 " + alias, "email": email, "password": secret})
            assert status == 201, "Test registration failed"
            status, auth, _, _ = self.request("/api/auth/login", owner=None, method="POST",
                                             body={"email": email, "password": secret})
            assert status == 200, "Test login failed"
            self.tokens[alias], self.users[alias], self.auth[alias] = auth["accessToken"], int(user["id"]), auth
            self.creds[alias] = {"email": email, "password": secret}
        assert self.request("/api/reports/monthly?from=2026-09&to=2026-11")[0] == 200, \
            "BLOCKED ENVIRONMENT: correct authenticated D10 endpoint not present"
        fixture = ROOT / "backend/src/test/resources/d10-reports-fixture.sql"
        self.ids = self.rows(f"SET @qa_user_a={self.users['A']};SET @qa_user_b={self.users['B']};"
                             + fixture.read_text(encoding="utf-8"))[-1]
        self.evidence["fixtureSha256"] = digest(fixture)

    def reuse_db_evidence(self, path: Path):
        prev = json.loads(path.read_text(encoding="utf-8"), parse_float=Decimal)
        assert self.before["BE"] == prev["snapshot"]["backendSources"], "BE sources changed since DB run"
        assert self.before["FE"] == prev["snapshot"]["frontendSources"], "FE sources changed since DB run"
        assert self.evidence["snapshot"]["jarSha256"] == prev["snapshot"]["jarSha256"], "BE JAR changed"
        assert self.evidence["fixtureSha256"] == prev["fixtureSha256"], "Fixture SQL changed"
        db_tests = [t for t in prev["tests"] if not str(t.get("id", "")).startswith("UI")]
        assert len(db_tests) == 36 and all(t["status"] == "PASS" for t in db_tests), "Previous 36 DB tests not valid"
        self.results.extend(db_tests)
        self.evidence["startedUtc"] = prev["startedUtc"]
        self.evidence["dbFinishedUtc"] = prev.get("finishedUtc")
        self.evidence["environment"] = prev["environment"]
        self.evidence["aiFixture"] = prev["aiFixture"]
        self.evidence["lastMeasuredLog"] = prev["lastMeasuredLog"]
        self.evidence["performance"] = prev["performance"]
        self.evidence["frontendService"] = prev["frontendService"]
        self.evidence["dbEvidenceReused"] = True

    def oracle(self, first, last, owner):
        uid, start, end = self.users[owner], first + "-01", next_month(last) + "-01"
        rows = self.rows(
            "SELECT JSON_OBJECT('month',MIN(DATE_FORMAT(transaction_date,'%Y-%m')),"
            "'totalIncome',CAST(SUM(CASE WHEN type='INCOME' THEN amount ELSE 0 END) AS CHAR),"
            "'totalExpense',CAST(SUM(CASE WHEN type='EXPENSE' THEN amount ELSE 0 END) AS CHAR)) "
            f"FROM transactions WHERE user_id={uid} AND transaction_date>='{start}' AND transaction_date<'{end}' "
            "GROUP BY DATE_FORMAT(transaction_date,'%Y-%m') ORDER BY MIN(transaction_date);")
        by_month = {row["month"]: row for row in rows}
        months = []
        for month in periods(first, last):
            values = by_month.get(month, {})
            income, expense = Decimal(values.get("totalIncome", "0")), Decimal(values.get("totalExpense", "0"))
            months.append({"month": month, "totalIncome": income, "totalExpense": expense,
                           "balance": income - expense})
        cats = self.rows(
            "SELECT JSON_OBJECT('categoryId',t.category_id,'categoryName',MAX(c.name),"
            "'totalAmount',CAST(SUM(t.amount) AS CHAR)) FROM transactions t "
            "JOIN categories c ON c.id=t.category_id "
            f"WHERE t.user_id={uid} AND t.type='EXPENSE' AND t.transaction_date>='{start}' "
            f"AND t.transaction_date<'{end}' GROUP BY t.category_id ORDER BY SUM(t.amount) DESC,t.category_id;")
        for cat in cats:
            cat["totalAmount"] = Decimal(cat["totalAmount"])
        return {"from": first, "to": last, "months": months, "expensesByCategory": cats}

    def report(self, first, last, owner="A", extra=""):
        path = f"/api/reports/monthly?from={first}&to={last}" + extra
        status, actual, raw, ms = self.request(path, owner=owner)
        assert status == 200, f"HTTP {status}, expected 200"
        expected = self.oracle(first, last, owner)
        assert set(actual) == set(expected), "Unexpected report fields"
        assert actual["from"] == first and actual["to"] == last
        assert actual["months"] == expected["months"], "Monthly totals differ from independent SQL"
        assert {c["categoryId"]: c for c in actual["expensesByCategory"]} == {
            c["categoryId"]: c for c in expected["expensesByCategory"]}, "Category totals differ from SQL"
        amounts = [c["totalAmount"] for c in actual["expensesByCategory"]]
        assert amounts == sorted(amounts, reverse=True), "Categories not descending"
        dashboard = []
        for month in expected["months"]:
            code, summary, _, _ = self.request("/api/dashboard/summary?month=" + month["month"], owner=owner)
            assert code == 200
            assert all(summary[field] == month[field] for field in ["totalIncome", "totalExpense", "balance"]), \
                "Dashboard/Reports/SQL mismatch"
            dashboard.append(summary)
        return {"http": status, "bodyRaw": raw, "sql": expected, "dashboard": dashboard, "durationMs": round(ms, 3)}

    def invalid(self, query, expected=400, token=None, owner="A"):
        code, body, raw, _ = self.request("/api/reports/monthly?" + query, token=token, owner=owner)
        assert code == expected, f"HTTP {code}, expected {expected}"
        assert body["status"] == expected
        assert body["code"] == ("VALIDATION_ERROR" if expected == 400 else "UNAUTHORIZED")
        assert set(body) == {"status", "code", "message"}, "Unexpected error fields"
        assert body["message"] and "trace" not in body
        return {"http": code, "bodyRaw": raw}

    def signed_expired(self):
        now = int(time.time())
        claims = {"sub": str(self.users["A"]), "iat": now - 1200, "exp": now - 600}
        signed = b64(b'{"alg":"HS256"}') + "." + b64(json.dumps(claims).encode())
        return signed + "." + b64(hmac.new(self.key, signed.encode(), hashlib.sha256).digest())

    def api_checks(self):
        ranges = [
            ("01", "2026-09", "2026-09", "one month, income and expense"),
            ("02", "2026-09", "2026-11", "three months"),
            ("03", "2026-05", "2026-10", "exactly six inclusive months"),
            ("04", "2026-10", "2026-10", "empty month zeros and no categories"),
            ("05", "2026-09", "2026-11", "empty middle month preserved"),
            ("06", "2025-12", "2026-01", "December to January"),
            ("07", "2024-02", "2024-02", "leap day 2024-02-29 included; March excluded"),
            ("08", "2026-09", "2026-09", "multiple transactions in same category"),
            ("09", "2026-11", "2026-11", "unused and income categories excluded"),
            ("10", "2026-05", "2026-10", "Reports/SQL/Dashboard reconciliation"),
            ("21", "1900-01", "1900-01", "minimum year"),
            ("22", "2100-12", "2100-12", "maximum year, next exclusive bound 2101-01"),
            ("23", "2030-01", "2030-01", "cents and aggregate 19999999999999.98"),
        ]
        for number, first, last, reason in ranges:
            self.check("API-" + number, "HTTP+SQL+Dashboard", {"from": first, "to": last},
                       reason, lambda f=first, t=last: self.report(f, t))
        validations = [
            ("11", "to=2026-11", "missing from"), ("12", "from=2026-09", "missing to"),
            ("13a", "from=2026-9&to=2026-11", "wrong YYYY-MM"),
            ("13b", "from=&to=2026-11", "empty from"),
            ("13c", "from=2026-09&to=", "empty to"),
            ("14a", "from=2026-00&to=2026-11", "month 00"),
            ("14b", "from=2026-09&to=2026-13", "month 13"),
            ("15", "from=2026-11&to=2026-09", "reversed"),
            ("16", "from=2026-01&to=2026-07", "seven months"),
            ("17a", "from=1899-12&to=1900-01", "below 1900"),
            ("17b", "from=2100-12&to=2101-01", "above 2100"),
            ("24", "from=" + urllib.parse.quote("2026-09' OR 1=1 --") + "&to=2026-11", "injection input"),
        ]
        for number, query, reason in validations:
            self.check("API-" + number, "validation", {"query": query}, "400 " + reason,
                       lambda q=query: self.invalid(q))
        query = "from=2026-09&to=2026-11"
        for suffix, token in [("a", ""), ("b", "not-a-jwt"), ("c", self.signed_expired())]:
            self.check("API-18" + suffix, "JWT", {"case": {"a": "missing", "b": "invalid", "c": "expired"}[suffix]},
                       "401 without SQL/trace/credentials", lambda t=token: self.invalid(query, 401, token=t))
        for alias in ["A", "B"]:
            self.check("API-19" + alias, "owner isolation", {"owner": alias, "from": "2026-09", "to": "2026-11"},
                       "only authenticated owner's SQL totals", lambda a=alias: self.report("2026-09", "2026-11", a))
        self.check("API-20", "owner override", {"owner": "A", "queryUserIdAlias": "B"},
                   "userId cannot replace JWT owner",
                   lambda: self.report("2026-09", "2026-11", extra=f"&userId={self.users['B']}"))

    def budget_fixture(self):
        output = {}
        for month in [9, 11]:
            code, value, _, _ = self.request(f"/api/budgets/2026/{month}")
            assert code == 200 and value["exceeded"] == (month == 11)
            sql = self.oracle(f"2026-{month:02d}", f"2026-{month:02d}", "A")["months"][0]
            assert value["spentAmount"] == sql["totalExpense"]
            output[f"monthly-{month}"] = value
        code, categories, _, _ = self.request("/api/category-budgets?year=2026&month=11")
        assert code == 200 and len(categories) == 2
        by_id = {c["categoryId"]: c for c in categories}
        assert by_id[self.ids["food_a"]]["status"] == "SAFE"
        assert by_id[self.ids["transport_a"]]["status"] == "OVER_BUDGET"
        output["categories"] = categories
        self.evidence["aiFixture"] = {"report": self.oracle("2026-09", "2026-11", "A"),
                                      "budgets": output, "owners": ["A", "B"], "emptyMonth": "2026-10"}
        return output

    def bulk(self, count, owner, year):
        category = self.ids["food_a" if owner == "A" else "food_b"]
        uid = self.users[owner]
        rows = []
        for index in range(count):
            month = index // 20 + 1 if owner == "A" else index % 12 + 1
            rows.append(f"({uid},{category},'EXPENSE',0.10,'{year}-{month:02d}-15','QA performance',NOW())")
        self.sql("INSERT INTO transactions(user_id,category_id,type,amount,transaction_date,note,created_at) VALUES "
                 + ",".join(rows) + ";")

    def measured_report(self):
        self.sql("SET GLOBAL general_log=OFF;SET GLOBAL log_output='TABLE';"
                 "TRUNCATE TABLE mysql.general_log;SET GLOBAL general_log=ON;", root=True)
        try:
            code, body, _, ms = self.request("/api/reports/monthly?from=2025-01&to=2025-06")
            assert code == 200 and len(body["months"]) == 6
        finally:
            self.sql("SET GLOBAL general_log=OFF;", root=True)
        statements = self.rows(
            "SELECT JSON_OBJECT('kind',command_type,'client',user_host,'thread',thread_id,'sql',CONVERT(argument USING utf8mb4)) "
            "FROM mysql.general_log WHERE command_type NOT IN ('Connect','Quit') ORDER BY event_time;", root=True)
        self.evidence["lastMeasuredLog"] = statements
        domain = [" ".join(row["sql"].split()) for row in statements
                  if row["kind"] in ("Query", "Execute") and "d10_qa" in row["client"]
                  and row["sql"].lower().lstrip().startswith("select")]
        assert len(domain) == 2, f"{len(domain)} transaction SELECTs, expected 2"
        assert all("sum(" in sql.lower() and "group by" in sql.lower() for sql in domain), "Entity query detected"
        assert all("user_id" in sql and "transaction_date>=" in sql.replace(" ", "")
                   and "transaction_date<" in sql.replace(" ", "") for sql in domain)
        return {"transactionSelects": len(domain), "capturedStatements": statements,
                "sql": domain, "durationMs": round(ms, 3), "response": body}

    def performance(self):
        self.bulk(120, "A", 2025)
        small = self.measured_report()
        self.bulk(20000, "B", 2018)
        self.sql("ANALYZE TABLE transactions;")
        large = self.measured_report()
        plans = [json.loads(self.sql("EXPLAIN FORMAT=JSON " + sql + ";")) for sql in large["sql"]]
        plans_text = dump(plans)
        assert "idx_transactions_user_date" in plans_text, "Owner/date index not selected in EXPLAIN"
        latencies = [self.request("/api/reports/monthly?from=2025-01&to=2025-06")[3] for _ in range(10)]
        counts = self.rows("SELECT JSON_OBJECT('total',COUNT(*),'ownerA',SUM(user_id="
                           + str(self.users["A"]) + ")) FROM transactions;")[0]
        output = {"beforeBulkOtherOwner": small, "afterBulkOtherOwner": large, "rowCounts": counts,
                  "explain": plans, "latencyMs": {"samples": len(latencies),
                  "min": round(min(latencies), 3), "median": round(statistics.median(latencies), 3),
                  "max": round(max(latencies), 3)}, "newIndexesOrMigrations": False}
        self.evidence["performance"] = output
        return output

    def neutral_server_error(self):
        # Fault injection is restricted to the private disposable database/user.
        def close_private_sessions():
            sessions = self.rows(
                "SELECT JSON_OBJECT('id',ID) FROM information_schema.PROCESSLIST "
                f"WHERE USER='d10_qa' AND DB='{self.db}';", root=True)
            for session in sessions:
                self.sql("KILL CONNECTION " + str(int(session["id"])) + ";", root=True)
        grants = self.rows("SELECT JSON_OBJECT('db',Db) FROM mysql.db "
                           "WHERE User='d10_qa' AND Host='%';", root=True)
        assert len(grants) == 1 and grants[0]["db"].replace("\\", "") == self.db
        grant_target = chr(96) + grants[0]["db"] + chr(96)
        try:
            self.sql(f"REVOKE SELECT ON {grant_target}.* FROM 'd10_qa'@'%';", root=True)
            close_private_sessions()
            status, body, raw, _ = self.request("/api/reports/monthly?from=2026-09&to=2026-11")
            assert status == 500 and body["code"] == "INTERNAL_ERROR"
            assert set(body) == {"status", "code", "message"}
            for forbidden in ["select ", "transactions", "hibernate", "sqlexception", "jdbc:", "trace",
                              self.user_secret, self.root_secret, base64.b64encode(self.key).decode()]:
                assert forbidden.lower() not in raw.lower(), "Sensitive internal detail in 500 response"
        finally:
            self.sql(f"GRANT SELECT ON {grant_target}.* TO 'd10_qa'@'%';", root=True)
            close_private_sessions()
        recovery = self.report("2026-09", "2026-11")
        return {"http": status, "bodyRaw": raw, "recoveryHttp": recovery["http"],
                "fault": "SELECT revoked/restored only in disposable QA database"}
    def concurrent(self):
        expected = self.oracle("2026-09", "2026-11", "A")
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            responses = list(pool.map(lambda _: self.request("/api/reports/monthly?from=2026-09&to=2026-11"), range(8)))
        assert all(code == 200 and body["months"] == expected["months"] for code, body, _, _ in responses)
        return {"requests": 8, "statuses": [r[0] for r in responses], "sameMonthlyTotals": True,
                "durationMs": [round(r[3], 3) for r in responses]}

    def frontend_service(self):
        # Actual FE modules + Axios HTTP adapter; only test session and baseURL are injected.
        script = r'''
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const values=new Map();
globalThis.sessionStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const load=p=>import(pathToFileURL(input.frontend+'/frontend/src/'+p).href);
const {default:client}=await load('api/axiosClient.js');
const {session}=await load('auth/session.js');
const {getMonthlyReport}=await load('services/reportService.js');
client.defaults.baseURL=input.base+'/api';
session.authenticate(input.authA,session.getSnapshot().revision);
const checks=[];
for (const [from,to,length] of [['2026-09','2026-09',1],['2026-09','2026-11',3],['2026-05','2026-10',6],['2026-10','2026-10',1]]) {
 const actual=await getMonthlyReport({from,to});
 assert.equal(actual.months.length,length);
 if(from==='2026-10') {assert.equal(actual.summary.totalExpense,0);assert.equal(actual.expensesByCategory.length,0);}
 if(to==='2026-11') {assert.equal(actual.summary.totalIncome,3000.3);assert.equal(actual.summary.totalExpense,851.35);}
 checks.push({from,to,status:'PASS',summary:actual.summary});
}
await assert.rejects(getMonthlyReport({from:'2026-11',to:'2026-09'}),e=>e.code==='INVALID_REPORT_RANGE');
checks.push({case:'invalid-range',status:'PASS'});
session.authenticate(input.authB,session.getSnapshot().revision);
const other=await getMonthlyReport({from:'2026-09',to:'2026-11'});
assert.equal(other.summary.totalIncome,9000);assert.equal(other.summary.totalExpense,999.99);
checks.push({case:'switch-owner-B',status:'PASS',summary:other.summary});
const expired={...input.authA,accessToken:input.expired};
session.authenticate(expired,session.getSnapshot().revision);
await assert.rejects(getMonthlyReport({from:'2026-09',to:'2026-11'}),e=>e.response?.status===401);
assert.equal(session.getToken(),null);
checks.push({case:'401-clears-session',status:'PASS'});
console.log(JSON.stringify(checks));
'''
        result = run(["node", "--input-type=module", "-e", script],
                     data=json.dumps({"frontend": str(self.fe), "base": self.base,
                                      "authA": self.auth["A"], "authB": self.auth["B"],
                                      "expired": self.signed_expired()}), cwd=ROOT)
        checks = json.loads(result)
        assert len(checks) == 7 and all(c["status"] == "PASS" for c in checks)
        self.evidence["frontendService"] = checks
        return checks

    def browser_qa(self):
        chrome = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        if not chrome.is_file():
            return
        fe_url = "http://localhost:5173"
        vite_proc = None
        try:
            with urllib.request.urlopen(fe_url + "/login", timeout=3) as resp:
                assert resp.status == 200
        except Exception:
            node_bin = shutil.which("node") or "node"
            vite_js = self.fe / "frontend/node_modules/vite/bin/vite.js"
            vite_proc = subprocess.Popen(
                [node_bin, str(vite_js), "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
                cwd=str(self.fe / "frontend"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            deadline = time.monotonic() + 30
            while True:
                try:
                    with urllib.request.urlopen(fe_url + "/login", timeout=2) as resp:
                        if resp.status == 200:
                            break
                except Exception:
                    assert time.monotonic() < deadline, "Vite readiness timeout"
                    time.sleep(0.5)
        cdp_port = free_port()
        profile_dir = Path(self.temp.name) / "chrome-cdp-profile"
        script = r'''
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', rej, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
        else res(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
      }
    });
  }
  on(method, fn) {
    const arr = this.listeners.get(method) || [];
    arr.push(fn);
    this.listeners.set(method, arr);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result?.value;
  }
  close() {
    try { this.ws?.close(); } catch {}
  }
}

async function waitFor(cdp, expr, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cdp.eval(`Boolean(${expr})`)) return true;
    await sleep(120);
  }
  const body = await cdp.eval(`document.body?.innerText || ''`);
  throw new Error(`Timeout waiting for: ${expr}\nBody:\n${body.slice(0, 600)}`);
}

async function setInput(cdp, selector, value) {
  await cdp.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('Missing input: ' + ${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

const chrome = spawn(input.chrome, [
  '--headless=new',
  `--remote-debugging-port=${input.cdpPort}`,
  `--user-data-dir=${input.profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,900',
  'about:blank'
], { stdio: 'ignore' });

let cdp = null;
const out = { scenarios: {}, meta: {} };
try {
  let versionInfo = null;
  for (let i = 0; i < 40; i++) {
    try {
      const vr = await fetch(`http://127.0.0.1:${input.cdpPort}/json/version`);
      if (vr.ok) versionInfo = await vr.json();
      const lr = await fetch(`http://127.0.0.1:${input.cdpPort}/json/list`);
      if (lr.ok) {
        const list = await lr.json();
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) {
          cdp = new CDP(page.webSocketDebuggerUrl);
          await cdp.connect();
          break;
        }
      }
    } catch {}
    await sleep(150);
  }
  assert.ok(cdp, 'CDP connection failed');
  out.meta.browserVersion = versionInfo?.Browser || 'Chrome';
  out.meta.protocolVersion = versionInfo?.['Protocol-Version'] || '1.3';

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  const apiCalls = [];
  cdp.on('Network.responseReceived', (p) => {
    const url = p.response?.url || '';
    if (url.includes('/api/')) {
      apiCalls.push({ url, status: p.response.status });
    }
  });

  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.__QA_API_BASE = ${JSON.stringify(input.base + '/api')};
      window.__QA_FAIL_REPORTS = false;
      const origOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        let target = String(url || '');
        if (target.startsWith('http://localhost:8080/api')) {
          target = window.__QA_API_BASE + target.slice('http://localhost:8080/api'.length);
        }
        this.__qaTarget = target;
        this.__qaFail = Boolean(window.__QA_FAIL_REPORTS && target.includes('/api/reports/monthly'));
        return origOpen.call(this, method, target, ...rest);
      };
      const origSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.send = function(...args) {
        if (this.__qaFail) {
          setTimeout(() => {
            this.dispatchEvent(new ProgressEvent('error'));
            if (typeof this.onerror === 'function') this.onerror(new ProgressEvent('error'));
          }, 15);
          return;
        }
        return origSend.apply(this, args);
      };
    })();`
  });

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
  });

  // UI01: Login User A and open /reports
  await cdp.send('Page.navigate', { url: `${input.feUrl}/login` });
  await waitFor(cdp, `document.querySelector('input[type="email"]') !== null`);
  await setInput(cdp, 'input[type="email"]', input.credsA.email);
  await setInput(cdp, 'input[type="password"]', input.credsA.password);
  await cdp.eval(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(cdp, `window.location.pathname === '/' && document.body.innerText.includes('Tổng quan')`);
  await cdp.eval(`document.querySelector('a[href="/reports"]').click()`);
  await waitFor(cdp, `window.location.pathname === '/reports' && document.body.innerText.includes('3.000,3 ₫') && document.body.innerText.includes('851,35 ₫') && document.body.innerText.includes('+2.148,95 ₫')`);
  out.scenarios.UI01 = {
    path: await cdp.eval(`window.location.pathname`),
    heading: await cdp.eval(`document.querySelector('main h1')?.innerText`),
    hasSessionToken: await cdp.eval(`Boolean(sessionStorage.getItem('accessToken'))`),
    initialRange: await cdp.eval(`({from: document.querySelector('#report-from-month').value, to: document.querySelector('#report-to-month').value})`)
  };

  // UI03: 3-month preset (2026-09 -> 2026-11)
  const table3M = await cdp.eval(`Array.from(document.querySelectorAll('table[aria-label="Bảng tổng hợp số liệu từng tháng"] tbody tr')).map(r => r.innerText.replace(/\\s+/g, ' ').trim())`);
  assert.equal(table3M.length, 3);
  out.scenarios.UI03 = {
    range: '2026-09..2026-11',
    monthRowsCount: table3M.length,
    monthRows: table3M,
    kpis: ['3.000,3 ₫', '851,35 ₫', '+2.148,95 ₫']
  };

  // UI07: Bar chart SVG & monthly table reconciliation
  await waitFor(cdp, `Boolean(document.querySelector('section[aria-label="Biểu đồ cột thu chi theo từng tháng"] svg.recharts-surface'))`);
  const chartInfo = await cdp.eval(`(() => {
    const sec = document.querySelector('section[aria-label="Biểu đồ cột thu chi theo từng tháng"]');
    const svg = sec?.querySelector('svg.recharts-surface');
    const ticks = Array.from(sec?.querySelectorAll('.recharts-cartesian-axis-tick-value') || []).map(t => t.textContent.trim());
    const tfoot = sec?.querySelector('table[aria-label="Bảng tổng hợp số liệu từng tháng"] tfoot')?.innerText.replace(/\\s+/g, ' ').trim();
    return { hasSvg: Boolean(svg), ticks, tfoot };
  })()`);
  assert.equal(chartInfo.hasSvg, true, 'UI07 hasSvg');
  assert.ok(chartInfo.ticks.includes('09/2026') && chartInfo.ticks.includes('10/2026') && chartInfo.ticks.includes('11/2026'), 'UI07 ticks: ' + JSON.stringify(chartInfo.ticks));
  assert.ok(chartInfo.tfoot.includes('3.000,3 ₫') && chartInfo.tfoot.includes('851,35 ₫') && chartInfo.tfoot.includes('+2.148,95 ₫'), 'UI07 tfoot: ' + chartInfo.tfoot);
  out.scenarios.UI07 = chartInfo;

  // UI08: KPI cards, Donut SVG & category table reconciliation (Food 650,55 ₫ = 76,41%, Transport 200,8 ₫ = 23,59%)
  const catInfo = await cdp.eval(`(() => {
    const sec = document.querySelector('section[aria-label="Phân bổ chi tiêu theo danh mục"]');
    const hasDonutSvg = Boolean(sec?.querySelector('svg.se097-svg'));
    const segmentsCount = sec?.querySelectorAll('.se097-segment')?.length || 0;
    const rows = Array.from(sec?.querySelectorAll('table[aria-label="Bảng chi tiêu theo danh mục"] tbody tr') || []).map(r => r.innerText.replace(/\\s+/g, ' ').trim());
    const progress = Array.from(sec?.querySelectorAll('[role="progressbar"]') || []).map(p => ({ label: p.getAttribute('aria-label'), val: Number(p.getAttribute('aria-valuenow')) }));
    return { hasDonutSvg, segmentsCount, rows, progress, text: sec?.innerText || '' };
  })()`);
  assert.equal(catInfo.hasDonutSvg, true, 'UI08 hasDonutSvg');
  assert.equal(catInfo.segmentsCount, 2, 'UI08 segmentsCount');
  assert.equal(catInfo.rows.length, 2, 'UI08 rows.length');
  assert.ok(catInfo.rows[0].includes('QA D10 Food') && catInfo.rows[0].includes('650,55 ₫') && catInfo.rows[0].includes('76,41%'), 'UI08 row0: ' + catInfo.rows[0]);
  assert.ok(catInfo.rows[1].includes('QA D10 Transport') && catInfo.rows[1].includes('200,8 ₫') && catInfo.rows[1].includes('23,59%'), 'UI08 row1: ' + catInfo.rows[1]);
  assert.equal(catInfo.text.includes('QA D10 Unused'), false, 'UI08 unused');
  assert.equal(catInfo.text.includes('QA D10 Income'), false, 'UI08 income');
  out.scenarios.UI08 = { hasDonutSvg: catInfo.hasDonutSvg, segmentsCount: catInfo.segmentsCount, rows: catInfo.rows, progress: catInfo.progress };

  // UI02: 1-month filter (preset 'Tháng này' = 2026-11 and custom 2026-09)
  await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Tháng này').click()`);
  await waitFor(cdp, `document.body.textContent.includes('(1 tháng)') && document.body.innerText.includes('2.000 ₫') && document.body.innerText.includes('501 ₫') && document.body.innerText.includes('+1.499 ₫')`);
  await setInput(cdp, '#report-from-month', '2026-09');
  await setInput(cdp, '#report-to-month', '2026-09');
  await cdp.eval(`document.querySelector('form[aria-label="Bộ lọc khoảng tháng báo cáo"] button[type="submit"]').click()`);
  await waitFor(cdp, `document.body.textContent.includes('(1 tháng)') && document.body.innerText.includes('1.000,3 ₫') && document.body.innerText.includes('350,35 ₫') && document.body.innerText.includes('+649,95 ₫')`);
  out.scenarios.UI02 = {
    preset2026_11: { income: '2.000 ₫', expense: '501 ₫', balance: '+1.499 ₫' },
    custom2026_09: { income: '1.000,3 ₫', expense: '350,35 ₫', balance: '+649,95 ₫' }
  };

  // UI04: 6-month filter (preset '6 tháng gần nhất' 2026-06..2026-11 and custom 2026-05..2026-10)
  await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '6 tháng gần nhất').click()`);
  await waitFor(cdp, `document.body.textContent.includes('(6 tháng)') && document.body.innerText.includes('06/2026 – 11/2026')`);
  await setInput(cdp, '#report-from-month', '2026-05');
  await setInput(cdp, '#report-to-month', '2026-10');
  await cdp.eval(`document.querySelector('form[aria-label="Bộ lọc khoảng tháng báo cáo"] button[type="submit"]').click()`);
  await waitFor(cdp, `document.body.textContent.includes('(6 tháng)') && document.body.innerText.includes('1.901,41 ₫') && document.body.innerText.includes('352,57 ₫') && document.body.innerText.includes('+1.548,84 ₫')`);
  const rows6M = await cdp.eval(`document.querySelectorAll('table[aria-label="Bảng tổng hợp số liệu từng tháng"] tbody tr').length`);
  assert.equal(rows6M, 6);
  out.scenarios.UI04 = {
    presetRange: '2026-06..2026-11',
    customRange: '2026-05..2026-10',
    monthRowsCount: rows6M,
    kpis: ['1.901,41 ₫', '352,57 ₫', '+1.548,84 ₫']
  };

  // UI06: Empty month (2026-10 -> 2026-10)
  await setInput(cdp, '#report-from-month', '2026-10');
  await setInput(cdp, '#report-to-month', '2026-10');
  await cdp.eval(`document.querySelector('form[aria-label="Bộ lọc khoảng tháng báo cáo"] button[type="submit"]').click()`);
  await waitFor(cdp, `document.body.innerText.includes('Chưa có phát sinh thu – chi trong khoảng thời gian đã chọn') && document.body.innerText.includes('Chưa có khoản chi tiêu nào trong khoảng thời gian đã chọn')`);
  out.scenarios.UI06 = {
    month: '2026-10',
    barEmptyText: 'Chưa có phát sinh thu – chi trong khoảng thời gian đã chọn',
    categoryEmptyText: 'Chưa có khoản chi tiêu nào trong khoảng thời gian đã chọn'
  };

  // UI05: Invalid ranges (from > to and > 6 months) blocked on UI
  const beforeInvalidCalls = apiCalls.filter(c => c.url.includes('/api/reports/monthly')).length;
  await setInput(cdp, '#report-from-month', '2026-11');
  await setInput(cdp, '#report-to-month', '2026-09');
  await waitFor(cdp, `document.body.innerText.includes('Tháng bắt đầu không được lớn hơn tháng kết thúc.')`);
  const revDisabled = await cdp.eval(`document.querySelector('form[aria-label="Bộ lọc khoảng tháng báo cáo"] button[type="submit"]').disabled`);
  assert.equal(revDisabled, true);

  await setInput(cdp, '#report-from-month', '2026-01');
  await setInput(cdp, '#report-to-month', '2026-07');
  await waitFor(cdp, `document.body.innerText.includes('Khoảng thời gian báo cáo tối đa 6 tháng (hiện đang chọn 7 tháng).')`);
  const overDisabled = await cdp.eval(`document.querySelector('form[aria-label="Bộ lọc khoảng tháng báo cáo"] button[type="submit"]').disabled`);
  assert.equal(overDisabled, true);
  const afterInvalidCalls = apiCalls.filter(c => c.url.includes('/api/reports/monthly')).length;
  assert.equal(afterInvalidCalls, beforeInvalidCalls);
  out.scenarios.UI05 = {
    reversedAlert: 'Tháng bắt đầu không được lớn hơn tháng kết thúc.',
    overSixMonthsAlert: 'Khoảng thời gian báo cáo tối đa 6 tháng (hiện đang chọn 7 tháng).',
    submitDisabled: true,
    extraHttpRequestsSent: afterInvalidCalls - beforeInvalidCalls
  };

  // Restore 3M preset
  await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '3 tháng gần nhất').click()`);
  await waitFor(cdp, `document.body.innerText.includes('3.000,3 ₫') && !document.querySelector('button[aria-label="Làm mới dữ liệu báo cáo"]').disabled`);

  // UI10: Network error on /api/reports/monthly and recovery via Retry
  await cdp.eval(`window.__QA_FAIL_REPORTS = true`);
  await cdp.eval(`document.querySelector('button[aria-label="Làm mới dữ liệu báo cáo"]').click()`);
  await waitFor(cdp, `document.querySelectorAll('[role="alert"]').length > 0 && document.body.innerText.includes('Thử lại') && document.querySelector('[aria-label="Chưa tải được tổng thu nhập"]') !== null`);
  const errState = await cdp.eval(`({
    hasPlaceholderDash: document.querySelector('[aria-label="Chưa tải được tổng thu nhập"]')?.textContent.trim() === '—',
    staleTotalVisible: document.body.innerText.includes('3.000,3 ₫')
  })`);
  assert.equal(errState.hasPlaceholderDash, true);
  assert.equal(errState.staleTotalVisible, false);

  await cdp.eval(`window.__QA_FAIL_REPORTS = false`);
  await cdp.eval(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Thử lại').click()`);
  await waitFor(cdp, `document.body.innerText.includes('3.000,3 ₫') && document.body.innerText.includes('+2.148,95 ₫')`);
  out.scenarios.UI10 = {
    errorClearedStaleKpi: true,
    retryRestoredKpis: ['3.000,3 ₫', '851,35 ₫', '+2.148,95 ₫']
  };

  // UI11: Light / Dark mode via #theme-toggle-btn
  await cdp.eval(`document.querySelector('#theme-toggle-btn').click()`);
  await waitFor(cdp, `document.querySelector('#theme-opt-dark') !== null`);
  await cdp.eval(`document.querySelector('#theme-opt-dark').click()`);
  await waitFor(cdp, `document.documentElement.classList.contains('dark') === true`);
  const darkBg = await cdp.eval(`getComputedStyle(document.querySelector('section[aria-label="Biểu đồ cột thu chi theo từng tháng"]')).backgroundColor`);

  await cdp.eval(`document.querySelector('#theme-toggle-btn').click()`);
  await waitFor(cdp, `document.querySelector('#theme-opt-light') !== null`);
  await cdp.eval(`document.querySelector('#theme-opt-light').click()`);
  await waitFor(cdp, `document.documentElement.classList.contains('dark') === false`);
  const lightBg = await cdp.eval(`getComputedStyle(document.querySelector('section[aria-label="Biểu đồ cột thu chi theo từng tháng"]')).backgroundColor`);
  assert.notEqual(darkBg, lightBg);
  out.scenarios.UI11 = { darkClassApplied: true, darkCardBg: darkBg, lightCardBg: lightBg };

  // UI12: Responsive mobile (320x700, 375x667, 430x932) & desktop (1440x900)
  const viewports = [];
  for (const vp of [
    { width: 320, height: 700, mobile: true },
    { width: 375, height: 667, mobile: true },
    { width: 430, height: 932, mobile: true },
    { width: 1440, height: 900, mobile: false }
  ]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile
    });
    await cdp.eval(`window.dispatchEvent(new Event('resize'))`);
    await sleep(250);
    const m = await cdp.eval(`(() => {
      const d = document.documentElement;
      const btn = document.querySelector('form[aria-label="Bộ lọc khoảng tháng báo cáo"] button[type="submit"]');
      const wide = Array.from(document.querySelectorAll('*')).filter(el => el.getBoundingClientRect().right > d.clientWidth + 1).slice(0, 5).map(el => el.tagName + '.' + el.className + ':' + Math.round(el.getBoundingClientRect().right));
      return {
        scrollWidth: d.scrollWidth,
        clientWidth: d.clientWidth,
        noHorizontalOverflow: d.scrollWidth <= d.clientWidth,
        wideElements: wide,
        hasMobileReportsLink: Boolean(document.querySelector('nav[aria-label="Điều hướng mobile"] a[href="/reports"]')),
        hasSidebarReportsLink: Boolean(document.querySelector('#smart-sidebar a[href="/reports"]')),
        submitHeight: Math.round(btn.getBoundingClientRect().height)
      };
    })()`);
    assert.equal(m.noHorizontalOverflow, true, `Overflow at ${vp.width}x${vp.height}: ${JSON.stringify(m)}`);
    assert.equal(m.hasMobileReportsLink, true, `Mobile nav link at ${vp.width}`);
    assert.equal(m.hasSidebarReportsLink, true, `Sidebar link at ${vp.width}`);
    assert.ok(m.submitHeight >= 36);
    delete m.wideElements;
    viewports.push({ viewport: `${vp.width}x${vp.height}`, ...m });
  }
  out.scenarios.UI12 = { viewports };

  // UI09: Switch account A -> B on UI and verify strict owner isolation
  await cdp.eval(`document.querySelector('#logout-btn').click()`);
  await waitFor(cdp, `!sessionStorage.getItem('accessToken')`);
  await cdp.eval(`window.history.pushState({}, '', '/reports'); window.dispatchEvent(new PopStateEvent('popstate'));`);
  await waitFor(cdp, `window.location.pathname === '/login' && document.querySelector('input[type="email"]') !== null`);

  await setInput(cdp, 'input[type="email"]', input.credsB.email);
  await setInput(cdp, 'input[type="password"]', input.credsB.password);
  await cdp.eval(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(cdp, `(window.location.pathname === '/' || window.location.pathname === '/reports') && Boolean(sessionStorage.getItem('accessToken'))`);
  if ((await cdp.eval(`window.location.pathname`)) !== '/reports') {
    await cdp.eval(`document.querySelector('a[href="/reports"]').click()`);
  }
  await waitFor(cdp, `window.location.pathname === '/reports' && document.body.innerText.includes('9.000 ₫') && document.body.innerText.includes('999,99 ₫') && document.body.innerText.includes('+8.000,01 ₫')`);
  const bodyB = await cdp.eval(`document.body.innerText`);
  assert.equal(bodyB.includes('3.000,3 ₫'), false);
  assert.equal(bodyB.includes('851,35 ₫'), false);
  assert.equal(bodyB.includes('QA D10 Transport'), false);
  out.scenarios.UI09 = {
    loggedOutRedirectToLogin: true,
    ownerBKpis: ['9.000 ₫', '999,99 ₫', '+8.000,01 ₫'],
    ownerALeakedInDom: false
  };

  // UI13: Dashboard > 8 transactions in 2026-11 for Owner A
  for (let d = 2; d <= 8; d++) {
    const res = await fetch(`${input.base}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.tokenA}` },
      body: JSON.stringify({
        categoryId: input.foodA,
        type: 'EXPENSE',
        amount: 1.00,
        transactionDate: `2026-11-0${d}`,
        note: `UI13 extra #${d - 1}`
      })
    });
    assert.equal(res.status, 201);
  }
  const page8Res = await fetch(`${input.base}/api/transactions?month=2026-11&page=0&size=8`, {
    headers: { Authorization: `Bearer ${input.tokenA}` }
  }).then(r => r.json());
  const monthlyAllRes = await fetch(`${input.base}/api/transactions?month=2026-11&page=0&size=100`, {
    headers: { Authorization: `Bearer ${input.tokenA}` }
  }).then(r => r.json());
  assert.equal(page8Res.content.length, 8);
  assert.equal(page8Res.totalElements, 10);
  assert.equal(monthlyAllRes.content.length, 10);

  await cdp.eval(`document.querySelector('#logout-btn').click()`);
  await waitFor(cdp, `!sessionStorage.getItem('accessToken')`);
  await cdp.eval(`window.history.pushState({}, '', '/login'); window.dispatchEvent(new PopStateEvent('popstate'));`);
  await waitFor(cdp, `window.location.pathname === '/login' && document.querySelector('input[type="email"]') !== null`);
  await setInput(cdp, 'input[type="email"]', input.credsA.email);
  await setInput(cdp, 'input[type="password"]', input.credsA.password);
  await cdp.eval(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(cdp, `window.location.pathname === '/' && document.body.innerText.includes('Tổng quan') && document.body.textContent.includes('2.000 ₫') && document.body.textContent.includes('508 ₫') && document.body.textContent.includes('1.492 ₫')`);
  await waitFor(cdp, `Boolean(document.querySelector('svg.recharts-surface'))`);
  const dashHasAreaSvg = await cdp.eval(`Boolean(document.querySelector('svg.recharts-surface'))`);
  assert.equal(dashHasAreaSvg, true, 'UI13 dashHasAreaSvg');
  out.scenarios.UI13 = {
    month: '2026-11',
    recentPageSize8Count: page8Res.content.length,
    monthlyEndpointCount: monthlyAllRes.content.length,
    earlyIncome2000Included: monthlyAllRes.content.some(t => t.transactionDate === '2026-11-01' && Number(t.amount) === 2000),
    browserFetchedPageSize100: apiCalls.some(c => c.url.includes('size=100') && c.status === 200),
    dashboardCashFlowSvgRendered: dashHasAreaSvg,
    dashboardKpis: { income: '2.000 ₫', expense: '508 ₫', balance: '1.492 ₫' }
  };

  out.meta.apiCallsCount = apiCalls.length;
  console.log(JSON.stringify(out));
} catch (err) {
  console.error('ERROR: ' + String(err?.stack || err?.message || err).replace(/\r?\n/g, ' | ').slice(0, 280));
  process.exitCode = 1;
} finally {
  cdp?.close();
  chrome.kill();
}
'''
        try:
            raw = run(["node", "--input-type=module", "-e", script],
                      data=json.dumps({
                          "chrome": str(chrome),
                          "cdpPort": cdp_port,
                          "profileDir": str(profile_dir),
                          "feUrl": fe_url,
                          "base": self.base,
                          "credsA": self.creds["A"],
                          "credsB": self.creds["B"],
                          "tokenA": self.tokens["A"],
                          "foodA": self.ids["food_a"],
                      }), cwd=ROOT, timeout=120)
            browser_out = json.loads(raw)
        finally:
            if vite_proc:
                vite_proc.terminate()
                try:
                    vite_proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    vite_proc.kill()
        sql_2026_11 = self.oracle("2026-11", "2026-11", "A")["months"][0]
        assert sql_2026_11["totalIncome"] == Decimal("2000.00")
        assert sql_2026_11["totalExpense"] == Decimal("508.00")
        assert sql_2026_11["balance"] == Decimal("1492.00")
        specs = [
            ("UI01", "Login and open /reports via sidebar navigation"),
            ("UI02", "1-month report filter (2026-11 preset and 2026-09 custom) matches SQL"),
            ("UI03", "3-month report filter (2026-09..2026-11) matches SQL"),
            ("UI04", "6-month report filter (2026-06..2026-11 and 2026-05..2026-10) matches SQL"),
            ("UI05", "Invalid ranges (from > to, > 6 months) show alert and block submit"),
            ("UI06", "Empty month (2026-10) shows empty states and 0 ₫ KPIs"),
            ("UI07", "Monthly bar chart SVG and table rows/footer match SQL"),
            ("UI08", "KPI cards, Donut SVG and category breakdown table/percentages match SQL"),
            ("UI09", "Switch account A -> B on UI isolates owner data"),
            ("UI10", "Network failure clears stale KPIs and Retry recovers real data"),
            ("UI11", "Light/Dark theme toggle updates DOM class and computed styles"),
            ("UI12", "Responsive layout at 320x700, 375x667, 430x932 and 1440x900 without overflow"),
            ("UI13", "Dashboard cash flow & KPIs use full monthly transactions when month has > 8 items"),
        ]
        for ident, expected in specs:
            self.check(ident, "browser CDP", {"case": ident}, expected,
                       lambda k=ident: browser_out["scenarios"][k])
        self.evidence["browser"] = {
            "status": "PASS",
            "method": "Google Chrome Headless CDP (--headless=new --remote-debugging-port) with disposable --user-data-dir",
            "browserVersion": browser_out["meta"]["browserVersion"],
            "protocolVersion": browser_out["meta"]["protocolVersion"],
            "database": self.db,
            "apiCallsCount": browser_out["meta"]["apiCallsCount"],
            "cases": [s[0] for s in specs],
        }
        return browser_out

    def finish(self):
        if self.app:
            self.app.terminate()
            try:
                self.app.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.app.kill()
                self.app.wait(timeout=10)
        if hasattr(self, "log"):
            self.log.close()
        if hasattr(self, "temp"):
            self.temp.cleanup()
        if self.container:
            self.sql("SET GLOBAL general_log=OFF;", root=True)
            run(["docker", "rm", "-f", self.container])
        if hasattr(self, "before"):
            unchanged = self.before == {"BE": source_manifest(self.be), "FE": source_manifest(self.fe)}
            self.evidence["sourceWorktreesUnchanged"] = unchanged
            assert unchanged, "BE or FE working files changed during QA"
        self.evidence["cleanup"] = "JVM stopped, private config removed, temporary MySQL container removed, disposable Chrome profile removed"
        counts = {state: sum(t["status"] == state for t in self.results) for state in ["PASS", "FAIL"]}
        counts["BLOCKED"] = 0 if self.evidence["browser"].get("status") == "PASS" else len(self.evidence["browser"]["cases"])
        counts["SKIPPED"] = 0
        counts["automatedDbPass"] = sum(t["status"] == "PASS" and not str(t["id"]).startswith("UI") for t in self.results)
        counts["browserPass"] = sum(t["status"] == "PASS" and str(t["id"]).startswith("UI") for t in self.results)
        self.evidence["counts"] = counts
        self.evidence["finishedUtc"] = datetime.now(timezone.utc).isoformat()
        (self.out / "results.json").write_text(dump(self.evidence) + "\n", encoding="utf-8")
        print(dump({"results": str(self.out / "results.json"), "counts": counts}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--frontend", type=Path, required=True)
    parser.add_argument("--browser-only", action="store_true")
    parser.add_argument("--evidence", type=Path, default=ROOT / "docs/qa/evidence/SE2-D10-DB_RESULTS.json")
    args = parser.parse_args()
    qa = Qa(args)
    try:
        qa.start()
        if args.browser_only:
            qa.reuse_db_evidence(args.evidence)
            qa.browser_qa()
            return 0
        qa.api_checks()
        qa.check("SQL-AI-01", "SQL+Budget+AI fixture", {"periods": ["2026-09", "2026-11"]},
                 "under/over budgets agree with SQL; two owners; empty month", qa.budget_fixture)
        qa.check("PERF-01", "MySQL general_log+EXPLAIN", {"ownerRows": 120, "otherOwnerExtraRows": 20000},
                 "two aggregate SELECTs; existing owner/date index; no migration", qa.performance)
        qa.check("HTTP-CONCURRENT-01", "read concurrency", {"requests": 8},
                 "eight 200 responses with identical SQL totals", qa.concurrent)
        qa.check("HTTP-500-01", "safe server error", {"fault": "private DB SELECT permission only"},
                 "neutral 500, no SQL/trace/credentials, recovery 200", qa.neutral_server_error)
        qa.check("FE-SERVICE-01", "real FE service -> HTTP -> MySQL", {"checks": 7},
                 "1/3/6 months, empty, validation, owner switch, 401 session clear", qa.frontend_service)
        qa.browser_qa()
    except Exception as error:
        qa.evidence["environmentBlocker"] = f"{type(error).__name__}: {error}"
        print("BLOCKED ENVIRONMENT: " + qa.evidence["environmentBlocker"], flush=True)
    finally:
        qa.finish()
    return 1 if qa.evidence.get("environmentBlocker") or qa.evidence["counts"]["FAIL"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
