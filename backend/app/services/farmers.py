from uuid import uuid4
from datetime import timezone
from sqlalchemy.orm import Session
from ..db import Farmer, utcnow
from ..errors import ApiError
from ..schemas import FarmerData, HarvestInput

class FarmerService:
    def __init__(self,session: Session):
        self.session=session
    @staticmethod
    def serialize(row):
        created=row.created_at if row.created_at.tzinfo else row.created_at.replace(tzinfo=timezone.utc)
        updated=row.updated_at if row.updated_at.tzinfo else row.updated_at.replace(tzinfo=timezone.utc)
        return FarmerData(**row.profile,id=row.id,created_at=created,updated_at=updated)
    def get(self,farmer_id):
        row=self.session.get(Farmer,str(farmer_id))
        if row is None: raise ApiError(404,'FARMER_NOT_FOUND','Farmer profile not found.')
        return self.serialize(row)
    def create(self,req: HarvestInput):
        now=utcnow(); row=Farmer(id=str(uuid4()),profile=req.model_dump(mode='json'),created_at=now,updated_at=now)
        self.session.add(row);self.session.commit();return self.serialize(row)
    def update(self,farmer_id,req: HarvestInput):
        row=self.session.get(Farmer,str(farmer_id))
        if row is None: raise ApiError(404,'FARMER_NOT_FOUND','Farmer profile not found.')
        row.profile=req.model_dump(mode='json');row.updated_at=utcnow();self.session.commit();return self.serialize(row)
