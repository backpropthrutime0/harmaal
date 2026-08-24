"""Manager financials — monthly rent + cash-drawer rollups and expense tracking.

Cash model: for each rent period we split the cash actually collected into a
three-way breakdown — deposited to the bank, spent on expenses (manual cash
expenses + maintenance work-order costs), and what's left on hand:

    cash_on_hand = cash_collected - cash_deposited - cash_spent_on_expenses
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db import get_session
from api.internal.auth import RequirePermission, TokenData
from api.models.orm import Expense, Payment, Property, WorkOrder
from api.models.schemas import ExpenseCreate, ExpenseResponse, MonthlyFinancials

router = APIRouter(prefix="/finance", tags=["finance"])

# Financial reporting + the expense ledger are business data: admin-only by default
# (view_business is no longer granted to manager/owner). Reads and writes share the
# same guard so no role can log an expense it is not allowed to see.
ViewBusiness = Annotated[TokenData, Depends(RequirePermission("view_business"))]


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


def _recent_periods(n: int) -> list[str]:
    """The last ``n`` YYYY-MM periods, newest first."""
    now = datetime.now(UTC)
    y, m = now.year, now.month
    out: list[str] = []
    for _ in range(n):
        out.append(f"{y}-{m:02d}")
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return out


@router.get("/monthly", response_model=list[MonthlyFinancials])
async def monthly_financials(
    _: ViewBusiness,
    session: Annotated[AsyncSession, Depends(get_session)],
    months: int = 6,
) -> list[MonthlyFinancials]:
    months = max(1, min(months, 24))
    periods = _recent_periods(months)
    wanted = set(periods)

    # Filter to the requested window in SQL so we don't materialize the whole
    # ledger. Work orders can't filter by period portably (completed_at is an ISO
    # string), so bound them to costed+completed rows and month-match in Python.
    payments = (await session.execute(select(Payment).where(Payment.period.in_(periods)))).scalars().all()
    expenses = (await session.execute(select(Expense).where(Expense.period.in_(periods)))).scalars().all()
    work_orders = (
        (
            await session.execute(
                select(WorkOrder).where(WorkOrder.cost.is_not(None), WorkOrder.completed_at.is_not(None))
            )
        )
        .scalars()
        .all()
    )

    out: list[MonthlyFinancials] = []
    for period in periods:
        p_rows = [p for p in payments if p.period == period]
        paid = [p for p in p_rows if p.status == "paid"]
        cash_paid = [p for p in paid if (p.method or "").lower() == "cash"]

        due = sum(p.amount for p in p_rows)
        collected = sum(p.amount for p in paid)
        cash_collected = sum(p.amount for p in cash_paid)
        cash_deposited = sum(p.amount for p in cash_paid if p.deposited)

        # Cash spent = manual cash expenses this period + cash-settled maintenance
        # costs completed this period (card/bank-paid repairs don't touch the drawer).
        manual_cash = sum(e.amount for e in expenses if e.period == period and e.paid_in_cash)
        wo_cash = sum(
            (w.cost or 0)
            for w in work_orders
            if w.cost and w.paid_in_cash and w.completed_at and w.completed_at[:7] == period
        )
        cash_spent = manual_cash + wo_cash

        out.append(
            MonthlyFinancials(
                period=period,
                due=round(due, 2),
                collected=round(collected, 2),
                outstanding=round(due - collected, 2),
                cash_collected=round(cash_collected, 2),
                cash_deposited=round(cash_deposited, 2),
                cash_spent_on_expenses=round(cash_spent, 2),
                cash_on_hand=round(cash_collected - cash_deposited - cash_spent, 2),
                charge_count=len(p_rows),
                paid_count=len(paid),
                undeposited_count=sum(1 for p in cash_paid if not p.deposited),
            )
        )

    # Keep the ordering deterministic (newest first) even if periods drifted.
    out.sort(key=lambda r: r.period, reverse=True)
    return [r for r in out if r.period in wanted]


# --- Expenses -------------------------------------------------------------


def _expense_response(e: Expense) -> ExpenseResponse:
    return ExpenseResponse(
        id=e.id,
        description=e.description,
        amount=e.amount,
        category=e.category,
        period=e.period,
        spent_date=e.spent_date,
        paid_in_cash=e.paid_in_cash,
        property_id=e.property_id,
        property_address=e.property.address if e.property else None,
    )


@router.get("/expenses", response_model=list[ExpenseResponse])
async def list_expenses(
    _: ViewBusiness,
    session: Annotated[AsyncSession, Depends(get_session)],
    period: str | None = None,
) -> list[ExpenseResponse]:
    stmt = select(Expense).order_by(Expense.spent_date.desc())
    if period:
        stmt = stmt.where(Expense.period == period)
    rows = (await session.execute(stmt)).scalars().all()
    return [_expense_response(e) for e in rows]


@router.post("/expenses", response_model=ExpenseResponse, status_code=201)
async def create_expense(
    body: ExpenseCreate,
    current: ViewBusiness,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExpenseResponse:
    if body.property_id is not None:
        exists = (
            await session.execute(select(Property).where(Property.id == body.property_id))
        ).scalar_one_or_none()
        if not exists:
            raise HTTPException(status_code=404, detail="Property not found")
    expense = Expense(
        description=body.description,
        amount=body.amount,
        category=body.category,
        period=body.period,
        spent_date=body.spent_date or _today(),
        paid_in_cash=body.paid_in_cash,
        property_id=body.property_id,
        created_by=current.user_id,
    )
    session.add(expense)
    await session.commit()
    await session.refresh(expense, attribute_names=["property"])
    return _expense_response(expense)


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: int,
    _: ViewBusiness,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    expense = (await session.execute(select(Expense).where(Expense.id == expense_id))).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    await session.delete(expense)
    await session.commit()
    return Response(status_code=204)
