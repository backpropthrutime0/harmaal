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
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from api.db import AsyncSessionFactory
from api.internal.auth import hash_password
from api.models.orm import (
    Expense,
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
    "Amina", "Fadumo", "Hodan", "Ayaan", "Khadra", "Sagal", "Ubax", "Deqa",
    "Ilhan", "Nasteexo", "Zamzam", "Hibaaq", "Muna", "Ruweyda", "Shukri",
    "Warsan", "Asma", "Barwaaqo", "Canab", "Farhia", "Cabdi", "Maxamed",
    "Axmed", "Ismaaciil", "Yuusuf", "Cali", "Xasan", "Xuseen", "Ibraahim",
    "Maxamuud", "Cabdiraxmaan", "Faisal", "Guuleed", "Liibaan", "Cumar",
    "Bashiir", "Daahir", "Jaamac", "Kaahin", "Sasyid", "Cabdulaahi", "Nuur",
    "Rooble", "Diriye",
]
LAST_NAMES = [
    "Yuusuf", "Farax", "Xaaji", "Diriye", "Cabdi", "Warsame", "Maxamed",
    "Cige", "Ismaaciil", "Guuleed", "Nuur", "Kayse", "Samatar", "Xirsi",
    "Ducaale", "Gaas", "Rooble", "Xasan", "Cabdilaahi", "Jaamac", "Boqor",
    "Egeh", "Carte", "Ainanshe", "Dheere", "Qaasim", "Cawaale", "Baarud",
    "Xirsi", "Maxamuud",
]
DISTRICTS = [
    "26 June", "Ahmed Dhagax", "Ga'an Libaax", "Ibraahim Koodbuur",
    "Maxamoud Haybe", "New Hargeisa", "Jigjiga Yar", "Sha'ab", "Koodbuur",
    "Masalaha", "31 May", "Pepsi",
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
    [60] * 14 + [54] * 4 + [48] * 5 + [42] * 4 + [36] * 5 + [30] * 4
    + [24] * 4 + [18] * 3 + [12] * 3 + [9] * 2 + [6] * 1 + [3] * 1
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
        thread.append((manager.id, manager.display_name, "manager",
                       f"Thanks for reporting. Assigning {assignee.display_name} to take a look."))
    if wo.status in ("in_progress", "completed"):
        thread.append((assignee.id, assignee.display_name, "maintenance",
                       "On my way / inspecting the issue now."))
    if wo.status == "completed":
        thread.append((assignee.id, assignee.display_name, "maintenance",
                       f"Repair complete. Cost ${wo.cost:.0f}. Replaced/fixed the affected part."))
        thread.append((manager.id, manager.display_name, "manager",
                       "Confirmed completed and notified the tenant. Closing this out."))
    if wo.status == "cancelled":
        thread.append((manager.id, manager.display_name, "manager",
                       "Tenant resolved it themselves. Cancelling the work order."))
    msgs = []
    t = created
    for aid, aname, arole, body in thread:
        t = t + timedelta(hours=random.randint(2, 36))
        msgs.append(WorkOrderMessage(
            work_order_id=wo.id, author_id=aid, author_name=aname,
            author_role=arole, body=body, created_at=t,
        ))
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
                    session.add(Payment(
                        amount=person["rent"], period=period_str, due_date=due,
                        paid_date=None, status="pending", method=None,
                        deposited=False, deposited_date=None, tenant_id=tenant.id,
                    ))
                    continue
                day = random.randint(2, 4) if idx not in late_idx else random.randint(9, 27)
                method = random.choice(["cash", "cash", "card", "transfer"])
                deposited, deposited_date = False, None
                # Older cash is already banked; only the live window sits on hand.
                if method == "cash" and period_str not in cash_window:
                    deposited = True
                    deposited_date = f"{y}-{m:02d}-{random.randint(10, 27):02d}"
                session.add(Payment(
                    amount=person["rent"], period=period_str, due_date=due,
                    paid_date=f"{y}-{m:02d}-{day:02d}", status="paid", method=method,
                    deposited=deposited, deposited_date=deposited_date, tenant_id=tenant.id,
                ))

            person["_prop_id"] = prop.id
            person["_tenant"] = tenant
            person["_periods"] = periods
        await session.commit()

        # A few vacant houses so occupancy is < 100% and varies by property.
        for _ in range(NUM_VACANT):
            session.add(Property(
                address=_house_address(seq), units=1,
                description="Vacant rental home — available to let", owner_id=manager.id,
            ))
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
                session.add(Expense(
                    description=desc, amount=float(random.randint(60, 480)), category=cat,
                    period=period_str, spent_date=f"{y}-{m:02d}-{random.randint(3, 26):02d}",
                    paid_in_cash=paid_in_cash, property_id=random.choice(prop_ids),
                    created_by=manager.id,
                ))
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
                    property_id=tenant.property_id, tenant_id=tenant.id, unit_label=tenant.unit_label,
                    title=title, description=desc, category=category, priority=priority,
                    status=status, created_by=tenant.user_id, created_at=created,
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
    if existing is not None:
        return
    await build()


if __name__ == "__main__":
    asyncio.run(build())
