"""Generate realistic demo data for Harmaal.

Run inside the backend container:  python -m api.mock_data

Idempotent: keeps staff accounts, wipes and recreates all business data
(properties, tenants, rent ledger, work orders + message threads). Prints the
demo credentials for every role at the end.
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
TENANT_PASSWORD = "Tenant!2026Key"  # shared demo password for all 10 tenants

TENANTS = [
    ("Amina Yusuf", "amina.yusuf@example.com"),
    ("Liang Chen", "liang.chen@example.com"),
    ("Sofia Rossi", "sofia.rossi@example.com"),
    ("Marcus Johnson", "marcus.johnson@example.com"),
    ("Priya Nair", "priya.nair@example.com"),
    ("Oliver Brooks", "oliver.brooks@example.com"),
    ("Fatima Al-Sayed", "fatima.alsayed@example.com"),
    ("Noah Williams", "noah.williams@example.com"),
    ("Yuki Tanaka", "yuki.tanaka@example.com"),
    ("Grace Okafor", "grace.okafor@example.com"),
]

PROPERTIES = [
    ("Cedar Court Apartments, 100 Cedar St", 12, "Mid-rise complex, 12 units"),
    ("Maple Grove Residences, 250 Maple Ave", 8, "Garden-style apartments, 8 units"),
    ("Harbor View Flats, 12 Marina Rd", 6, "Seafront block, 6 units"),
]

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
NUM_WORK_ORDERS = 150
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

        # Properties
        props = [Property(address=a, units=u, description=d, owner_id=manager.id) for a, u, d in PROPERTIES]
        session.add_all(props)
        await session.flush()

        # Tenants (each gets a portal user) + rent ledger
        periods = months_back(MONTHS)
        now = datetime.now(UTC)
        # Months that still hold undeposited cash — the only ones that carry cash spend.
        cash_window = {f"{y}-{m:02d}" for y, m in periods[-CASH_ON_HAND_MONTHS:]}
        tenants: list[Tenant] = []
        for i, (name, email) in enumerate(TENANTS):
            prop = props[i % len(props)]
            unit = f"{chr(65 + i % 3)}-{100 + i}"
            rent = random.choice([850, 950, 1050, 1150, 1250, 1400])
            t_user = User(
                email=email.lower(),
                hashed_password=hash_password(TENANT_PASSWORD),
                role="tenant",
                display_name=name,
                password_changed_at=now,
            )
            t_role = (await session.execute(select(Role).where(Role.name == "tenant"))).scalar_one()
            t_user.roles = [t_role]
            session.add(t_user)
            await session.flush()

            tenant = Tenant(
                name=name,
                email=email.lower(),
                rent_amount=rent,
                lease_start_date=f"{periods[0][0]}-{periods[0][1]:02d}-01",
                lease_end_date=f"{now.year + 1}-{now.month:02d}-01",
                unit_label=unit,
                property_id=prop.id,
                user_id=t_user.id,
            )
            session.add(tenant)
            await session.flush()
            tenants.append(tenant)

            # Rent ledger: default all paid; create overdue for a few tenants.
            unpaid_recent = 0
            if i in (2, 5):
                unpaid_recent = 1
            elif i == 7:
                unpaid_recent = 2
            for idx, (y, m) in enumerate(periods):
                is_recent = idx >= len(periods) - unpaid_recent
                due = f"{y}-{m:02d}-05"
                deposited, deposited_date = False, None
                if is_recent:
                    status, paid_date, method = "pending", None, None
                else:
                    status = "paid"
                    paid_date = f"{y}-{m:02d}-{random.randint(2, 9):02d}"
                    method = random.choice(["cash", "cash", "card", "transfer"])
                    # Cash from older months is already banked; the most recent
                    # cash payments sit "on hand" for the manager to check off.
                    if method == "cash" and idx < len(periods) - CASH_ON_HAND_MONTHS:
                        deposited = True
                        deposited_date = f"{y}-{m:02d}-{random.randint(10, 27):02d}"
                session.add(
                    Payment(
                        amount=rent,
                        period=f"{y}-{m:02d}",
                        due_date=due,
                        paid_date=paid_date,
                        status=status,
                        method=method,
                        deposited=deposited,
                        deposited_date=deposited_date,
                        tenant_id=tenant.id,
                    )
                )
        await session.commit()

        # Operating expenses — a few per recent month, some paid in cash.
        exp_templates = [
            ("Landscaping & grounds", "maintenance"),
            ("Common-area cleaning", "maintenance"),
            ("Water & sewer", "utilities"),
            ("Electricity (common areas)", "utilities"),
            ("Property insurance", "insurance"),
            ("Plumbing supplies", "maintenance"),
            ("Pest control", "maintenance"),
        ]
        for y, m in periods[-18:]:  # last 18 months of operating expenses
            period_str = f"{y}-{m:02d}"
            for _ in range(random.randint(2, 4)):
                desc, cat = random.choice(exp_templates)
                prop = random.choice(props)
                # Only the current cash-drawer window pays cash; older bills were banked.
                paid_in_cash = period_str in cash_window and random.random() < 0.6
                session.add(
                    Expense(
                        description=desc,
                        amount=float(random.randint(60, 480)),
                        category=cat,
                        period=period_str,
                        spent_date=f"{y}-{m:02d}-{random.randint(3, 26):02d}",
                        paid_in_cash=paid_in_cash,
                        property_id=prop.id,
                        created_by=manager.id,
                    )
                )
        await session.commit()

        # Work orders + threads — ~150 spread across the full 5-year window so the
        # maintenance-spend breakdown varies by month, year, property, and tenant.
        for _ in range(NUM_WORK_ORDERS):
            title, category, desc = random.choice(WO_TEMPLATES)
            tenant = random.choice(tenants)
            assignee = random.choice(maint_users)
            priority = random.choice(PRIORITIES)

            # Pick a month in the window (0 = oldest, newest last); bias slightly recent.
            p_idx = min(len(periods) - 1, int(random.triangular(0, len(periods) - 1, len(periods) - 1)))
            y, m = periods[p_idx]
            created = datetime(y, m, random.randint(1, 27), random.randint(8, 18), tzinfo=UTC)
            if created > now:
                created = now - timedelta(days=random.randint(1, 20))

            # Recent jobs show a live mix of statuses; older jobs are resolved.
            recent = p_idx >= len(periods) - 4
            if recent:
                wo_status = random.choice(
                    ["completed", "completed", "in_progress", "assigned", "open", "open"]
                )
            else:
                wo_status = random.choices(["completed", "cancelled"], weights=[92, 8])[0]
            wo = WorkOrder(
                property_id=tenant.property_id,
                tenant_id=tenant.id,
                unit_label=tenant.unit_label,
                title=title,
                description=desc,
                category=category,
                priority=priority,
                status=wo_status,
                created_by=tenant.user_id,
                created_at=created,
            )
            if wo_status in ("assigned", "in_progress", "completed"):
                wo.assigned_to = assignee.id
            if wo_status == "completed":
                done = min(created + timedelta(days=random.randint(1, 6)), now)
                wo.completed_at = done.isoformat()
                # Emergencies/high priority cost more; keeps yearly spend uneven.
                base = 900 if priority == "emergency" else 600 if priority == "high" else 400
                wo.cost = float(random.randint(80, base))
                # Only recent repairs draw from the cash drawer; older ones were banked.
                wo.paid_in_cash = done.isoformat()[:7] in cash_window and random.random() < 0.5
                wo.scheduled_for = (created + timedelta(days=1)).date().isoformat()
            session.add(wo)
            await session.flush()

            # Message thread reflecting the workflow
            thread: list[tuple[int | None, str, str, str]] = [
                (tenant.user_id, tenant.name, "tenant", f"Hi, {desc} Please help."),
            ]
            t = created
            msgs = []
            if wo_status != "open":
                thread.append(
                    (
                        manager.id,
                        manager.display_name,
                        "manager",
                        f"Thanks for reporting. Assigning {assignee.display_name} to take a look.",
                    )
                )
            if wo_status in ("in_progress", "completed"):
                thread.append(
                    (
                        assignee.id,
                        assignee.display_name,
                        "maintenance",
                        "On my way / inspecting the issue now.",
                    )
                )
            if wo_status == "completed":
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
            if wo_status == "cancelled":
                thread.append(
                    (
                        manager.id,
                        manager.display_name,
                        "manager",
                        "Tenant resolved it themselves. Cancelling the work order.",
                    )
                )
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
            session.add_all(msgs)
        await session.commit()

    print("\n=== Harmaal demo data ready ===")
    print("Admin (owner, no data):  admin@harmaal.local / changeme")
    print(f"Manager:                 {MANAGER[0]} / {MANAGER[1]}")
    for e, p, _d in MAINTENANCE:
        print(f"Maintenance:             {e} / {p}")
    print(f"Tenants (x10):           {TENANTS[0][1]} ... {TENANTS[-1][1]} / {TENANT_PASSWORD}")
    print("================================\n")


if __name__ == "__main__":
    asyncio.run(build())
