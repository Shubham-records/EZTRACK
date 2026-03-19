from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ExpenseBase(BaseModel):
    category: str
    description: Optional[str] = None
    amount: float
    date: str  # YYYY-MM-DD
    paymentMode: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    branchId: Optional[str] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[str] = None
    paymentMode: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class ExpenseResponse(ExpenseBase):
    id: str
    legacy_id: str = Field(..., alias="_id", serialization_alias="_id")
    gymId: str
    createdAt: datetime
    updatedAt: datetime
    hasReceipt: Optional[bool] = False
    receiptUrl: Optional[str] = None

    class Config:
        from_attributes = True
        populate_by_name = True


class BulkExpenseItem(BaseModel):
    """SEC-CRIT-02: Typed schema for one expense row in bulk-create."""
    category: Optional[str] = "Other"
    description: Optional[str] = "Imported Expense"
    amount: float
    date: Optional[str] = None
    paymentMode: Optional[str] = "Cash"
    notes: Optional[str] = None


class BulkExpenseCreate(BaseModel):
    expenses: List[BulkExpenseItem] = []
    items: List[BulkExpenseItem] = []   # alias for frontend compatibility

    def all_items(self) -> List[BulkExpenseItem]:
        """Return whichever list is populated (expenses or items)."""
        return self.expenses or self.items


class BulkDeleteRequest(BaseModel):
    """SW-06: Typed schema for bulk-delete endpoints.
    Validates that ids is a list of strings, capped at 500 items.
    Replaces raw dict params on bulk_delete_expenses and bulk_delete_proteins.
    """
    ids: List[str] = Field(..., min_length=1, max_length=500)
