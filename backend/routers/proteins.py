from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, ProteinStock
from schemas.protein import ProteinResponse

router = APIRouter()

def map_protein_response(p: ProteinStock):
    p_dict = p.__dict__.copy()
    p_dict['_id'] = p.id
    return p_dict

@router.get("/", response_model=List[ProteinResponse])
def get_proteins(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    proteins = db.query(ProteinStock).filter(ProteinStock.gymId == current_gym.id).all()
    # Pydantic via alias="_id" will look for "_id" key.
    return [map_protein_response(p) for p in proteins]
