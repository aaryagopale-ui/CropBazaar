from uuid import UUID
from fastapi import APIRouter, Depends, Request
from ..dependencies import get_farmers, respond
from ..schemas import Envelope, FarmerData, HarvestInput
from ..services.farmers import FarmerService

router=APIRouter(prefix='/api/farmers',tags=['Farmer profiles'])
@router.get('/{farmer_id}',response_model=Envelope[FarmerData])
def get_farmer(farmer_id: UUID,request: Request,service: FarmerService=Depends(get_farmers)):
    return respond(request,service.get(farmer_id))
@router.post('',response_model=Envelope[FarmerData],status_code=201)
def create_farmer(body: HarvestInput,request: Request,service: FarmerService=Depends(get_farmers)):
    return respond(request,service.create(body))
@router.put('/{farmer_id}',response_model=Envelope[FarmerData])
def update_farmer(farmer_id: UUID,body: HarvestInput,request: Request,service: FarmerService=Depends(get_farmers)):
    return respond(request,service.update(farmer_id,body))
