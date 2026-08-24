"""Generate realistic demo data for Harmaal.

Run inside the backend container:  python -m api.mock_data

Idempotent: keeps staff accounts, wipes and recreates all business data
(properties, tenants, rent ledger, work orders + message threads). Prints the
demo credentials for every role at the end.

Data model: standalone **rental houses**, one tenant per house (not an
apartment complex). 50 occupied houses plus a handful of vacant listings, with
deliberately wide variance — cheap→luxury rents, punctual→defaulting payers,
pristine→money-pit repair histories, and staggered lease start dates — so every
dashboard/analytics feature (occupancy over time, overdue follow-up, cash
reconciliation, maintenance spend by property/tenant/month) has real signal.
"""

from __future__ import annotations

import asyncio
import random
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from api.db import AsyncSessionFactory
from api.internal import feed_inventory
from api.internal.auth import hash_password
from api.models.orm import (
    Expense,
    FeedBatch,
    FeedProduct,
    FeedStockMovement,
    Payment,
    Property,
    Role,
    Tenant,
    User,
    WorkOrder,
    WorkOrderMessage,
)
from api.seed import seed

random.seed(42)

# --- demo credentials ---
MANAGER = ("manager@harmaal.local", "Manager!Harbor7", "Jamal Abdi")
MAINTENANCE = [
    ("maintenance@harmaal.local", "Fixit!Wrench42", "Carlos Rivera"),
    ("contractor2@harmaal.local", "Pipes!Toolbox88", "Dmitri Volkov"),
]
TENANT_PASSWORD = "Tenant!2026Key"  # shared demo password for all tenants

# --- name & address pools (Somaliland flavour) ---
FIRST_NAMES = [
    "Amina",
    "Fadumo",
    "Hodan",
    "Ayaan",
    "Khadra",
    "Sagal",
    "Ubax",
    "Deqa",
    "Ilhan",
    "Nasteexo",
    "Zamzam",
    "Hibaaq",
    "Muna",
    "Ruweyda",
    "Shukri",
    "Warsan",
    "Asma",
    "Barwaaqo",
    "Canab",
    "Farhia",
    "Cabdi",
    "Maxamed",
    "Axmed",
    "Ismaaciil",
    "Yuusuf",
    "Cali",
    "Xasan",
    "Xuseen",
    "Ibraahim",
    "Maxamuud",
    "Cabdiraxmaan",
    "Faisal",
    "Guuleed",
    "Liibaan",
    "Cumar",
    "Bashiir",
    "Daahir",
    "Jaamac",
    "Kaahin",
    "Sasyid",
    "Cabdulaahi",
    "Nuur",
    "Rooble",
    "Diriye",
]
LAST_NAMES = [
    "Yuusuf",
    "Farax",
    "Xaaji",
    "Diriye",
    "Cabdi",
    "Warsame",
    "Maxamed",
    "Cige",
    "Ismaaciil",
    "Guuleed",
    "Nuur",
    "Kayse",
    "Samatar",
    "Xirsi",
    "Ducaale",
    "Gaas",
    "Rooble",
    "Xasan",
    "Cabdilaahi",
    "Jaamac",
    "Boqor",
    "Egeh",
    "Carte",
    "Ainanshe",
    "Dheere",
    "Qaasim",
    "Cawaale",
    "Baarud",
    "Xirsi",
    "Maxamuud",
]
DISTRICTS = [
    "26 June",
    "Ahmed Dhagax",
    "Ga'an Libaax",
    "Ibraahim Koodbuur",
    "Maxamoud Haybe",
    "New Hargeisa",
    "Jigjiga Yar",
    "Sha'ab",
    "Koodbuur",
    "Masalaha",
    "31 May",
    "Pepsi",
]
CITIES = ["Hargeysa"] * 9 + ["Berbera", "Burco", "Borama", "Gabiley"]

# --- rent tiers: (label, min, max, count) — counts sum to 50 ---
RENT_TIERS = [
    ("budget", 250, 480, 9),
    ("affordable", 520, 820, 14),
    ("standard", 850, 1300, 15),
    ("premium", 1500, 2600, 9),
    ("luxury", 3200, 6000, 3),
]

# --- payer reliability profiles: (name, count) — counts sum to 50 ---
PAYER_PROFILES = [
    ("always_on_time", 17),
    ("mostly_on_time", 12),
    ("occasionally_late", 8),
    ("recently_overdue", 6),
    ("chronic_late", 5),
    ("serial_defaulter", 2),
]

# --- repair-history profiles: (name, min_wo, max_wo, count) — counts sum to 50 ---
REPAIR_PROFILES = [
    ("pristine", 0, 1, 8),
    ("low", 2, 4, 15),
    ("average", 5, 8, 16),
    ("high", 10, 15, 8),
    ("money_pit", 18, 26, 3),
]

# --- tenure in months (staggered lease starts) — list length 50 ---
TENURES = (
    [60] * 14
    + [54] * 4
    + [48] * 5
    + [42] * 4
    + [36] * 5
    + [30] * 4
    + [24] * 4
    + [18] * 3
    + [12] * 3
    + [9] * 2
    + [6] * 1
    + [3] * 1
)

NUM_HOUSES = 50
NUM_VACANT = 5

WO_TEMPLATES = [
    ("Leaking kitchen faucet", "plumbing", "Constant drip under the kitchen sink, cabinet getting wet."),
    ("No hot water", "plumbing", "Water heater not producing hot water since this morning."),
    ("AC not cooling", "hvac", "Air conditioner runs but blows warm air."),
    ("Heater not working", "hvac", "Furnace won't turn on, unit is cold."),
    ("Outlet sparking", "electrical", "Wall outlet in living room sparked when plugging in."),
    ("Hallway light out", "electrical", "Shared hallway light fixture is dead."),
    ("Dishwasher won't drain", "appliance", "Standing water left after every cycle."),
    ("Fridge not cooling", "appliance", "Refrigerator warm, freezer barely working."),
    ("Cracked window pane", "structural", "Bedroom window cracked, draft coming through."),
    ("Front door won't lock", "structural", "Deadbolt jammed, door not securing."),
    ("Clogged bathroom drain", "plumbing", "Shower draining very slowly."),
    ("Smoke detector chirping", "general", "Battery low warning all night."),
    ("Garbage disposal jammed", "appliance", "Disposal hums but won't spin."),
    ("Ceiling water stain", "structural", "Brown stain spreading on bedroom ceiling."),
    ("Thermostat unresponsive", "hvac", "Display blank, can't change temperature."),
    ("Toilet running constantly", "plumbing", "Water keeps running after flush."),
    ("Bedroom outlet dead", "electrical", "No power to two outlets in the bedroom."),
    ("Washing machine leaking", "appliance", "Water pools under the washer during spin."),
    ("Pest issue - ants", "general", "Ant trail in the kitchen near the pantry."),
    ("Broken cabinet hinge", "general", "Kitchen cabinet door hanging off its hinge."),
]

PRIORITIES = ["low", "medium", "medium", "high", "emergency"]

# History depth. 5 years of rent ledger + work-order spend so the dashboard
# breakdowns (this-month / this-year / all-time by property/tenant) have real data.
YEARS = 5
MONTHS = YEARS * 12
# The manager reconciles the cash drawer monthly: older months are fully banked,
# only the most recent months still hold undeposited cash. Cash-settled repairs
# and expenses only happen within this window, so `cash_on_hand` never goes
# negative (finance.py: cash_on_hand = collected - deposited - spent).
CASH_ON_HAND_MONTHS = 2


def months_back(n: int) -> list[tuple[int, int]]:
    now = datetime.now(UTC)
    out: list[tuple[int, int]] = []
    y, m = now.year, now.month
    for _ in range(n):
        out.append((y, m))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return list(reversed(out))  # oldest -> newest


def _expand(pairs: list[tuple]) -> list:
    """Expand [(value, count), …] into a flat list, then shuffle for variety."""
    out: list = []
    for value, count in pairs:
        out.extend([value] * count)
    random.shuffle(out)
    return out


def _build_people() -> list[dict]:
    """Deterministically assemble 50 tenant profiles: unique name, address, rent
    tier, payer reliability, repair history, and tenure — each dimension shuffled
    independently so the combinations vary widely."""
    # Unique names
    names: list[str] = []
    seen: set[str] = set()
    combos = [(fn, ln) for fn in FIRST_NAMES for ln in LAST_NAMES]
    random.shuffle(combos)
    for first, last in combos:
        full = f"{first} {last}"
        if full in seen:
            continue
        seen.add(full)
        names.append(full)
        if len(names) == NUM_HOUSES:
            break

    tiers = _expand([(t, c) for (t, _lo, _hi, c) in RENT_TIERS])
    tier_range = {name: (lo, hi) for (name, lo, hi, _c) in RENT_TIERS}
    payers = _expand([(p, c) for (p, c) in PAYER_PROFILES])
    repairs = _expand([(r, c) for (r, _lo, _hi, c) in REPAIR_PROFILES])
    repair_range = {name: (lo, hi) for (name, lo, hi, _c) in REPAIR_PROFILES}
    tenures = list(TENURES)
    random.shuffle(tenures)

    people: list[dict] = []
    for i in range(NUM_HOUSES):
        first, last = names[i].split(" ", 1)
        email = f"{first}.{last}".lower().replace("'", "").replace(" ", ".") + "@example.com"
        lo, hi = tier_range[tiers[i]]
        rent = round(random.randint(lo, hi) / 10) * 10
        rlo, rhi = repair_range[repairs[i]]
        people.append(
            {
                "name": names[i],
                "email": email,
                "phone": f"+252 63 {random.randint(4000000, 4999999)}",
                "rent": float(rent),
                "tier": tiers[i],
                "payer": payers[i],
                "repair_min": rlo,
                "repair_max": rhi,
                "tenure": tenures[i],
            }
        )
    return people


def _house_address(seq: int) -> str:
    city = random.choice(CITIES)
    district = random.choice(DISTRICTS)
    return f"House {seq}, {district}, {city}"


async def _get_or_create_user(session, email, password, display, role_name) -> User:
    email = email.lower()
    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user:
        # Reset to the known demo password/name and clear any lockout so creds always work.
        user.hashed_password = hash_password(password)
        user.display_name = display
        user.must_change_password = False
        user.login_attempts = 0
        user.login_locked_until = None
        return user
    role = (
        await session.execute(
            select(Role).options(selectinload(Role.permissions)).where(Role.name == role_name)
        )
    ).scalar_one()
    user = User(
        email=email,
        hashed_password=hash_password(password),
        role=role_name,
        display_name=display,
        password_changed_at=datetime.now(UTC),
        roles=[role],
    )
    session.add(user)
    await session.flush()
    return user


async def _wipe_business(session) -> None:
    # FK-safe order
    await session.execute(delete(WorkOrderMessage))
    await session.execute(delete(WorkOrder))
    await session.execute(delete(Expense))
    await session.execute(delete(Payment))
    await session.execute(delete(Tenant))
    await session.execute(delete(Property))
    await session.execute(delete(User).where(User.role == "tenant"))
    await session.commit()


def _payment_plan(n: int, payer: str) -> tuple[set[int], set[int]]:
    """For a tenure of ``n`` months (index 0 = oldest, n-1 = current), return the
    set of month indexes left unpaid (``pending`` → overdue once past due) and the
    set paid late, according to the payer reliability profile."""
    if n <= 0:
        return set(), set()
    pending: set[int] = set()
    late: set[int] = set()
    older = list(range(max(0, n - CASH_ON_HAND_MONTHS)))  # exclude live cash window from scatter
    if payer == "always_on_time":
        pass
    elif payer == "mostly_on_time":
        late = set(random.sample(range(n), k=min(n, random.randint(0, 2))))
    elif payer == "occasionally_late":
        late = set(random.sample(range(n), k=min(n, max(1, n // 6))))
    elif payer == "recently_overdue":
        pending = set(range(n - random.randint(1, 3), n))
    elif payer == "chronic_late":
        late = set(random.sample(range(n), k=min(n, max(1, n // 3))))
        pending = set(range(n - random.randint(1, 2), n))
    elif payer == "serial_defaulter":
        pending = set(range(n - random.randint(4, 6), n))
        if older:
            pending |= set(random.sample(older, k=min(len(older), random.randint(1, 3))))
    return pending, late


def _build_thread(wo, manager, assignee, tenant_name, desc, created):
    """Reconstruct a plausible message thread for a work order's status."""
    thread: list[tuple[int | None, str, str, str]] = [
        (wo.created_by, tenant_name, "tenant", f"Hi, {desc} Please help."),
    ]
    if wo.status != "open":
        thread.append(
            (
                manager.id,
                manager.display_name,
                "manager",
                f"Thanks for reporting. Assigning {assignee.display_name} to take a look.",
            )
        )
    if wo.status in ("in_progress", "completed"):
        thread.append(
            (assignee.id, assignee.display_name, "maintenance", "On my way / inspecting the issue now.")
        )
    if wo.status == "completed":
        thread.append(
            (
                assignee.id,
                assignee.display_name,
                "maintenance",
                f"Repair complete. Cost ${wo.cost:.0f}. Replaced/fixed the affected part.",
            )
        )
        thread.append(
            (
                manager.id,
                manager.display_name,
                "manager",
                "Confirmed completed and notified the tenant. Closing this out.",
            )
        )
    if wo.status == "cancelled":
        thread.append(
            (
                manager.id,
                manager.display_name,
                "manager",
                "Tenant resolved it themselves. Cancelling the work order.",
            )
        )
    msgs = []
    t = created
    for aid, aname, arole, body in thread:
        t = t + timedelta(hours=random.randint(2, 36))
        msgs.append(
            WorkOrderMessage(
                work_order_id=wo.id,
                author_id=aid,
                author_name=aname,
                author_role=arole,
                body=body,
                created_at=t,
            )
        )
    return msgs


async def build() -> None:
    async with AsyncSessionFactory() as session:
        await seed(session)  # ensure roles/permissions + root admin exist

        # Reset the seeded owner/admin to known demo creds (lands straight on the dashboard).
        admin = (
            await session.execute(select(User).where(User.email == "admin@harmaal.local"))
        ).scalar_one_or_none()
        if admin:
            admin.hashed_password = hash_password("changeme")
            admin.must_change_password = False
            admin.login_attempts = 0
            admin.login_locked_until = None

        manager = await _get_or_create_user(session, *MANAGER, "manager")
        maint_users = [await _get_or_create_user(session, e, p, d, "maintenance") for e, p, d in MAINTENANCE]
        await session.commit()

        await _wipe_business(session)

        now = datetime.now(UTC)
        full_periods = months_back(MONTHS)
        cash_window = {f"{y}-{m:02d}" for y, m in full_periods[-CASH_ON_HAND_MONTHS:]}
        tenant_role = (await session.execute(select(Role).where(Role.name == "tenant"))).scalar_one()

        people = _build_people()
        seq = 1

        # One standalone house per tenant (units=1), staggered lease starts.
        for person in people:
            prop = Property(
                address=_house_address(seq),
                units=1,
                description=f"Standalone rental home ({person['tier']} tier)",
                owner_id=manager.id,
            )
            seq += 1
            session.add(prop)
            await session.flush()

            tenure = person["tenure"]
            periods = months_back(tenure)  # this tenant's active months
            lease_start = f"{periods[0][0]}-{periods[0][1]:02d}-01"
            # Lease end varies 2-24 months out, exercising the expiring-leases view.
            end_off = random.randint(2, 24)
            ey, em = now.year, now.month + end_off
            ey += (em - 1) // 12
            em = (em - 1) % 12 + 1
            lease_end = f"{ey}-{em:02d}-01"

            t_user = User(
                email=person["email"],
                hashed_password=hash_password(TENANT_PASSWORD),
                role="tenant",
                display_name=person["name"],
                phone=person["phone"],
                password_changed_at=now,
            )
            t_user.roles = [tenant_role]
            session.add(t_user)
            await session.flush()

            tenant = Tenant(
                name=person["name"],
                email=person["email"],
                phone=person["phone"],
                rent_amount=person["rent"],
                lease_start_date=lease_start,
                lease_end_date=lease_end,
                unit_label=None,  # a whole house has no sub-unit
                property_id=prop.id,
                user_id=t_user.id,
            )
            session.add(tenant)
            await session.flush()

            # Rent ledger over the tenant's tenure, shaped by their payer profile.
            pending_idx, late_idx = _payment_plan(tenure, person["payer"])
            for idx, (y, m) in enumerate(periods):
                due = f"{y}-{m:02d}-05"
                period_str = f"{y}-{m:02d}"
                if idx in pending_idx:
                    session.add(
                        Payment(
                            amount=person["rent"],
                            period=period_str,
                            due_date=due,
                            paid_date=None,
                            status="pending",
                            method=None,
                            deposited=False,
                            deposited_date=None,
                            tenant_id=tenant.id,
                        )
                    )
                    continue
                day = random.randint(2, 4) if idx not in late_idx else random.randint(9, 27)
                method = random.choice(["cash", "cash", "card", "transfer"])
                deposited, deposited_date = False, None
                # Older cash is already banked; only the live window sits on hand.
                if method == "cash" and period_str not in cash_window:
                    deposited = True
                    deposited_date = f"{y}-{m:02d}-{random.randint(10, 27):02d}"
                session.add(
                    Payment(
                        amount=person["rent"],
                        period=period_str,
                        due_date=due,
                        paid_date=f"{y}-{m:02d}-{day:02d}",
                        status="paid",
                        method=method,
                        deposited=deposited,
                        deposited_date=deposited_date,
                        tenant_id=tenant.id,
                    )
                )

            person["_prop_id"] = prop.id
            person["_tenant"] = tenant
            person["_periods"] = periods
        await session.commit()

        # A few vacant houses so occupancy is < 100% and varies by property.
        for _ in range(NUM_VACANT):
            session.add(
                Property(
                    address=_house_address(seq),
                    units=1,
                    description="Vacant rental home — available to let",
                    owner_id=manager.id,
                )
            )
            seq += 1
        await session.commit()

        # Operating expenses — a few per recent month across random houses.
        exp_templates = [
            ("Landscaping & grounds", "maintenance"),
            ("Compound cleaning", "maintenance"),
            ("Water & sewer", "utilities"),
            ("Electricity (common areas)", "utilities"),
            ("Property insurance", "insurance"),
            ("Plumbing supplies", "maintenance"),
            ("Pest control", "maintenance"),
        ]
        prop_ids = [p["_prop_id"] for p in people]
        for y, m in full_periods[-18:]:
            period_str = f"{y}-{m:02d}"
            for _ in range(random.randint(3, 6)):
                desc, cat = random.choice(exp_templates)
                paid_in_cash = period_str in cash_window and random.random() < 0.6
                session.add(
                    Expense(
                        description=desc,
                        amount=float(random.randint(60, 480)),
                        category=cat,
                        period=period_str,
                        spent_date=f"{y}-{m:02d}-{random.randint(3, 26):02d}",
                        paid_in_cash=paid_in_cash,
                        property_id=random.choice(prop_ids),
                        created_by=manager.id,
                    )
                )
        await session.commit()

        # Work orders + threads per house, scaled by its repair profile & tenure.
        wo_total = 0
        for person in people:
            tenant = person["_tenant"]
            periods = person["_periods"]
            n = len(periods)
            cap = max(1, n // 2)
            count = min(random.randint(person["repair_min"], person["repair_max"]), cap)
            money_pit = person["repair_max"] >= 18
            for _ in range(count):
                title, category, desc = random.choice(WO_TEMPLATES)
                assignee = random.choice(maint_users)
                priority = random.choice(
                    ["high", "high", "emergency", "medium", "low"] if money_pit else PRIORITIES
                )
                p_idx = min(n - 1, int(random.triangular(0, n - 1, n - 1)))
                y, m = periods[p_idx]
                created = datetime(y, m, random.randint(1, 27), random.randint(8, 18), tzinfo=UTC)
                if created > now:
                    created = now - timedelta(days=random.randint(1, 20))
                recent = p_idx >= n - 4
                if recent:
                    status = random.choice(
                        ["completed", "completed", "in_progress", "assigned", "open", "open"]
                    )
                else:
                    status = random.choices(["completed", "cancelled"], weights=[92, 8])[0]
                wo = WorkOrder(
                    property_id=tenant.property_id,
                    tenant_id=tenant.id,
                    unit_label=tenant.unit_label,
                    title=title,
                    description=desc,
                    category=category,
                    priority=priority,
                    status=status,
                    created_by=tenant.user_id,
                    created_at=created,
                )
                if status in ("assigned", "in_progress", "completed"):
                    wo.assigned_to = assignee.id
                if status == "completed":
                    done = min(created + timedelta(days=random.randint(1, 6)), now)
                    wo.completed_at = done.isoformat()
                    base = 900 if priority == "emergency" else 600 if priority == "high" else 400
                    wo.cost = float(random.randint(80, base))
                    wo.paid_in_cash = done.isoformat()[:7] in cash_window and random.random() < 0.5
                    wo.scheduled_for = (created + timedelta(days=1)).date().isoformat()
                session.add(wo)
                await session.flush()
                session.add_all(_build_thread(wo, manager, assignee, tenant.name, desc, created))
                wo_total += 1
        await session.commit()

    # --- summary ---
    print("\n=== Harmaal demo data ready ===")
    print(f"Houses: {NUM_HOUSES} occupied (1 tenant each) + {NUM_VACANT} vacant · {wo_total} work orders")
    print("Admin (owner, portfolio view):  admin@harmaal.local / changeme")
    print(f"Manager:                        {MANAGER[0]} / {MANAGER[1]}")
    for e, p, _d in MAINTENANCE:
        print(f"Maintenance:                    {e} / {p}")
    print(f"Tenants (x{NUM_HOUSES}):  {people[0]['email']} … {people[-1]['email']} / {TENANT_PASSWORD}")
    print("================================\n")

    # Sibling Hormaal Group company — same demo gate, its own dataset.
    await build_feed()


async def seed_demo_if_empty() -> None:
    """Populate the demo dataset on first boot only — idempotent and non-destructive.

    Runs the full :func:`build` when the database has no properties yet, so a
    fresh ``docker compose up`` yields the same demo staff/tenant logins and
    business data for every collaborator. If any property already exists the
    build is skipped, leaving existing data (and any local edits) untouched.
    Called from the app lifespan; the ``python -m api.mock_data`` CLI still
    forces a full wipe-and-rebuild.
    """
    async with AsyncSessionFactory() as session:
        existing = (await session.execute(select(Property).limit(1))).scalar_one_or_none()
        feed_existing = (await session.execute(select(FeedProduct).limit(1))).scalar_one_or_none()
    if existing is None:
        await build()
        return
    # The property demo is already in place. The feed catalogue arrived later, so
    # seed it on its own rather than forcing a full (destructive) rebuild.
    if feed_existing is None:
        await build_feed()


# ---------------------------------------------------------------------------
# Hormaal Animal Feed — demo inventory
# ---------------------------------------------------------------------------
# A sibling Hormaal Group company. Built with its own RNG so the feed dataset is
# reproducible regardless of how much randomness the property build consumed.
#
# The point of this data is *signal*: every dashboard panel must have something
# real to show. So the catalogue deliberately spans fast and slow movers, the
# lots span fresh / expiring-soon / already-expired, and a few SKUs sit at or
# under their reorder point. Sales are drawn FEFO through the same allocator the
# API uses, so the ledger and the remaining lot quantities always reconcile.
#
# `demand` is the notional units/month used to size lots and sales — it is a
# generator knob, not a stored column.


# The catalogue ships with exactly one product per livestock line — the four the
# business actually sells. Everything else about a product (package size, costs,
# shelf life, reorder point) is editable from the console, and an admin can add
# more SKUs there; this is the starting point, not a fixed list.
FEED_CATALOGUE: list[dict] = [
    {
        "sku": "CAMEL-50",
        "name": "Camel Feed",
        "species": "camel",
        "feed_type": "pellet",
        "brand": "Hormaal Prime",
        "unit_size": 50,
        "package_type": "bag",
        "cost": 21.00,
        "price": 29.00,
        "shelf_life": 240,
        "reorder": 40,
        "demand": 55,
    },
    {
        "sku": "CATTLE-50",
        "name": "Cattle Feed",
        "species": "cattle",
        "feed_type": "pellet",
        "brand": "Hormaal Prime",
        "unit_size": 50,
        "package_type": "bag",
        "cost": 19.00,
        "price": 26.50,
        "shelf_life": 210,
        "reorder": 50,
        "demand": 70,
    },
    {
        "sku": "GOAT-40",
        "name": "Goat & Sheep Feed",
        "species": "goat",
        "feed_type": "pellet",
        "brand": "Hormaal Prime",
        "unit_size": 40,
        "package_type": "bag",
        "cost": 16.00,
        "price": 23.00,
        "shelf_life": 200,
        "reorder": 35,
        "demand": 48,
    },
    {
        "sku": "CHICKEN-50",
        "name": "Chicken Feed",
        "species": "chicken",
        "feed_type": "mash",
        "brand": "Hormaal Prime",
        "unit_size": 50,
        "package_type": "bag",
        "cost": 22.00,
        "price": 30.00,
        # Poultry feed is the short-shelf-life line, which is why it is the one
        # that reliably ends up with stock to write off.
        "shelf_life": 120,
        "reorder": 40,
        "demand": 68,
    },
]

FEED_SUPPLIERS = [
    "Berbera Port Traders",
    "Awdal Agro Supply",
    "Hargeisa Feed Mills",
    "Djibouti Import Co.",
]

#: Forces specific lots onto specific expiry dates so every panel of the dashboard
#: has something real to show. With only four SKUs the natural spread of shelf
#: lives no longer guarantees one of each state, so the demo states them outright.
#: `sku -> {lot index: days from today until that lot expires}` (negative = past).
FEED_DEMO_EXPIRY: dict[str, dict[int, int]] = {
    # Poultry feed has the shortest shelf life, so it is the only line where a
    # near-term expiry is plausible — forcing one onto a 240-day camel lot would
    # imply seven months in transit.
    "CHICKEN-50": {
        1: -12,  # expired this month, still on the shelf awaiting write-off
        2: 18,  # inside the 30-day warning window: discount or move it
    },
    "GOAT-40": {0: -150},  # long expired, and scrapped at the time
}

#: SKUs deliberately left short so the reorder alerts have live work. Maps a SKU
#: to the sellable units it should be sitting on today. Reached by one extra
#: clearance sale at the end of the build, so the ledger still reconciles with the
#: remaining lot quantities.
FEED_UNDERSTOCKED: dict[str, int] = {
    "GOAT-40": 22,  # low — reorder level 35
}

#: Months (1-12) of the two dry seasons, when feed demand spikes.
FEED_PEAK_MONTHS = frozenset({1, 2, 3, 7, 8, 9})

#: A lot more than this many days past its expiry is assumed to have been written
#: off already; anything more recent stays on the shelf as work to be done.
FEED_SCRAP_AFTER_DAYS = 30


async def _wipe_feed(session) -> None:
    """Clear the feed dataset (ledger first — it references lots and products)."""
    await session.execute(delete(FeedStockMovement))
    await session.execute(delete(FeedBatch))
    await session.execute(delete(FeedProduct))
    await session.commit()


def _feed_lot_plan(rng: random.Random, spec: dict, today: date) -> list[dict]:
    """Plan the lots for one SKU across the last ~10 months.

    Four receipts roughly a quarter apart, oldest first, so every SKU has a fresh
    lot to sell from and an audit trail behind it. Expiry normally falls out of the
    manufactured date plus the shelf life; ``FEED_DEMO_EXPIRY`` pins particular
    lots to particular dates where the demo needs a guaranteed expired or
    expiring-soon lot to show.
    """
    demand, shelf_life = spec["demand"], spec["shelf_life"]
    forced = FEED_DEMO_EXPIRY.get(spec["sku"], {})
    prefix = spec["sku"].split("-")[0]
    lots: list[dict] = []

    for index, age_days in enumerate((285, 195, 105, 25)):
        received = today - timedelta(days=age_days)
        if index in forced:
            # Work backwards from the expiry the demo wants: manufacture is one
            # shelf life earlier, and the lot cannot have been received before it
            # was made.
            expiry = today + timedelta(days=forced[index])
            manufactured = expiry - timedelta(days=shelf_life)
            received = max(received, manufactured + timedelta(days=rng.randint(5, 30)))
        else:
            manufactured = received - timedelta(days=rng.randint(5, 30))
            expiry = manufactured + timedelta(days=shelf_life)

        # Roughly a quarter's cover each, so after ten months of sales several lots
        # still hold stock and the FEFO story is visible. A lot that reaches its
        # expiry with stock left is by definition one that was over-ordered, so
        # size the deliberately-expired lots to match that story.
        cover = rng.uniform(3.0, 4.2)
        if forced.get(index, 1) < 0:
            cover *= 1.9

        lots.append(
            {
                "batch_code": f"{prefix}-{received.strftime('%y%m')}-{index + 1}",
                "quantity": int(demand * cover),
                # Landed cost drifts with freight and FX between shipments.
                "unit_cost": round(spec["cost"] * rng.uniform(0.9, 1.08), 2),
                "received": received,
                "manufactured": manufactured,
                "expiry": expiry,
                "supplier": rng.choice(FEED_SUPPLIERS),
                "reference": f"PO-{received.strftime('%Y%m')}-{rng.randint(100, 999)}",
            }
        )
    return lots


def _month_starts(today: date, count: int) -> list[date]:
    """First day of each of the last ``count`` months, oldest first."""
    anchor = today.replace(day=1)
    out = [anchor]
    for _ in range(count - 1):
        anchor = (anchor - timedelta(days=1)).replace(day=1)
        out.append(anchor)
    return list(reversed(out))


def _feed_sale_days(rng: random.Random, start: date, end: date, count: int) -> list[date]:
    """Pick ``count`` trading days inside a month, nudging off Friday (market closed)."""
    span = max(0, (end - start).days)
    days: list[date] = []
    for _ in range(count):
        candidate = start + timedelta(days=rng.randint(0, span))
        if candidate.weekday() == 4 and candidate > start:
            candidate -= timedelta(days=1)
        days.append(candidate)
    return sorted(days)


def _feed_sales_for_month(
    rng: random.Random,
    spec: dict,
    lots: list[FeedBatch],
    month_start: date,
    month_end: date,
    admin_id: int | None,
) -> list[FeedStockMovement]:
    """Draw one month of FEFO sales out of the lots that had actually arrived."""
    seasonal = 1.25 if month_start.month in FEED_PEAK_MONTHS else 0.85
    target = int(spec["demand"] * seasonal * rng.uniform(0.7, 1.15))
    if target <= 0:
        return []

    out: list[FeedStockMovement] = []
    for sale_day in _feed_sale_days(rng, month_start, month_end, rng.randint(3, 7)):
        iso = sale_day.isoformat()
        wanted = max(1, int(target / 5 * rng.uniform(0.5, 1.5)))
        # Only lots received by that day and not yet expired on it.
        available = [
            b
            for b in lots
            if b.quantity_remaining > 0 and b.received_date <= iso and (b.expiry_date or "9999") > iso
        ]
        on_hand = sum(b.quantity_remaining for b in available)
        if on_hand <= 0:
            continue
        by_id = {b.id: b for b in available}
        for allocation in feed_inventory.allocate_fefo(available, min(wanted, on_hand)):
            lot = by_id[allocation.batch_id]
            lot.quantity_remaining -= allocation.quantity
            out.append(
                FeedStockMovement(
                    product_id=lot.product_id,
                    batch_id=lot.id,
                    movement_type="sale",
                    quantity=-allocation.quantity,
                    unit_cost=allocation.unit_cost,
                    # Small discounts off list, as a real counter would give.
                    unit_price=round(spec["price"] * rng.uniform(0.97, 1.0), 2),
                    reference=f"INV-{sale_day.strftime('%y%m%d')}-{rng.randint(10, 99)}",
                    occurred_on=iso,
                    created_by=admin_id,
                )
            )
    return out


def _feed_drawdown(
    rng: random.Random,
    spec: dict,
    lots: list[FeedBatch],
    target: int,
    today: date,
    admin_id: int | None,
) -> list[FeedStockMovement]:
    """One extra clearance sale bringing a SKU down to ``target`` units on hand.

    Sales cannot draw on expired lots (the API enforces the same rule), so the
    target is measured against sellable stock only — leftover expired units stay
    put for the write-off queue.
    """
    sellable = [b for b in lots if b.quantity_remaining > 0 and (b.expiry_date or "9999") > today.isoformat()]
    surplus = sum(b.quantity_remaining for b in sellable) - target
    if surplus <= 0:
        return []

    sale_day = today - timedelta(days=rng.randint(1, 6))
    by_id = {b.id: b for b in sellable}
    out: list[FeedStockMovement] = []
    for allocation in feed_inventory.allocate_fefo(sellable, surplus):
        lot = by_id[allocation.batch_id]
        lot.quantity_remaining -= allocation.quantity
        out.append(
            FeedStockMovement(
                product_id=lot.product_id,
                batch_id=lot.id,
                movement_type="sale",
                quantity=-allocation.quantity,
                unit_cost=allocation.unit_cost,
                unit_price=round(spec["price"] * rng.uniform(0.94, 0.99), 2),
                reference=f"INV-{sale_day.strftime('%y%m%d')}-BULK",
                note="Bulk order — cooperative purchase",
                occurred_on=sale_day.isoformat(),
                created_by=admin_id,
            )
        )
    return out


async def build_feed() -> None:
    """Create the Hormaal Animal Feed demo catalogue, lots, and sales ledger."""
    rng = random.Random(7)
    today = datetime.now(UTC).date()
    months = _month_starts(today, 10)

    async with AsyncSessionFactory() as session:
        await _wipe_feed(session)
        admin = (
            (await session.execute(select(User).where(User.role == "admin").order_by(User.id)))
            .scalars()
            .first()
        )
        admin_id = admin.id if admin else None

        products: list[tuple[FeedProduct, dict]] = []
        for spec in FEED_CATALOGUE:
            product = FeedProduct(
                sku=spec["sku"],
                name=spec["name"],
                species=spec["species"],
                feed_type=spec["feed_type"],
                brand=spec["brand"],
                unit_size=float(spec["unit_size"]),
                unit_of_measure="kg",
                package_type=spec["package_type"],
                unit_cost=spec["cost"],
                unit_price=spec["price"],
                shelf_life_days=spec["shelf_life"],
                reorder_level=spec["reorder"],
                is_active=True,
            )
            session.add(product)
            products.append((product, spec))
        await session.flush()

        movements: list[FeedStockMovement] = []
        lot_count = 0
        for product, spec in products:
            lots = [
                FeedBatch(
                    product_id=product.id,
                    batch_code=plan["batch_code"],
                    quantity_received=plan["quantity"],
                    quantity_remaining=plan["quantity"],
                    unit_cost=plan["unit_cost"],
                    received_date=plan["received"].isoformat(),
                    manufactured_date=plan["manufactured"].isoformat(),
                    expiry_date=plan["expiry"].isoformat(),
                    supplier=plan["supplier"],
                    reference=plan["reference"],
                    created_by=admin_id,
                )
                for plan in _feed_lot_plan(rng, spec, today)
            ]
            session.add_all(lots)
            await session.flush()  # assign lot ids before the ledger references them
            lot_count += len(lots)

            movements.extend(
                FeedStockMovement(
                    product_id=product.id,
                    batch_id=lot.id,
                    movement_type="receipt",
                    quantity=lot.quantity_received,
                    unit_cost=lot.unit_cost,
                    reference=lot.reference,
                    occurred_on=lot.received_date,
                    created_by=admin_id,
                )
                for lot in lots
            )

            for month_start in months:
                next_month = (month_start + timedelta(days=32)).replace(day=1)
                month_end = min(today, next_month - timedelta(days=1))
                if month_end >= month_start:
                    movements.extend(_feed_sales_for_month(rng, spec, lots, month_start, month_end, admin_id))

            # Draw the deliberately-short SKUs down to their target so the reorder
            # panel is never empty on a fresh demo database.
            target = FEED_UNDERSTOCKED.get(spec["sku"])
            if target is not None:
                movements.extend(_feed_drawdown(rng, spec, lots, target, today, admin_id))

            # Anything long expired was scrapped at the time — nobody leaves feed
            # five months past date on a pallet. Recently expired lots are left on
            # the shelf so the expiry alerts and the write-off workflow have live
            # work waiting for the operator.
            scrap_before = (today - timedelta(days=FEED_SCRAP_AFTER_DAYS)).isoformat()
            for lot in lots:
                if (lot.expiry_date or "") < scrap_before and lot.quantity_remaining > 0:
                    scrapped = lot.quantity_remaining
                    lot.quantity_remaining = 0
                    movements.append(
                        FeedStockMovement(
                            product_id=product.id,
                            batch_id=lot.id,
                            movement_type="write_off",
                            quantity=-scrapped,
                            unit_cost=lot.unit_cost,
                            note="Past expiry — destroyed under supervision",
                            occurred_on=lot.expiry_date,
                            created_by=admin_id,
                        )
                    )

        session.add_all(movements)
        await session.commit()

    print("\n=== Hormaal Animal Feed demo inventory ready ===")
    print(f"Products: {len(FEED_CATALOGUE)} — " + ", ".join(p["name"] for p in FEED_CATALOGUE))
    print(f"Lots: {lot_count} · ledger rows: {len(movements)} (receipts, sales, write-offs)")
    print("Sign in at /feed/login with the admin account above.")
    print("===============================================\n")


if __name__ == "__main__":
    asyncio.run(build())
