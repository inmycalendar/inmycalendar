# ---------------------------------------------------------------------------
# inmycalendar - holiday extractor
#
# Writes assets/holidays/XX.js, one file per country, in the format the app
# loads directly. Also writes coverage-review.csv, which is the thing to read
# after every run.
#
# RUN ORDER. This script is step one of three. Skipping step two silently
# reverts corrections that took real work to find:
#
#     python tools/extract-holidays.py
#     node   tools/holiday-corrections.js
#     node   tools/audit-holidays.js      <- fails loudly if step two was skipped
#
# ---------------------------------------------------------------------------
# WHAT WAS WRONG WITH THE EARLIER VERSION
#
# Two fixes from the original are kept and are correct:
#   - list_supported_countries() returns each country twice, by alpha-2 and
#     alpha-3, so filtering to len(code) == 2 is right.
#   - a +/-15 year window instead of 1976-2076.
#
# Three further faults were found by auditing the output against the official
# holiday lists of the largest countries.
#
# FAULT 1: observed=True DELETED holidays instead of adding to them.
#   country_holidays(code, years=YEARS) defaults to observed=True. For some
#   countries the library then SUBSTITUTES the observed day for the real one
#   rather than adding it. Spain lost nine of its ten fixed national holidays
#   in every year they fell on a Sunday. Christmas Day was simply absent from
#   the Spanish calendar in 2016, 2022, 2033, 2039 and 2044, and 12 October
#   2025 was missing too.
#   FIX: pull both observed=False (the real dates) and observed=True (the days
#   actually taken off) and union them. A fixed-date holiday never disappears
#   again, and genuine substitutes like the US 4 July observed on a Friday are
#   still captured.
#
# FAULT 2: "national" quietly meant "observed in EVERY subdivision".
#   The library defines a country-level set and adds subdivision extras on top,
#   so anything one subdivision skips lands in the extras and is written as
#   Regional. Regional days are hidden by default in the app, so they vanish.
#   That is how UK users lost Easter Monday and the late-August bank holiday:
#   Scotland does something different, so three of four nations and about 97%
#   of the population were outvoted by the rule.
#   FIX (partial, deliberately): this script cannot decide which majority days
#   deserve promoting, because the library has no population weighting and a
#   pure subdivision count gets Canada and Australia wrong in opposite
#   directions. So it writes coverage-review.csv listing every regional day
#   with the share of subdivisions observing it. Anything above about 0.7 is
#   worth checking against an official source and, if confirmed, adding to
#   tools/holiday-corrections.js, which is the authority.
#
# FAULT 3: the duplicate check compared one name against many.
#   `if national.get(d) != hname` fails whenever a date carries more than one
#   holiday, because the library joins them as "A; B". The comparison then
#   never matches and a duplicate regional row is written.
#   FIX: compare sets of dates, not name strings.
# ---------------------------------------------------------------------------

import csv
import datetime
import json
import os
import sys

try:
    import holidays
    import pycountry
except ImportError:
    sys.exit("pip install holidays pycountry")

THIS_YEAR = datetime.date.today().year
YEARS = list(range(THIS_YEAR - 15, THIS_YEAR + 16))       # about 31 years

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "assets", "holidays")
REVIEW = os.path.join(HERE, "..", "coverage-review.csv")

# Coverage at or above this is worth a human looking at it. It is a prompt to
# check a source, NOT an automatic promotion: 3 of the UK's 4 nations is 0.75
# and should be national, while 6 of Australia's 8 states is also 0.75 and
# should not, because the King's Birthday falls on different dates.
REVIEW_AT = 0.60


def merged(code, subdiv=None):
    """Every date the library knows, whether it calls it real or observed.

    Returns {date: name}. Unioning the two views is the whole fix for fault 1.
    """
    out = {}
    for observed in (False, True):
        try:
            h = holidays.country_holidays(
                code, subdiv=subdiv, years=YEARS, observed=observed)
        except (NotImplementedError, KeyError, AttributeError, TypeError):
            continue
        for day, name in h.items():
            # keep the first name seen; the real-date pass runs first
            out.setdefault(day, name)
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    review_rows = []
    written = 0
    total_days = 0

    for code, subdivs in sorted(holidays.list_supported_countries().items()):
        if len(code) != 2:                     # skip the alpha-3 duplicates
            continue

        country = pycountry.countries.get(alpha_2=code)
        name = country.name if country else code

        national = merged(code)
        if not national:
            print("  {}  {}  - no data, skipped".format(code, name))
            continue

        # How many subdivisions observe each date. Counting is what makes
        # fault 2 reviewable instead of invisible.
        counts = {}
        regional = {}
        usable_subdivs = 0
        for sub in subdivs:
            days = merged(code, subdiv=sub)
            if not days:
                continue
            usable_subdivs += 1
            for day, hname in days.items():
                counts[day] = counts.get(day, 0) + 1
                if day not in national:        # compare DATES, fixes fault 3
                    regional.setdefault(day, hname)

        # {"2025": {"1225": ["Christmas Day", 0]}}   0 national, 1 regional
        data = {}
        for day, hname in national.items():
            data.setdefault(str(day.year), {})["%02d%02d" % (day.month, day.day)] = [hname, 0]
        for day, hname in regional.items():
            data.setdefault(str(day.year), {})["%02d%02d" % (day.month, day.day)] = [hname, 1]

            if usable_subdivs:
                share = counts.get(day, 0) / float(usable_subdivs)
                if share >= REVIEW_AT:
                    review_rows.append([code, name, day.isoformat(), hname,
                                        counts.get(day, 0), usable_subdivs,
                                        round(share, 2)])

        payload = 'window.__imcHol&&window.__imcHol("%s",%s);\n' % (
            code, json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
        with open(os.path.join(OUT_DIR, code + ".js"), "w", encoding="utf-8") as fh:
            fh.write(payload)

        written += 1
        total_days += sum(len(v) for v in data.values())
        print("  {}  {}  ({} days, {} subdivisions)".format(
            code, name, sum(len(v) for v in data.values()), usable_subdivs))

    review_rows.sort(key=lambda r: -r[6])
    with open(REVIEW, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["CountryCode", "CountryName", "Date", "HolidayName",
                    "SubdivisionsObserving", "SubdivisionsTotal", "Share"])
        w.writerows(review_rows)

    print("\n  {} countries, {:,} holiday entries".format(written, total_days))
    print("  {} regional days at or above {:.0%} coverage listed in {}".format(
        len(review_rows), REVIEW_AT, os.path.basename(REVIEW)))
    print("\n  NEXT, and do not skip it:")
    print("    node tools/holiday-corrections.js")
    print("    node tools/audit-holidays.js")


if __name__ == "__main__":
    main()
